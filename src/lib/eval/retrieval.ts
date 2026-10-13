/**
 * LegalBench-RAG(-mini) retrieval evaluation over `ClauseIndex` (gap 9, retrieval stage).
 *
 * - Data: the official LegalBench-RAG corpus + benchmarks (Dropbox archive linked from
 *   https://github.com/zeroentropy-ai/legalbenchrag), cached in eval/data/raw/legalbenchrag.
 * - Mini selection reproduces `legalbenchrag/benchmark.py` exactly: per benchmark, tests sorted by
 *   `random.seed(file_path); random.random()` (CPython MT19937, ported in ./rng) and capped at 194,
 *   corpus = the documents those tests reference (776 queries, 72 documents).
 * - Chunking: our section parser (`structureDocument`), so chunks are whole clauses (<= 1500 chars),
 *   not the paper's fixed 500-character chunks.
 * - Metrics at k in K_VALUES:
 *     hit  P@k = retrieved clauses (of k) overlapping a gold span / k;  R@k = gold spans touched / gold spans
 *     char P@k / R@k = character overlap / retrieved chars, / gold chars (the paper's definition)
 *   Overall = mean of per-benchmark means (the paper weights the four benchmarks 0.25 each).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Clause, SourceDocument } from "@/lib/types";
import { structureDocument } from "@/lib/parse";
import { ClauseIndex, EMBED_MODEL, RERANK_MODEL } from "@/lib/retrieval";
import { RAW_DIR, download, fileExists, unzip } from "./io";
import { mean, overlapLen } from "./metrics";
import { pyRandomForSeed } from "./rng";

export const LBR_URL =
  "https://www.dropbox.com/scl/fo/r7xfa5i3hdsbxex1w6amw/AID389Olvtm-ZLTKAPrw6k4?rlkey=5n8zrbk4c08lbit3iiexofmwg&st=0hu354cq&dl=1";
export const LBR_DIR = join(RAW_DIR, "legalbenchrag");
export const LBR_DATA = join(LBR_DIR, "data");
export const LBR_BENCHMARKS = ["privacy_qa", "contractnli", "maud", "cuad"] as const;
export const MINI_PER_BENCHMARK = 194;
export const K_VALUES = [1, 2, 4, 5, 8, 10, 16, 32, 64] as const;
export const REPORT_P = [1, 5, 10] as const;
export const REPORT_R = [1, 5, 10, 64] as const;

/** Published LegalBench-RAG baseline as cited in the synopsis (section 9): character-level metrics. */
export const LBR_BASELINE = {
  source: "LegalBench-RAG (Pipitone & Houir Alami, 2024): 500-char recursive chunks, OpenAI text-embedding-3-large, no reranker",
  precisionAt1: 0.064,
  recallAt64: 0.62,
};

export interface RetrievalConfig {
  name: string;
  embed: boolean;
  rerank: boolean;
}

export const RETRIEVAL_CONFIGS: RetrievalConfig[] = [
  { name: "bm25", embed: false, rerank: false },
  { name: "hybrid", embed: true, rerank: false },
  { name: "hybrid+rerank", embed: true, rerank: true },
];

interface LbrSnippet {
  file_path: string;
  span: [number, number];
  answer?: string;
}

export interface LbrQuery {
  id: string;
  benchmark: string;
  query: string;
  snippets: LbrSnippet[];
}

/** Download + unzip LegalBench-RAG (about 90 MB) unless cached. Returns the data directory. */
export async function ensureLegalBenchRag(log: (m: string) => void = () => {}): Promise<string> {
  if (fileExists(join(LBR_DATA, "benchmarks", "cuad.json"))) return LBR_DATA;
  const zip = join(LBR_DIR, "LegalBench-RAG.zip");
  log("Downloading LegalBench-RAG (about 90 MB) ...");
  await download(LBR_URL, zip);
  unzip(zip, LBR_DATA);
  if (!fileExists(join(LBR_DATA, "benchmarks", "cuad.json"))) throw new Error(`benchmarks not found after extracting ${zip}`);
  return LBR_DATA;
}

/** LegalBench-RAG-mini: per benchmark, the first 194 tests after the seeded file-path sort of benchmark.py. */
export function loadMiniBenchmark(dataDir = LBR_DATA, perBenchmark = MINI_PER_BENCHMARK): LbrQuery[] {
  const out: LbrQuery[] = [];
  const keyCache = new Map<string, number>();
  const key = (path: string) => {
    let v = keyCache.get(path);
    if (v === undefined) {
      v = pyRandomForSeed(path);
      keyCache.set(path, v);
    }
    return v;
  };
  for (const name of LBR_BENCHMARKS) {
    const raw = JSON.parse(readFileSync(join(dataDir, "benchmarks", `${name}.json`), "utf8")) as { tests: Array<{ query: string; snippets: LbrSnippet[] }> };
    let tests = raw.tests.map((t, i) => ({ ...t, i }));
    if (tests.length > perBenchmark) {
      // Array.prototype.sort is stable, like Python's sorted().
      tests = [...tests].sort((a, b) => key(a.snippets[0].file_path) - key(b.snippets[0].file_path)).slice(0, perBenchmark);
    }
    for (const t of tests) out.push({ id: `${name}#${t.i}`, benchmark: name, query: t.query, snippets: t.snippets });
  }
  return out;
}

export interface LoadedCorpus {
  docs: SourceDocument[];
  /** Gold snippets whose text did not match the corpus at the converted offsets. */
  spanMismatches: number;
  spansChecked: number;
}

/**
 * Read corpus files the way Python's `open().read()` does (UTF-8, universal newlines) and convert
 * gold spans from code-point offsets to UTF-16 offsets where a file contains astral characters.
 */
export function loadCorpus(dataDir: string, files: readonly string[], queries: LbrQuery[]): LoadedCorpus {
  const docs: SourceDocument[] = [];
  const maps = new Map<string, Int32Array>();
  for (const file of files) {
    const text = readFileSync(join(dataDir, "corpus", file), "utf8").replace(/\r\n?/g, "\n");
    docs.push({ id: file, name: file, kind: "txt", text });
    if (/[\uD800-\uDFFF]/.test(text)) {
      const cps = Array.from(text);
      const map = new Int32Array(cps.length + 1);
      let unit = 0;
      cps.forEach((c, i) => {
        map[i] = unit;
        unit += c.length;
      });
      map[cps.length] = unit;
      maps.set(file, map);
    }
  }
  const byId = new Map(docs.map((d) => [d.id, d]));
  let mismatches = 0;
  let checked = 0;
  for (const q of queries) {
    q.snippets = q.snippets.map((s) => {
      const map = maps.get(s.file_path);
      const span: [number, number] = map ? [map[s.span[0]], map[s.span[1]]] : s.span;
      const doc = byId.get(s.file_path);
      if (doc && typeof s.answer === "string") {
        checked++;
        if (doc.text.slice(span[0], span[1]) !== s.answer) mismatches++;
      }
      return { ...s, span };
    });
  }
  return { docs, spanMismatches: mismatches, spansChecked: checked };
}

export interface QueryScores {
  hitP: Record<number, number>;
  hitR: Record<number, number>;
  charP: Record<number, number>;
  charR: Record<number, number>;
}

/** Score one ranked list of clauses against the gold snippets of a query. */
export function scoreRanking(ranked: readonly Pick<Clause, "docId" | "start" | "end">[], gold: readonly LbrSnippet[], ks: readonly number[] = K_VALUES): QueryScores {
  const out: QueryScores = { hitP: {}, hitR: {}, charP: {}, charR: {} };
  const goldChars = gold.reduce((s, g) => s + (g.span[1] - g.span[0]), 0);
  for (const k of ks) {
    const top = ranked.slice(0, k);
    let hits = 0;
    let overlapChars = 0;
    let retrievedChars = 0;
    const touched = new Set<number>();
    for (const c of top) {
      retrievedChars += c.end - c.start;
      let hit = false;
      gold.forEach((g, gi) => {
        if (g.file_path !== c.docId) return;
        const o = overlapLen(c, { start: g.span[0], end: g.span[1] });
        if (o > 0) {
          hit = true;
          overlapChars += o;
          touched.add(gi);
        }
      });
      if (hit) hits++;
    }
    out.hitP[k] = hits / k;
    out.hitR[k] = gold.length ? touched.size / gold.length : 0;
    out.charP[k] = retrievedChars ? overlapChars / retrievedChars : 0;
    out.charR[k] = goldChars ? overlapChars / goldChars : 0;
  }
  return out;
}

export interface MetricTable {
  hitP: Record<number, number | null>;
  hitR: Record<number, number | null>;
  charP: Record<number, number | null>;
  charR: Record<number, number | null>;
}

function aggregate(scores: readonly QueryScores[], ks: readonly number[]): MetricTable {
  const t: MetricTable = { hitP: {}, hitR: {}, charP: {}, charR: {} };
  for (const k of ks) {
    t.hitP[k] = mean(scores.map((s) => s.hitP[k]));
    t.hitR[k] = mean(scores.map((s) => s.hitR[k]));
    t.charP[k] = mean(scores.map((s) => s.charP[k]));
    t.charR[k] = mean(scores.map((s) => s.charR[k]));
  }
  return t;
}

/** Equal-weight mean over benchmarks (LegalBench-RAG weights each benchmark 0.25). */
function macro(tables: readonly MetricTable[], ks: readonly number[]): MetricTable {
  const t: MetricTable = { hitP: {}, hitR: {}, charP: {}, charR: {} };
  for (const k of ks) {
    for (const m of ["hitP", "hitR", "charP", "charR"] as const) {
      t[m][k] = mean(tables.map((x) => x[m][k]).filter((v): v is number => v !== null));
    }
  }
  return t;
}

export interface ConfigResult {
  config: RetrievalConfig;
  /** Display name (differs from config.name for the paired subset row). */
  label: string;
  queries: number;
  denseEnabled: boolean;
  rerankEnabled: boolean;
  buildSeconds: number;
  querySeconds: number;
  overall: MetricTable;
  micro: MetricTable;
  perBenchmark: Record<string, MetricTable & { queries: number }>;
}

export interface RetrievalEvalResult {
  models: { embed: string; rerank: string };
  /** Cross-encoder depth used by rerank configs. */
  rerankDepth: number;
  queries: number;
  documents: number;
  clauses: number;
  corpusChars: number;
  queriesPerBenchmark: Record<string, number>;
  spanCheck: { checked: number; mismatches: number };
  limited: { docs?: number; queries?: number };
  ks: readonly number[];
  baseline: typeof LBR_BASELINE;
  configs: ConfigResult[];
  perQuery: Array<{ config: string; id: string; benchmark: string; scores: QueryScores; top: string[] }>;
}

/** Hits sent to the cross-encoder: the app's RERANK_DEPTH (retrieval/index.ts), i.e. what rule search reranks at k <= 30. */
export const EVAL_RERANK_DEPTH = 30;

export interface RetrievalEvalOptions {
  /** Rerank only the top N fused hits (default 30); ranks N+1..64 keep the hybrid (fused) order. */
  rerankDepth?: number;
  /** Run rerank configs on a benchmark-balanced subset of N queries (CPU budget); hybrid is also reported on that subset. */
  rerankQueries?: number;
  /** Called after each config with the results so far (for incremental saving). */
  onConfig?: (partial: RetrievalEvalResult) => void;
  /** Keep only the first N corpus documents (sorted by path) and the queries fully inside them. */
  limitDocs?: number;
  /** Cap the number of queries (round-robin over benchmarks). */
  limitQueries?: number;
  configs?: readonly string[];
  perBenchmark?: number;
  log?: (m: string) => void;
}

function roundRobin(queries: LbrQuery[], n: number): LbrQuery[] {
  const groups = LBR_BENCHMARKS.map((b) => queries.filter((q) => q.benchmark === b));
  const out: LbrQuery[] = [];
  for (let i = 0; out.length < n && groups.some((g) => i < g.length); i++) {
    for (const g of groups) if (i < g.length && out.length < n) out.push(g[i]);
  }
  return out;
}

function summarise(scores: ReadonlyArray<{ q: LbrQuery; s: QueryScores }>): Pick<ConfigResult, "overall" | "micro" | "perBenchmark" | "queries"> {
  const perBenchmark: ConfigResult["perBenchmark"] = {};
  for (const b of LBR_BENCHMARKS) {
    const sub = scores.filter((x) => x.q.benchmark === b).map((x) => x.s);
    if (sub.length) perBenchmark[b] = { ...aggregate(sub, K_VALUES), queries: sub.length };
  }
  return {
    queries: scores.length,
    overall: macro(Object.values(perBenchmark), K_VALUES),
    micro: aggregate(scores.map((x) => x.s), K_VALUES),
    perBenchmark,
  };
}

export async function runRetrievalEval(opts: RetrievalEvalOptions = {}): Promise<RetrievalEvalResult> {
  const log = opts.log ?? (() => {});
  const dataDir = await ensureLegalBenchRag(log);
  let queries = loadMiniBenchmark(dataDir, opts.perBenchmark ?? MINI_PER_BENCHMARK);
  let files = [...new Set(queries.flatMap((q) => q.snippets.map((s) => s.file_path)))].sort();
  if (opts.limitDocs && opts.limitDocs < files.length) {
    // Spread the kept documents over the benchmarks so every benchmark stays represented.
    const perB = LBR_BENCHMARKS.map((b) => files.filter((f) => f.startsWith(`${b}/`)));
    const kept: string[] = [];
    for (let i = 0; kept.length < opts.limitDocs && perB.some((g) => i < g.length); i++) {
      for (const g of perB) if (i < g.length && kept.length < opts.limitDocs) kept.push(g[i]);
    }
    files = kept.sort();
    const keep = new Set(files);
    queries = queries.filter((q) => q.snippets.every((s) => keep.has(s.file_path)));
  }
  if (opts.limitQueries && opts.limitQueries < queries.length) queries = roundRobin(queries, opts.limitQueries);

  const corpus = loadCorpus(dataDir, files, queries);
  const clauses = corpus.docs.flatMap((d) => structureDocument(d));
  const corpusChars = corpus.docs.reduce((s, d) => s + d.text.length, 0);
  log(`LegalBench-RAG-mini: ${queries.length} queries, ${corpus.docs.length} documents (${(corpusChars / 1e6).toFixed(1)}M chars), ${clauses.length} clauses`);
  if (corpus.spanMismatches) log(`WARNING: ${corpus.spanMismatches}/${corpus.spansChecked} gold spans do not match the corpus text`);

  const configs = RETRIEVAL_CONFIGS.filter((c) => !opts.configs || opts.configs.includes(c.name));
  const results: ConfigResult[] = [];
  const perQuery: RetrievalEvalResult["perQuery"] = [];
  const maxK = Math.max(...K_VALUES);
  for (const config of configs) {
    const t0 = Date.now();
    let lastPct = -1;
    const index = await ClauseIndex.build(clauses, {
      embed: config.embed,
      rerank: config.rerank,
      onProgress: (done, total) => {
        const p = Math.floor((100 * done) / Math.max(1, total));
        if (config.embed && p >= lastPct + 10) {
          lastPct = p;
          log(`  [${config.name}] embedded ${done}/${total} clauses`);
        }
      },
    });
    const buildSeconds = (Date.now() - t0) / 1000;
    if (config.embed && !index.denseEnabled) log(`WARNING: [${config.name}] dense embeddings unavailable; this config ran as BM25 only`);
    // Rerank configs: the cross-encoder reorders the top `depth` fused hits; ranks below keep the
    // fused order of the same index without the reranker (cached embeddings, so this is cheap).
    const depth = Math.min(maxK, opts.rerankDepth ?? EVAL_RERANK_DEPTH);
    const tailIndex = config.rerank && index.rerankEnabled ? await ClauseIndex.build(clauses, { embed: config.embed, rerank: false }) : null;
    const t1 = Date.now();
    const scores: Array<{ q: LbrQuery; s: QueryScores }> = [];
    const runQueries = config.rerank && opts.rerankQueries && opts.rerankQueries < queries.length ? roundRobin(queries, opts.rerankQueries) : queries;
    if (runQueries !== queries) log(`  [${config.name}] on a balanced subset of ${runQueries.length} queries`);
    for (let i = 0; i < runQueries.length; i++) {
      const q = runQueries[i];
      let ranked: Clause[];
      if (tailIndex) {
        const head = (await index.search(q.query, { k: depth })).map((h) => h.clause);
        const seen = new Set(head.map((c) => c.id));
        const tail = (await tailIndex.search(q.query, { k: maxK })).map((h) => h.clause).filter((c) => !seen.has(c.id));
        ranked = [...head, ...tail].slice(0, maxK);
      } else {
        ranked = (await index.search(q.query, { k: maxK })).map((h) => h.clause);
      }
      const s = scoreRanking(ranked, q.snippets);
      scores.push({ q, s });
      perQuery.push({ config: config.name, id: q.id, benchmark: q.benchmark, scores: s, top: ranked.slice(0, 10).map((c) => c.id) });
      if ((i + 1) % 100 === 0 || i + 1 === runQueries.length) log(`  [${config.name}] ${i + 1}/${runQueries.length} queries (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
    }
    // Paired comparison: when the rerank config ran on a subset, score hybrid on the same queries.
    if (runQueries !== queries) {
      const ids = new Set(runQueries.map((q) => q.id));
      const hybrid = perQuery.filter((p) => p.config === "hybrid" && ids.has(p.id));
      if (hybrid.length) {
        const prev = results.find((r) => r.config.name === "hybrid");
        results.push({
          ...summarise(runQueries.map((q) => ({ q, s: hybrid.find((h) => h.id === q.id)!.scores }))),
          config: prev?.config ?? { name: "hybrid", embed: true, rerank: false },
          label: `hybrid (same ${runQueries.length} queries)`,
          denseEnabled: prev?.denseEnabled ?? true,
          rerankEnabled: false,
          buildSeconds: 0,
          querySeconds: 0,
        });
      }
    }
    results.push({
      ...summarise(scores),
      config,
      label: runQueries !== queries ? `${config.name} (${runQueries.length} queries)` : config.name,
      denseEnabled: index.denseEnabled,
      rerankEnabled: index.rerankEnabled,
      buildSeconds,
      querySeconds: (Date.now() - t1) / 1000,
    });
    opts.onConfig?.(assemble());
  }
  return assemble();

  function assemble(): RetrievalEvalResult {
    const queriesPerBenchmark: Record<string, number> = {};
    for (const q of queries) queriesPerBenchmark[q.benchmark] = (queriesPerBenchmark[q.benchmark] ?? 0) + 1;
    return {
      rerankDepth: Math.min(maxK, opts.rerankDepth ?? EVAL_RERANK_DEPTH),
      models: { embed: EMBED_MODEL, rerank: RERANK_MODEL },
      queries: queries.length,
      documents: corpus.docs.length,
      clauses: clauses.length,
      corpusChars,
      queriesPerBenchmark,
      spanCheck: { checked: corpus.spansChecked, mismatches: corpus.spanMismatches },
      limited: { docs: opts.limitDocs, queries: opts.limitQueries },
      ks: K_VALUES,
      baseline: LBR_BASELINE,
      configs: [...results],
      perQuery: [...perQuery],
    };
  }
}
