import type { Quote } from "@/lib/types";
import { clauseContext, quoteMatches } from "./context";

interface Props {
  quote: Quote;
  heading: string;
  docName: string;
  /** Full source text of the quote's document, when available. */
  docText?: string;
}

function clauseLabel(clauseId: string): string {
  const local = clauseId.includes(":") ? clauseId.slice(clauseId.indexOf(":") + 1) : clauseId;
  return local.replace(/^c_/, "clause ");
}

/** One side of a finding: the clause text with the exact quote highlighted. */
export function QuotePanel({ quote, heading, docName, docText }: Props) {
  const context = clauseContext(docText, quote);
  const mismatch = docText !== undefined && !quoteMatches(docText, quote);

  return (
    <figure className="flex min-w-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950/40">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
        <span className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{heading}</span>
        <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-400" title={`${docName}, ${quote.clauseId}`}>
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{docName}</span>
          {" · "}
          {clauseLabel(quote.clauseId)}
          {" · "}
          <span className="font-mono">
            {quote.start}&ndash;{quote.end}
          </span>
        </span>
      </figcaption>
      <blockquote className="px-3 py-3 text-sm leading-relaxed break-words whitespace-pre-line text-zinc-700 dark:text-zinc-300">
        {context ? (
          <>
            {context.truncatedStart ? "…" : null}
            {context.before}
            <mark className="rounded-sm bg-amber-200/80 px-0.5 text-zinc-900 ring-1 ring-amber-400/60 dark:bg-amber-400/25 dark:text-amber-50 dark:ring-amber-300/40">
              {context.match}
            </mark>
            {context.after}
            {context.truncatedEnd ? "…" : null}
          </>
        ) : (
          <mark className="rounded-sm bg-amber-200/80 px-0.5 text-zinc-900 dark:bg-amber-400/25 dark:text-amber-50">
            {quote.text}
          </mark>
        )}
      </blockquote>
      {mismatch ? (
        <p className="border-t border-red-200 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:text-red-300">
          Quote does not match the source text at the cited offsets.
        </p>
      ) : null}
    </figure>
  );
}
