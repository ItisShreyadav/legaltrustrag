import { getSessionUser } from "@/lib/auth";
import { getEnv, hasAnthropicCredentials, maxUploadBytes, type Env } from "@/lib/env";
import { crossSiteResponse, isCrossSiteRequest, jsonNoStore, newRequestId } from "@/lib/http";
import { log, type Logger } from "@/lib/log";
import { loadDocument } from "@/lib/parse";
import { runPipeline } from "@/lib/pipeline";
import { RateLimiter, formatRetryAfter } from "@/lib/rate-limit";
import { saveRun } from "@/lib/runs";
import type { AnalyzeRequest, ProgressEvent, SourceDocument, TrustReport } from "@/lib/types";

// Runs on the Node.js runtime, which is the default. Next 16 rejects an explicit
// `export const runtime` while `cacheComponents` is enabled in next.config.ts.
export const maxDuration = 300;

const MAX_RULES = 50;
const MAX_RULE_CHARS = 1000;
const MAX_FILE_NAME_CHARS = 255;
/** Multipart framing, the rules field and the other small fields, on top of the files themselves. */
const FORM_OVERHEAD_BYTES = 1024 * 1024;
/** Analyses one user may have running at once (two tabs, or a retry while the last run finishes). */
const MAX_CONCURRENT_PER_USER = 2;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt"]);
const HEARTBEAT_MS = 15_000;
const GENERIC_FAILURE = "The analysis failed. Please try again.";

const analyzeLimiter = new RateLimiter({ name: "analyze-user", windowMs: RATE_WINDOW_MS });
const globalForRuns = globalThis as typeof globalThis & { __ltrAnalysesInFlight?: Map<string, number> };
const inFlight = (globalForRuns.__ltrAnalysesInFlight ??= new Map<string, number>());

class BodyTooLargeError extends Error {}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return typeof err === "string" && err ? err : "Unknown error";
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

/** Newline-separated rules; blank lines dropped, list markers ("-", "*", "1.") stripped, duplicates removed. */
function parseRules(raw: string): string[] {
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const line of raw.split(/\r\n|\r|\n/)) {
    const rule = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!rule || seen.has(rule)) continue;
    seen.add(rule);
    rules.push(rule);
  }
  return rules;
}

/**
 * request.formData(), but the body is counted as it streams in and parsing stops
 * with BodyTooLargeError past `maxBytes`, so a chunked upload without a
 * Content-Length cannot make the server buffer an unbounded body.
 */
async function readFormData(request: Request, contentType: string, maxBytes: number): Promise<FormData> {
  if (!request.body) throw new Error("Empty request body.");
  let received = 0;
  const capped = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) controller.error(new BodyTooLargeError());
        else controller.enqueue(chunk);
      },
    }),
  );
  try {
    return await new Response(capped, { headers: { "Content-Type": contentType } }).formData();
  } catch (err) {
    throw received > maxBytes ? new BodyTooLargeError() : err;
  }
}

/** What the client sees when a stage fails: the real message in development, a generic one in production. */
function publicFailure(env: Env, err: unknown): string {
  return env.NODE_ENV === "production" ? GENERIC_FAILURE : errorMessage(err);
}

/**
 * POST multipart/form-data
 *   files[]      1 to LTR_MAX_FILES files (.pdf, .docx, .txt), at most LTR_MAX_UPLOAD_MB each
 *   rules        optional, one compliance rule per line (at most 50, 1000 characters each)
 *   includeText  optional "1": emit an `event: documents` SSE message with the parsed
 *                document texts before the pipeline starts (the UI uses it to show
 *                quotes inside their clause context)
 *
 * Errors before the stream starts are JSON `{ error, requestId, code? }` with an
 * `X-Request-Id` header: 400 invalid input, 401 signed out, 403 cross-site,
 * 413 body too large, 415 wrong content type, 429 rate limited (Retry-After),
 * 503 no Anthropic credentials (code "not_configured").
 *
 * Otherwise responds with text/event-stream: ": stream open", ": keep-alive"
 * comments every 15 s, the optional `event: documents` message, then every
 * ProgressEvent as `data: <json>\n\n`. The stream closes after the `done` or
 * `error` event. The error event carries `requestId`; in production its message
 * is generic and the details are only in the server log. A finished report is
 * saved for the signed-in user (with the document texts) and the `done` event
 * carries its `runId`; if saving fails the report is still sent, without a `runId`.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  const idHeader = { "X-Request-Id": requestId };
  const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    jsonNoStore({ error, requestId, ...extra }, { status, headers: { ...idHeader, ...headers } });

  if (isCrossSiteRequest(request)) {
    const response = crossSiteResponse();
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  const user = await getSessionUser();
  if (!user) return fail(401, "Sign in to analyse documents.");
  const logger: Logger = log.child({ requestId, userId: user.id });

  const env = getEnv();
  if (!hasAnthropicCredentials(env)) {
    logger.error("analyze.not_configured", { reason: "ANTHROPIC_API_KEY is not set" });
    return fail(
      503,
      "Analysis is unavailable because the server has no Anthropic API key configured. Ask an administrator to set ANTHROPIC_API_KEY.",
      { code: "not_configured" },
    );
  }

  const rateLimit = env.LTR_ANALYZE_RATE_LIMIT;
  const early = analyzeLimiter.check(user.id, rateLimit);
  if (!early.allowed) {
    logger.warn("analyze.rate_limited", { retryAfter: early.retryAfterSeconds });
    return fail(
      429,
      `You have reached the limit of ${rateLimit} analyses per hour. Try again in ${formatRetryAfter(early.retryAfterSeconds)}.`,
      { code: "rate_limited" },
      { "Retry-After": String(early.retryAfterSeconds) },
    );
  }
  const tooManyRunning = () =>
    fail(429, "You already have analyses running. Wait for one to finish, then try again.", {
      code: "too_many_running",
    });
  if ((inFlight.get(user.id) ?? 0) >= MAX_CONCURRENT_PER_USER) return tooManyRunning();

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return fail(415, "Expected a multipart/form-data body with files[] and an optional rules field.");
  }

  const maxFiles = env.LTR_MAX_FILES;
  const maxFileBytes = maxUploadBytes(env);
  const maxBodyBytes = maxFiles * maxFileBytes + FORM_OVERHEAD_BYTES;
  const tooLarge = `The upload is too large. Send at most ${maxFiles} ${maxFiles === 1 ? "file" : "files"} of up to ${formatMb(maxFileBytes)} each.`;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    logger.warn("analyze.body_too_large", { contentLength: declaredLength, maxBodyBytes });
    return fail(413, tooLarge);
  }

  let form: FormData;
  try {
    form = await readFormData(request, contentType, maxBodyBytes);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      logger.warn("analyze.body_too_large", { maxBodyBytes });
      return fail(413, tooLarge);
    }
    return fail(400, "Malformed multipart/form-data body.");
  }

  const entries = [...form.getAll("files[]"), ...form.getAll("files")];
  const files = entries.filter((entry): entry is File => typeof entry !== "string");
  if (files.length !== entries.length) {
    return fail(400, "files[] must contain file uploads, not text values.");
  }
  if (files.length === 0) {
    return fail(400, "Upload at least one document (PDF, DOCX or TXT) in the files[] field.");
  }
  if (files.length > maxFiles) {
    return fail(400, `Too many files (${files.length}). Upload at most ${maxFiles}.`);
  }
  for (const file of files) {
    if (file.name.length > MAX_FILE_NAME_CHARS) {
      return fail(400, `A file name is longer than ${MAX_FILE_NAME_CHARS} characters. Rename the file and try again.`);
    }
    if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) {
      return fail(400, `Unsupported file type for "${file.name}". Use PDF, DOCX or TXT.`);
    }
    if (file.size === 0) {
      return fail(400, `"${file.name}" is empty.`);
    }
    if (file.size > maxFileBytes) {
      const mb = (file.size / (1024 * 1024)).toFixed(2);
      return fail(400, `"${file.name}" is ${mb} MB. The limit is ${formatMb(maxFileBytes)} per file.`);
    }
  }

  const rulesField = form.get("rules");
  if (rulesField !== null && typeof rulesField !== "string") {
    return fail(400, "rules must be a text field, not a file.");
  }
  const rules = parseRules(rulesField ?? "");
  if (rules.length > MAX_RULES) {
    return fail(400, `Too many rules (${rules.length}). The limit is ${MAX_RULES}.`);
  }
  const longRule = rules.find((rule) => rule.length > MAX_RULE_CHARS);
  if (longRule) {
    return fail(400, `Each rule must be at most ${MAX_RULE_CHARS} characters ("${longRule.slice(0, 60)}...").`);
  }
  const includeText = form.get("includeText") === "1";

  const documents: SourceDocument[] = [];
  for (const [index, file] of files.entries()) {
    let doc: SourceDocument;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      doc = await loadDocument({ name: file.name, bytes }, `doc_${index + 1}`);
    } catch (err) {
      logger.warn("analyze.document_unreadable", { document: index + 1, kind: extensionOf(file.name), err });
      const detail =
        env.NODE_ENV === "production"
          ? "Check that it is a valid, text-based PDF, DOCX or TXT file (scanned PDFs need OCR first)."
          : errorMessage(err);
      return fail(400, `Could not read "${file.name}". ${detail}`);
    }
    if (!doc.text.trim()) {
      return fail(400, `No extractable text in "${file.name}". Scanned PDFs need OCR before upload.`);
    }
    documents.push(doc);
  }

  // Checked again and counted only for valid requests, synchronously from here to the
  // in-flight increment below, so concurrent requests cannot slip past either limit.
  if ((inFlight.get(user.id) ?? 0) >= MAX_CONCURRENT_PER_USER) return tooManyRunning();
  const admitted = analyzeLimiter.consume(user.id, rateLimit);
  if (!admitted.allowed) {
    return fail(
      429,
      `You have reached the limit of ${rateLimit} analyses per hour. Try again in ${formatRetryAfter(admitted.retryAfterSeconds)}.`,
      { code: "rate_limited" },
      { "Retry-After": String(admitted.retryAfterSeconds) },
    );
  }

  const analyzeRequest: AnalyzeRequest = { documents, rules: rules.length > 0 ? rules : undefined };
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const startedAt = Date.now();
  inFlight.set(user.id, (inFlight.get(user.id) ?? 0) + 1);
  logger.info("analyze.started", {
    documents: documents.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0),
    characters: documents.reduce((sum, doc) => sum + doc.text.length, 0),
    rules: rules.length,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed or cancelled by the client
        }
      };
      const emit = (event: ProgressEvent) => {
        write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.stage === "done" || event.stage === "error") close();
      };

      // Initial comment flushes headers so the client sees the stream open immediately.
      write(": stream open\n\n");
      heartbeat = setInterval(() => write(": keep-alive\n\n"), HEARTBEAT_MS);

      if (includeText) {
        const payload = { documents: documents.map(({ id, name, kind, text }) => ({ id, name, kind, text })) };
        write(`event: documents\ndata: ${JSON.stringify(payload)}\n\n`);
      }

      try {
        const report: TrustReport = await runPipeline(analyzeRequest, (event: ProgressEvent) => {
          // The pipeline reports its own failure with the raw message before throwing;
          // the catch below sends a sanitised error event with the request id instead.
          if (event.stage === "error") return;
          if (!closed) emit(event);
        });
        // Saved even if the client has gone away, so the run is waiting under /runs.
        let runId: string | undefined;
        try {
          runId = saveRun({ userId: user.id, documents, ruleCount: rules.length, report });
        } catch (err) {
          logger.error("analyze.save_failed", { err });
        }
        logger.info("analyze.finished", {
          runId,
          durationMs: Date.now() - startedAt,
          findings: report.findings.length,
          withheld: report.withheld.length,
          compliance: report.compliance.length,
          clientConnected: !closed,
        });
        if (!closed) emit(runId ? { stage: "done", report, runId } : { stage: "done", report });
      } catch (err) {
        logger.error("analyze.failed", { durationMs: Date.now() - startedAt, err });
        if (!closed) emit({ stage: "error", message: publicFailure(env, err), requestId });
      } finally {
        const running = (inFlight.get(user.id) ?? 1) - 1;
        if (running > 0) inFlight.set(user.id, running);
        else inFlight.delete(user.id);
        close();
      }
    },
    cancel() {
      // Client disconnected. The pipeline has no abort hook, so it finishes in the
      // background (and is still saved); we just stop writing.
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops compression middleware from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...idHeader,
    },
  });
}
