/**
 * Agreement between the generated ContractConflict labels and a human annotator.
 *
 *   npm run eval:agreement -- [--csv eval/data/review-sample.csv]
 *
 * Reports Cohen's kappa (Landis & Koch band), raw agreement, the confusion matrix and every
 * disagreement. Rows with an empty human_label are skipped.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DATA_DIR, DATASET_PATH, mdTable, num, parseCsv, pct, readJsonl, reviewAgreement } from "@/lib/eval";
import type { ConflictRecord } from "@/lib/eval";

function main(): void {
  const { values } = parseArgs({
    options: {
      csv: { type: "string", default: join(DATA_DIR, "review-sample.csv") },
      data: { type: "string", default: DATASET_PATH },
    },
  });
  const rows = parseCsv(readFileSync(values.csv, "utf8"));
  const dataset = new Map(readJsonl<ConflictRecord>(values.data).map((r) => [r.id, r]));
  const rep = reviewAgreement(rows, dataset);

  if (rep.annotated === 0) {
    console.error(`No annotated rows in ${values.csv} (${rep.rows} rows, human_label empty). Fill in human_label first.`);
    process.exit(1);
  }
  console.log(`Annotated ${rep.annotated}/${rep.rows} rows${rep.invalid.length ? `; ${rep.invalid.length} unrecognised labels` : ""}.`);
  console.log(`Raw agreement: ${pct(rep.kappa.observed)}   chance agreement: ${pct(rep.kappa.expected)}`);
  console.log(`Cohen's kappa: ${num(rep.kappa.kappa)} (${rep.band})\n`);

  const labels = rep.confusion.labels;
  console.log("Confusion (rows = generated label, columns = human label):");
  console.log(mdTable(["generated \\ human", ...labels], labels.map((g) => [g, ...labels.map((h) => rep.confusion.confusion[g][h])])));
  if (rep.disagreements.length) {
    console.log("\nDisagreements:");
    for (const d of rep.disagreements) console.log(`  ${d.id}  generated=${d.gold}  human=${d.human}  (${d.source})`);
  }
  for (const bad of rep.invalid) console.log(`  unrecognised human_label "${bad.value}" for ${bad.id}`);
}

main();
