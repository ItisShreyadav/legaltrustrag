import type { ReactNode } from "react";
import type { Finding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfidenceText, LabelBadge, VerificationBadge } from "./badges";
import { QuotePanel } from "./QuotePanel";
import { VerificationDetails } from "./VerificationDetails";

export interface DocLookup {
  name: (docId: string) => string;
  text: (docId: string) => string | undefined;
}

export interface FindingCardProps {
  finding: Finding;
  index: number;
  docs: DocLookup;
  /** Replaces "Finding 01" as the card's title. */
  label?: string;
  /** Prefix for element ids; must be unique on the page. */
  idPrefix?: string;
  /** Mono line above the title, e.g. the run a queued finding came from. */
  meta?: ReactNode;
  /** Shown at the bottom of the card, e.g. the human-review control. */
  footer?: ReactNode;
}

/**
 * One finding: title with its label, verification status and confidence; the
 * rule (compliance only); both clauses side by side with the exact quotes
 * highlighted; the explanation; and the verifier's checks.
 */
export function FindingCard({ finding, index, docs, label, idPrefix = "finding", meta, footer }: FindingCardProps) {
  const titleId = `${idPrefix}-${finding.id}-title`;
  const { clauseA, clauseB } = finding;

  return (
    <article
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-3 text-card-foreground sm:p-4"
    >
      {meta ? <div className="font-mono text-xs leading-5 break-words text-muted-foreground">{meta}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="mr-1 text-sm font-semibold">
          {label ?? `Finding ${String(index + 1).padStart(2, "0")}`}
        </h3>
        <LabelBadge label={finding.label} />
        <VerificationBadge status={finding.verification.status} />
        <ConfidenceText value={finding.confidence} className="sm:ml-auto" />
      </div>

      {finding.rule ? (
        <div className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Rule</span>
          <p className="text-sm break-words">{finding.rule}</p>
        </div>
      ) : null}

      <div className={cn("grid gap-3", clauseB && "md:grid-cols-2")}>
        <QuotePanel heading="A" quote={clauseA} docName={docs.name(clauseA.docId)} docText={docs.text(clauseA.docId)} />
        {clauseB ? (
          <QuotePanel heading="B" quote={clauseB} docName={docs.name(clauseB.docId)} docText={docs.text(clauseB.docId)} />
        ) : null}
      </div>

      {finding.explanation ? <p className="text-sm leading-relaxed">{finding.explanation}</p> : null}

      <VerificationDetails verification={finding.verification} />

      {footer ? <div className="border-t pt-4">{footer}</div> : null}
    </article>
  );
}
