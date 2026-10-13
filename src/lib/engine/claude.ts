/**
 * Thin Claude wrapper shared by the engine and the verifier.
 *
 * - Model id from ANTHROPIC_MODEL (default "claude-sonnet-5-5").
 * - Structured JSON output (output_config.format) validated with zod.
 * - System prompt is sent as a cached block (cache_control: ephemeral).
 * - Transient API errors (408/409/429/5xx/connection) are retried 3x by the SDK
 *   itself (maxRetries: 3, honours retry-after). Truncated / unparseable output is
 *   retried here once with a larger max_tokens.
 * - Server-side refusal fallback (`fallbacks: "default"`) is enabled for models that
 *   support it; disable with LTR_FALLBACKS=0.
 */
import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Models on which the Claude API accepts `fallbacks: "default"`. */
const FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-fable-5",
]);

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 3 });
  return client;
}

export function modelId(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
}

/**
 * LTR_EFFORT overrides the per-call default. "none"/"default" omits the effort
 * parameter entirely (needed for models without effort support, e.g. Haiku 4.5).
 */
function resolveEffort(fallback: Effort): Effort | undefined {
  const env = process.env.LTR_EFFORT?.trim().toLowerCase();
  if (!env) return fallback;
  if (env === "none" || env === "default") return undefined;
  return (EFFORTS as readonly string[]).includes(env) ? (env as Effort) : fallback;
}

export class ClaudeRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(`Claude declined the request${category ? ` (category: ${category})` : ""}`);
    this.name = "ClaudeRefusalError";
  }
}

export class ClaudeOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeOutputError";
  }
}

export interface CallJsonOptions<S extends z.ZodType> {
  /** Stable instructions. Sent as a cached system block; keep it free of per-request data. */
  system: string;
  /** Per-request content (clauses, rule, claim). */
  user: string;
  schema: S;
  maxTokens?: number;
  effort?: Effort;
}

/** JSON-schema keywords that Claude structured outputs accept (numeric/string-length constraints are not). */
const SCHEMA_KEYWORDS = new Set(["type", "properties", "required", "items", "enum", "const", "anyOf", "allOf", "$ref", "$defs", "description", "format"]);

function strictNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictNode);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!SCHEMA_KEYWORDS.has(key)) continue;
    if (key === "properties" || key === "$defs") {
      out[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, strictNode(v)]));
    } else {
      out[key] = strictNode(value);
    }
  }
  if (out.type === "object") {
    out.additionalProperties = false;
    if (out.properties && !out.required) out.required = Object.keys(out.properties as object);
  }
  return out;
}

/**
 * zod -> JSON schema for output_config.format. Keeps `enum` as a hard constraint and drops
 * keywords structured outputs reject (min/max etc.); zod re-validates the parsed result.
 */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return strictNode(z.toJSONSchema(schema)) as Record<string, unknown>;
}

/** One structured-output call to Claude. Returns zod-validated data or throws. */
export async function callClaudeJson<S extends z.ZodType>(opts: CallJsonOptions<S>): Promise<z.infer<S>> {
  const model = modelId();
  const effort = resolveEffort(opts.effort ?? "medium");
  const useFallbacks = process.env.LTR_FALLBACKS !== "0" && FALLBACK_MODELS.has(model);
  const format = { type: "json_schema" as const, schema: strictJsonSchema(opts.schema) };
  const baseMax = opts.maxTokens ?? 8000;

  let lastProblem = "no response";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await getClient().beta.messages.create({
      model,
      max_tokens: attempt === 0 ? baseMax : baseMax * 2,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
      output_config: effort ? { format, effort } : { format },
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    if (response.stop_reason === "refusal") {
      throw new ClaudeRefusalError(response.stop_details?.category ?? null);
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();

    if (!text) {
      lastProblem = `empty output (stop_reason=${response.stop_reason})`;
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      lastProblem = `invalid JSON (stop_reason=${response.stop_reason})`;
      continue;
    }

    const parsed = opts.schema.safeParse(json);
    if (parsed.success) return parsed.data as z.infer<S>;
    lastProblem = `schema mismatch: ${parsed.error.message}`;
  }
  throw new ClaudeOutputError(`Claude returned no usable structured output: ${lastProblem}`);
}

/** Run `fn` over `items` with at most `limit` in flight. Preserves input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onDone?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      done++;
      onDone?.(done, items.length);
    }
  };
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
