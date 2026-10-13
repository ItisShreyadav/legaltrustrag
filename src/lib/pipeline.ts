/**
 * End-to-end pipeline: structure -> type -> index -> candidate pairs -> NLI -> compliance
 * -> verification -> report. Progress is reported through `onProgress`; the caller (the
 * API route) emits the final `{ stage: "done" }` event with the returned report.
 */
import type {
  AnalyzeRequest,
  Clause,
  ComplianceRow,
  Finding,
  NliLabel,
  ProgressEvent,
  RetrievedClause,
  TrustReport,
} from "@/lib/types";
import { structureDocument } from "@/lib/parse";
import { typeClauses } from "@/lib/typing";
import { ClauseIndex } from "@/lib/retrieval";
import type { CandidatePair } from "@/lib/retrieval";
import { checkRule, clamp01, judgePairs, mapWithConcurrency, wholeClauseQuote } from "@/lib/engine";
import type { PairResult, RuleCheck } from "@/lib/engine";
import { verifyFindings, INSUFFICIENT_EVIDENCE } from "@/lib/verify";
import type { FindingDraft } from "@/lib/verify";
import { buildReport } from "@/lib/report";

type StageName = Exclude<ProgressEvent["stage"], "done" | "error">;

/** Intermediate state exposed to evaluation code through `PipelineOptions.onTrace`. */
export interface PipelineTrace {
  /** Typed clauses of every document. */
  clauses: Clause[];
  /** Conflict candidate pairs sent to the NLI engine. */
  pairs: CandidatePair[];
  /** Every NLI result, including agree / not_mentioned and per-pair errors. */
  judged: PairResult[];
}

/**
 * Optional switches for evaluation and ablations. The app calls `runPipeline` without them,
 * which keeps the default behaviour (full verification, default index, real Claude modules).
 */
export interface PipelineOptions {
  /** false = plain-RAG baseline: skip the verifier, keep every finding, confidence = engine probability. Default true. */
  verify?: boolean;
  /** Retrieval toggles passed to `ClauseIndex.build` (dense embeddings, cross-encoder reranker). */
  index?: { embed?: boolean; rerank?: boolean };
  /** Replacement clause typer (same contract as `typeClauses`), e.g. a heuristic-only stub for dry runs. */
  typeClauses?: typeof typeClauses;
  /** Replacement NLI engine (same contract as `judgePairs`), e.g. a deterministic stub for dry runs. */
  judgePairs?: typeof judgePairs;
  /** Replacement verifier (same contract as `verifyFindings`), e.g. a deterministic stub for dry runs. */
  verifyFindings?: typeof verifyFindings;
  /** Called once, after verification, with the candidate pairs and raw NLI results. */
  onTrace?: (trace: PipelineTrace) => void;
}

/** Baseline (verification off): the engine's finding as-is, never withheld. */
function unverifiedFinding(d: FindingDraft): Finding {
  return {
    id: d.id,
    kind: d.kind,
    label: d.label,
    clauseA: d.clauseA,
    ...(d.clauseB ? { clauseB: d.clauseB } : {}),
    ...(d.rule !== undefined ? { rule: d.rule } : {}),
    explanation: d.explanation,
    confidence: clamp01(d.probability),
    verification: { checks: [], status: "unverified", retries: 0 },
  };
}

const RULE_TOP_K = 8;

function envInt(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Accept the common progress-callback shapes: (done, total), (fraction), ({done,total}) or ({pct}). */
function progressFraction(args: unknown[]): number | null {
  const [a, b] = args;
  if (typeof a === "number" && typeof b === "number") return b > 0 ? a / b : null;
  if (typeof a === "number") return a > 1 ? a / 100 : a;
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    if (typeof o.done === "number" && typeof o.total === "number") return o.total > 0 ? o.done / o.total : null;
    if (typeof o.pct === "number") return o.pct > 1 ? o.pct / 100 : o.pct;
  }
  return null;
}

const COMPLIANCE_LABEL: Record<RuleCheck["status"], NliLabel> = {
  met: "agree",
  violated: "contradict",
  not_addressed: "not_mentioned",
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Retrieval scores are 0..1 (reranker sigmoid or normalised RRF); clamp defensively. */
function evidenceSimilarity(check: RuleCheck, evidence: RetrievedClause[]): number | undefined {
  const owner = check.evidence ?? evidence[0];
  if (!owner || !Number.isFinite(owner.score)) return undefined;
  return clamp01(owner.score);
}

export async function runPipeline(
  req: AnalyzeRequest,
  onProgress: (e: ProgressEvent) => void,
  options: PipelineOptions = {},
): Promise<TrustReport> {
  let lastPct = -1;
  let lastStage: StageName | null = null;
  const emit = (stage: StageName, message: string, pct: number, force = false) => {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if (!force && stage === lastStage && p <= lastPct) return;
    lastStage = stage;
    lastPct = Math.max(lastPct, p);
    onProgress({ stage, message, pct: Math.max(p, lastPct) });
  };

  try {
    const concurrency = envInt("LTR_CONCURRENCY") ?? 4;
    const maxPairs = envInt("LTR_MAX_PAIRS");
    const docs = req.documents;
    const docMap = new Map(docs.map((d) => [d.id, d]));
    const rules = (req.rules ?? []).map((r) => r.trim()).filter((r) => r.length > 0);

    // 1. Structure (0-10).
    emit("structuring", `Structuring ${docs.length} document${docs.length === 1 ? "" : "s"}`, 0, true);
    let clauses: Clause[] = [];
    for (let i = 0; i < docs.length; i++) {
      const structured = await structureDocument(docs[i]);
      clauses.push(...structured);
      emit("structuring", `Found ${structured.length} clauses in ${docs[i].name}`, (10 * (i + 1)) / Math.max(1, docs.length), true);
    }

    // 2. Type (10-30).
    emit("typing", `Classifying ${clauses.length} clauses into CUAD categories`, 10, true);
    clauses = await (options.typeClauses ?? typeClauses)(clauses, {
      onProgress: (...args: unknown[]) => {
        const f = progressFraction(args);
        if (f !== null) emit("typing", `Classifying clauses (${Math.round(clamp01(f) * 100)}%)`, 10 + 20 * clamp01(f));
      },
    });
    const clauseById = new Map(clauses.map((c) => [c.id, c]));

    // 3. Index (30-45).
    emit("retrieval", "Building the hybrid clause index", 30, true);
    const index = await ClauseIndex.build(clauses, {
      ...options.index,
      onProgress: (...args: unknown[]) => {
        const f = progressFraction(args);
        if (f !== null) emit("retrieval", `Indexing clauses (${Math.round(clamp01(f) * 100)}%)`, 30 + 15 * clamp01(f));
      },
    });

    // 4a. Candidate pairs + NLI (45-65).
    const pairs = index.candidatePairs(maxPairs ? { maxPairs } : {});
    emit("conflict", `Comparing ${pairs.length} candidate clause pairs`, 45, true);
    const judged = await (options.judgePairs ?? judgePairs)(
      pairs,
      { docs: docMap, clauseById },
      {
        concurrency,
        onProgress: (done, total) => emit("conflict", `Compared ${done}/${total} clause pairs`, 45 + (20 * done) / Math.max(1, total)),
      },
    );
    const pairErrors = judged.filter((r) => r.error);
    if (judged.length > 0 && pairErrors.length === judged.length) {
      throw new Error(`Every clause comparison failed; first error: ${pairErrors[0].error}`);
    }

    const drafts: FindingDraft[] = [];
    let conflictN = 0;
    for (const r of judged) {
      const j = r.judgment;
      if (!j || (j.label !== "contradict" && j.label !== "exception")) continue; // skip agree / not_mentioned
      drafts.push({
        id: `conflict_${++conflictN}`,
        kind: "conflict",
        label: j.label,
        clauseA: j.quoteA,
        clauseB: j.quoteB,
        explanation: j.explanation,
        probability: j.probability,
        similarity: index.similarity(r.a, r.b),
      });
    }

    // 4b. Compliance rules (65-75): top-8 hybrid search, then ContractNLI-style check.
    interface RuleOutcome {
      rule: string;
      evidence: RetrievedClause[];
      check?: RuleCheck;
      error?: string;
    }
    let rulesDone = 0;
    if (rules.length > 0) emit("conflict", `Checking ${rules.length} compliance rule${rules.length === 1 ? "" : "s"}`, 65, true);
    const ruleOutcomes = await mapWithConcurrency(rules, concurrency, async (rule): Promise<RuleOutcome> => {
      let evidence: RetrievedClause[] = [];
      try {
        evidence = await index.search(rule, { k: RULE_TOP_K });
        const check = await checkRule(rule, evidence, { docs: docMap });
        return { rule, evidence, check };
      } catch (err) {
        return { rule, evidence, error: errorMessage(err) };
      } finally {
        rulesDone++;
        emit("conflict", `Checked rule ${rulesDone}/${rules.length}`, 65 + (10 * rulesDone) / rules.length);
      }
    });
    const ruleErrors = ruleOutcomes.filter((o) => o.error);
    if (ruleOutcomes.length > 0 && ruleErrors.length === ruleOutcomes.length) {
      throw new Error(`Every compliance check failed; first error: ${ruleErrors[0].error}`);
    }

    const failedRuleFindings = new Map<number, Finding>(); // rule index -> withheld finding for an engine failure
    ruleOutcomes.forEach((o, i) => {
      const id = `rule_${i + 1}`;
      if (o.check?.quote) {
        drafts.push({
          id,
          kind: "compliance",
          label: COMPLIANCE_LABEL[o.check.status],
          clauseA: o.check.quote,
          rule: o.rule,
          explanation: o.check.explanation,
          probability: o.check.probability,
          similarity: evidenceSimilarity(o.check, o.evidence),
        });
      } else if (o.error && o.evidence[0]) {
        // Engine failed for this rule: surface it as withheld rather than as "not addressed".
        failedRuleFindings.set(i, {
          id,
          kind: "compliance",
          label: "not_mentioned",
          clauseA: wholeClauseQuote(o.evidence[0].clause, docMap),
          rule: o.rule,
          explanation: INSUFFICIENT_EVIDENCE,
          confidence: 0,
          verification: {
            checks: [{ name: "support", passed: false, detail: `compliance engine failed: ${o.error}` }],
            status: "withheld",
            retries: 0,
          },
        });
      }
    });

    // 5. Verification (75-95).
    let verified: Finding[];
    if (options.verify === false) {
      emit("verification", `Verification disabled (baseline): keeping ${drafts.length} unverified finding${drafts.length === 1 ? "" : "s"}`, 75, true);
      verified = drafts.map(unverifiedFinding);
    } else {
      emit("verification", `Verifying ${drafts.length} finding${drafts.length === 1 ? "" : "s"}`, 75, true);
      verified = await (options.verifyFindings ?? verifyFindings)(
        drafts,
        { docs: docMap, clauses: clauseById },
        {
          concurrency,
          onProgress: (done, total) => emit("verification", `Verified ${done}/${total} findings`, 75 + (20 * done) / Math.max(1, total)),
        },
      );
    }
    options.onTrace?.({ clauses, pairs, judged });
    const byId = new Map(verified.map((f) => [f.id, f]));

    const compliance: ComplianceRow[] = ruleOutcomes.map((o, i) => {
      const id = `rule_${i + 1}`;
      const finding = byId.get(id) ?? failedRuleFindings.get(i);
      const status = o.check?.status ?? "not_addressed";
      return finding ? { rule: o.rule, status, finding } : { rule: o.rule, status };
    });

    // 6. Report (95-100).
    emit("report", "Assembling the trust report", 95, true);
    const report = buildReport({
      docs,
      clauses,
      findings: verified.filter((f) => f.kind === "conflict"),
      compliance,
      candidatePairs: pairs.length,
    });
    emit(
      "report",
      `Report ready: ${report.stats.verified} verified, ${report.stats.unverified} unverified, ${report.stats.withheld} withheld` +
        (pairErrors.length || ruleErrors.length
          ? ` (${pairErrors.length} pair and ${ruleErrors.length} rule checks failed)`
          : ""),
      100,
      true,
    );
    return report;
  } catch (err) {
    onProgress({ stage: "error", message: errorMessage(err) });
    throw err;
  }
}
