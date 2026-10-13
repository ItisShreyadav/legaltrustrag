/**
 * End-to-end evaluation: synthetic agreement + amendment cases with known conflicts, run through
 * `runPipeline` with verification on (full) and off (baseline), graded with the Legal RAG Bench
 * taxonomy (retrieved / grounded / correct; search_failure | reasoning_failure | invented).
 *
 *   npm run eval:e2e -- [--cases 20] [--seed e2e-v1] [--baseline | --full] [--embed on|off] [--rerank on|off] [--dry-run]
 *
 * Default runs both and compares them. --baseline / --full run only one. --dry-run swaps every
 * Claude call (typing, NLI, verification) for deterministic stubs.
 */
import { parseArgs } from "node:util";
import { taskE2e } from "@/lib/eval";

function onOff(v: string | undefined, name: string): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === "on") return true;
  if (v === "off") return false;
  throw new Error(`--${name} must be on or off`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cases: { type: "string", default: "20" },
      seed: { type: "string" },
      baseline: { type: "boolean", default: false },
      full: { type: "boolean", default: false },
      embed: { type: "string" },
      rerank: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  if (values.baseline && values.full) throw new Error("--baseline and --full are exclusive (omit both to run and compare both)");
  const out = await taskE2e({
    cases: Number.parseInt(values.cases, 10),
    seed: values.seed,
    only: values.baseline ? "baseline" : values.full ? "full" : undefined,
    embed: onOff(values.embed, "embed"),
    rerank: onOff(values.rerank, "rerank"),
    dryRun: values["dry-run"],
    log: (m) => console.log(m),
  });
  console.log(`\n${out.markdown}\n\nWrote ${out.files.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
