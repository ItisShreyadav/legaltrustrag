import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";
import type { ProgressEvent, TrustReport } from "@/lib/types";
import { readSseStream } from "./sse";
import { INITIAL_RUN_STATE, runReducer, type RunState } from "./state";

/** A failure the server explained before the stream started, with its request id when it sent one. */
class AnalyzeRequestError extends Error {
  constructor(
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AnalyzeRequestError";
  }
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return typeof err === "string" && err ? err : "Something went wrong.";
}

async function errorFromResponse(res: Response): Promise<AnalyzeRequestError> {
  let message = `The server responded with ${res.status} ${res.statusText}`.trim();
  let requestId = res.headers.get("X-Request-Id") ?? undefined;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      if ("error" in body && typeof body.error === "string" && body.error) message = body.error;
      if ("requestId" in body && typeof body.requestId === "string" && body.requestId) requestId = body.requestId;
    }
  } catch {
    // not JSON
  }
  if (res.status === 401 && message.startsWith("The server responded")) message = "Your session has ended. Sign in again.";
  return new AnalyzeRequestError(message, requestId);
}

function isProgressEvent(value: unknown): value is ProgressEvent {
  return typeof value === "object" && value !== null && "stage" in value && typeof value.stage === "string";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface Analysis {
  state: RunState;
  /** Upload the files and stream the pipeline. Ignored while a run is in flight. */
  start: (files: readonly File[], rules: string) => void;
  /** Stop following the run in flight and return to idle. */
  cancel: () => void;
  /** Clear a finished or failed run. */
  dismiss: () => void;
}

/**
 * Drives one analysis at a time: POST /api/analyze, read its SSE stream, and
 * fold each event into a RunState. Aborts the request on cancel and unmount.
 */
export function useAnalysis(): Analysis {
  const [state, dispatch] = useReducer(runReducer, INITIAL_RUN_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Abort any in-flight analysis when the page unmounts.
  useEffect(() => {
    const ref = abortRef;
    return () => ref.current?.abort();
  }, []);

  const announceDone = useCallback(
    (report: TrustReport, runId: string | undefined) => {
      const findings = report.findings.filter((f) => f.kind === "conflict" && f.verification.status !== "withheld").length;
      const summary = `${plural(findings, "finding", "findings")}, ${plural(report.compliance.length, "rule", "rules")} checked.`;
      toast.success("Analysis complete", {
        description: runId ? summary : `${summary} The run could not be saved; export the JSON to keep a copy.`,
        action: runId ? { label: "Open saved run", onClick: () => router.push(`/runs/${runId}`) } : undefined,
      });
    },
    [router],
  );

  const run = useCallback(
    async (files: readonly File[], rules: string) => {
      if (files.length === 0 || abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      dispatch({ type: "start", at: Date.now(), fileCount: files.length });

      let finished = false;
      /** X-Request-Id of the stream, for errors that do not carry their own. */
      let requestId: string | undefined;
      const handleEvent = (event: ProgressEvent) => {
        if (finished) return;
        if (event.stage === "done") {
          finished = true;
          const runId = typeof event.runId === "string" ? event.runId : undefined;
          dispatch({ type: "done", report: event.report, runId, at: Date.now() });
          announceDone(event.report, runId);
        } else if (event.stage === "error") {
          finished = true;
          dispatch({
            type: "error",
            message: event.message || "The analysis failed.",
            requestId: typeof event.requestId === "string" && event.requestId ? event.requestId : requestId,
            at: Date.now(),
          });
        } else {
          dispatch({
            type: "progress",
            stage: event.stage,
            message: event.message ?? "",
            pct: Number(event.pct),
            at: Date.now(),
          });
        }
      };

      try {
        const form = new FormData();
        for (const file of files) form.append("files[]", file, file.name);
        if (rules.trim()) form.append("rules", rules);
        form.append("includeText", "1");

        let res: Response;
        try {
          res = await fetch("/api/analyze", { method: "POST", body: form, signal: controller.signal });
        } catch (err) {
          if (controller.signal.aborted) throw err;
          throw new Error("Could not reach the server. Check your connection and try again.");
        }
        if (!res.ok) throw await errorFromResponse(res);
        if (!res.body) throw new Error("The server returned an empty response.");
        requestId = res.headers.get("X-Request-Id") ?? undefined;

        await readSseStream(res.body, (message) => {
          let payload: unknown;
          try {
            payload = JSON.parse(message.data);
          } catch {
            return; // ignore malformed events
          }
          if (message.event === "documents") {
            const docs = (payload as { documents?: Array<{ id: string; text: string }> }).documents;
            if (Array.isArray(docs)) {
              dispatch({ type: "documents", docTexts: Object.fromEntries(docs.map((d) => [d.id, d.text])) });
            }
          } else if (message.event === "message" && isProgressEvent(payload)) {
            handleEvent(payload);
          }
        });
        if (!finished) {
          throw new AnalyzeRequestError(
            "The connection closed before the analysis finished. If the server completes it, the run will appear under Runs.",
            requestId,
          );
        }
      } catch (err) {
        if (controller.signal.aborted || finished) return;
        const failedId = err instanceof AnalyzeRequestError ? err.requestId : requestId;
        dispatch({ type: "error", message: errorText(err), requestId: failedId, at: Date.now() });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [announceDone],
  );

  const start = useCallback(
    (files: readonly File[], rules: string) => {
      void run(files, rules);
    },
    [run],
  );

  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    dispatch({ type: "reset" });
    toast("Analysis cancelled", {
      description: "The server may still finish it. Completed runs are listed under Runs.",
    });
  }, []);

  const dismiss = useCallback(() => dispatch({ type: "reset" }), []);

  return { state, start, cancel, dismiss };
}
