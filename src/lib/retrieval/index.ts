/**
 * Stage 3: hybrid clause retrieval.
 *
 *   query -> BM25 (lexical, own implementation) ----\
 *         -> dense cosine (bge-small-en-v1.5) -------> reciprocal rank fusion
 *                                                     -> cross-encoder rerank of top ~30 (bge-reranker-base)
 *                                                     -> top k + linked exceptions/definitions
 *
 * Also generates conflict candidate pairs for the engine (`candidatePairs`).
 *
 * Runtime: Node only. Models load lazily on first use. `embed: false` at build time, or
 * env `LTR_DISABLE_EMBEDDINGS=1`, gives a pure-BM25 index that never touches the network.
 */

import { CONFLICT_PAIRS } from "@/lib/types";
import type { Clause, CuadCategory, RetrievedClause } from "@/lib/types";
import { Bm25 } from "./bm25";
import { tokenize } from "./text";
import {
  EMBED_MODEL,
  RERANK_MODEL,
  clearModelCache,
  cosine,
  embedClauses,
  embedQuery,
  modelsDisabled,
  rerankScores,
} from "./models";

export { EMBED_MODEL, RERANK_MODEL, clearModelCache };

export interface BuildOptions {
  /** Compute dense embeddings (default true unless LTR_DISABLE_EMBEDDINGS=1). false = BM25 only. */
  embed?: boolean;
  /** Use the cross-encoder reranker in `search` (default: same as `embed`). */
  rerank?: boolean;
  /** Embedding progress, in clauses. Called at least once, with done === total at the end. */
  onProgress?: (done: number, total: number) => void;
}

export interface SearchOptions {
  k?: number;
  category?: CuadCategory | CuadCategory[];
  docIds?: string[];
  excludeClauseIds?: string[];
}

export interface SimilarOptions {
  k?: number;
  sameCategoryOnly?: boolean;
  crossDocOnly?: boolean;
}

export type CandidateReason = "same_category" | "conflict_pair" | "cross_reference" | "cross_document";
export type CandidatePair = [Clause, Clause, CandidateReason];

export interface CandidatePairOptions {
  maxPairs?: number;
}

/** RRF constant (Cormack et al. 2009). */
const RRF_K = 60;
/** How many fused hits go to the cross-encoder. */
const RERANK_DEPTH = 30;
/** Max linked clauses attached to a hit. */
const MAX_LINKED = 5;
/** Cross-document partners kept per clause and per other document. */
const CROSS_DOC_TOP = 2;
/** Same-doc "Other" neighbours kept per clause (fallback when typing produced little signal). */
const OTHER_TOP = 2;

/**
 * Added to similarity when ranking candidate pairs, so explicit structure
 * (a cross-reference, a known conflict category pair) survives the maxPairs cap
 * even when the two clauses share little vocabulary.
 */
const REASON_BONUS: Record<CandidateReason, number> = {
  cross_reference: 0.3,
  conflict_pair: 0.2,
  cross_document: 0.1,
  same_category: 0,
};
/** When one pair is produced by several sources, keep the most specific reason. */
const REASON_PRIORITY: Record<CandidateReason, number> = {
  cross_reference: 3,
  conflict_pair: 2,
  cross_document: 1,
  same_category: 0,
};

function conflictPairKey(a: CuadCategory, b: CuadCategory): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
const CONFLICT_PAIR_SET = new Set(CONFLICT_PAIRS.map(([a, b]) => conflictPairKey(a, b)));

function isConflictPair(a: CuadCategory, b: CuadCategory): boolean {
  return a !== b && CONFLICT_PAIR_SET.has(conflictPairKey(a, b));
}

function indexText(c: Clause): string {
  return c.heading && !c.text.includes(c.heading) ? `${c.heading}\n${c.text}` : c.text;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function overlaps(a: Clause, b: Clause): boolean {
  return a.docId === b.docId && a.start < b.end && b.start < a.end;
}

export class ClauseIndex {
  /** Indexed clauses, in input order (duplicate ids dropped). */
  readonly clauses: readonly Clause[];
  private readonly byId = new Map<string, number>();
  private readonly tokens: string[][];
  private readonly bm25: Bm25;
  private readonly vectors: Array<Float32Array | undefined> | null;
  private readonly useReranker: boolean;
  /** clause id -> indices of clauses whose `references` include it. */
  private readonly referencedBy = new Map<string, number[]>();

  private constructor(clauses: Clause[], vectors: Array<Float32Array | undefined> | null, useReranker: boolean) {
    this.clauses = clauses;
    clauses.forEach((c, i) => this.byId.set(c.id, i));
    this.tokens = clauses.map((c) => tokenize(indexText(c)));
    this.bm25 = new Bm25(this.tokens);
    this.vectors = vectors;
    this.useReranker = useReranker;
    clauses.forEach((c, i) => {
      for (const ref of new Set(c.references)) {
        if (ref === c.id) continue;
        const list = this.referencedBy.get(ref);
        if (list) list.push(i);
        else this.referencedBy.set(ref, [i]);
      }
    });
  }

  static async build(clauses: Clause[], opts: BuildOptions = {}): Promise<ClauseIndex> {
    const seen = new Set<string>();
    const unique: Clause[] = [];
    for (const c of clauses) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      unique.push(c);
    }
    if (unique.length !== clauses.length) {
      console.warn(`[retrieval] dropped ${clauses.length - unique.length} clause(s) with duplicate ids`);
    }

    const total = unique.length;
    const embedOn = (opts.embed ?? true) && !modelsDisabled();
    let vectors: Array<Float32Array | undefined> | null = null;
    let embedderFailed = false;
    if (embedOn && total > 0) {
      const map = await embedClauses(
        unique.map((c) => ({ id: c.id, text: indexText(c) })),
        opts.onProgress,
      );
      if (map) vectors = unique.map((c) => map.get(c.id));
      else embedderFailed = true;
    }
    if (!vectors) opts.onProgress?.(total, total);
    // Reranker follows `embed` by default; skip it when the embedder failed to load (likely offline).
    const useReranker = (opts.rerank ?? embedOn) && !modelsDisabled() && !embedderFailed;
    return new ClauseIndex(unique, vectors, useReranker);
  }

  get size(): number {
    return this.clauses.length;
  }

  /** True when dense vectors are available (embeddings on and the model loaded). */
  get denseEnabled(): boolean {
    return this.vectors !== null;
  }

  /** True when `search` will attempt cross-encoder reranking. */
  get rerankEnabled(): boolean {
    return this.useReranker;
  }

  get(clauseId: string): Clause | undefined {
    const i = this.byId.get(clauseId);
    return i === undefined ? undefined : this.clauses[i];
  }

  /**
   * Clauses linked to `clause`: those it references (definitions, exceptions, cross-refs)
   * plus exception clauses that reference it. Exceptions first, deduped, at most 5.
   */
  linked(clause: Clause): Clause[] {
    const out: Clause[] = [];
    const seen = new Set<string>([clause.id]);
    const push = (c: Clause | undefined) => {
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    };
    for (const ref of clause.references) push(this.get(ref));
    for (const j of this.referencedBy.get(clause.id) ?? []) {
      if (this.clauses[j].isException) push(this.clauses[j]);
    }
    // Stable sort: exceptions before definitions/plain cross-refs.
    return out
      .map((c, i) => ({ c, i }))
      .sort((a, b) => Number(b.c.isException) - Number(a.c.isException) || a.i - b.i)
      .slice(0, MAX_LINKED)
      .map((x) => x.c);
  }

  /** Hybrid search: BM25 + dense, RRF fusion, cross-encoder rerank of the top ~30. */
  async search(query: string, opts: SearchOptions = {}): Promise<RetrievedClause[]> {
    const k = Math.max(1, opts.k ?? 10);
    if (!query.trim() || this.size === 0) return [];
    const pool = this.filterPool(opts);
    if (pool.length === 0) return [];

    // Lexical ranking.
    const qTokens = tokenize(query);
    const bm25 = new Map<number, number>();
    for (const i of pool) {
      const s = this.bm25.score(qTokens, i);
      if (s > 0) bm25.set(i, s);
    }
    const lexRanked = [...bm25.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => i);

    // Dense ranking.
    const dense = new Map<number, number>();
    if (this.vectors) {
      const qv = await embedQuery(query);
      if (qv) {
        for (const i of pool) {
          const v = this.vectors[i];
          if (v) dense.set(i, cosine(qv, v));
        }
      }
    }
    const denseRanked = [...dense.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => i);

    // Reciprocal rank fusion, normalised so rank 1 in every list == 1.0.
    const lists = [lexRanked, denseRanked].filter((l) => l.length > 0);
    if (lists.length === 0) return [];
    const fused = new Map<number, number>();
    for (const list of lists) {
      list.forEach((i, rank) => fused.set(i, (fused.get(i) ?? 0) + 1 / (RRF_K + rank + 1)));
    }
    const maxFused = lists.length / (RRF_K + 1);
    const shortlist = [...fused.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, Math.max(RERANK_DEPTH, k))
      .map(([i, s]) => ({ i, fused: s / maxFused }));

    // Cross-encoder rerank (falls back to the fused score if unavailable).
    let finalScores: number[] | null = null;
    if (this.useReranker) {
      finalScores = await rerankScores(
        query,
        shortlist.map(({ i }) => indexText(this.clauses[i])),
      );
    }

    return shortlist
      .map(({ i, fused: f }, n) => ({ i, score: finalScores ? finalScores[n] : f, fused: f }))
      .sort((a, b) => b.score - a.score || b.fused - a.fused || a.i - b.i)
      .slice(0, k)
      .map(({ i, score }) => {
        const clause = this.clauses[i];
        return {
          clause,
          score,
          bm25Score: bm25.get(i) ?? 0,
          denseScore: dense.get(i),
          linked: this.linked(clause),
        };
      });
  }

  /**
   * Symmetric similarity of two indexed clauses in 0..1:
   * 0.7 * dense cosine + 0.3 * TF-IDF cosine when embeddings exist, else TF-IDF cosine.
   */
  similarity(a: Clause | string, b: Clause | string): number {
    const i = this.byId.get(typeof a === "string" ? a : a.id);
    const j = this.byId.get(typeof b === "string" ? b : b.id);
    if (i === undefined || j === undefined) return 0;
    return this.pairSim(i, j).score;
  }

  /**
   * Nearest neighbours of an indexed clause (candidate pair partners for the conflict engine).
   * `score` = `similarity()`; `bm25Score` = BM25 of the clause text as a query; `denseScore` = cosine.
   * Clauses overlapping the source in the same document (parent/child spans) are excluded.
   */
  similar(clauseId: string, opts: SimilarOptions = {}): RetrievedClause[] {
    const src = this.byId.get(clauseId);
    if (src === undefined) return [];
    const k = Math.max(1, opts.k ?? 5);
    const a = this.clauses[src];
    const qTokens = [...new Set(this.tokens[src])];
    const hits: Array<{ i: number; score: number; bm: number; dense?: number }> = [];
    for (let j = 0; j < this.size; j++) {
      if (j === src) continue;
      const b = this.clauses[j];
      if (opts.sameCategoryOnly && b.category !== a.category) continue;
      if (opts.crossDocOnly && b.docId === a.docId) continue;
      if (overlaps(a, b)) continue;
      const { score, dense } = this.pairSim(src, j);
      if (score <= 0) continue;
      hits.push({ i: j, score, bm: this.bm25.score(qTokens, j), dense });
    }
    return hits
      .sort((x, y) => y.score - x.score || x.i - y.i)
      .slice(0, k)
      .map(({ i, score, bm, dense }) => ({
        clause: this.clauses[i],
        score,
        bm25Score: bm,
        denseScore: dense,
        linked: this.linked(this.clauses[i]),
      }));
  }

  /**
   * Conflict candidate pairs, from three sources:
   *  1. same document, related types: same category (every pair; for "Other" only each
   *     clause's top-2 nearest "Other" neighbours), or categories listed in CONFLICT_PAIRS;
   *  2. explicit cross-references (`Clause.references`, either direction, any document);
   *  3. across documents: same category (each clause's top-2 most similar partners per
   *     other document; for "Other" only the top-1 and only if clearly similar), plus
   *     CONFLICT_PAIRS categories across documents (reason "conflict_pair").
   * Pairs are unordered and deduped (most specific reason wins: cross_reference >
   * conflict_pair > cross_document > same_category). Overlapping spans and exact duplicate
   * texts are skipped. Ranked by similarity + a small per-reason bonus, capped at maxPairs.
   * Each tuple is [earlier clause, later clause, reason] in index order.
   */
  candidatePairs(opts: CandidatePairOptions = {}): CandidatePair[] {
    const maxPairs = Math.max(0, opts.maxPairs ?? 200);
    const n = this.size;
    const found = new Map<string, { i: number; j: number; reason: CandidateReason; sim: number }>();
    const norm = this.clauses.map((c) => collapse(c.text));
    const otherCrossDocMin = this.vectors ? 0.75 : 0.35;

    const add = (x: number, y: number, reason: CandidateReason, sim?: number) => {
      if (x === y) return;
      const [i, j] = x < y ? [x, y] : [y, x];
      const a = this.clauses[i];
      const b = this.clauses[j];
      if (overlaps(a, b) || norm[i] === norm[j]) return;
      const key = `${i}:${j}`;
      const prev = found.get(key);
      if (prev) {
        if (REASON_PRIORITY[reason] > REASON_PRIORITY[prev.reason]) prev.reason = reason;
        return;
      }
      found.set(key, { i, j, reason, sim: sim ?? this.pairSim(i, j).score });
    };

    // Group by document.
    const byDoc = new Map<string, number[]>();
    this.clauses.forEach((c, i) => {
      const list = byDoc.get(c.docId);
      if (list) list.push(i);
      else byDoc.set(c.docId, [i]);
    });
    const docs = [...byDoc.values()];

    // (1) Same document: related types.
    for (const idx of docs) {
      for (let p = 0; p < idx.length; p++) {
        const i = idx[p];
        const ci = this.clauses[i].category;
        const others: Array<{ j: number; sim: number }> = [];
        for (let q = p + 1; q < idx.length; q++) {
          const j = idx[q];
          const cj = this.clauses[j].category;
          if (ci === cj && ci !== "Other") add(i, j, "same_category");
          else if (isConflictPair(ci, cj)) add(i, j, "conflict_pair");
        }
        if (ci === "Other") {
          for (const j of idx) {
            if (j !== i && this.clauses[j].category === "Other") others.push({ j, sim: this.pairSim(i, j).score });
          }
          others
            .filter((o) => o.sim > 0)
            .sort((x, y) => y.sim - x.sim || x.j - y.j)
            .slice(0, OTHER_TOP)
            .forEach((o) => add(i, o.j, "same_category", o.sim));
        }
      }
    }

    // (2) Cross-references (resolved ids only).
    for (let i = 0; i < n; i++) {
      for (const ref of this.clauses[i].references) {
        const j = this.byId.get(ref);
        if (j !== undefined) add(i, j, "cross_reference");
      }
    }

    // (3) Across documents.
    for (let d = 0; d < docs.length; d++) {
      for (let e = 0; e < docs.length; e++) {
        if (d === e) continue;
        for (const i of docs[d]) {
          const ci = this.clauses[i].category;
          const same: Array<{ j: number; sim: number }> = [];
          const related: Array<{ j: number; sim: number }> = [];
          for (const j of docs[e]) {
            const cj = this.clauses[j].category;
            if (cj === ci) same.push({ j, sim: this.pairSim(i, j).score });
            else if (isConflictPair(ci, cj)) related.push({ j, sim: this.pairSim(i, j).score });
          }
          const byScore = (x: { j: number; sim: number }, y: { j: number; sim: number }) => y.sim - x.sim || x.j - y.j;
          if (ci === "Other") {
            same
              .filter((s) => s.sim >= otherCrossDocMin)
              .sort(byScore)
              .slice(0, 1)
              .forEach((s) => add(i, s.j, "cross_document", s.sim));
          } else {
            same.sort(byScore).slice(0, CROSS_DOC_TOP).forEach((s) => add(i, s.j, "cross_document", s.sim));
          }
          related.sort(byScore).slice(0, CROSS_DOC_TOP).forEach((s) => add(i, s.j, "conflict_pair", s.sim));
        }
      }
    }

    const exceptionBonus = (p: { i: number; j: number }) =>
      this.clauses[p.i].isException || this.clauses[p.j].isException ? 0.05 : 0;
    return [...found.values()]
      .map((p) => ({ ...p, rank: p.sim + REASON_BONUS[p.reason] + exceptionBonus(p) }))
      .sort((x, y) => y.rank - x.rank || x.i - y.i || x.j - y.j)
      .slice(0, maxPairs)
      .map((p): CandidatePair => [this.clauses[p.i], this.clauses[p.j], p.reason]);
  }

  // ---- internals -------------------------------------------------------------------

  private filterPool(opts: SearchOptions): number[] {
    const cats = opts.category === undefined ? null : new Set(Array.isArray(opts.category) ? opts.category : [opts.category]);
    const docs = opts.docIds ? new Set(opts.docIds) : null;
    const excl = opts.excludeClauseIds ? new Set(opts.excludeClauseIds) : null;
    const pool: number[] = [];
    this.clauses.forEach((c, i) => {
      if (cats && !cats.has(c.category)) return;
      if (docs && !docs.has(c.docId)) return;
      if (excl && excl.has(c.id)) return;
      pool.push(i);
    });
    return pool;
  }

  private pairSim(i: number, j: number): { score: number; lexical: number; dense?: number } {
    const lexical = this.bm25.cosine(i, j);
    const vi = this.vectors?.[i];
    const vj = this.vectors?.[j];
    if (vi && vj) {
      const dense = cosine(vi, vj);
      return { score: Math.max(0, Math.min(1, 0.7 * dense + 0.3 * lexical)), lexical, dense };
    }
    return { score: lexical, lexical };
  }
}
