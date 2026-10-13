/**
 * Deterministic stand-ins for the Claude-backed stages, used by `--dry-run` so the evaluation
 * plumbing (dataset -> pipeline -> grading -> metrics -> curves -> reports) runs end to end
 * without an API key. The numbers they produce measure the stubs, not the system.
 *
 * - stubJudgeTexts: lexical NLI heuristic (near-duplicate with a number/"not" difference ->
 *   contradict; exception wording -> exception; low overlap -> not_mentioned) plus ~15% seeded
 *   label noise at lowered probability, so confidence correlates with correctness.
 * - stubJudgePairs: same contract as engine.judgePairs; ~5% of quotes are deliberately corrupted
 *   to exercise the exact-quote (groundedness) check.
 * - stubVerifyFindings: same contract as verify.verifyFindings, using the real quote check,
 *   lexical relevance and confidence formula, with stubbed support / second-opinion checks.
 * - stubTypeClauses: keyword heuristics only (no LLM).
 */
import type { Clause, Finding, NliLabel, Quote, SourceDocument, VerificationCheck, VerificationResult } from "@/lib/types";
import { clamp01, locateInClause, mapWithConcurrency, wholeClauseQuote } from "@/lib/engine";
import type { ClausePair, EngineContext, JudgePairsContext, JudgePairsOptions, PairJudgment, PairResult } from "@/lib/engine";
import { checkQuote, combineConfidence, confidenceThreshold, INSUFFICIENT_EVIDENCE, lexicalRelevance } from "@/lib/verify";
import type { FindingDraft, VerifyContext, VerifyManyOptions } from "@/lib/verify";
import { heuristicType } from "@/lib/typing";
import type { TypeClausesOptions } from "@/lib/typing";
import { LABELS } from "./dataset";
import { hash32 } from "./rng";

const EXCEPTION_WORDING = /\b(notwithstanding|shall not apply|except as|provided,? however|other than|save for)\b/i;
const NUMBER_WORD = /^(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|sixty|ninety|hundred)$/;

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+|\d[\d,.]*/g) ?? [];
}

function multisetDiff(a: string[], b: string[]): string[] {
  const count = new Map<string, number>();
  for (const t of a) count.set(t, (count.get(t) ?? 0) + 1);
  for (const t of b) count.set(t, (count.get(t) ?? 0) - 1);
  return [...count.entries()].filter(([, n]) => n !== 0).map(([t]) => t);
}

function jaccardOf(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

export interface StubDecision {
  label: NliLabel;
  probability: number;
  explanation: string;
}

/** Deterministic heuristic NLI over two texts, with seeded label noise. */
export function stubJudgeTexts(a: string, b: string, salt = ""): StubDecision {
  const ta = tokens(a);
  const tb = tokens(b);
  const jac = jaccardOf(ta, tb);
  let label: NliLabel;
  let strength: number;
  if (jac >= 0.7) {
    const diff = multisetDiff(ta, tb);
    const flips = diff.some((t) => t === "not" || /^\d/.test(t) || NUMBER_WORD.test(t));
    label = flips ? "contradict" : "agree";
    strength = flips ? 0.86 : 0.8;
  } else if (EXCEPTION_WORDING.test(a) !== EXCEPTION_WORDING.test(b) && jac >= 0.2) {
    label = "exception";
    strength = 0.74;
  } else if (jac < 0.12) {
    label = "not_mentioned";
    strength = 0.72;
  } else {
    label = "not_mentioned";
    strength = 0.5;
  }
  const h = hash32(`${a}\u0000${b}\u0000${salt}`);
  const roll = h % 100;
  let probability = strength + ((h >>> 8) % 10) / 100;
  if (roll < 15) {
    const others = LABELS.filter((l) => l !== label);
    label = others[(h >>> 4) % others.length];
    probability = 0.35 + ((h >>> 12) % 25) / 100;
  }
  const head = (t: string) => t.split(/\s+/).slice(0, 8).join(" ");
  return {
    label,
    probability: clamp01(probability),
    explanation: `Stub judge (${label}): Clause A says "${head(a)} ..." and Clause B says "${head(b)} ..." (token overlap ${jac.toFixed(2)}).`,
  };
}

/** First sentence of the clause (<= 240 chars) as an exact quote. */
function leadQuote(clause: Clause, docs: Map<string, SourceDocument>): Quote {
  const first = clause.text.split(/(?<=[.;])\s+/)[0] ?? clause.text;
  const span = first.length > 240 ? first.slice(0, first.lastIndexOf(" ", 240)) : first;
  return locateInClause(clause, span, docs) ?? wholeClauseQuote(clause, docs);
}

/** Corrupt a quote (offsets unchanged, text altered) so the exact-quote check fails. */
function corrupt(q: Quote): Quote {
  return { ...q, text: q.text.replace(/\b(shall|will|may|must|the|and)\b/i, (m) => (m === m.toUpperCase() ? m.toLowerCase() : m.toUpperCase())) + " " };
}

/** Stub for engine.judgePair (pair eval). */
export async function stubJudgePair(a: Clause, b: Clause, ctx: EngineContext): Promise<PairJudgment> {
  const d = stubJudgeTexts(a.text, b.text);
  return { label: d.label, explanation: d.explanation, probability: d.probability, quoteA: leadQuote(a, ctx.docs), quoteB: leadQuote(b, ctx.docs) };
}

/** Stub for engine.judgePairs (pipeline dry runs). */
export async function stubJudgePairs(
  pairs: ReadonlyArray<ClausePair>,
  ctx: JudgePairsContext,
  opts: JudgePairsOptions = {},
): Promise<PairResult[]> {
  return mapWithConcurrency(
    pairs,
    opts.concurrency ?? 4,
    async (pair): Promise<PairResult> => {
      const [a, b] = pair;
      const reason = pair.length > 2 ? (pair as readonly [Clause, Clause, string])[2] : undefined;
      const judgment = await stubJudgePair(a, b, { docs: ctx.docs });
      const h = hash32(`${a.id}|${b.id}|quote`) % 100;
      if (h < 5) judgment.quoteB = corrupt(judgment.quoteB);
      return { a, b, reason, judgment };
    },
    opts.onProgress,
  );
}

/** Stub for verify.verifyFindings: real quote check, lexical relevance and confidence formula. */
export async function stubVerifyFindings(drafts: FindingDraft[], ctx: VerifyContext, opts: VerifyManyOptions = {}): Promise<Finding[]> {
  return mapWithConcurrency(
    drafts,
    opts.concurrency ?? 4,
    async (d): Promise<Finding> => {
      const checks: VerificationCheck[] = [];
      const scores: number[] = [];
      const qa = checkQuote(d.clauseA, ctx.docs, ctx.clauses);
      const qb = d.clauseB ? checkQuote(d.clauseB, ctx.docs, ctx.clauses) : undefined;
      const quotePassed = qa.passed && (qb ? qb.passed : true);
      checks.push({ name: "quote", passed: quotePassed, detail: qb ? `A: ${qa.detail} | B: ${qb.detail}` : qa.detail });
      scores.push(quotePassed ? 1 : 0);
      let conflictFailed = false;
      if (quotePassed) {
        const rel = lexicalRelevance(d.explanation, [d.clauseA.text, d.clauseB?.text ?? ""].filter(Boolean));
        checks.push({ name: "relevance", passed: rel.passed, detail: `stub: lexical overlap ${rel.overlap.toFixed(2)}` });
        scores.push(rel.probability);
        const supported = hash32(`${d.id}|${d.explanation}|support`) % 100 >= 12;
        checks.push({ name: "support", passed: supported, detail: supported ? "stub: supported" : "stub: unsupported" });
        scores.push(supported ? 0.85 : 0.2);
        if (d.kind === "conflict" && d.clauseB) {
          const ca = ctx.clauses.get(d.clauseA.clauseId);
          const cb = ctx.clauses.get(d.clauseB.clauseId);
          const second = stubJudgeTexts(cb?.text ?? d.clauseB.text, ca?.text ?? d.clauseA.text, "second-opinion");
          const passed = second.label === "contradict" || second.label === "exception";
          checks.push({ name: "conflict", passed, detail: `stub second opinion: ${second.label} (${second.probability.toFixed(2)})` });
          scores.push(passed ? second.probability : Math.min(second.probability, 1 - second.probability));
          conflictFailed = !passed;
        }
      }
      const agreement = scores.reduce((s, x) => s + x, 0) / Math.max(1, scores.length);
      const confidence = clamp01(combineConfidence(d.probability, agreement, d.similarity));
      let status: VerificationResult["status"];
      if (!quotePassed || conflictFailed) status = "withheld";
      else if (checks.every((c) => c.passed)) status = "verified";
      else status = "unverified";
      if (confidence < confidenceThreshold()) status = "withheld";
      return {
        id: d.id,
        kind: d.kind,
        label: d.label,
        clauseA: d.clauseA,
        ...(d.clauseB ? { clauseB: d.clauseB } : {}),
        ...(d.rule !== undefined ? { rule: d.rule } : {}),
        explanation: status === "withheld" ? INSUFFICIENT_EVIDENCE : d.explanation,
        confidence,
        verification: { checks, status, retries: 0 },
      };
    },
    opts.onProgress,
  );
}

/** Heuristic-only clause typing (no LLM), same contract as typing.typeClauses. */
export async function stubTypeClauses(clauses: Clause[], opts: TypeClausesOptions = {}): Promise<Clause[]> {
  const out = clauses.map((c) => {
    const g = heuristicType(c) ?? { category: "Other" as const, confidence: 0.3 };
    return { ...c, category: g.category, categoryConfidence: g.confidence };
  });
  opts.onProgress?.(clauses.length, clauses.length);
  return out;
}
