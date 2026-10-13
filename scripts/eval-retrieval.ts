/**
 * Retrieval evaluation on LegalBench-RAG-mini (776 queries, 72 documents): BM25 only, hybrid
 * (BM25 + bge-small, RRF) and hybrid + cross-encoder rerank, against the published baseline.
 *
 *   npm run eval:retrieval -- [--limit N] [--queries N] [--configs bm25,hybrid,hybrid+rerank]
 *
 * --limit N    keep only N corpus documents (spread over the four benchmarks) and their queries
 * --queries N  cap the number of queries (round-robin over benchmarks)
 * --rerank-depth N  hits reordered by the cross-encoder in the rerank config (default 30, the
 *              app's depth; ranks below keep the hybrid order). 64 reranks the whole list.
 * --rerank-queries N  run the rerank config on a benchmark-balanced subset of N queries (CPU
 *              budget); hybrid is also reported on the same subset for a paired comparison.
 * --out DIR    results directory (default eval/results)
 * Writes eval/results/retrieval.{json,md} and per-query scores to retrieval-queries.jsonl.
 */
import { parseArgs } from "node:util";
import { taskRetrieval } from "@/lib/eval";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      limit: { type: "string" },
      queries: { type: "string" },
      configs: { type: "string" },
      "rerank-depth": { type: "string", default: "30" },
      "rerank-queries": { type: "string" },
      out: { type: "string" },
    },
  });
  const out = await taskRetrieval({
    limitDocs: values.limit ? Number.parseInt(values.limit, 10) : undefined,
    limitQueries: values.queries ? Number.parseInt(values.queries, 10) : undefined,
    configs: values.configs?.split(",").map((s) => s.trim()),
    rerankDepth: Number.parseInt(values["rerank-depth"], 10),
    rerankQueries: values["rerank-queries"] ? Number.parseInt(values["rerank-queries"], 10) : undefined,
    outDir: values.out,
    log: (m) => console.log(m),
  });
  console.log(`\n${out.markdown}\n\nWrote ${out.files.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
