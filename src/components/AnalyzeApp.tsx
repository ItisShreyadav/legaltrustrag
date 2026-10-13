"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ProgressEvent, TrustReport } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { ProgressPanel, type ProgressState } from "./ProgressPanel";
import { NumberedHeading } from "./report/ui";
import { ReportView } from "./report/ReportView";
import { readSseStream } from "./sse";
import { STAGES, stageIndex, type PipelineStage } from "./stages";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, MAX_FILES, UploadPanel, formatBytes } from "./UploadPanel";

type DocTexts = Record<string, string>;

type RunState =
  | { status: "idle" }
  | { status: "running"; progress: ProgressState; docTexts?: DocTexts }
  | { status: "done"; report: TrustReport; docTexts?: DocTexts; runId?: string }
  | { status: "error"; message: string; progress: ProgressState | null };

type Action =
  | { type: "start"; at: number; fileCount: number }
  | { type: "documents"; docTexts: DocTexts }
  | { type: "progress"; stage: PipelineStage; message: string; pct: number; at: number }
  | { type: "done"; report: TrustReport; runId?: string }
  | { type: "error"; message: string; at: number }
  | { type: "reset" };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "start": {
      const n = action.fileCount;
      const message = `Uploading ${n} ${n === 1 ? "document" : "documents"} for parsing.`;
      return {
        status: "running",
        progress: { stage: null, pct: 0, message, log: [{ at: action.at, stage: "upload", message }] },
      };
    }
    case "documents":
      return state.status === "running" ? { ...state, docTexts: action.docTexts } : state;
    case "progress": {
      if (state.status !== "running") return state;
      const idx = stageIndex(action.stage);
      const prev = state.progress;
      const prevIdx = prev.stage ? stageIndex(prev.stage) : -1;
      // Never move the stage or the bar backwards; the bar is at least at the
      // start of the current stage. The log records every event as received.
      const stage = idx >= prevIdx ? action.stage : prev.stage;
      const floor = (Math.max(idx, prevIdx) / STAGES.length) * 100;
      const pct = Math.min(100, Math.max(prev.pct, floor, Number.isFinite(action.pct) ? action.pct : 0));
      const message = action.message || (STAGES[idx]?.hint ?? "");
      return {
        ...state,
        progress: { stage, pct, message, log: [...prev.log, { at: action.at, stage: action.stage, message }] },
      };
    }
    case "done":
      return {
        status: "done",
        report: action.report,
        docTexts: state.status === "running" ? state.docTexts : undefined,
        runId: action.runId,
      };
    case "error":
      return {
        status: "error",
        message: action.message,
        progress:
          state.status === "running"
            ? {
                ...state.progress,
                log: [...state.progress.log, { at: action.at, stage: "error", message: action.message }],
              }
            : null,
      };
    case "reset":
      return { status: "idle" };
  }
}

interface Health {
  ok: boolean;
  hasApiKey: boolean;
  model: string;
}

const SAMPLE_FILES = ["msa.txt", "amendment.txt"];
const SAMPLE_RULES = [
  "The agreement must be governed by the laws of India.",
  "Liability must be capped at the total fees paid.",
  "Either party may terminate for convenience on no more than 30 days' notice.",
  "Personal data must not be transferred outside India without prior written consent.",
];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return typeof err === "string" && err ? err : "Something went wrong.";
}

async function errorFromResponse(res: Response): Promise<string> {
  const fallback = `The server responded with ${res.status} ${res.statusText}`.trim();
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // not JSON
  }
  return fallback;
}


function isProgressEvent(value: unknown): value is ProgressEvent {
  return typeof value === "object" && value !== null && "stage" in value && typeof value.stage === "string";
}

export function AnalyzeApp() {
  const [state, dispatch] = useReducer(reducer, { status: "idle" });
  const [files, setFiles] = useState<File[]>([]);
  const [rules, setRules] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [loadingSample, setLoadingSample] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const running = state.status === "running";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Health>) : null))
      .then((h) => setHealth(h))
      .catch(() => {
        // health is advisory only
      });
    return () => controller.abort();
  }, []);

  // Abort any in-flight analysis when the component unmounts.
  useEffect(() => {
    const ref = abortRef;
    return () => ref.current?.abort();
  }, []);

  // Move focus (and scroll) to the analysis section when a
  // run starts or finishes, for keyboard and screen-reader users.
  useEffect(() => {
    if (state.status !== "idle") resultsRef.current?.focus();
  }, [state.status]);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const next = [...files];
      const problems: string[] = [];
      for (const file of incoming) {
        const ext = extensionOf(file.name);
        if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
          problems.push(`${file.name}: unsupported type. Use PDF, DOCX or TXT.`);
        } else if (file.size === 0) {
          problems.push(`${file.name}: file is empty.`);
        } else if (file.size > MAX_FILE_BYTES) {
          problems.push(`${file.name}: ${formatBytes(file.size)} exceeds the 10 MB limit.`);
        } else if (next.some((f) => f.name === file.name && f.size === file.size)) {
          problems.push(`${file.name}: already added.`);
        } else if (next.length >= MAX_FILES) {
          problems.push(`${file.name}: limit of ${MAX_FILES} files reached.`);
        } else {
          next.push(file);
        }
      }
      setFiles(next);
      setNotices(problems);
    },
    [files],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
    setNotices([]);
  }, []);

  const loadSample = useCallback(async () => {
    setLoadingSample(true);
    setNotices([]);
    try {
      const loaded = await Promise.all(
        SAMPLE_FILES.map(async (name) => {
          const res = await fetch(`/samples/${name}`);
          if (!res.ok) throw new Error(`${name} (${res.status})`);
          return new File([await res.text()], name, { type: "text/plain" });
        }),
      );
      setFiles(loaded);
      setRules((current) => (current.trim() ? current : SAMPLE_RULES.join("\n")));
    } catch (err) {
      setNotices([`Could not load the sample documents: ${errorText(err)}`]);
    } finally {
      setLoadingSample(false);
    }
  }, []);

  const analyse = useCallback(async () => {
    if (files.length === 0 || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setNotices([]);
    dispatch({ type: "start", at: Date.now(), fileCount: files.length });

    let finished = false;
    const handleEvent = (event: ProgressEvent) => {
      if (finished) return;
      if (event.stage === "done") {
        finished = true;
        dispatch({ type: "done", report: event.report, runId: typeof event.runId === "string" ? event.runId : undefined });
      } else if (event.stage === "error") {
        finished = true;
        dispatch({ type: "error", message: event.message || "The analysis failed.", at: Date.now() });
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

      const res = await fetch("/api/analyze", { method: "POST", body: form, signal: controller.signal });
      if (!res.ok) throw new Error(await errorFromResponse(res));
      if (!res.body) throw new Error("The server returned an empty response.");

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
      if (!finished) throw new Error("The connection closed before the analysis finished. Please try again.");
    } catch (err) {
      if (controller.signal.aborted || finished) return;
      dispatch({ type: "error", message: errorText(err), at: Date.now() });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [files, rules]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  const report = state.status === "done" ? state.report : null;
  const docTexts = state.status === "done" ? state.docTexts : undefined;
  const runId = state.status === "done" ? state.runId : undefined;

  return (
    <div className="mt-12">
      {health && !health.hasApiKey ? (
        <p role="note" className="mb-8 max-w-[68ch] text-[1.0625rem] leading-[1.6] md:ml-16">
          <span className="smallcaps font-semibold">Configuration.</span>{" "}
          <code className="font-mono text-[0.875em]">ANTHROPIC_API_KEY</code> is not set on the server, so analysis will
          fail. Add it to <code className="font-mono text-[0.875em]">.env.local</code>.
        </p>
      ) : null}

      <UploadPanel
        files={files}
        rules={rules}
        notices={notices}
        busy={running}
        loadingSample={loadingSample}
        model={health?.model}
        onAddFiles={addFiles}
        onRemoveFile={removeFile}
        onRulesChange={setRules}
        onAnalyse={analyse}
        onLoadSample={loadSample}
      />

      <section
        ref={resultsRef}
        tabIndex={-1}
        aria-labelledby="analysis-heading"
        className="scroll-mt-6 border-t border-rule pt-7 focus:outline-none md:pl-16"
      >
        <NumberedHeading id="analysis-heading" number="3." title="Analysis" />

        <div className="mt-5 space-y-8">
          {state.status === "running" ? <ProgressPanel progress={state.progress} mode="running" onCancel={cancel} /> : null}

          {state.status === "error" ? (
            <>
              {state.progress ? <ProgressPanel progress={state.progress} mode="error" /> : null}
              <div role="alert" className="max-w-[68ch]">
                <p className="text-[1.125rem] font-semibold text-accent">The analysis could not be completed.</p>
                <p className="mt-1 text-[1.0625rem] leading-[1.6] break-words">{state.message}</p>
                <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-3">
                  <button type="button" onClick={analyse} disabled={files.length === 0} className="btn-primary">
                    Try again
                  </button>
                  <button type="button" onClick={() => dispatch({ type: "reset" })} className="link text-[0.9375rem]">
                    Dismiss
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {report ? <ReportView report={report} docTexts={docTexts} sectionNumber="3" runId={runId} /> : null}

          {state.status === "idle" && !report ? <EmptyState /> : null}
        </div>
      </section>
    </div>
  );
}
