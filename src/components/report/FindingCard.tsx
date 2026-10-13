import type { Finding } from "@/lib/types";
import { QuotePanel } from "./QuotePanel";
import { ConfidenceMeter, LabelBadge, StatusBadge } from "./ui";
import { VerificationDetails } from "./VerificationDetails";

export interface DocLookup {
  name: (docId: string) => string;
  text: (docId: string) => string | undefined;
}

export function FindingCard({ finding, index, docs }: { finding: Finding; index: number; docs: DocLookup }) {
  const titleId = `finding-${finding.id}-title`;
  return (
    <article
      aria-labelledby={titleId}
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Finding {index + 1}
          </h3>
          <LabelBadge label={finding.label} />
          <StatusBadge status={finding.verification.status} />
        </div>
        <ConfidenceMeter value={finding.confidence} />
      </header>

      <div className={`grid gap-3 ${finding.clauseB ? "md:grid-cols-2" : ""}`}>
        <QuotePanel
          heading="Clause A"
          quote={finding.clauseA}
          docName={docs.name(finding.clauseA.docId)}
          docText={docs.text(finding.clauseA.docId)}
        />
        {finding.clauseB ? (
          <QuotePanel
            heading="Clause B"
            quote={finding.clauseB}
            docName={docs.name(finding.clauseB.docId)}
            docText={docs.text(finding.clauseB.docId)}
          />
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{finding.explanation}</p>

      <div className="mt-4">
        <VerificationDetails verification={finding.verification} />
      </div>
    </article>
  );
}
