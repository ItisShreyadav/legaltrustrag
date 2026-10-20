/*
 * Saved runs: each finished analysis is stored for its owner (report plus
 * document texts). Server-only (imports node:sqlite via @/lib/auth); client
 * components import shapes from ./types instead.
 */
export { RunIdParam } from "./schemas";
export {
  MAX_LISTED_RUNS,
  countRuns,
  deleteRun,
  findFinding,
  getRun,
  getRunReport,
  getRunSummary,
  listRuns,
  loadRuns,
  saveRun,
} from "./store";
export { RUN_ID_PATTERN, type RunReviewCounts, type RunSummary, type SavedRun } from "./types";
