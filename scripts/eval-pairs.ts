/**
 * Clause-pair NLI (`judgePair`) on the ContractConflict set: accuracy, per-label P/R/F1,
 * contradiction F1, confusion matrix and per-source accuracy.
 *
 *   npm run eval:pairs -- [--limit N] [--subset carveout] [--concurrency 4] [--dry-run]
 *
 * --subset   keep one source (twin|carveout|paraphrase|unrelated) or label; `carveout` is the
 *            distant-exception subset
 * --dry-run  deterministic stub judge instead of Claude (no API key needed); results go to
 *            pairs[.subset].dry-run.{json,md}
 */
import { parseArgs } from "node:util";
import { taskPairs } from "@/lib/eval";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      limit: { type: "string" },
      subset: { type: "string" },
      concurrency: { type: "string", default: "4" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const out = await taskPairs({
    limit: values.limit ? Number.parseInt(values.limit, 10) : undefined,
    subset: values.subset,
    concurrency: Number.parseInt(values.concurrency, 10),
    dryRun: values["dry-run"],
    log: (m) => console.log(m),
  });
  console.log(`\n${out.markdown}\n\nWrote ${out.files.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
