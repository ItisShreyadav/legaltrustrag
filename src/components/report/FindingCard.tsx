import type { ReactNode } from "react";
import type { Finding } from "@/lib/types";
import { QuotePanel } from "./QuotePanel";
import { Confidence, LabelText, Sep, StatusText } from "./ui";
import { VerificationDetails } from "./VerificationDetails";

export interface DocLookup {
  name: (docId: string) => string;
  text: (docId: string) => string | undefined;
}

interface Props {
  finding: Finding;
  index: number;
  docs: DocLookup;
  /** Replaces "Finding 01" at the start of the reference line. */
  label?: string;
  /** Prefix for element ids; must be unique on the page. */
  idPrefix?: string;
  /** Mono line above the reference line, e.g. the run a queued finding came from. */
  meta?: ReactNode;
  /** Shown under the verification line, e.g. the human-review control. */
  footer?: ReactNode;
}

/** One ruled entry: mono reference line, the two clauses side by side, then the reasoning. */
export function FindingCard({ finding, index, docs, label, idPrefix = "finding", meta, footer }: Props) {
  const titleId = `${idPrefix}-${finding.id}-title`;
  return (
    <article aria-labelledby={titleId} className="border-t border-rule py-7">
      {meta ? <p className="mb-1 font-mono text-[0.75rem] leading-5 break-words text-muted">{meta}</p> : null}
      <h4 id={titleId} className="font-mono text-[0.8125rem] leading-6">
        <span>{label ?? `Finding ${String(index + 1).padStart(2, "0")}`}</span>
        <Sep />
        <LabelText label={finding.label} />
        <Sep />
        <span className="figures">
          <Confidence value={finding.confidence} />
        </span>
        <Sep />
        <StatusText status={finding.verification.status} />
      </h4>

      {finding.rule ? (
        <p className="mt-3 max-w-[68ch] text-[1.0625rem] leading-[1.6]">
          <span className="smallcaps font-semibold">Rule.</span> {finding.rule}
        </p>
      ) : null}

      <div className={`mt-4 grid gap-x-10 gap-y-6 ${finding.clauseB ? "md:grid-cols-2" : ""}`}>
        <QuotePanel
          heading="A"
          quote={finding.clauseA}
          docName={docs.name(finding.clauseA.docId)}
          docText={docs.text(finding.clauseA.docId)}
        />
        {finding.clauseB ? (
          <QuotePanel
            heading="B"
            quote={finding.clauseB}
            docName={docs.name(finding.clauseB.docId)}
            docText={docs.text(finding.clauseB.docId)}
          />
        ) : null}
      </div>

      <p className="mt-5 max-w-[68ch] pl-6 text-[1.0625rem] leading-[1.65] md:pl-10">{finding.explanation}</p>

      <div className="mt-4 pl-6 md:pl-10">
        <VerificationDetails verification={finding.verification} />
      </div>

      {footer ? <div className="mt-4 pl-6 md:pl-10">{footer}</div> : null}
    </article>
  );
}
