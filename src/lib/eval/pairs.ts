/**
 * Clause-pair NLI evaluation on ContractConflict: `judgePair` on every record, scored with
 * accuracy, per-label P/R/F1 (contradiction F1 is the ContractNLI comparison point, 0.36-0.41),
 * a confusion matrix, per-source accuracy and the coverage-vs-accuracy curve over the engine's
 * probability.
 */
import type { Clause, NliLabel, SourceDocument } from "@/lib/types";
import { mapWithConcurrency } from "@/lib/engine";
import type { EngineContext, PairJudgment } from "@/lib/engine";
import type { ConflictRecord } from "./dataset";
import { LABELS } from "./dataset";
import { classify, coverageCurve, f1Of, ratio } from "./metrics";
import type { ClassificationReport, CurvePoint } from "./metrics";

export type PairJudge = (a: Clause, b: Clause, ctx: EngineContext) => Promise<PairJudgment>;

const EXCEPTION_RE = /\b(except|notwithstanding|subject to|provided,? however|provided that|unless|other than|save for)\b/i;

function singleClause(docId: string, name: string, text: string, category: Clause["category"]): { doc: SourceDocument; clause: Clause } {
  const doc: SourceDocument = { id: docId, name, kind: "txt", text };
  const clause: Clause = {
    id: `${docId}:c_1`,
    docId,
    path: [],
    text,
    start: 0,
    end: text.length,
    category,
    categoryConfidence: 1,
    definedTerms: [],
    references: [],
    isException: EXCEPTION_RE.test(text),
  };
  return { doc, clause };
}

/** Each side of a record becomes its own one-clause document. */
export function recordToClauses(r: ConflictRecord): { a: Clause; b: Clause; docs: Map<string, SourceDocument> } {
  const A = singleClause(`${r.id}-A`, `${r.id} clause A`, r.clauseA, r.category);
  const B = singleClause(`${r.id}-B`, `${r.id} clause B`, r.clauseB, r.categoryB ?? r.category);
  return { a: A.clause, b: B.clause, docs: new Map([[A.doc.id, A.doc], [B.doc.id, B.doc]]) };
}

export interface PairPrediction {
  id: string;
  source: string;
  editType?: string;
  gold: NliLabel;
  pred: NliLabel | null;
  confidence: number | null;
  correct: boolean;
  error?: string;
}

export interface PairEvalResult {
  n: number;
  judged: number;
  errors: number;
  subset?: string;
  report: ClassificationReport;
  contradictionF1: number | null;
  /** Binary "is there a conflict" (contradict|exception vs agree|not_mentioned). */
  conflictDetection: { precision: number | null; recall: number | null; f1: number | null };
  bySource: Record<string, { n: number; accuracy: number | null }>;
  curve: CurvePoint[];
  predictions: PairPrediction[];
}

export interface PairEvalOptions {
  judge: PairJudge;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function runPairEval(records: readonly ConflictRecord[], opts: PairEvalOptions, subset?: string): Promise<PairEvalResult> {
  const predictions = await mapWithConcurrency(
    records,
    opts.concurrency ?? 4,
    async (r): Promise<PairPrediction> => {
      const { a, b, docs } = recordToClauses(r);
      try {
        const j = await opts.judge(a, b, { docs });
        return { id: r.id, source: r.source, editType: r.editType, gold: r.label, pred: j.label, confidence: j.probability, correct: j.label === r.label };
      } catch (err) {
        return { id: r.id, source: r.source, editType: r.editType, gold: r.label, pred: null, confidence: null, correct: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    opts.onProgress,
  );
  return scorePairs(predictions, subset);
}

export function scorePairs(predictions: PairPrediction[], subset?: string): PairEvalResult {
  const ok = predictions.filter((p) => p.pred !== null);
  const report = classify(ok.map((p) => ({ gold: p.gold, pred: p.pred as string })), LABELS);
  const isConflict = (l: string | null) => l === "contradict" || l === "exception";
  const tp = ok.filter((p) => isConflict(p.gold) && isConflict(p.pred)).length;
  const predPos = ok.filter((p) => isConflict(p.pred)).length;
  const goldPos = ok.filter((p) => isConflict(p.gold)).length;
  const precision = ratio(tp, predPos);
  const recall = ratio(tp, goldPos);
  const bySource: PairEvalResult["bySource"] = {};
  for (const src of [...new Set(ok.map((p) => p.source))].sort()) {
    const sub = ok.filter((p) => p.source === src);
    bySource[src] = { n: sub.length, accuracy: ratio(sub.filter((p) => p.correct).length, sub.length) };
  }
  return {
    n: predictions.length,
    judged: ok.length,
    errors: predictions.length - ok.length,
    subset,
    report,
    contradictionF1: report.perLabel.find((l) => l.label === "contradict")?.f1 ?? null,
    conflictDetection: { precision, recall, f1: f1Of(precision, recall) },
    bySource,
    curve: coverageCurve(ok.map((p) => ({ confidence: p.confidence ?? 0, correct: p.correct }))),
    predictions,
  };
}
