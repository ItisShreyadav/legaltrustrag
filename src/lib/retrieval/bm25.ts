/**
 * Okapi BM25 over pre-tokenised documents, plus TF-IDF vectors for symmetric
 * lexical similarity between two clauses (BM25 itself is asymmetric).
 */

export interface Bm25Options {
  k1?: number;
  b?: number;
}

export class Bm25 {
  readonly k1: number;
  readonly b: number;
  private readonly docTf: Array<Map<string, number>> = [];
  private readonly docLen: number[] = [];
  private readonly df = new Map<string, number>();
  private readonly idfCache = new Map<string, number>();
  private readonly norms: number[] = [];
  private avgLen = 0;

  constructor(docs: string[][], opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.2;
    this.b = opts.b ?? 0.75;
    let total = 0;
    for (const tokens of docs) {
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.docTf.push(tf);
      this.docLen.push(tokens.length);
      total += tokens.length;
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgLen = docs.length ? total / docs.length : 0;
    // Precompute TF-IDF vector norms for cosine similarity.
    for (const tf of this.docTf) {
      let sq = 0;
      for (const [t, f] of tf) {
        const w = (1 + Math.log(f)) * this.idf(t);
        sq += w * w;
      }
      this.norms.push(Math.sqrt(sq));
    }
  }

  get size(): number {
    return this.docTf.length;
  }

  /** BM25+ style non-negative IDF: ln(1 + (N - df + 0.5) / (df + 0.5)). */
  idf(term: string): number {
    const cached = this.idfCache.get(term);
    if (cached !== undefined) return cached;
    const n = this.docTf.length;
    const df = this.df.get(term) ?? 0;
    const v = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    this.idfCache.set(term, v);
    return v;
  }

  /** BM25 score of document `i` for the given query tokens. */
  score(query: string[], i: number): number {
    const tf = this.docTf[i];
    if (!tf || tf.size === 0) return 0;
    const len = this.docLen[i];
    const norm = this.k1 * (1 - this.b + this.b * (this.avgLen ? len / this.avgLen : 1));
    let s = 0;
    // Count repeated query terms once per occurrence (standard BM25 query tf = linear).
    for (const q of query) {
      const f = tf.get(q);
      if (!f) continue;
      s += this.idf(q) * ((f * (this.k1 + 1)) / (f + norm));
    }
    return s;
  }

  /** Cosine similarity between the (log-tf * idf) vectors of documents i and j. */
  cosine(i: number, j: number): number {
    const a = this.docTf[i];
    const b = this.docTf[j];
    const na = this.norms[i];
    const nb = this.norms[j];
    if (!a || !b || !na || !nb) return 0;
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    let dot = 0;
    for (const [t, f] of small) {
      const g = large.get(t);
      if (!g) continue;
      const idf = this.idf(t);
      dot += (1 + Math.log(f)) * idf * (1 + Math.log(g)) * idf;
    }
    return dot / (na * nb);
  }
}
