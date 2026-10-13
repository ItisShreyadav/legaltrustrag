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

interface Props {
  progress: ProgressState;
  /** "running" marks the newest line as current; "error" marks the run as stopped. */
  mode: "running" | "error";
  onCancel?: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

function clock(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** A running log, newest line at the bottom, over a 2px ink progress rule. */
export function ProgressPanel({ progress, mode, onCancel }: Props) {
  const current = progress.stage ? stageIndex(progress.stage) : -1;
  const pct = Math.round(Math.min(100, Math.max(0, progress.pct)));
  const failed = mode === "error";
  const last = progress.log.length - 1;

  return (
    <section aria-labelledby="progress-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 id="progress-heading" className="text-[1.25rem] leading-snug font-semibold">
          {failed ? "Analysis stopped" : "Analysing documents"}
        </h3>
        <div className="flex items-baseline gap-5">
          <span className="figures font-mono text-[0.75rem] text-muted">
            stage {Math.max(current + 1, 0)}/{STAGES.length}
            <span aria-hidden="true" className="px-[0.6ch]">
              ·
            </span>
            {pct}%
          </span>
          {onCancel && !failed ? (
            <button type="button" onClick={onCancel} className="link text-[0.9375rem]">
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <ol
        role="log"
        aria-label="Analysis log"
        className="mt-3 border-t border-rule pt-3 pb-3 font-mono text-[0.75rem] leading-[1.6rem]"
      >
        {progress.log.map((entry, i) => {
          const isCurrent = i === last;
          const tone =
            isCurrent && entry.stage === "error" ? "font-bold text-accent" : isCurrent ? "font-bold text-ink" : "text-muted";
          return (
            <li
              key={`${entry.at}-${i}`}
              aria-current={isCurrent && !failed ? "step" : undefined}
              className={`grid grid-cols-[8ch_minmax(0,1fr)] gap-x-[2ch] sm:grid-cols-[8ch_13ch_minmax(0,1fr)] ${tone}`}
            >
              <time dateTime={new Date(entry.at).toISOString()} className="figures">
                {clock(entry.at)}
              </time>
              <span>{entry.stage}</span>
              <span className="col-start-2 break-words sm:col-start-3">{entry.message}</span>
            </li>
          );
        })}
      </ol>

      <div
        role="progressbar"
        aria-label="Overall progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-[2px] w-full bg-rule"
      >
        <div
          className={`h-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${failed ? "bg-accent" : "bg-ink"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}
