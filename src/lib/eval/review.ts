/**
 * Hand verification of the ContractConflict set: stratified review sample (CSV with a blank
 * `human_label` column) and inter-annotator agreement (Cohen's kappa) once it is filled in.
 */
import type { NliLabel } from "@/lib/types";
import type { ConflictRecord } from "./dataset";
import { LABELS } from "./dataset";
import { classify, cohenKappa, kappaBand } from "./metrics";
import type { ClassificationReport, KappaReport } from "./metrics";
import { Rng } from "./rng";

export const REVIEW_COLUMNS = ["n", "id", "label", "source", "category", "edit", "clauseA", "clauseB", "human_label", "notes"] as const;

/** Stratified by label (proportional, at least one per label when n >= labels). */
export function reviewSample(records: readonly ConflictRecord[], n: number, seed = "review-v1"): ConflictRecord[] {
  const rng = new Rng(seed);
  const byLabel = new Map<NliLabel, ConflictRecord[]>();
  for (const r of records) byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r]);
  const total = records.length;
  const quota = new Map<NliLabel, number>();
  let assigned = 0;
  for (const l of LABELS) {
    const q = Math.min(byLabel.get(l)?.length ?? 0, Math.max(n >= LABELS.length ? 1 : 0, Math.floor((n * (byLabel.get(l)?.length ?? 0)) / total)));
    quota.set(l, q);
    assigned += q;
  }
  // Hand out the remainder to the largest strata first.
  const order = [...LABELS].sort((a, b) => (byLabel.get(b)?.length ?? 0) - (byLabel.get(a)?.length ?? 0));
  for (let i = 0; assigned < Math.min(n, total); i++) {
    const l = order[i % order.length];
    if ((quota.get(l) ?? 0) < (byLabel.get(l)?.length ?? 0)) {
      quota.set(l, (quota.get(l) ?? 0) + 1);
      assigned++;
    }
  }
  const picked = LABELS.flatMap((l) => rng.sample(byLabel.get(l) ?? [], quota.get(l) ?? 0));
  return rng.shuffle(picked);
}

const LABEL_ALIASES: Record<string, NliLabel> = {
  agree: "agree",
  agreement: "agree",
  entailment: "agree",
  consistent: "agree",
  a: "agree",
  contradict: "contradict",
  contradiction: "contradict",
  conflict: "contradict",
  c: "contradict",
  exception: "exception",
  carveout: "exception",
  "carve-out": "exception",
  e: "exception",
  not_mentioned: "not_mentioned",
  "not mentioned": "not_mentioned",
  notmentioned: "not_mentioned",
  unrelated: "not_mentioned",
  neutral: "not_mentioned",
  n: "not_mentioned",
};

/** Normalise a hand-written label ("Contradiction", "carve-out", "n") or return null. */
export function normaliseLabel(raw: string | undefined): NliLabel | null {
  const key = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return LABEL_ALIASES[key] ?? LABEL_ALIASES[key.replace(/[\s-]+/g, "_")] ?? null;
}

export interface AgreementReport {
  rows: number;
  annotated: number;
  invalid: Array<{ id: string; value: string }>;
  kappa: KappaReport;
  band: string;
  confusion: ClassificationReport;
  disagreements: Array<{ id: string; gold: NliLabel; human: NliLabel; source: string }>;
}

/**
 * Agreement between the generated label and `human_label`. The generated label comes from the CSV
 * `label` column, or from the dataset by id when the sample was exported blind.
 */
export function reviewAgreement(rows: ReadonlyArray<Record<string, string>>, dataset: ReadonlyMap<string, ConflictRecord>): AgreementReport {
  const invalid: AgreementReport["invalid"] = [];
  const pairs: Array<{ id: string; gold: NliLabel; human: NliLabel; source: string }> = [];
  for (const r of rows) {
    const id = (r.id ?? "").trim();
    const rec = dataset.get(id);
    const gold = normaliseLabel(r.label) ?? rec?.label ?? null;
    const humanRaw = r.human_label ?? "";
    if (!humanRaw.trim()) continue;
    const human = normaliseLabel(humanRaw);
    if (!gold || !human) {
      invalid.push({ id, value: humanRaw });
      continue;
    }
    pairs.push({ id, gold, human, source: r.source || rec?.source || "" });
  }
  const kappa = cohenKappa(pairs.map((p) => ({ a: p.gold, b: p.human })));
  return {
    rows: rows.length,
    annotated: pairs.length,
    invalid,
    kappa,
    band: kappaBand(kappa.kappa),
    confusion: classify(pairs.map((p) => ({ gold: p.gold, pred: p.human })), LABELS),
    disagreements: pairs.filter((p) => p.gold !== p.human),
  };
}
