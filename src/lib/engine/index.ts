/**
 * Stage 4: reasoning engine. Clause-pair NLI and rule compliance via Claude, plus a
 * pure-TS contradiction generator for evaluation data.
 */
export { judgePair, judgePairs, requote, UNLOCATED_QUOTE_PENALTY } from "./nli";
export type {
  ClausePair,
  EngineContext,
  JudgePairsContext,
  JudgePairsOptions,
  PairJudgment,
  PairResult,
} from "./nli";
export { checkRule } from "./compliance";
export type { ComplianceStatus, RuleCheck } from "./compliance";
export { makeContradictoryTwin } from "./twin";
export type { TwinOptions } from "./twin";
export { locateInClause, quoteOrWholeClause, wholeClauseQuote, describeClause } from "./locate";
export {
  callClaudeJson,
  clamp01,
  mapWithConcurrency,
  modelId,
  ClaudeOutputError,
  ClaudeRefusalError,
} from "./claude";
export type { CallJsonOptions, Effort } from "./claude";
