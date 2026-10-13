import { STAGES, stageIndex, type PipelineStage } from "./stages";

export interface ProgressState {
  stage: PipelineStage | null;
  /** Overall progress, 0-100. */
  pct: number;
  message: string;
}

interface Props {
  progress: ProgressState;
  /** "running" animates the active step; "error" marks it failed. */
  mode: "running" | "error";
  onCancel?: () => void;
}

export function ProgressPanel({ progress, mode, onCancel }: Props) {
  const current = progress.stage ? stageIndex(progress.stage) : -1;
  const pct = Math.round(Math.min(100, Math.max(0, progress.pct)));
  const failed = mode === "error";

  return (
    <section
      aria-labelledby="progress-heading"
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="progress-heading" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {failed ? "Analysis stopped" : "Analysing documents"}
        </h2>
        {onCancel && !failed ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <ol className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-6">
        {STAGES.map((s, i) => {
          const state = i < current ? "done" : i === current ? (failed ? "failed" : "active") : "pending";
          return (
            <li key={s.id} aria-current={state === "active" ? "step" : undefined} className="flex flex-col gap-2">
              <div
                className={`h-1 rounded-full ${
                  state === "done"
                    ? "bg-indigo-600 dark:bg-indigo-400"
                    : state === "active"
                      ? "animate-pulse bg-indigo-400 dark:bg-indigo-500"
                      : state === "failed"
                        ? "bg-red-500"
                        : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              />
              <div className="flex items-center gap-1.5">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
                    state === "done"
                      ? "bg-indigo-600 text-white dark:bg-indigo-500"
                      : state === "active"
                        ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-200"
                        : state === "failed"
                          ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                  aria-hidden="true"
                >
                  {state === "done" ? "✓" : state === "failed" ? "!" : i + 1}
                </span>
                <span
                  className={`truncate text-xs font-medium ${
                    state === "pending" ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {s.label}
                  <span className="sr-only">
                    {state === "done" ? " (complete)" : state === "active" ? " (in progress)" : state === "failed" ? " (failed)" : " (pending)"}
                  </span>
                </span>
              </div>
              <p className="hidden text-[0.7rem] leading-snug text-zinc-500 lg:block dark:text-zinc-500">{s.hint}</p>
            </li>
          );
        })}
      </ol>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>Overall progress</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Overall progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${failed ? "bg-red-500" : "bg-indigo-600 dark:bg-indigo-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p aria-live="polite" className="mt-3 min-h-5 text-sm text-zinc-600 dark:text-zinc-300">
          {progress.message || "Uploading and parsing documents…"}
        </p>
      </div>
    </section>
  );
}
