import { getSessionUser } from "@/lib/auth";
import { loadDocument } from "@/lib/parse";
import { runPipeline } from "@/lib/pipeline";
import { saveRun } from "@/lib/runs";
import type { AnalyzeRequest, ProgressEvent, SourceDocument, TrustReport } from "@/lib/types";

// Runs on the Node.js runtime, which is the default. Next 16 rejects an explicit
// `export const runtime` while `cacheComponents` is enabled in next.config.ts.
export const maxDuration = 300;

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_RULES = 50;
const MAX_RULE_CHARS = 1000;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt"]);
const HEARTBEAT_MS = 15_000;

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return typeof err === "string" && err ? err : "Unknown error";
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
 * POST multipart/form-data
 *   files[]      1-5 files (.pdf, .docx, .txt), max 10 MB each
 *   rules        optional, one compliance rule per line
 *   includeText  optional "1": emit an `event: documents` SSE message with the parsed
 *                document texts before the pipeline starts (the UI uses it to show
 *                quotes inside their clause context)
 *
 * Responds with text/event-stream. Every ProgressEvent is sent as `data: <json>\n\n`;
 * the stream closes after the `done` or `error` event. A finished report is saved
 * for the signed-in user (with the document texts) and the `done` event carries
 * its `runId`; if saving fails the report is still sent, without a `runId`.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in to analyse documents." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return badRequest("Expected a multipart/form-data body with files[] and an optional rules field.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Malformed multipart/form-data body.");
  }

  const entries = [...form.getAll("files[]"), ...form.getAll("files")];
  const files = entries.filter((entry): entry is File => typeof entry !== "string");
  if (files.length !== entries.length) {
    return badRequest("files[] must contain file uploads, not text values.");
  }
  if (files.length === 0) {
    return badRequest("Upload at least one document (PDF, DOCX or TXT) in the files[] field.");
  }
  if (files.length > MAX_FILES) {
    return badRequest(`Too many files (${files.length}). Upload at most ${MAX_FILES}.`);
  }
  for (const file of files) {
    if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) {
      return badRequest(`Unsupported file type for "${file.name}". Use PDF, DOCX or TXT.`);
    }
    if (file.size === 0) {
      return badRequest(`"${file.name}" is empty.`);
    }
    if (file.size > MAX_FILE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(2);
      return badRequest(`"${file.name}" is ${mb} MB. The limit is 10 MB per file.`);
    }
  }

  const rulesField = form.get("rules");
  if (rulesField !== null && typeof rulesField !== "string") {
    return badRequest("rules must be a text field, not a file.");
  }
  const rules = parseRules(rulesField ?? "");
  if (rules.length > MAX_RULES) {
    return badRequest(`Too many rules (${rules.length}). The limit is ${MAX_RULES}.`);
  }
  const longRule = rules.find((rule) => rule.length > MAX_RULE_CHARS);
  if (longRule) {
    return badRequest(`Each rule must be at most ${MAX_RULE_CHARS} characters ("${longRule.slice(0, 60)}...").`);
  }
  const includeText = form.get("includeText") === "1";

  const documents: SourceDocument[] = [];
  for (const [index, file] of files.entries()) {
    let doc: SourceDocument;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      doc = await loadDocument({ name: file.name, bytes }, `doc_${index + 1}`);
    } catch (err) {
      return badRequest(`Could not read "${file.name}": ${errorMessage(err)}`);
    }
    if (!doc.text.trim()) {
      return badRequest(`No extractable text in "${file.name}". Scanned PDFs need OCR before upload.`);
    }
    documents.push(doc);
  }

  const analyzeRequest: AnalyzeRequest = { documents, rules: rules.length > 0 ? rules : undefined };
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

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
          if (!closed) emit(event);
        });
        // Saved even if the client has gone away, so the run is waiting under /runs.
        let runId: string | undefined;
        try {
          runId = saveRun({ userId: user.id, documents, ruleCount: rules.length, report });
        } catch (err) {
          console.error("[api/analyze] could not save the run:", err);
        }
        if (!closed) emit(runId ? { stage: "done", report, runId } : { stage: "done", report });
      } catch (err) {
        console.error("[api/analyze] pipeline failed:", err);
        if (!closed) emit({ stage: "error", message: errorMessage(err) });
      } finally {
        close();
      }
    },
    cancel() {
      // Client disconnected. The pipeline has no abort hook, so it finishes in the
      // background; we just stop writing.
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
    },
  });
}
