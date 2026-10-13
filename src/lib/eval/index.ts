/**
 * Evaluation toolkit (gaps 6, 8, 9): ContractConflict dataset, LegalBench-RAG retrieval eval,
 * pair and end-to-end evals graded with the Legal RAG Bench taxonomy, coverage-vs-accuracy
 * curves and ablations. Node only; used by `scripts/*.ts`, never by the app.
 */
export * from "./rng";
export * from "./metrics";
export * from "./io";
export * from "./cuad";
export * from "./dataset";
export * from "./review";
export * from "./retrieval";
export * from "./format";
export * from "./stub";
export * from "./pairs";
export * from "./e2e";
export * from "./curve";
export * from "./tasks";
