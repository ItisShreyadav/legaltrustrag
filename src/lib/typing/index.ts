/**
 * Stage 2: CUAD clause typing.
 *
 * A keyword pre-pass labels the obvious clauses (governing law, parties, signature blocks,
 * definitions, ...). Everything else is sent to Claude in batches with a cached system prompt
 * and a structured JSON output schema. Without credentials, heuristics alone are used.
 */
import Anthropic from "@anthropic-ai/sdk";
import { log } from "@/lib/log";
import type { Clause } from "../types";
import { HEURISTIC_SKIP_THRESHOLD, heuristicType, type TypeGuess } from "./heuristics";
import { OutputError, classifyBatch, withRetry, type Effort } from "./llm";

export { heuristicType, HEURISTIC_SKIP_THRESHOLD, type TypeGuess } from "./heuristics";
export { CATEGORY_DEFINITIONS } from "./categories";
export { normalizeCategory, typingModel } from "./llm";

export interface TypeClausesOptions {
  /** Clauses per Claude call (default 20). */
  batchSize?: number;
  /** Parallel Claude calls (default 4). */
  concurrency?: number;
  /** Called with (clauses typed so far, total clauses). */
  onProgress?: (done: number, total: number) => void;
  /** Reasoning effort for the classification calls (default "low"). */
  effort?: Effort;
  /** Inject a preconfigured client (tests, custom base URL). Defaults to `new Anthropic()`. */
  client?: Anthropic;
}

/** Confidence assigned when nothing (LLM or rule) supports a label. */
const UNKNOWN: TypeGuess = { category: "Other", confidence: 0.3 };
const MAX_BATCH_CHARS = 40_000;

let warnedNoKey = false;
let sharedClient: Anthropic | null = null;

function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  // We own retries (withRetry) so the SDK's own retry loop is disabled.
  sharedClient ??= new Anthropic({ maxRetries: 0, timeout: 120_000 });
  return sharedClient;
}

function makeBatches(clauses: Clause[], size: number): Clause[][] {
  const batches: Clause[][] = [];
  let cur: Clause[] = [];
  let chars = 0;
  for (const c of clauses) {
    if (cur.length && (cur.length >= size || chars + c.text.length > MAX_BATCH_CHARS)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(c);
    chars += c.text.length;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/** Classify a batch; on unusable output split it in half and try again, down to single clauses. */
async function classifyWithSplit(client: Anthropic, batch: Clause[], effort: Effort): Promise<Map<string, TypeGuess>> {
  try {
    const out = await withRetry(() => classifyBatch(client, batch, effort));
    const missing = batch.filter((c) => !out.has(c.id));
    if (missing.length && missing.length < batch.length) {
      const again = await withRetry(() => classifyBatch(client, missing, effort));
      again.forEach((g, id) => out.set(id, g));
    }
    return out;
  } catch (err) {
    if (err instanceof OutputError && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      const [a, b] = await Promise.all([
        classifyWithSplit(client, batch.slice(0, mid), effort),
        classifyWithSplit(client, batch.slice(mid), effort),
      ]);
      return new Map([...a, ...b]);
    }
    throw err;
  }
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(runners);
}

/**
 * Assign a CUAD category + confidence to every clause. Returns new clause objects in the
 * same order; input clauses are not mutated. Never throws for model/API failures: affected
 * clauses fall back to keyword heuristics (or "Other" at low confidence).
 */
export async function typeClauses(clauses: Clause[], opts: TypeClausesOptions = {}): Promise<Clause[]> {
  const batchSize = Math.max(1, opts.batchSize ?? 20);
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const effort = opts.effort ?? "low";
  const total = clauses.length;
  const progress = (done: number) => opts.onProgress?.(Math.min(done, total), total);

  const guesses = new Map<string, TypeGuess>();
  const heuristics = new Map<string, TypeGuess | null>();
  const pending: Clause[] = [];
  for (const c of clauses) {
    const h = heuristicType(c);
    heuristics.set(c.id, h);
    if (h && h.confidence >= HEURISTIC_SKIP_THRESHOLD) guesses.set(c.id, h);
    else pending.push(c);
  }
  let done = total - pending.length;
  progress(done);

  if (pending.length) {
    if (!opts.client && !hasCredentials()) {
      if (!warnedNoKey) {
        warnedNoKey = true;
        log.warn("typing.no_api_key", { detail: "clause typing uses keyword heuristics only" });
      }
    } else {
      const client = opts.client ?? getClient();
      const batches = makeBatches(pending, batchSize);
      // A 4xx such as a bad model id or key fails every batch the same way: stop calling after the first.
      let fatal = false;
      const work = async (batch: Clause[]) => {
        if (!fatal) {
          try {
            const out = await classifyWithSplit(client, batch, effort);
            out.forEach((g, id) => guesses.set(id, g));
          } catch (err) {
            if (err instanceof Anthropic.APIError && [400, 401, 403, 404].includes(err.status ?? 0)) fatal = true;
            const msg = err instanceof Error ? err.message : String(err);
            log.warn("typing.batch_failed", { batchSize: batch.length, fatal, error: msg });
          }
        }
        done += batch.length;
        progress(done);
      };
      // First batch alone writes the prompt cache; the rest then read it concurrently.
      await work(batches[0]);
      await runPool(batches.slice(1), concurrency, work);
    }
  }
  if (done < total) progress(total);

  return clauses.map((c) => {
    const g = guesses.get(c.id) ?? heuristics.get(c.id) ?? UNKNOWN;
    return { ...c, category: g.category, categoryConfidence: g.confidence };
  });
}
