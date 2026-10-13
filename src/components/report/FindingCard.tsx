import type { Finding } from "@/lib/types";
import { QuotePanel } from "./QuotePanel";
import { Confidence, LabelText, Sep, StatusText } from "./ui";
import { VerificationDetails } from "./VerificationDetails";

export interface DocLookup {
  name: (docId: string) => string;
  text: (docId: string) => string | undefined;
}

/** One ruled entry: mono reference line, the two clauses side by side, then the reasoning. */
export function FindingCard({ finding, index, docs }: { finding: Finding; index: number; docs: DocLookup }) {
  const titleId = `finding-${finding.id}-title`;
  return (
    <article aria-labelledby={titleId} className="border-t border-rule py-7">
      <h4 id={titleId} className="font-mono text-[0.8125rem] leading-6">
        <span>Finding {String(index + 1).padStart(2, "0")}</span>
        <Sep />
        <LabelText label={finding.label} />
        <Sep />
        <span className="figures">
          <Confidence value={finding.confidence} />
        </span>
        <Sep />
        <StatusText status={finding.verification.status} />
      </h4>

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
    </article>
  );
}
