"use client";

import { CircleAlertIcon, CircleCheckIcon, KeyRoundIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { shortRunId } from "@/components/runs/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { RunProgress } from "./RunProgress";
import type { RunState } from "./state";
import { uploadLimits, type ServerHealth } from "./use-server-health";

interface RunCardProps {
  state: RunState;
  health: ServerHealth;
  fileCount: number;
  ruleCount: number;
  /** Why the run button is disabled while idle, if it is. */
  blocker: string | null;
  onRun: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  className?: string;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function ModelValue({ health }: { health: ServerHealth }) {
  if (health.status === "loading") {
    return (
      <>
        <Skeleton className="ml-auto h-4 w-28" />
        <span className="sr-only">Loading</span>
      </>
    );
  }
  const model = health.status === "ready" ? health.model : null;
  if (!model) return <span className="font-normal text-muted-foreground">Unavailable</span>;
  return (
    <span className="block truncate font-mono text-xs" title={model}>
      {model}
    </span>
  );
}

/** Run summary, the run button, then live progress, the failure or the completion notice. */
export function RunCard({
  state,
  health,
  fileCount,
  ruleCount,
  blocker,
  onRun,
  onCancel,
  onDismiss,
  className,
}: RunCardProps) {
  const titleId = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  const running = state.status === "running";
  const apiKeyMissing = health.status === "ready" && health.hasApiKey === false;

  // The run button is disabled while a run is in flight, so move focus to the
  // progress (or to the failure) for keyboard and screen-reader users.
  useEffect(() => {
    if (state.status === "running" || state.status === "error") statusRef.current?.focus();
  }, [state.status]);

  return (
    <Card className={cn("gap-0 py-0", className)} role="region" aria-labelledby={titleId}>
      <CardHeader className="shrink-0 border-b py-4">
        <CardTitle>
          <h2 id={titleId}>Run</h2>
        </CardTitle>
        <CardDescription>
          Detects conflicts between clauses, checks each rule, and verifies every finding against an exact quote.
        </CardDescription>
      </CardHeader>

      {/* Scrolls on its own when the card is capped to the viewport, so the run and cancel buttons stay visible. */}
      <CardContent className="flex min-h-0 flex-col gap-4 overflow-y-auto py-4">
        <dl className="divide-y text-sm">
          <SummaryRow label="Documents">
            {fileCount}
            <span className="font-normal text-muted-foreground"> / {uploadLimits(health).maxFiles}</span>
          </SummaryRow>
          <SummaryRow label="Rules">{ruleCount}</SummaryRow>
          <SummaryRow label="Model">
            <ModelValue health={health} />
          </SummaryRow>
        </dl>

        {apiKeyMissing ? (
          <Alert variant="destructive">
            <KeyRoundIcon />
            <AlertTitle>API key not configured</AlertTitle>
            <AlertDescription>
              <p>
                The server has no <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>, so analyses cannot run. Set
                it in the server environment and reload this page.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {state.status === "running" || state.status === "error" ? (
          <div
            ref={statusRef}
            tabIndex={-1}
            role="group"
            aria-label="Analysis status"
            className="flex flex-col gap-4 rounded-lg outline-none"
          >
            {state.status === "running" ? <RunProgress progress={state.progress} mode="running" /> : null}
            {state.status === "error" && state.progress ? <RunProgress progress={state.progress} mode="error" /> : null}
            {state.status === "error" ? (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>The analysis could not be completed</AlertTitle>
                <AlertDescription className="break-words [&_p:not(:last-child)]:mb-1">
                  <p>{state.message}</p>
                  {state.requestId ? (
                    <p className="text-xs">
                      Reference <span className="font-mono select-all">{state.requestId}</span>
                    </p>
                  ) : null}
                </AlertDescription>
                <div className="col-start-2 mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={onRun} disabled={blocker !== null}>
                    <RotateCcwIcon data-icon="inline-start" />
                    Try again
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onDismiss}>
                    Dismiss
                  </Button>
                </div>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {state.status === "done" ? (
          <Alert role="status">
            <CircleCheckIcon />
            <AlertTitle>Analysis complete</AlertTitle>
            <AlertDescription>
              Finished in {formatDuration(state.finishedAt - state.startedAt)}.{" "}
              {state.runId ? (
                <>
                  Saved as run{" "}
                  <Link href={`/runs/${state.runId}`} className="font-mono text-foreground" title={state.runId}>
                    {shortRunId(state.runId)}
                  </Link>
                  .
                </>
              ) : (
                "The run could not be saved; export the JSON to keep a copy."
              )}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <CardFooter className="shrink-0 flex-col items-stretch gap-2">
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" onClick={onRun} disabled={running || blocker !== null}>
            {running ? <Spinner data-icon="inline-start" aria-hidden="true" /> : <PlayIcon data-icon="inline-start" />}
            {running ? "Analyzing…" : "Run analysis"}
          </Button>
          {running ? (
            <Button size="lg" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
        {!running && blocker ? <p className="text-center text-xs text-muted-foreground">{blocker}</p> : null}
      </CardFooter>
    </Card>
  );
}
