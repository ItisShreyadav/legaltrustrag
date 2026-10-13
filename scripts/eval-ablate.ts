/**
 * Factorial ablation of the end-to-end system: embeddings {off,on} x rerank {off,on} x
 * verify {off,on}, and x model when LTR_MODELS is set (comma-separated model ids).
 *
 *   npm run eval:ablate -- [--cases 20] [--seed e2e-v1] [--dry-run]
 *   LTR_MODELS=claude-sonnet-5-5,claude-haiku-4-5 npm run eval:ablate
 *
 * Writes eval/results/ablations.{json,md} (or ablations.dry-run.*) with a main-effects table.
 */
import { parseArgs } from "node:util";
import { taskAblate } from "@/lib/eval";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cases: { type: "string", default: "20" },
      seed: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const models = (process.env.LTR_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = await taskAblate({
    cases: Number.parseInt(values.cases, 10),
    seed: values.seed,
    dryRun: values["dry-run"],
    models,
    log: (m) => console.log(m),
  });
  console.log(`\n${out.markdown}\n\nWrote ${out.files.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
