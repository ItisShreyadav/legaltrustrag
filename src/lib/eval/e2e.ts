/**
 * End-to-end evaluation (gap 9): synthetic agreement + amendment cases with known conflicts, run
 * through `runPipeline`, graded with the Legal RAG Bench taxonomy.
 *
 * Case = one CUAD contract: an "agreement" of N real clauses (distinct categories, no
 * CONFLICT_PAIRS combinations, so the base document has no known internal conflict) and an
 * "amendment" restating K of them as contradictory twins or adding a carve-out (the gold
 * conflicts), plus hard negatives: a paraphrased restatement (agree), an unrelated clause from
 * another contract (not_mentioned) and a boilerplate "except as amended" sentence. Twins,
 * carve-outs and paraphrases come from the ContractConflict generators.
 *
 * Grading, per finding: retrieved (gold pair among candidate pairs), grounded (every quote is an
 * exact substring of its document), correct (matches a gold conflict pair and label). Every error
 * is one of search_failure (gold pair never became a candidate), reasoning_failure (candidate
 * judged wrongly, mislabelled, wrongly flagged, or withheld) or invented (surfaced finding with an
 * inexact quote or an explanation that failed the support check).
 */
import type { Clause, Finding, NliLabel, SourceDocument, TrustReport } from "@/lib/types";
import { CONFLICT_PAIRS } from "@/lib/types";
import { runPipeline } from "@/lib/pipeline";
import type { PipelineOptions, PipelineTrace } from "@/lib/pipeline";
import { checkQuote } from "@/lib/verify";
import type { CuadClause } from "./cuad";
import { CATEGORY_FAMILY, clausePool, contentWords, jaccard, makeCarveout, makeParaphrase, twinFor } from "./dataset";
import type { TwinEdit } from "./dataset";
import { coverageCurve, f1Of, ratio } from "./metrics";
import type { CurvePoint, ScoredItem, Span } from "./metrics";
import { Rng } from "./rng";
import { stubJudgePairs, stubTypeClauses, stubVerifyFindings } from "./stub";

export interface DocSpan extends Span {
  docId: string;
}

export interface GoldConflict {
  id: string;
  label: Extract<NliLabel, "contradict" | "exception">;
  source: "twin" | "carveout";
  category: string;
  edit: string;
  a: DocSpan; // agreement paragraph
  b: DocSpan; // amendment paragraph
}

export interface GoldNegative {
  label: Extract<NliLabel, "agree" | "not_mentioned">;
  source: "paraphrase" | "unrelated" | "boilerplate";
  a?: DocSpan;
  b: DocSpan;
}

export interface E2eCase {
  id: string;
  contractId: string;
  documents: SourceDocument[];
  gold: GoldConflict[];
  negatives: GoldNegative[];
}

export interface BuildCasesOptions {
  n?: number;
  seed?: string;
  clausesPerDoc?: number;
  maxClauseChars?: number;
}

const CONFLICT_KEYS = new Set(CONFLICT_PAIRS.map(([a, b]) => [a, b].sort().join("|")));

/** Synthesise `n` agreement/amendment cases from CUAD (deterministic for a seed). */
export function buildE2eCases(clauses: readonly CuadClause[], opts: BuildCasesOptions = {}): E2eCase[] {
  const n = opts.n ?? 20;
  const per = opts.clausesPerDoc ?? 8;
  const maxChars = opts.maxClauseChars ?? 900;
  const rng = new Rng(opts.seed ?? "e2e-v1");
  const pool = clausePool(clauses).filter((c) => c.text.length <= maxChars);
  const byContract = new Map<string, CuadClause[]>();
  for (const c of pool) byContract.set(c.contractId, [...(byContract.get(c.contractId) ?? []), c]);
  const contracts = rng.shuffle([...byContract.keys()].sort());
  const cases: E2eCase[] = [];

  for (const contractId of contracts) {
    if (cases.length >= n) break;
    // Distinct categories, no known conflict-pair combinations inside the agreement.
    const chosen: CuadClause[] = [];
    for (const c of rng.shuffle(byContract.get(contractId) ?? [])) {
      if (chosen.length >= per) break;
      if (chosen.some((x) => x.category === c.category || CONFLICT_KEYS.has([x.category, c.category].sort().join("|")))) continue;
      chosen.push(c);
    }
    if (chosen.length < per) continue;

    const k = cases.length % 2 === 0 ? 3 : 2;
    const twinKinds: TwinEdit[] = rng.shuffle(["number", "modal", "negation"]);
    const twins: Array<{ idx: number; text: string; edit: string }> = [];
    for (let i = 0; i < chosen.length && twins.length < k - 1; i++) {
      const t = twinFor(chosen[i].text, twinKinds[twins.length % twinKinds.length]) ?? twinFor(chosen[i].text, "modal");
      if (t) twins.push({ idx: i, text: t.text, edit: t.edit });
    }
    const used = new Set(twins.map((t) => t.idx));
    let carve: { idx: number; text: string; edit: string } | null = null;
    for (let i = 0; i < chosen.length && !carve; i++) {
      if (used.has(i)) continue;
      const kOut = makeCarveout(chosen[i].text, chosen[i].category, rng, `Section ${i + 1} of the Agreement`);
      if (kOut.specific) carve = { idx: i, text: kOut.text, edit: `carve-out of "${kOut.subject}" ${kOut.scope}` };
    }
    if (twins.length < k - 1 || !carve) continue;
    used.add(carve.idx);
    let para: { idx: number; text: string } | null = null;
    for (let i = 0; i < chosen.length && !para; i++) {
      if (used.has(i)) continue;
      const p = makeParaphrase(chosen[i].text, 1);
      if (p) para = { idx: i, text: p.text };
    }
    const families = new Set(chosen.map((c) => CATEGORY_FAMILY[c.category]));
    const words = chosen.map((c) => contentWords(c.text));
    const unrelated = rng
      .shuffle(pool)
      .find((c) => c.contractId !== contractId && !families.has(CATEGORY_FAMILY[c.category]) && words.every((w) => jaccard(w, contentWords(c.text)) < 0.1));

    const caseId = `e2e-${String(cases.length + 1).padStart(2, "0")}`;
    const agreementId = `${caseId}-agreement`;
    const amendmentId = `${caseId}-amendment`;

    // Agreement.
    let text = "MASTER AGREEMENT\n\nThis Master Agreement is entered into by and between the parties identified in the signature block below.";
    const spansA: DocSpan[] = [];
    chosen.forEach((c, i) => {
      text += `\n\n${i + 1}. `;
      spansA.push({ docId: agreementId, start: text.length, end: text.length + c.text.length });
      text += c.text;
    });
    const agreement: SourceDocument = { id: agreementId, name: "master-agreement.txt", kind: "txt", text };

    // Amendment paragraphs (body order shuffled; intro and closing fixed).
    type Para = { body: string; gold?: Omit<GoldConflict, "b" | "id">; neg?: Omit<GoldNegative, "b"> };
    const paras: Para[] = [];
    for (const t of twins) {
      paras.push({
        body: `Section ${t.idx + 1} of the Agreement is amended and restated in its entirety to read as follows: ${t.text}`,
        gold: { label: "contradict", source: "twin", category: chosen[t.idx].category, edit: t.edit, a: spansA[t.idx] },
      });
    }
    paras.push({
      body: carve.text,
      gold: { label: "exception", source: "carveout", category: chosen[carve.idx].category, edit: carve.edit, a: spansA[carve.idx] },
    });
    if (para) {
      paras.push({
        body: `Section ${para.idx + 1} of the Agreement is amended and restated in its entirety to read as follows: ${para.text}`,
        neg: { label: "agree", source: "paraphrase", a: spansA[para.idx] },
      });
    }
    if (unrelated) paras.push({ body: unrelated.text, neg: { label: "not_mentioned", source: "unrelated" } });
    const ordered = [
      ...rng.shuffle(paras),
      { body: "Except as amended by this Amendment, the Agreement remains in full force and effect.", neg: { label: "not_mentioned" as const, source: "boilerplate" as const } },
    ];
    let am = "AMENDMENT NO. 1 TO MASTER AGREEMENT\n\nThis Amendment modifies the Master Agreement between the same parties. Capitalised terms have the meanings given in the Master Agreement.";
    const gold: GoldConflict[] = [];
    const negatives: GoldNegative[] = [];
    ordered.forEach((p, i) => {
      am += `\n\n${i + 1}. `;
      const span: DocSpan = { docId: amendmentId, start: am.length, end: am.length + p.body.length };
      am += p.body;
      if (p.gold) gold.push({ id: `${caseId}-g${gold.length + 1}`, ...p.gold, b: span });
      if (p.neg) negatives.push({ ...p.neg, b: span });
    });
    const amendment: SourceDocument = { id: amendmentId, name: "amendment-1.txt", kind: "txt", text: am };
    cases.push({ id: caseId, contractId, documents: [agreement, amendment], gold, negatives });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export type ErrorKind = "search_failure" | "reasoning_failure" | "invented";

export interface FindingGrade {
  findingId: string;
  label: NliLabel;
  status: Finding["verification"]["status"];
  confidence: number;
  surfaced: boolean;
  hardWithheld: boolean;
  retrieved: boolean;
  grounded: boolean;
  pairMatch: string | null; // gold id when the clause pair matches a gold conflict (label-agnostic)
  correct: boolean;
  error?: ErrorKind;
  detail?: string;
}

export interface GoldGrade {
  goldId: string;
  label: NliLabel;
  source: string;
  retrieved: boolean;
  found: boolean;
  engineLabel?: string;
  error?: ErrorKind;
  detail?: string;
}

export interface CaseGrade {
  caseId: string;
  goldCount: number;
  candidatePairs: number;
  findings: FindingGrade[];
  golds: GoldGrade[];
  decisions: { total: number; abstained: number; correct: number };
  error?: string;
}

function clauseSpan(c: Pick<Clause, "docId" | "start" | "end">): DocSpan {
  return { docId: c.docId, start: c.start, end: c.end };
}

function ov(x: DocSpan, y: DocSpan): boolean {
  return x.docId === y.docId && x.start < y.end && y.start < x.end;
}

function pairMatches(x: DocSpan, y: DocSpan, g: { a: DocSpan; b: DocSpan }): boolean {
  return (ov(x, g.a) && ov(y, g.b)) || (ov(x, g.b) && ov(y, g.a));
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function gradeCase(c: E2eCase, report: TrustReport, trace: PipelineTrace): CaseGrade {
  const docs = new Map(c.documents.map((d) => [d.id, d]));
  const clauseById = new Map(trace.clauses.map((x) => [x.id, x]));
  const spanOf = (q: Finding["clauseA"]): DocSpan => {
    const cl = clauseById.get(q.clauseId);
    return cl ? clauseSpan(cl) : { docId: q.docId, start: q.start, end: q.end };
  };
  const goldRetrieved = new Map(c.gold.map((g) => [g.id, trace.pairs.some(([x, y]) => pairMatches(clauseSpan(x), clauseSpan(y), g))]));

  const all = new Map<string, Finding>();
  for (const f of [...report.findings, ...report.withheld]) if (f.kind === "conflict" && f.clauseB) all.set(f.id, f);

  const findings: FindingGrade[] = [...all.values()].map((f) => {
    const sa = spanOf(f.clauseA);
    const sb = spanOf(f.clauseB!);
    const gold = c.gold.find((g) => pairMatches(sa, sb, g)) ?? null;
    const grounded = checkQuote(f.clauseA, docs).passed && checkQuote(f.clauseB!, docs).passed;
    const checks = f.verification.checks;
    const surfaced = f.verification.status !== "withheld";
    const hardWithheld = !surfaced && checks.some((k) => (k.name === "quote" || k.name === "conflict") && !k.passed);
    const supportFailed = checks.some((k) => k.name === "support" && !k.passed);
    const correct = !!gold && gold.label === f.label;
    const grade: FindingGrade = {
      findingId: f.id,
      label: f.label,
      status: f.verification.status,
      confidence: f.confidence,
      surfaced,
      hardWithheld,
      retrieved: gold ? goldRetrieved.get(gold.id) ?? false : true,
      grounded,
      pairMatch: gold?.id ?? null,
      correct,
    };
    if (surfaced && !correct) {
      if (!grounded || supportFailed) {
        grade.error = "invented";
        grade.detail = !grounded ? "quote is not an exact substring of its document" : "explanation failed the support check";
      } else {
        grade.error = "reasoning_failure";
        grade.detail = gold ? `gold pair, wrong label (${f.label} vs ${gold.label})` : "conflict flagged between clauses that do not conflict";
      }
    }
    return grade;
  });

  const judgedByKey = new Map(trace.judged.map((r) => [pairKey(r.a.id, r.b.id), r]));
  const golds: GoldGrade[] = c.gold.map((g) => {
    const retrieved = goldRetrieved.get(g.id) ?? false;
    const matching = findings.filter((f) => f.pairMatch === g.id && f.correct);
    const found = matching.some((f) => f.surfaced);
    const judged = trace.judged.find((r) => pairMatches(clauseSpan(r.a), clauseSpan(r.b), g));
    const engineLabel = judged ? judged.judgment?.label ?? `error: ${judged.error ?? "unknown"}` : undefined;
    const grade: GoldGrade = { goldId: g.id, label: g.label, source: g.source, retrieved, found, engineLabel };
    if (!found) {
      if (!retrieved) {
        grade.error = "search_failure";
        grade.detail = "gold clause pair was not among the candidate pairs";
      } else {
        grade.error = "reasoning_failure";
        grade.detail = matching.length ? "correct finding was withheld (abstained)" : `engine judged the pair as ${engineLabel ?? "unknown"}`;
      }
    }
    return grade;
  });

  // Pair-level decisions over every candidate pair (for answered accuracy).
  const findingByPair = new Map<string, Finding>();
  for (const f of all.values()) findingByPair.set(pairKey(f.clauseA.clauseId, f.clauseB!.clauseId), f);
  let abstained = 0;
  let correct = 0;
  for (const [x, y] of trace.pairs) {
    const g = c.gold.find((gg) => pairMatches(clauseSpan(x), clauseSpan(y), gg));
    const goldLabel = g?.label ?? "none";
    const f = findingByPair.get(pairKey(x.id, y.id));
    const r = judgedByKey.get(pairKey(x.id, y.id));
    let decision: string;
    if (f) decision = f.verification.status === "withheld" ? "abstain" : f.label;
    else if (!r || r.error || !r.judgment) decision = "abstain";
    else decision = r.judgment.label === "contradict" || r.judgment.label === "exception" ? r.judgment.label : "none";
    if (decision === "abstain") abstained++;
    else if (decision === goldLabel) correct++;
  }

  return {
    caseId: c.id,
    goldCount: c.gold.length,
    candidatePairs: trace.pairs.length,
    findings,
    golds,
    decisions: { total: trace.pairs.length, abstained, correct },
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface E2eSummary {
  cases: number;
  caseErrors: number;
  gold: number;
  findings: number;
  surfaced: number;
  withheld: number;
  correctSurfaced: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  retrievalRecall: number | null;
  groundedRate: number | null;
  citationPrecision: number | null;
  abstainRate: number | null;
  answeredAccuracy: number | null;
  abstainedCorrect: number;
  errors: Record<ErrorKind, number>;
}

export function summariseE2e(grades: readonly CaseGrade[]): E2eSummary {
  const ok = grades.filter((g) => !g.error);
  const findings = ok.flatMap((g) => g.findings);
  const golds = ok.flatMap((g) => g.golds);
  const surfaced = findings.filter((f) => f.surfaced);
  const correctSurfaced = surfaced.filter((f) => f.correct).length;
  const precision = ratio(correctSurfaced, surfaced.length);
  const recall = ratio(golds.filter((g) => g.found).length, golds.length);
  const citedGood = surfaced.reduce((s, f) => s + (f.pairMatch && f.grounded ? 2 : 0), 0);
  const decisions = ok.reduce((s, g) => ({ total: s.total + g.decisions.total, abstained: s.abstained + g.decisions.abstained, correct: s.correct + g.decisions.correct }), { total: 0, abstained: 0, correct: 0 });
  const errors: Record<ErrorKind, number> = { search_failure: 0, reasoning_failure: 0, invented: 0 };
  for (const f of findings) if (f.error) errors[f.error]++;
  for (const g of golds) if (g.error) errors[g.error]++;
  return {
    cases: grades.length,
    caseErrors: grades.length - ok.length,
    gold: golds.length,
    findings: findings.length,
    surfaced: surfaced.length,
    withheld: findings.length - surfaced.length,
    correctSurfaced,
    precision,
    recall,
    f1: f1Of(precision, recall),
    retrievalRecall: ratio(golds.filter((g) => g.retrieved).length, golds.length),
    groundedRate: ratio(surfaced.filter((f) => f.grounded).length, surfaced.length),
    citationPrecision: ratio(citedGood, 2 * surfaced.length),
    abstainRate: ratio(findings.length - surfaced.length, findings.length),
    answeredAccuracy: ratio(decisions.correct, decisions.total - decisions.abstained),
    abstainedCorrect: findings.filter((f) => !f.surfaced && f.correct).length,
    errors,
  };
}

/** Findings as scored items for the coverage curve (hard-withheld findings never count as kept). */
export function e2eCurveItems(grades: readonly CaseGrade[]): ScoredItem[] {
  return grades.flatMap((g) => g.findings.map((f) => ({ confidence: f.confidence, correct: f.correct, eligible: !f.hardWithheld })));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface E2eRunOptions {
  /** false = baseline (no verification). */
  verify: boolean;
  /** Deterministic stubs instead of Claude (typing, NLI, verification). */
  dryRun: boolean;
  index?: PipelineOptions["index"];
  log?: (m: string) => void;
}

export interface E2eRunResult {
  config: { verify: boolean; dryRun: boolean; embed: boolean | null; rerank: boolean | null; model: string };
  summary: E2eSummary;
  curve: CurvePoint[];
  grades: CaseGrade[];
}

export async function runE2e(cases: readonly E2eCase[], opts: E2eRunOptions): Promise<E2eRunResult> {
  const grades: CaseGrade[] = [];
  for (const c of cases) {
    const captured: { trace?: PipelineTrace } = {};
    try {
      const report = await runPipeline({ documents: c.documents }, () => {}, {
        verify: opts.verify,
        index: opts.index,
        ...(opts.dryRun ? { typeClauses: stubTypeClauses, judgePairs: stubJudgePairs, verifyFindings: stubVerifyFindings } : {}),
        onTrace: (t) => {
          captured.trace = t;
        },
      });
      if (!captured.trace) throw new Error("pipeline did not report a trace");
      const grade = gradeCase(c, report, captured.trace);
      grades.push(grade);
      opts.log?.(
        `  ${c.id}: ${grade.candidatePairs} candidate pairs, ${grade.findings.length} findings (${grade.findings.filter((f) => f.surfaced).length} surfaced), ` +
          `${grade.golds.filter((g) => g.found).length}/${grade.goldCount} gold found`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      grades.push({ caseId: c.id, goldCount: c.gold.length, candidatePairs: 0, findings: [], golds: [], decisions: { total: 0, abstained: 0, correct: 0 }, error: msg });
      opts.log?.(`  ${c.id}: FAILED ${msg}`);
    }
  }
  return {
    config: {
      verify: opts.verify,
      dryRun: opts.dryRun,
      embed: opts.index?.embed ?? null,
      rerank: opts.index?.rerank ?? null,
      model: opts.dryRun ? "stub" : process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    },
    summary: summariseE2e(grades),
    curve: coverageCurve(e2eCurveItems(grades)),
    grades,
  };
}

