import type { Quote } from "@/lib/types";
import { clauseContext, clausePath, quoteMatches } from "./context";

interface Props {
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

/** Mono reference: "msa.txt › Section 4 › 4.2", falling back to the clause id. */
export function QuoteRef({ quote, docName, docText }: { quote: Quote; docName: string; docText?: string }) {
  const path = clausePath(docText, quote);
  const parts = [docName, ...(path.length > 0 ? path : [clauseLabel(quote.clauseId)])];
  return (
    <span className="break-words" title={quote.clauseId}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? (
            <span aria-hidden="true" className="px-[0.5ch] text-muted">
              ›
            </span>
          ) : null}
          {i > 0 ? <span className="sr-only">, </span> : null}
          <span className={i === 0 ? "text-ink" : ""}>{p}</span>
        </span>
      ))}
    </span>
  );
}

/** One side of a finding: the clause text, with the exact quote underlined in oxblood. */
export function QuotePanel({ quote, heading, docName, docText }: Props) {
  const context = clauseContext(docText, quote);
  const mismatch = docText !== undefined && !quoteMatches(docText, quote);

  return (
    <figure className="min-w-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-rule pb-1.5 font-mono text-[0.75rem] leading-5 text-muted">
        <span className="min-w-0">
          <span className="mr-[1.5ch] text-ink">{heading}</span>
          <QuoteRef quote={quote} docName={docName} docText={docText} />
        </span>
        <span className="figures shrink-0">
          <span className="sr-only">characters </span>
          {quote.start}&ndash;{quote.end}
        </span>
      </figcaption>
      <blockquote className="mt-3 max-w-[68ch] text-[1.0625rem] leading-[1.65] break-words whitespace-pre-line">
        {context ? (
          <>
            <span className="text-muted">
              {context.truncatedStart ? "… " : null}
              {context.before}
            </span>
            <mark>{context.match}</mark>
            <span className="text-muted">
              {context.after}
              {context.truncatedEnd ? " …" : null}
            </span>
          </>
        ) : (
          <mark>{quote.text}</mark>
        )}
      </blockquote>
      {mismatch ? (
        <p className="mt-2 text-sm text-accent italic">Quote does not match the source text at the cited offsets.</p>
      ) : null}
    </figure>
  );
}
