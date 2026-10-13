/**
 * Pure metric helpers: multi-class classification, Cohen's kappa, selective prediction
 * (coverage vs accuracy) and LegalBench-RAG style span overlap.
 */

export interface LabelScores {
  label: string;
  support: number; // gold count
  predicted: number;
  tp: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface ClassificationReport {
  labels: string[];
  n: number;
  accuracy: number | null;
  macroF1: number | null;
  perLabel: LabelScores[];
  /** confusion[gold][pred] */
  confusion: Record<string, Record<string, number>>;
}

export function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export function f1Of(p: number | null, r: number | null): number | null {
  if (p === null || r === null) return null;
  return p + r > 0 ? (2 * p * r) / (p + r) : 0;
}

/** Accuracy, per-label P/R/F1, macro-F1 and a confusion matrix (rows = gold, columns = predicted). */
export function classify(pairs: ReadonlyArray<{ gold: string; pred: string }>, labels: readonly string[]): ClassificationReport {
  const all = [...labels];
  for (const p of pairs) {
    if (!all.includes(p.gold)) all.push(p.gold);
    if (!all.includes(p.pred)) all.push(p.pred);
  }
  const confusion: Record<string, Record<string, number>> = {};
  for (const g of all) confusion[g] = Object.fromEntries(all.map((p) => [p, 0]));
  for (const p of pairs) confusion[p.gold][p.pred]++;

  const perLabel = all.map((label): LabelScores => {
    const tp = confusion[label][label];
    const support = all.reduce((s, p) => s + confusion[label][p], 0);
    const predicted = all.reduce((s, g) => s + confusion[g][label], 0);
    const precision = ratio(tp, predicted);
    const recall = ratio(tp, support);
    return { label, support, predicted, tp, precision, recall, f1: f1Of(precision, recall) };
  });
  const correct = pairs.filter((p) => p.gold === p.pred).length;
  const scored = perLabel.filter((l) => labels.includes(l.label) && l.support > 0 && l.f1 !== null);
  return {
    labels: all,
    n: pairs.length,
    accuracy: ratio(correct, pairs.length),
    macroF1: scored.length ? scored.reduce((s, l) => s + (l.f1 ?? 0), 0) / scored.length : null,
    perLabel,
    confusion,
  };
}

export interface KappaReport {
  n: number;
  observed: number | null;
  expected: number | null;
  kappa: number | null;
}

/** Cohen's kappa between two raters over the same items. */
export function cohenKappa(pairs: ReadonlyArray<{ a: string; b: string }>): KappaReport {
  const n = pairs.length;
  if (n === 0) return { n, observed: null, expected: null, kappa: null };
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  let agree = 0;
  for (const { a, b } of pairs) {
    ca.set(a, (ca.get(a) ?? 0) + 1);
    cb.set(b, (cb.get(b) ?? 0) + 1);
    if (a === b) agree++;
  }
  const po = agree / n;
  let pe = 0;
  for (const [k, v] of ca) pe += (v / n) * ((cb.get(k) ?? 0) / n);
  const kappa = pe >= 1 ? (po >= 1 ? 1 : 0) : (po - pe) / (1 - pe);
  return { n, observed: po, expected: pe, kappa };
}

/** Landis & Koch (1977) verbal scale. */
export function kappaBand(k: number | null): string {
  if (k === null) return "n/a";
  if (k < 0) return "poor";
  if (k <= 0.2) return "slight";
  if (k <= 0.4) return "fair";
  if (k <= 0.6) return "moderate";
  if (k <= 0.8) return "substantial";
  return "almost perfect";
}

// ---------------------------------------------------------------------------
// Selective prediction: coverage vs accuracy
// ---------------------------------------------------------------------------

export interface ScoredItem {
  confidence: number;
  correct: boolean;
  /** false = withheld regardless of threshold (e.g. failed the quote or conflict check). Default true. */
  eligible?: boolean;
}

export interface CurvePoint {
  threshold: number;
  kept: number;
  total: number;
  correct: number;
  coverage: number | null;
  accuracy: number | null;
}

/** Thresholds 0.00, 0.05, ..., 1.00 (computed from integers to avoid float drift). */
export function defaultThresholds(step = 0.05): number[] {
  const n = Math.round(1 / step);
  return Array.from({ length: n + 1 }, (_, i) => Math.round((i / n) * 1e6) / 1e6);
}

/** Keep an item at threshold t iff eligible and confidence >= t; coverage = kept / total. */
export function coverageCurve(items: readonly ScoredItem[], thresholds = defaultThresholds()): CurvePoint[] {
  return thresholds.map((threshold) => {
    const kept = items.filter((x) => x.eligible !== false && x.confidence >= threshold - 1e-12);
    const correct = kept.filter((x) => x.correct).length;
    return {
      threshold,
      kept: kept.length,
      total: items.length,
      correct,
      coverage: ratio(kept.length, items.length),
      accuracy: ratio(correct, kept.length),
    };
  });
}

/** Area under the accuracy-vs-coverage curve (trapezoid over the swept points; higher is better). */
export function areaUnderCurve(points: readonly CurvePoint[]): number | null {
  const pts = points
    .filter((p) => p.coverage !== null && p.accuracy !== null)
    .map((p) => ({ x: p.coverage as number, y: p.accuracy as number }))
    .sort((a, b) => a.x - b.x);
  if (pts.length < 2) return null;
  let area = 0;
  for (let i = 1; i < pts.length; i++) area += ((pts[i].x - pts[i - 1].x) * (pts[i].y + pts[i - 1].y)) / 2;
  const span = pts[pts.length - 1].x - pts[0].x;
  return span > 0 ? area / span : pts[0].y;
}

// ---------------------------------------------------------------------------
// Spans
// ---------------------------------------------------------------------------

export interface Span {
  start: number;
  end: number;
}

export function overlapLen(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function overlaps(a: Span, b: Span): boolean {
  return overlapLen(a, b) > 0;
}

export function mean(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}
