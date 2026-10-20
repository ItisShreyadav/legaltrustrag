"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { STAGES, stageIndex } from "./stages";
import type { ProgressState } from "./state";

type StepState = "done" | "current" | "failed" | "pending";

const STEP_WORD: Record<StepState, string> = {
  done: "complete",
  current: "in progress",
  failed: "failed",
  pending: "pending",
};

const pad = (n: number) => String(n).padStart(2, "0");

function clock(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function StepIcon({ state }: { state: StepState }) {
  return (
    <span
      className={cn(
        "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background",
        state === "done" && "border-primary bg-primary text-primary-foreground",
        state === "current" && "border-primary text-primary",
        state === "failed" && "border-destructive text-destructive",
        state === "pending" && "text-muted-foreground",
      )}
    >
      {state === "done" ? <CheckIcon className="size-3.5" /> : null}
      {state === "current" ? <Spinner className="size-3.5" aria-hidden="true" /> : null}
      {state === "failed" ? <XIcon className="size-3.5" /> : null}
      {state === "pending" ? <span className="size-1.5 rounded-full bg-muted-foreground/50" /> : null}
    </span>
  );
}

interface RunProgressProps {
  progress: ProgressState;
  /** "error" marks the current stage as failed and stops the spinner. */
  mode: "running" | "error";
}

/** Overall bar, the six pipeline stages as a vertical stepper, and the raw event log. */
export function RunProgress({ progress, mode }: RunProgressProps) {
  const headingId = useId();
  const logLabelId = useId();
  const logRef = useRef<HTMLOListElement>(null);
  const failed = mode === "error";
  const current = progress.stage ? stageIndex(progress.stage) : -1;
  const pct = Math.round(Math.min(100, Math.max(0, progress.pct)));
  const entries = progress.log.length;

  // Keep the newest log line in view without scrolling the page itself.
  useEffect(() => {
    const viewport = logRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [entries]);

  const stepState = (i: number): StepState => {
    if (i < current) return "done";
    if (i === current) return failed ? "failed" : "current";
    return "pending";
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={headingId} className="text-sm font-medium">
            {failed ? "Analysis stopped" : "Analyzing documents"}
          </h3>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {current >= 0 ? `${current + 1}/${STAGES.length} · ` : null}
            {pct}%
          </span>
        </div>
        <Progress
          value={pct}
          aria-label="Overall progress"
          className={cn("h-1.5", failed && "*:data-[slot=progress-indicator]:bg-destructive")}
        />
        <p className="text-xs break-words text-muted-foreground">{progress.message}</p>
      </div>

      <ol aria-label="Pipeline stages" className="flex flex-col">
        {STAGES.map((stage, i) => {
          const state = stepState(i);
          return (
            <li
              key={stage.id}
              aria-current={state === "current" ? "step" : undefined}
              className="relative flex gap-3 pb-3 last:pb-0"
            >
              {i < STAGES.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-6 bottom-0 left-3 w-px -translate-x-1/2",
                    state === "done" ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
              <StepIcon state={state} />
              <div className="min-w-0 pt-0.5">
                <p className={cn("text-sm leading-5 font-medium", state === "pending" && "text-muted-foreground")}>
                  {stage.label}
                  <span className="sr-only">, {STEP_WORD[state]}</span>
                </p>
                <p className={cn("text-xs text-muted-foreground", state === "failed" && "text-destructive")}>
                  {stage.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1.5">
        <p id={logLabelId} className="text-xs font-medium text-muted-foreground">
          Event log
        </p>
        <ScrollArea className="rounded-lg border bg-muted/30 *:data-[slot=scroll-area-viewport]:max-h-60">
          <div role="log" aria-live="polite" aria-labelledby={logLabelId}>
            <ol ref={logRef} className="flex flex-col gap-1 p-2.5 font-mono text-xs leading-5">
              {progress.log.map((entry, i) => {
                const latest = i === entries - 1;
                return (
                  <li
                    key={`${entry.at}-${i}`}
                    className={cn(
                      "grid grid-cols-[auto_minmax(0,1fr)] gap-x-2",
                      latest ? "text-foreground" : "text-muted-foreground",
                      entry.stage === "error" && "text-destructive",
                    )}
                  >
                    <time dateTime={new Date(entry.at).toISOString()} className="tabular-nums">
                      {clock(entry.at)}
                    </time>
                    <span className="break-words">
                      <span className="font-medium">{entry.stage}</span> {entry.message}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}
