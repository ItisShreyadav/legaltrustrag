/**
 * Build the ContractConflict test set (gap 8) from CUAD v1.
 *
 *   npm run eval:dataset -- [--seed contract-conflict-v1] [--total 260] [--out eval/data/contract-conflict.jsonl]
 *
 * Downloads CUAD v1 into eval/data/raw/cuad on first use, then writes the JSONL dataset and a
 * `.meta.json` summary next to it.
 */
import { parseArgs } from "node:util";
import { statSync } from "node:fs";
import { DATASET_PATH, buildContractConflict, ensureCuad, loadCuad, writeJson, writeJsonl } from "@/lib/eval";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seed: { type: "string", default: "contract-conflict-v1" },
      total: { type: "string", default: "260" },
      out: { type: "string", default: DATASET_PATH },
    },
  });
  const total = Number.parseInt(values.total, 10);
  if (!(total >= 4)) throw new Error(`--total must be a number >= 4 (got ${values.total})`);

  const cuadPath = await ensureCuad((m) => console.log(m));
  const cuad = loadCuad(cuadPath);
  console.log(`CUAD v1: ${cuad.contracts.length} contracts, ${cuad.clauses.length} gold clause spans`);

  const { records, summary } = buildContractConflict(cuad.clauses, { seed: values.seed, total });
  writeJsonl(values.out, records);
  const meta = {
    ...summary,
    source: "CUAD v1 (CUADv1.json, https://github.com/TheAtticusProject/cuad)",
    builtAt: new Date().toISOString(),
    bytes: statSync(values.out).size,
  };
  writeJson(values.out.replace(/\.jsonl$/, ".meta.json"), meta);

  console.log(`Wrote ${records.length} pairs to ${values.out} (${(meta.bytes / 1024).toFixed(0)} KB)`);
  console.log(`  clause pool: ${summary.poolSize} usable CUAD spans; ${summary.categories} categories, ${summary.contracts} contracts used`);
  for (const [label, n] of Object.entries(summary.byLabel)) {
    console.log(`  ${label.padEnd(14)} ${String(n).padStart(4)}  ${((100 * n) / records.length).toFixed(1)}%`);
  }
  console.log(`  edit types: ${Object.entries(summary.byEditType).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (meta.bytes > 2 * 1024 * 1024) console.warn("WARNING: dataset is larger than 2 MB; lower --total before committing it.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
