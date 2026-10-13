"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ProgressEvent, TrustReport } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { ProgressPanel, type ProgressState } from "./ProgressPanel";
import { mockDocuments, mockProgress, mockReport } from "./report/mock";
import { ReportView } from "./report/ReportView";
import { readSseStream } from "./sse";
import { STAGES, stageIndex, type PipelineStage } from "./stages";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, MAX_FILES, UploadPanel, formatBytes } from "./UploadPanel";

type DocTexts = Record<string, string>;

type RunState =
  | { status: "idle" }
  | { status: "running"; progress: ProgressState; docTexts?: DocTexts }
  | { status: "done"; report: TrustReport; docTexts?: DocTexts }
  | { status: "error"; message: string; progress: ProgressState | null };

type Action =
  | { type: "start" }
  | { type: "documents"; docTexts: DocTexts }
  | { type: "progress"; stage: PipelineStage; message: string; pct: number }
  | { type: "done"; report: TrustReport }
  | { type: "error"; message: string }
  | { type: "reset" };

const INITIAL_PROGRESS: ProgressState = { stage: null, pct: 0, message: "" };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "start":
      return { status: "running", progress: INITIAL_PROGRESS };
    case "documents":
      return state.status === "running" ? { ...state, docTexts: action.docTexts } : state;
    case "progress": {
      if (state.status !== "running") return state;
      const idx = stageIndex(action.stage);
      const prev = state.progress;
      const prevIdx = prev.stage ? stageIndex(prev.stage) : -1;
      // Never move the stepper or the bar backwards; the bar is at least at the
      // start of the current stage.
      const stage = idx >= prevIdx ? action.stage : prev.stage;
      const floor = (Math.max(idx, prevIdx) / STAGES.length) * 100;
      const pct = Math.min(100, Math.max(prev.pct, floor, Number.isFinite(action.pct) ? action.pct : 0));
      return { ...state, progress: { stage, pct, message: action.message } };
    }
    case "done":
      return {
        status: "done",
        report: action.report,
        docTexts: state.status === "running" ? state.docTexts : undefined,
      };
    case "error":
      return {
        status: "error",
        message: action.message,
        progress: state.status === "running" ? state.progress : null,
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

const MOCK_DOC_TEXTS: DocTexts = Object.fromEntries(mockDocuments.map((d) => [d.id, d.text]));

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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function isProgressEvent(value: unknown): value is ProgressEvent {
  return typeof value === "object" && value !== null && "stage" in value && typeof value.stage === "string";
}

export function AnalyzeApp() {
  const searchParams = useSearchParams();
  const mockMode = searchParams.get("mock") === "1";

  const [state, dispatch] = useReducer(reducer, { status: "idle" });
  const [files, setFiles] = useState<File[]>([]);
  const [rules, setRules] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [loadingSample, setLoadingSample] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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

  // Move focus (and scroll, on narrow screens) to the progress/results column when a
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
    dispatch({ type: "start" });

    let finished = false;
    const handleEvent = (event: ProgressEvent) => {
      if (finished) return;
      if (event.stage === "done") {
        finished = true;
        dispatch({ type: "done", report: event.report });
      } else if (event.stage === "error") {
        finished = true;
        dispatch({ type: "error", message: event.message || "The analysis failed." });
      } else {
        dispatch({ type: "progress", stage: event.stage, message: event.message ?? "", pct: Number(event.pct) });
      }
    };

    try {
      if (mockMode) {
        dispatch({ type: "documents", docTexts: MOCK_DOC_TEXTS });
        for (const event of mockProgress) {
          await sleep(500, controller.signal);
          handleEvent(event);
        }
        await sleep(500, controller.signal);
        handleEvent({ stage: "done", report: mockReport });
        return;
      }

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
      dispatch({ type: "error", message: errorText(err) });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [files, rules, mockMode]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  // In mock mode the fixture is shown until a run replaces it.
  const showMockFixture = mockMode && state.status === "idle";
  const report = state.status === "done" ? state.report : showMockFixture ? mockReport : null;
  const docTexts = state.status === "done" ? state.docTexts : showMockFixture ? MOCK_DOC_TEXTS : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <aside aria-label="Analysis input" className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
          {health && !health.hasApiKey && !mockMode ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <span className="font-semibold">ANTHROPIC_API_KEY is not set</span> on the server, so analysis will fail.
              Add it to <code className="font-mono">.env.local</code>, or{" "}
              <Link href="/?mock=1" className="font-medium underline underline-offset-2">
                preview with mock data
              </Link>
              .
            </div>
          ) : null}
          <UploadPanel
            files={files}
            rules={rules}
            notices={notices}
            busy={running}
            loadingSample={loadingSample}
            mockMode={mockMode}
            onAddFiles={addFiles}
            onRemoveFile={removeFile}
            onRulesChange={setRules}
            onAnalyse={analyse}
            onLoadSample={loadSample}
          />
          {health?.model ? (
            <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
              Model: <span className="font-mono">{health.model}</span>
            </p>
          ) : null}
        </div>
      </aside>

      <div ref={resultsRef} tabIndex={-1} className="min-w-0 space-y-6 focus:outline-none">
        {mockMode && (showMockFixture || state.status === "done") ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
            <span>
              <span className="font-semibold">Mock data.</span> This report comes from a built-in fixture; no API call was
              made.
            </span>
            <Link href="/" className="font-medium underline underline-offset-2">
              Exit mock mode
            </Link>
          </div>
        ) : null}

        {state.status === "running" ? <ProgressPanel progress={state.progress} mode="running" onCancel={cancel} /> : null}

        {state.status === "error" ? (
          <>
            {state.progress ? <ProgressPanel progress={state.progress} mode="error" /> : null}
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
            >
              <p className="font-semibold">The analysis could not be completed</p>
              <p className="mt-1 break-words">{state.message}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={analyse}
                  disabled={files.length === 0}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "reset" })}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-red-300 dark:hover:bg-red-500/20"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </>
        ) : null}

        {report ? <ReportView report={report} docTexts={docTexts} /> : null}

        {state.status === "idle" && !report ? <EmptyState /> : null}
      </div>
    </div>
  );
}
