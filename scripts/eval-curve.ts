/**
 * Coverage-vs-accuracy curve (gap 6) from the saved pair and e2e results: sweeps the confidence
 * threshold 0.00-1.00 in 0.05 steps and writes eval/results/coverage-accuracy.{csv,md,svg}.
 *
 *   npm run eval:curve -- [--synthetic]
 *
 * Real results are preferred over dry-run results. --synthetic adds two synthetic series
 * (calibrated / overconfident); they are also used when no saved results exist.
 */
import { parseArgs } from "node:util";
import { taskCurve } from "@/lib/eval";

function main(): void {
  const { values } = parseArgs({ options: { synthetic: { type: "boolean", default: false } } });
  const out = taskCurve({ synthetic: values.synthetic, log: (m) => console.log(m) });
  console.log(`\n${out.markdown}\n\nWrote ${out.files.join(", ")}`);
}

main();
