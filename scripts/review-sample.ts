/**
 * Print a stratified random sample of the ContractConflict set for hand verification and write
 * it to eval/data/review-sample.csv with a blank `human_label` column.
 *
 *   npm run eval:review -- [--n 40] [--seed review-v1] [--blind] [--out eval/data/review-sample.csv]
 *
 * --blind leaves the generated label out of the CSV (annotate without seeing it); the agreement
 * script then looks the label up in the dataset by id.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DATA_DIR, DATASET_PATH, REVIEW_COLUMNS, readJsonl, reviewSample, toCsv, writeText } from "@/lib/eval";
import type { ConflictRecord } from "@/lib/eval";

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      n: { type: "string", default: "40" },
      seed: { type: "string", default: "review-v1" },
      blind: { type: "boolean", default: false },
      data: { type: "string", default: DATASET_PATH },
      out: { type: "string", default: join(DATA_DIR, "review-sample.csv") },
      width: { type: "string", default: "360" },
    },
  });
  const n = Number.parseInt(values.n, 10);
  const width = Number.parseInt(values.width, 10);
  const records = readJsonl<ConflictRecord>(values.data);
  const sample = reviewSample(records, n, values.seed);

  sample.forEach((r, i) => {
    console.log(`${i + 1}. [${r.label} | ${r.source} | ${r.category}] ${r.id}`);
    console.log(`   A: ${clip(r.clauseA, width)}`);
    console.log(`   B: ${clip(r.clauseB, width)}`);
    if (r.edit) console.log(`   edit: ${clip(r.edit, width)}`);
    console.log("");
  });

  const rows = sample.map((r, i) => ({
    n: i + 1,
    id: r.id,
    label: values.blind ? "" : r.label,
    source: values.blind ? "" : r.source,
    category: r.category,
    edit: values.blind ? "" : r.edit ?? "",
    clauseA: r.clauseA,
    clauseB: r.clauseB,
    human_label: "",
    notes: "",
  }));
  writeText(values.out, toCsv(REVIEW_COLUMNS, rows));
  const counts = sample.reduce<Record<string, number>>((m, r) => ({ ...m, [r.label]: (m[r.label] ?? 0) + 1 }), {});
  console.log(`Wrote ${sample.length} rows to ${values.out} (${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")}).`);
  console.log("Fill in human_label with one of: agree, contradict, exception, not_mentioned. Then run: npm run eval:agreement");
}

main();
