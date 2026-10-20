/*
 * Server configuration, validated with zod and read lazily.
 *
 * getEnv() parses process.env on every call (it is a handful of fields, so this
 * is cheap) and never at import time. Under `cacheComponents` a value read while
 * prerendering is frozen into the build output, so call it only at request
 * time: in a Route Handler after reading the request (or after
 * `await connection()`), or in a Server Component below a request-time API.
 *
 * Server-only: never import this from client components or src/proxy.ts.
 * Pipeline tuning variables (LTR_CONCURRENCY, LTR_RERANK_MODEL, ...) are read by
 * their own modules so the evaluation scripts can use them outside Next.js; the
 * README lists them all.
 */
import { z } from "zod";
import { LOG_LEVELS } from "@/lib/log";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

const optionalText = z.string().optional();

/** "true"/"false" (also 1/0, yes/no, on/off). */
const flag = (fallback: boolean) => z.stringbool().default(fallback);

const number = (fallback: number, min: number, max: number, int: boolean) => {
  let schema = z.coerce
    .number({ error: (issue) => (issue.code === "invalid_type" && issue.expected === "number" ? "Must be a number." : undefined) })
    .min(min)
    .max(max);
  if (int) schema = schema.int();
  return schema.default(fallback);
};

/** false/0 = do not trust X-Forwarded-For; true = one proxy hop; N = N hops. */
const trustProxy = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (raw === undefined) return 0;
    const value = raw.toLowerCase();
    if (["false", "no", "off"].includes(value)) return 0;
    if (["true", "yes", "on"].includes(value)) return 1;
    if (/^\d{1,2}$/.test(value) && Number(value) <= 10) return Number(value);
    ctx.addIssue({ code: "custom", message: "Use true, false or the number of trusted proxy hops (0-10)." });
    return z.NEVER;
  });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** Required to run analyses; the app boots without it. */
  ANTHROPIC_API_KEY: optionalText,
  /** Alternative credential accepted by @anthropic-ai/sdk. */
  ANTHROPIC_AUTH_TOKEN: optionalText,
  ANTHROPIC_MODEL: z.string().default(DEFAULT_MODEL),
  /** SQLite file for users, sessions, runs and reviews (default ./data/ltr.sqlite). */
  LTR_DB_PATH: optionalText,
  /** Hugging Face model cache (default: inside node_modules/@huggingface/transformers). */
  LTR_MODEL_CACHE_DIR: optionalText,
  LTR_ALLOW_SIGNUP: flag(true),
  /** Session cookie `Secure` flag; unset = on in production. Set false only for plain-HTTP deployments. */
  LTR_COOKIE_SECURE: z.stringbool().optional(),
  /** Per-file upload limit in MB. */
  LTR_MAX_UPLOAD_MB: number(10, 0.1, 100, false),
  /** Documents per analysis. */
  LTR_MAX_FILES: number(5, 1, 20, true),
  /** Analyses per user per hour; 0 disables the limit. */
  LTR_ANALYZE_RATE_LIMIT: number(10, 0, 10_000, true),
  LTR_TRUST_PROXY: trustProxy,
  LTR_LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export type Env = z.output<typeof EnvSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid server configuration: ${problems.join("; ")}`);
    this.name = "EnvError";
  }
}

/** Trimmed process.env values for the schema's keys; blank values count as unset. */
function readRaw(): Record<string, string | undefined> {
  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = process.env[key]?.trim();
    raw[key] = value ? value : undefined;
  }
  return raw;
}

/**
 * The validated configuration. Throws EnvError naming each invalid variable
 * (never its value), so a misconfigured server fails loudly instead of running
 * with surprising limits.
 */
export function getEnv(): Env {
  if (typeof window !== "undefined") throw new Error("@/lib/env is server-only.");
  const result = EnvSchema.safeParse(readRaw());
  if (result.success) return result.data;
  throw new EnvError(result.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`));
}

/** Whether the Anthropic SDK has a credential to analyse with. */
export function hasAnthropicCredentials(env: Env = getEnv()): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

/** Upload limit per file in bytes. */
export function maxUploadBytes(env: Env = getEnv()): number {
  return Math.floor(env.LTR_MAX_UPLOAD_MB * 1024 * 1024);
}
