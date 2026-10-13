/**
 * Run the whole evaluation and write eval/results/REPORT.md.
 *
 *   npm run eval:all -- [--quick] [--dry-run] [--skip retrieval,ablate] [--rebuild-dataset]
 *
 * --quick     small limits everywhere (retrieval: 12 docs / 60 queries; pairs: 40; e2e: 5 cases;
 *             ablations: 4 cases); results and REPORT.md go to eval/results/quick/ so full results
 *             are never overwritten
 * --dry-run   stub judge for every Claude-backed step. Without ANTHROPIC_API_KEY those steps run as
 *             dry runs automatically and the report says so.
 * --rerank-queries N  passed to the retrieval eval (rerank config on a balanced subset of N queries)
 * --skip      comma list of steps to skip: dataset, retrieval, pairs, e2e, curve, ablate. A skipped
 *             step reuses its saved results when they exist.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  DATASET_PATH,
  DATA_DIR,
  RESULTS_DIR,
  ablationMarkdown,
  e2eMarkdown,
  fileExists,
  hasApiKey,
  pairsMarkdown,
  parseCsv,
  readJson,
  readJsonl,
  reviewAgreement,
  retrievalMarkdown,
  runMeta,
  taskAblate,
  taskCurve,
  taskDataset,
  taskE2e,
  taskPairs,
  taskRetrieval,
  writeText,
} from "@/lib/eval";
import type { AblationRow, ConflictRecord, E2eRunResult, PairEvalResult, RetrievalEvalResult } from "@/lib/eval";

const STEPS = ["dataset", "retrieval", "pairs", "e2e", "curve", "ablate"] as const;
type Step = (typeof STEPS)[number];

interface Section {
  title: string;
  status: "ran" | "dry run" | "reused" | "skipped" | "failed";
  body: string;
  seconds?: number;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      quick: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      skip: { type: "string", default: "" },
      "rebuild-dataset": { type: "boolean", default: false },
      "rerank-queries": { type: "string" },
    },
  });
  const quick = values.quick;
  const skip = new Set(values.skip.split(",").map((s) => s.trim()).filter(Boolean) as Step[]);
  for (const s of skip) if (!STEPS.includes(s)) throw new Error(`unknown step "${s}" (steps: ${STEPS.join(", ")})`);
  const dryRun = values["dry-run"] || !hasApiKey();
  const meta = runMeta();
  const log = (m: string) => console.log(m);
  const started = Date.now();
  const sections: Section[] = [];
  const resultsDir = quick ? join(RESULTS_DIR, "quick") : RESULTS_DIR;
  /** Only quick mode redirects outputs (results and the e2e cases file) away from the defaults. */
  const outDir = quick ? resultsDir : undefined;
  const limits = quick
    ? { retrievalDocs: 12, retrievalQueries: 60, pairs: 40, e2eCases: 5, ablateCases: 4 }
    : { retrievalDocs: undefined, retrievalQueries: undefined, pairs: undefined, e2eCases: 20, ablateCases: 20 };

  if (!values["dry-run"] && dryRun) log("ANTHROPIC_API_KEY is not set: Claude-backed steps (pairs, e2e, ablations) run as DRY RUNS with the stub judge.");

  async function step(name: Step, title: string, run: () => Promise<{ body: string; dry?: boolean }>, reuse?: () => string | null): Promise<void> {
    if (skip.has(name)) {
      const saved = reuse?.() ?? null;
      sections.push({ title, status: saved ? "reused" : "skipped", body: saved ?? "_Skipped._" });
      return;
    }
    log(`\n=== ${title} ===`);
    const t0 = Date.now();
    try {
      const out = await run();
      sections.push({ title, status: out.dry ? "dry run" : "ran", body: out.body, seconds: (Date.now() - t0) / 1000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`FAILED: ${msg}`);
      sections.push({ title, status: "failed", body: `**Failed:** ${msg}`, seconds: (Date.now() - t0) / 1000 });
    }
  }

  const saved = <T,>(file: string): T | null => (fileExists(join(resultsDir, file)) ? readJson<T>(join(resultsDir, file)) : null);
  const savedNote = (m: { meta?: { timestamp?: string } } | null) => (m?.meta?.timestamp ? `_Saved results from ${m.meta.timestamp}._\n\n` : "");
  const pick = (base: string) => (fileExists(join(resultsDir, `${base}.json`)) ? `${base}.json` : `${base}.dry-run.json`);

  await step("dataset", "1. ContractConflict test set (gap 8)", async () => {
    const out = await taskDataset({ rebuild: values["rebuild-dataset"], log });
    return { body: `File: \`${DATASET_PATH.replace(`${process.cwd()}/`, "")}\`.\n\n${out.markdown}` };
  });

  // Hand verification status (gap 8): kappa when review-sample.csv has been annotated.
  const reviewPath = join(DATA_DIR, "review-sample.csv");
  let reviewNote = "Hand verification: `eval/data/review-sample.csv` not found (run `npm run eval:review`).";
  if (fileExists(reviewPath) && fileExists(DATASET_PATH)) {
    const rep = reviewAgreement(parseCsv(readFileSync(reviewPath, "utf8")), new Map(readJsonl<ConflictRecord>(DATASET_PATH).map((r) => [r.id, r])));
    reviewNote =
      rep.annotated === 0
        ? `Hand verification: **pending**. ${rep.rows} sampled pairs in \`eval/data/review-sample.csv\` await a \`human_label\`; then run \`npm run eval:agreement\`.`
        : `Hand verification: ${rep.annotated}/${rep.rows} sampled pairs annotated; agreement ${(100 * (rep.kappa.observed ?? 0)).toFixed(1)}%, Cohen's kappa ${rep.kappa.kappa?.toFixed(3) ?? "n/a"} (${rep.band}).`;
  }
  if (sections[0]?.title.startsWith("1.")) sections[0].body += `\n\n${reviewNote}`;

  await step(
    "retrieval",
    "2. Retrieval: LegalBench-RAG-mini",
    async () => {
      const out = await taskRetrieval({
        limitDocs: limits.retrievalDocs,
        limitQueries: limits.retrievalQueries,
        rerankQueries: values["rerank-queries"] ? Number.parseInt(values["rerank-queries"], 10) : undefined,
        log,
        meta,
        outDir,
      });
      return { body: out.markdown };
    },
    () => {
      const r = saved<RetrievalEvalResult & { meta?: { timestamp?: string } }>("retrieval.json");
      return r ? savedNote(r) + retrievalMarkdown({ ...r, perQuery: [] }) : null;
    },
  );

  await step(
    "pairs",
    "3. Clause-pair NLI on ContractConflict",
    async () => {
      const all = await taskPairs({ limit: limits.pairs, dryRun, log, meta, outDir });
      const carve = await taskPairs({ subset: "carveout", limit: quick ? 15 : undefined, dryRun, log, meta, outDir });
      return { body: `${all.markdown}\n\n**Distant-exception subset (\`carveout\`):** accuracy ${(100 * (carve.result.report.accuracy ?? 0)).toFixed(1)}% on ${carve.result.judged} pairs.`, dry: dryRun };
    },
    () => {
      const r = saved<PairEvalResult & { dryRun: boolean; meta?: { timestamp?: string } }>(pick("pairs"));
      return r ? savedNote(r) + pairsMarkdown(r, r.dryRun) : null;
    },
  );

  await step(
    "e2e",
    "4. End-to-end: full pipeline vs plain-RAG baseline (Legal RAG Bench grading)",
    async () => {
      const out = await taskE2e({ cases: limits.e2eCases, dryRun, log, meta, outDir });
      return { body: out.markdown, dry: dryRun };
    },
    () => {
      const r = saved<{ runs: E2eRunResult[]; meta?: { timestamp?: string } }>(pick("e2e"));
      return r ? savedNote(r) + e2eMarkdown(r.runs) : null;
    },
  );

  await step("curve", "5. Coverage vs accuracy (gap 6)", async () => {
    const out = taskCurve({ log, outDir });
    return { body: `![Coverage vs accuracy](coverage-accuracy.svg)\n\nData: \`coverage-accuracy.csv\`.\n\n${out.markdown}` };
  });

  await step(
    "ablate",
    "6. Ablations (factorial: embeddings x rerank x verify [x model])",
    async () => {
      const models = (process.env.LTR_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const out = await taskAblate({ cases: limits.ablateCases, dryRun, models, log, meta, outDir });
      return { body: out.markdown, dry: dryRun };
    },
    () => {
      const r = saved<{ rows: AblationRow[]; dryRun: boolean; meta?: { timestamp?: string } }>(pick("ablations"));
      return r ? savedNote(r) + ablationMarkdown(r.rows, r.dryRun) : null;
    },
  );

  // What this report does not contain.
  const missing: string[] = [];
  if (dryRun) {
    missing.push(
      "Live Claude runs of the pair NLI, end-to-end and ablation evals: " +
        (values["dry-run"] ? "`--dry-run` was set." : "`ANTHROPIC_API_KEY` is not set.") +
        " Those sections ran with the deterministic stub judge, so their accuracy numbers describe the stub; retrieval, candidate pairs, quote checks, grading and curves are real.",
    );
  }
  if (reviewNote.includes("pending") || reviewNote.includes("not found")) missing.push("Cohen's kappa for the hand-verified sample (needs a human annotator).");
  if (quick) missing.push("Full-size runs: `--quick` limits every step (retrieval on 12 documents / 60 queries is not comparable to the published baseline).");
  if (!process.env.LTR_MODELS) missing.push("The model factor of the factorial ablation (set `LTR_MODELS=a,b`).");
  for (const s of sections) if (s.status === "failed" || s.status === "skipped") missing.push(`${s.title}: ${s.status}.`);
  sections.push({ title: "7. Not run / caveats", status: "ran", body: missing.length ? missing.map((m) => `- ${m}`).join("\n") : "- Nothing: every step ran live." });

  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  const header = [
    "# LegalTrustRAG evaluation report",
    "",
    `- Generated: ${meta.timestamp} (${minutes} min)`,
    `- Git: ${meta.gitSha ?? "n/a"}${meta.gitDirty ? " (uncommitted changes)" : ""}`,
    `- Mode: ${quick ? "quick (small limits)" : "full"}; Claude-backed steps: ${dryRun ? "**dry run (stub judge)**" : `live, model \`${meta.model}\``}`,
    `- Node ${meta.node}; ANTHROPIC_API_KEY ${meta.hasApiKey ? "present" : "absent"}; env: ${Object.entries(meta.env).map(([k, v]) => `${k}=${v}`).join(", ") || "(no LTR_* overrides)"}`,
    "",
    mdTable2(sections),
    "",
    `Metric definitions and baselines: \`eval/README.md\`.${quick ? " Quick mode: small limits, numbers are smoke-test only." : ""}`,
  ].join("\n");
  const body = sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n");
  const path = join(resultsDir, "REPORT.md");
  writeText(path, `${header}\n\n${body}\n`);
  log(`\nWrote ${path}`);
}

function mdTable2(sections: Section[]): string {
  return ["| step | status | seconds |", "| --- | --- | --- |", ...sections.map((s) => `| ${s.title} | ${s.status} | ${s.seconds === undefined ? "" : s.seconds.toFixed(0)} |`)].join("\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
