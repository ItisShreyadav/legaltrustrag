"use client";

import { useId, useState } from "react";

export const ACCEPTED_EXTENSIONS = ["pdf", "docx", "txt"] as const;
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPT_ATTR = [
  ".pdf",
  ".docx",
  ".txt",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
].join(",");

const RULES_PLACEHOLDER = [
  "The agreement must be governed by the laws of India.",
  "Liability must be capped at the total fees paid.",
  "Either party may terminate for convenience on 30 days' notice.",
].join("\n");

interface Props {
  files: File[];
  rules: string;
  notices: string[];
  busy: boolean;
  loadingSample: boolean;
  mockMode: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onRulesChange: (rules: string) => void;
  onAnalyse: () => void;
  onLoadSample: () => void;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "?" : name.slice(dot + 1).toUpperCase();
}

export function countRules(rules: string): number {
  return rules.split(/\r?\n/).filter((r) => r.trim()).length;
}

export function UploadPanel({
  files,
  rules,
  notices,
  busy,
  loadingSample,
  mockMode,
  onAddFiles,
  onRemoveFile,
  onRulesChange,
  onAnalyse,
  onLoadSample,
}: Props) {
  const inputId = useId();
  const rulesId = useId();
  const rulesHintId = useId();
  const [dragging, setDragging] = useState(false);
  const ruleCount = countRules(rules);
  const full = files.length >= MAX_FILES;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onAnalyse();
      }}
    >
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Documents</legend>
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = busy ? "none" : "copy";
          }}
          onDragLeave={(e) => {
            if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) onAddFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <input
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="peer sr-only"
            onChange={(e) => {
              onAddFiles(Array.from(e.currentTarget.files ?? []));
              e.currentTarget.value = "";
            }}
          />
          <label
            htmlFor={inputId}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${
              dragging
                ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true" className="size-8 text-zinc-400">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
              />
            </svg>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Drop files here or <span className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">browse</span>
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              PDF, DOCX or TXT &middot; up to {MAX_FILES} files, 10 MB each
            </span>
          </label>
        </div>

        {notices.length > 0 ? (
          <ul role="alert" className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {notices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}

        {files.length > 0 ? (
          <ul aria-label="Selected files" className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {files.map((file, i) => (
              <li key={`${file.name}-${file.size}-${i}`} className="flex items-center gap-3 px-3 py-2">
                <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[0.65rem] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {kindOf(file.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-200" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    doc_{i + 1} &middot; {formatBytes(file.size)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(i)}
                  aria-label={`Remove ${file.name}`}
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
                    <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {full ? <p className="text-xs text-zinc-500 dark:text-zinc-400">File limit reached ({MAX_FILES}).</p> : null}
      </fieldset>

      <fieldset disabled={busy}>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label htmlFor={rulesId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Compliance rules (one per line)
          </label>
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {ruleCount} {ruleCount === 1 ? "rule" : "rules"}
          </span>
        </div>
        <textarea
          id={rulesId}
          aria-describedby={rulesHintId}
          value={rules}
          onChange={(e) => onRulesChange(e.target.value)}
          rows={5}
          placeholder={RULES_PLACEHOLDER}
          className="block w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <p id={rulesHintId} className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          Optional. Each rule is checked as met, violated or not addressed.
        </p>
      </fieldset>

      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
        <button
          type="submit"
          disabled={busy || files.length === 0}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
            busy
              ? "cursor-wait bg-indigo-600/80 text-white"
              : "bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          }`}
        >
          {busy ? (
            <>
              <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Analysing&hellip;
            </>
          ) : (
            "Analyse"
          )}
        </button>
        <button
          type="button"
          onClick={onLoadSample}
          disabled={busy || loadingSample}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {loadingSample ? "Loading…" : "Load sample"}
        </button>
      </div>
      {mockMode ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Mock mode: Analyse plays a simulated run and shows the built-in fixture. No API call is made.
        </p>
      ) : null}
    </form>
  );
}
