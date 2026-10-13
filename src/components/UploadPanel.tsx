"use client";

import { useId, useState } from "react";
import { NumberedHeading } from "./report/ui";

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
  /** Model id reported by the server, shown beside the actions. */
  model?: string;
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
  model,
  onAddFiles,
  onRemoveFile,
  onRulesChange,
  onAnalyse,
  onLoadSample,
}: Props) {
  const inputId = useId();
  const rulesId = useId();
  const rulesHintId = useId();
  const docsHeadingId = useId();
  const rulesHeadingId = useId();
  const [dragging, setDragging] = useState(false);
  const ruleCount = countRules(rules);
  const full = files.length >= MAX_FILES;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAnalyse();
      }}
    >
      <section aria-labelledby={docsHeadingId} className="border-t border-rule pt-7 pb-10 md:pl-16">
        <NumberedHeading
          id={docsHeadingId}
          number="1."
          title="Documents"
          aside={
            <button type="button" onClick={onLoadSample} disabled={busy || loadingSample} className="link text-[0.9375rem]">
              {loadingSample ? "Loading sample…" : "Load sample"}
            </button>
          }
        />
        <fieldset disabled={busy} className="mt-5 min-w-0">
          <legend className="sr-only">Documents</legend>
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
              className={`block cursor-pointer border px-5 py-9 text-center text-[1.125rem] leading-snug peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:cursor-not-allowed peer-disabled:text-muted ${
                dragging ? "border-solid border-ink" : "border-dashed border-rule-strong hover:border-ink"
              }`}
            >
              {dragging ? (
                "Release to add these files."
              ) : (
                <>
                  Drop PDF, DOCX or TXT here, or <span className="link">choose files</span>.
                </>
              )}
            </label>
          </div>
          <p className="mt-2 font-mono text-[0.6875rem] text-muted">
            Up to {MAX_FILES} files, 10 MB each{full ? ` · limit reached` : ""}
          </p>

          {notices.length > 0 ? (
            <ul role="alert" className="mt-4 space-y-1 text-[0.9375rem] leading-[1.5] text-accent">
              {notices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}

          {files.length > 0 ? (
            <table className="mt-6 w-full border-collapse text-left">
              <caption className="sr-only">Selected files</caption>
              <thead>
                <tr className="border-b border-rule">
                  <th scope="col" className="smallcaps w-[5rem] py-1.5 pr-3 text-[0.9375rem] font-semibold text-muted">
                    Ref
                  </th>
                  <th scope="col" className="smallcaps py-1.5 pr-3 text-[0.9375rem] font-semibold text-muted">
                    Name
                  </th>
                  <th scope="col" className="smallcaps hidden w-[5rem] py-1.5 pr-3 text-[0.9375rem] font-semibold text-muted sm:table-cell">
                    Type
                  </th>
                  <th scope="col" className="smallcaps w-[6.5rem] py-1.5 pr-3 text-right text-[0.9375rem] font-semibold text-muted">
                    Size
                  </th>
                  <th scope="col" className="w-[5rem] py-1.5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, i) => (
                  <tr key={`${file.name}-${file.size}-${i}`} className="border-b border-rule align-baseline">
                    <td className="py-2.5 pr-3 font-mono text-[0.75rem] text-muted">doc_{i + 1}</td>
                    <td className="max-w-0 py-2.5 pr-3 text-[1.0625rem]">
                      <span className="block truncate" title={file.name}>
                        {file.name}
                      </span>
                    </td>
                    <td className="hidden py-2.5 pr-3 font-mono text-[0.75rem] text-muted sm:table-cell">{kindOf(file.name)}</td>
                    <td className="figures py-2.5 pr-3 text-right font-mono text-[0.75rem] whitespace-nowrap text-muted">
                      {formatBytes(file.size)}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoveFile(i)}
                        aria-label={`Remove ${file.name}`}
                        className="link text-[0.9375rem]"
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </fieldset>
      </section>

      <section aria-labelledby={rulesHeadingId} className="border-t border-rule pt-7 pb-10 md:pl-16">
        <NumberedHeading
          id={rulesHeadingId}
          number="2."
          title="Compliance rules"
          aside={
            <span className="figures font-mono text-[0.75rem] text-muted">
              {ruleCount} {ruleCount === 1 ? "rule" : "rules"}
            </span>
          }
        />
        <fieldset disabled={busy} className="mt-5 min-w-0">
          <legend className="sr-only">Compliance rules</legend>
          <label htmlFor={rulesId} className="sr-only">
            Compliance rules, one per line
          </label>
          <p id={rulesHintId} className="mb-3 max-w-[68ch] text-[1.0625rem] leading-[1.6] text-muted">
            Optional. Write one rule per line; each is marked met, violated or not addressed.
          </p>
          <textarea
            id={rulesId}
            aria-describedby={rulesHintId}
            value={rules}
            onChange={(e) => onRulesChange(e.target.value)}
            rows={5}
            placeholder={RULES_PLACEHOLDER}
            className="block w-full max-w-[68ch] resize-y rounded-none border border-rule-strong bg-transparent px-4 py-3 font-serif text-[1.0625rem] leading-[1.65] text-ink placeholder:text-muted placeholder:italic focus:border-ink disabled:text-muted"
          />
        </fieldset>
      </section>

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-t border-rule pt-7 pb-12 md:pl-16">
        <button type="submit" disabled={busy || files.length === 0} className={`btn-primary ${busy ? "cursor-wait" : ""}`}>
          {busy ? "Analysing…" : "Analyse"}
        </button>
        <p className="text-[0.9375rem] leading-[1.5] text-muted italic">
          {files.length === 0
            ? "Add at least one document to begin."
            : `${files.length} ${files.length === 1 ? "document" : "documents"}, ${ruleCount} ${ruleCount === 1 ? "rule" : "rules"}.`}
        </p>
        {model ? (
          <p className="font-mono text-[0.6875rem] text-muted md:ml-auto">
            model <span className="text-ink">{model}</span>
          </p>
        ) : null}
      </div>
    </form>
  );
}
