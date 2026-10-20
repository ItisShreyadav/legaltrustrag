/*
 * Minimal structured logger: one JSON object per line on stdout (debug, info)
 * or stderr (warn, error), e.g.
 *   {"time":"2026-10-20T12:00:00.000Z","level":"error","msg":"analyze.failed","requestId":"…","err":{…}}
 *
 * Rules for callers: log ids, counts, sizes and durations. Never log secrets,
 * passwords, cookies, uploaded file contents or document text. Field names that
 * look sensitive (password, token, secret, api key, cookie, authorization,
 * session) are redacted here as a backstop.
 *
 * The threshold comes from LTR_LOG_LEVEL (debug | info | warn | error, default
 * info). It is read straight from process.env rather than through getEnv(),
 * because the logger must never throw, including while reporting an invalid
 * environment. Safe to import from scripts run outside Next.js.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger that adds `fields` (e.g. a requestId) to every line. */
  child(fields: LogFields): Logger;
}

export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const RESERVED = new Set(["time", "level", "msg"]);
const SENSITIVE_KEY = /pass(word|phrase)?|secret|token|api[-_]?key|authori[sz]ation|cookie|session/i;
const MAX_MESSAGE_CHARS = 2000;
const MAX_STACK_CHARS = 4000;

function threshold(): number {
  const raw = (typeof process !== "undefined" ? process.env?.LTR_LOG_LEVEL : undefined)?.trim().toLowerCase();
  return raw && raw in RANK ? RANK[raw as LogLevel] : RANK.info;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Name, message, stack and (for API errors) the HTTP status. Never the request payload. */
export function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { message: truncate(String(err), MAX_MESSAGE_CHARS) };
  const out: Record<string, unknown> = { name: err.name, message: truncate(err.message, MAX_MESSAGE_CHARS) };
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number") out.status = status;
  if (err.stack) out.stack = truncate(err.stack, MAX_STACK_CHARS);
  if (err.cause !== undefined) out.cause = err.cause instanceof Error ? `${err.cause.name}: ${err.cause.message}` : String(err.cause);
  return out;
}

function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || RESERVED.has(key)) continue;
    if (SENSITIVE_KEY.test(key) && typeof value !== "boolean") out[key] = "[redacted]";
    else if (value instanceof Error) out[key] = serializeError(value);
    else out[key] = value;
  }
  return out;
}

function write(level: LogLevel, msg: string, fields: LogFields): void {
  if (RANK[level] < threshold()) return;
  let line: string;
  try {
    line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...sanitize(fields) });
  } catch {
    // Circular or otherwise unserialisable fields: keep the event, drop the fields.
    line = JSON.stringify({ time: new Date().toISOString(), level, msg, fieldsDropped: true });
  }
  const stream = typeof process !== "undefined" ? (RANK[level] >= RANK.warn ? process.stderr : process.stdout) : undefined;
  if (stream?.write) stream.write(`${line}\n`);
  else if (RANK[level] >= RANK.warn) console.error(line);
  else console.info(line);
}

function createLogger(bound: LogFields): Logger {
  const emit = (level: LogLevel) => (msg: string, fields?: LogFields) => write(level, msg, { ...bound, ...fields });
  return {
    debug: emit("debug"),
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    child: (fields) => createLogger({ ...bound, ...fields }),
  };
}

export const log: Logger = createLogger({});
