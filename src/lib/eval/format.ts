/**
 * Markdown renderers for every evaluation result (used by the scripts and REPORT.md).
 */
import type { RetrievalEvalResult } from "./retrieval";
import { REPORT_P, REPORT_R } from "./retrieval";
import { mdTable, num, pct } from "./io";
import type { PairEvalResult } from "./pairs";
import type { E2eRunResult, E2eSummary } from "./e2e";

export function retrievalMarkdown(r: RetrievalEvalResult): string {
  const lines: string[] = [];
  const limited = r.limited.docs || r.limited.queries;
  lines.push(
    `LegalBench-RAG-mini: ${r.queries} queries over ${r.documents} documents (${(r.corpusChars / 1e6).toFixed(2)}M chars) split into ${r.clauses} clauses by \`structureDocument\`.` +
      (limited ? ` **Limited run** (${r.limited.docs ? `${r.limited.docs} documents` : ""}${r.limited.docs && r.limited.queries ? ", " : ""}${r.limited.queries ? `${r.limited.queries} queries` : ""}): a smaller corpus is easier, so these numbers are not comparable to the baseline.` : ""),
  );
  lines.push(`Queries per benchmark: ${Object.entries(r.queriesPerBenchmark).map(([b, n]) => `${b} ${n}`).join(", ")}. Gold spans checked against the corpus text: ${r.spanCheck.checked - r.spanCheck.mismatches}/${r.spanCheck.checked} exact.`);
  lines.push("");
  lines.push("**Character-level metrics (the paper's definition; comparable to the published baseline).** Overall = mean of the four per-benchmark means.");
  lines.push("");
  const charHeader = ["config", ...REPORT_P.map((k) => `P@${k}`), ...REPORT_R.map((k) => `R@${k}`)];
  const charRows: Array<Array<string | number>> = [
    ["published baseline", pct(r.baseline.precisionAt1), "", "", "", "", "", pct(r.baseline.recallAt64)],
    ...r.configs.map((c) => [
      (c.label ?? c.config.name) + (c.config.embed && !c.denseEnabled ? " (dense unavailable)" : ""),
      ...REPORT_P.map((k) => pct(c.overall.charP[k])),
      ...REPORT_R.map((k) => pct(c.overall.charR[k])),
    ]),
  ];
  lines.push(mdTable(charHeader, charRows));
  lines.push("");
  lines.push("**Hit-based metrics** (a retrieved clause is a hit when it overlaps a gold span; P@k = hits / k, R@k = share of gold spans touched).");
  lines.push("");
  lines.push(
    mdTable(
      charHeader,
      r.configs.map((c) => [c.label ?? c.config.name, ...REPORT_P.map((k) => pct(c.overall.hitP[k])), ...REPORT_R.map((k) => pct(c.overall.hitR[k]))]),
    ),
  );
  lines.push("");
  lines.push("**Per benchmark** (char P@1 / char R@64 / hit P@1 / hit R@64):");
  lines.push("");
  const benches = Object.keys(r.queriesPerBenchmark);
  lines.push(
    mdTable(
      ["config", ...benches],
      r.configs.map((c) => [
        c.label ?? c.config.name,
        ...benches.map((b) => {
          const t = c.perBenchmark[b];
          return t ? `${pct(t.charP[1])} / ${pct(t.charR[64])} / ${pct(t.hitP[1])} / ${pct(t.hitR[64])}` : "n/a";
        }),
      ]),
    ),
  );
  lines.push("");
  lines.push(
    mdTable(
      ["config", "queries", "dense", "rerank", "index build (s)", "query time (s)"],
      r.configs.map((c) => [c.label ?? c.config.name, c.queries ?? r.queries, c.denseEnabled ? "on" : "off", c.rerankEnabled ? "on" : "off", c.buildSeconds.toFixed(1), c.querySeconds.toFixed(1)]),
    ),
  );
  lines.push("");
  lines.push(
    `Models: embeddings \`${r.models.embed}\`, reranker \`${r.models.rerank}\`. The rerank config reorders the top ${r.rerankDepth} fused hits (the app's rerank depth); ranks below keep the hybrid order, so R@64 matches \`hybrid\` by construction.`,
  );
  lines.push("");
  lines.push(`Baseline: ${r.baseline.source}. Our chunks are whole clauses (up to 1,500 chars), so char-level precision is structurally lower than with 500-char chunks; hit-based precision is the fairer view of ranking quality.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pairs
// ---------------------------------------------------------------------------


export const DRY_RUN_BANNER =
  "> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.";

export function pairsMarkdown(r: PairEvalResult, dryRun: boolean): string {
  const lines: string[] = [];
  if (dryRun) lines.push(DRY_RUN_BANNER, "");
  lines.push(
    `${r.judged}/${r.n} pairs judged${r.errors ? ` (${r.errors} failed and are excluded)` : ""}${r.subset ? `, subset \`${r.subset}\`` : ""}. ` +
      `Accuracy **${pct(r.report.accuracy)}**, macro-F1 ${num(r.report.macroF1)}, **contradiction F1 ${num(r.contradictionF1)}** (ContractNLI published contradiction F1: 0.36-0.41). ` +
      `Binary conflict detection (contradict|exception vs agree|not_mentioned): P ${pct(r.conflictDetection.precision)}, R ${pct(r.conflictDetection.recall)}, F1 ${num(r.conflictDetection.f1)}.`,
  );
  lines.push("");
  lines.push(
    mdTable(
      ["label", "support", "predicted", "precision", "recall", "F1"],
      r.report.perLabel.map((l) => [l.label, l.support, l.predicted, pct(l.precision), pct(l.recall), num(l.f1)]),
    ),
  );
  lines.push("");
  lines.push("Confusion matrix (rows = gold, columns = predicted):");
  lines.push("");
  const labels = r.report.labels;
  lines.push(mdTable(["gold \\ pred", ...labels], labels.map((g) => [g, ...labels.map((p) => r.report.confusion[g][p])])));
  lines.push("");
  lines.push(
    `Accuracy by source: ${Object.entries(r.bySource)
      .map(([s, v]) => `${s} ${pct(v.accuracy)} (n=${v.n})`)
      .join(", ")}. The \`carveout\` row is the distant-exception subset.`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

export const E2E_COLUMNS = ["precision", "recall", "F1", "retrieval recall", "grounded", "citation precision", "abstain rate", "answered accuracy", "search / reasoning / invented"];

export function e2eRow(s: E2eSummary): string[] {
  return [
    pct(s.precision),
    pct(s.recall),
    num(s.f1),
    pct(s.retrievalRecall),
    pct(s.groundedRate),
    pct(s.citationPrecision),
    pct(s.abstainRate),
    pct(s.answeredAccuracy),
    `${s.errors.search_failure} / ${s.errors.reasoning_failure} / ${s.errors.invented}`,
  ];
}

export function e2eMarkdown(runs: readonly E2eRunResult[]): string {
  const lines: string[] = [];
  if (runs.some((r) => r.config.dryRun)) lines.push(DRY_RUN_BANNER, "");
  const s0 = runs[0]?.summary;
  if (s0) {
    lines.push(
      `${s0.cases} synthetic agreement + amendment cases from CUAD contracts, ${s0.gold} gold conflicts (twins = contradict, carve-outs = exception) plus paraphrase, unrelated and boilerplate hard negatives.` +
        (s0.caseErrors ? ` ${s0.caseErrors} case(s) failed to run and are excluded.` : ""),
    );
    lines.push("");
  }
  lines.push(
    mdTable(
      ["run", ...E2E_COLUMNS, "findings (surfaced / withheld)"],
      runs.map((r) => [r.config.verify ? "full (verification on)" : "baseline (verification off)", ...e2eRow(r.summary), `${r.summary.surfaced} / ${r.summary.withheld}`]),
    ),
  );
  lines.push("");
  lines.push(
    "precision = correct surfaced findings / surfaced findings; recall = gold conflicts with a correct surfaced finding / gold conflicts; retrieval recall = gold pairs among the candidate pairs; " +
      "grounded = surfaced findings whose quotes are all exact substrings; citation precision = quotes of surfaced findings that are exact and cite the clause pair of a real conflict; " +
      "abstain rate = withheld / all conflict findings; answered accuracy = correct decisions / non-abstained decisions over every candidate pair (conflict labels and no-conflict). " +
      "Errors are counted once each: misses as search_failure (pair never retrieved) or reasoning_failure (retrieved but judged wrong or withheld); false findings as reasoning_failure (grounded) or invented (inexact quote or failed support check).",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Ablations
// ---------------------------------------------------------------------------

export interface AblationRow {
  model: string;
  embed: boolean;
  rerank: boolean;
  verify: boolean;
  summary: E2eSummary;
  seconds: number;
}

export function ablationMarkdown(rows: readonly AblationRow[], dryRun: boolean): string {
  const lines: string[] = [];
  if (dryRun) lines.push(DRY_RUN_BANNER, "");
  lines.push(
    mdTable(
      ["model", "embeddings", "rerank", "verify", ...E2E_COLUMNS, "s"],
      rows.map((r) => [r.model, r.embed ? "on" : "off", r.rerank ? "on" : "off", r.verify ? "on" : "off", ...e2eRow(r.summary), r.seconds.toFixed(0)]),
    ),
  );
  lines.push("");
  lines.push(
    "The reranker only reorders `ClauseIndex.search` results (compliance-rule evidence); conflict candidate pairs come from `candidatePairs`, which does not use it, so on these conflict-only cases rerank on/off is expected to change nothing. Its effect is measured by the retrieval eval.",
  );
  return lines.join("\n");
}
