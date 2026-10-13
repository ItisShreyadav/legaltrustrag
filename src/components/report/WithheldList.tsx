import type { Finding, Quote } from "@/lib/types";
import type { DocLookup } from "./FindingCard";
import { quoteMatches } from "./context";
import { LabelBadge } from "./ui";
import { VerificationDetails } from "./VerificationDetails";

/** Findings that failed verification. Shown for transparency, never as results. */
export function WithheldList({ findings, docs }: { findings: Finding[]; docs: DocLookup }) {
  return (
    <ul className="space-y-3">
      {findings.map((f) => {
        const failed = f.verification.checks.filter((c) => !c.passed).map((c) => c.name);
        const quotes = [f.clauseA, f.clauseB].filter((q): q is Quote => q !== undefined);
        return (
          <li
            key={f.id}
            className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <LabelBadge label={f.label} />
              {f.rule ? <span className="font-medium text-zinc-800 dark:text-zinc-200">Rule: {f.rule}</span> : null}
              {failed.length > 0 ? (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Failed: {failed.join(", ")}</span>
              ) : null}
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{f.explanation}</p>
            <ul className="mt-2 space-y-1">
              {quotes.map((q, i) => {
                const exact = quoteMatches(docs.text(q.docId), q);
                return (
                  <li key={i} className="text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{docs.name(q.docId)}:</span>{" "}
                    <q className={exact ? "" : "line-through decoration-red-400/70"}>{q.text}</q>
                    {!exact && docs.text(q.docId) !== undefined ? (
                      <span className="ml-1 text-red-600 dark:text-red-400">(not in source)</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3">
              <VerificationDetails verification={f.verification} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
