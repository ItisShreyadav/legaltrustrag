"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReportView } from "@/components/report/ReportView";
import { AnalyzeEmpty } from "./AnalyzeEmpty";
import { DocumentsCard } from "./DocumentsCard";
import { addFiles, parseRules, rulesProblem } from "./files";
import { RulesCard } from "./RulesCard";
import { RunCard } from "./RunCard";
import { useAnalysis } from "./use-analysis";
import { uploadLimits, useServerHealth } from "./use-server-health";

/**
 * The "New analysis" workspace: documents and rules on the left, the sticky run
 * card on the right, and the report below once a run completes.
 */
export function AnalyzeWorkspace() {
  const { state, start, cancel, dismiss } = useAnalysis();
  const health = useServerHealth();
  const [files, setFiles] = useState<File[]>([]);
  const [rules, setRules] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const resultsRef = useRef<HTMLElement>(null);

  const limits = uploadLimits(health);
  const running = state.status === "running";
  const parsedRules = useMemo(() => parseRules(rules), [rules]);
  const rulesError = rulesProblem(parsedRules);
  const apiKeyMissing = health.status === "ready" && health.hasApiKey === false;

  let blocker: string | null = null;
  if (apiKeyMissing) blocker = "Analyses are unavailable until the server has an API key.";
  else if (files.length === 0) blocker = "Add at least one document to run an analysis.";
  else if (rulesError) blocker = "Fix the compliance rules to run an analysis.";

  // Move focus (and scroll) to the report when a run finishes.
  useEffect(() => {
    if (state.status === "done") resultsRef.current?.focus();
  }, [state.status]);

  const handleAdd = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const intake = addFiles(files, incoming, limits);
      setFiles(intake.files);
      setNotices(intake.problems);
    },
    [files, limits],
  );

  const handleRemove = useCallback((index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
    setNotices([]);
  }, []);

  const handleClear = useCallback(() => {
    setFiles([]);
    setNotices([]);
  }, []);

  const handleRun = useCallback(() => {
    if (blocker !== null || running) return;
    setNotices([]);
    start(files, rules);
  }, [blocker, running, start, files, rules]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DocumentsCard
            files={files}
            notices={notices}
            limits={limits}
            disabled={running}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onClear={handleClear}
          />
          <RulesCard
            value={rules}
            ruleCount={parsedRules.length}
            error={rulesError}
            disabled={running}
            onChange={setRules}
          />
        </div>
        <RunCard
          state={state}
          health={health}
          fileCount={files.length}
          ruleCount={parsedRules.length}
          blocker={blocker}
          onRun={handleRun}
          onCancel={cancel}
          onDismiss={dismiss}
          className="lg:sticky lg:top-20 lg:max-h-[calc(100svh-6.5rem)]"
        />
      </div>

      {state.status === "done" ? (
        <section
          ref={resultsRef}
          tabIndex={-1}
          aria-label="Analysis report"
          className="min-w-0 scroll-mt-20 outline-none"
        >
          <ReportView report={state.report} docTexts={state.docTexts} runId={state.runId} />
        </section>
      ) : null}

      {state.status === "idle" ? <AnalyzeEmpty /> : null}
    </div>
  );
}
