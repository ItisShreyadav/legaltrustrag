import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import { Fragment } from "react";
import type { Quote } from "@/lib/types";
import { cn } from "@/lib/utils";
import { clauseContext, clausePath, quoteMatches } from "./context";

interface QuotePanelProps {
  quote: Quote;
  /** Short marker for this side of a finding, e.g. "A". */
  heading: string;
  docName: string;
  /** Full source text of the quote's document, when available. */
  docText?: string;
}

function clauseLabel(clauseId: string): string {
  const local = clauseId.includes(":") ? clauseId.slice(clauseId.indexOf(":") + 1) : clauseId;
  return local.replace(/^c_/, "clause ");
}

/** Mono breadcrumb: "msa.txt › Section 4 › 4.2", falling back to the clause id. */
export function QuoteRef({
  quote,
  docName,
  docText,
  className,
}: {
  quote: Quote;
  docName: string;
  docText?: string;
  className?: string;
}) {
  const path = clausePath(docText, quote);
  const parts = [docName, ...(path.length > 0 ? path : [clauseLabel(quote.clauseId)])];
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1 font-mono break-all", className)} title={quote.clauseId}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <>
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/70" />
              <span className="sr-only">, </span>
            </>
          ) : null}
          <span className={i === 0 ? "text-foreground" : undefined}>{part}</span>
        </Fragment>
      ))}
    </span>
  );
}

/** One side of a finding: the clause around the quote, with the exact quote highlighted. */
export function QuotePanel({ quote, heading, docName, docText }: QuotePanelProps) {
  const context = clauseContext(docText, quote);
  const mismatch = docText !== undefined && !quoteMatches(docText, quote);

  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted/50 p-3">
      <figcaption className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-start gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md border bg-background font-mono text-[0.6875rem] font-semibold text-foreground">
            {heading}
          </span>
          <QuoteRef quote={quote} docName={docName} docText={docText} className="pt-0.5" />
        </span>
        <span className="shrink-0 pt-0.5 font-mono tabular-nums">
          <span className="sr-only">Characters </span>
          {quote.start}&ndash;{quote.end}
        </span>
      </figcaption>
      <blockquote className="text-sm leading-relaxed break-words whitespace-pre-line">
        {context ? (
          <>
            <span className="text-muted-foreground">
              {context.truncatedStart ? "… " : null}
              {context.before}
            </span>
            <mark className="rounded-sm bg-primary/10 font-medium text-foreground underline decoration-primary/60 decoration-2 underline-offset-4 box-decoration-clone">
              {context.match}
            </mark>
            <span className="text-muted-foreground">
              {context.after}
              {context.truncatedEnd ? " …" : null}
            </span>
          </>
        ) : (
          <mark className="rounded-sm bg-primary/10 font-medium text-foreground underline decoration-primary/60 decoration-2 underline-offset-4 box-decoration-clone">
            {quote.text}
          </mark>
        )}
      </blockquote>
      {mismatch ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          The quote does not match the source text at the cited offsets.
        </p>
      ) : null}
    </figure>
  );
}
