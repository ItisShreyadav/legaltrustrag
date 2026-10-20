import type { TrustReport } from "@/lib/types";
import { STAGES, stageIndex, type PipelineStage } from "./stages";

export interface LogEntry {
  /** Epoch milliseconds when the event arrived. */
  at: number;
  /** Pipeline stage id, or "upload" / "error" for the client's own entries. */
  stage: string;
  message: string;
}

export interface ProgressState {
  stage: PipelineStage | null;
  /** Overall progress, 0-100. */
  pct: number;
  message: string;
  /** Every event received so far, oldest first. */
  log: LogEntry[];
}

/** Parsed document texts keyed by doc id, sent by the server before the pipeline starts. */
export type DocTexts = Record<string, string>;

export type RunState =
  | { status: "idle" }
  | { status: "running"; startedAt: number; progress: ProgressState; docTexts?: DocTexts }
  | {
      status: "done";
      startedAt: number;
      finishedAt: number;
      report: TrustReport;
      docTexts?: DocTexts;
      runId?: string;
    }
  /** `requestId` identifies the failed request in the server log, when the server sent one. */
  | { status: "error"; message: string; requestId?: string; progress: ProgressState | null };

export type RunAction =
  | { type: "start"; at: number; fileCount: number }
  | { type: "documents"; docTexts: DocTexts }
  | { type: "progress"; stage: PipelineStage; message: string; pct: number; at: number }
  | { type: "done"; report: TrustReport; runId?: string; at: number }
  | { type: "error"; message: string; requestId?: string; at: number }
  | { type: "reset" };

export const INITIAL_RUN_STATE: RunState = { status: "idle" };

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "start": {
      const n = action.fileCount;
      const message = `Uploading ${n} ${n === 1 ? "document" : "documents"} for parsing.`;
      return {
        status: "running",
        startedAt: action.at,
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
      if (state.status !== "running") return state;
      return {
        status: "done",
        startedAt: state.startedAt,
        finishedAt: action.at,
        report: action.report,
        docTexts: state.docTexts,
        runId: action.runId,
      };
    case "error":
      if (state.status !== "running") return state;
      return {
        status: "error",
        message: action.message,
        requestId: action.requestId,
        progress: {
          ...state.progress,
          log: [...state.progress.log, { at: action.at, stage: "error", message: action.message }],
        },
      };
    case "reset":
      return INITIAL_RUN_STATE;
  }
}
