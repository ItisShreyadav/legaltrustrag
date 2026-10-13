"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ReviewView } from "@/lib/review/types";
import type { Finding, TrustReport } from "@/lib/types";
import { FindingReview } from "../review/FindingReview";
import { ReviewProvider, useReviews } from "../review/ReviewProvider";
import { shortRunId } from "../runs/format";
import { ComplianceTable } from "./ComplianceTable";
import { FindingCard, type DocLookup } from "./FindingCard";
import { SummaryCards } from "./SummaryCards";
import { NumberedHeading } from "./ui";
import { WithheldList } from "./WithheldList";

interface Props {
  report: TrustReport;
  /** Parsed document texts keyed by doc id, used to show quotes in clause context. */
  docTexts?: Record<string, string>;
  /** Section number the report sits under, e.g. "3" gives subsections 3.1, 3.2 … */
  sectionNumber?: string;
  /** Id of the saved run. Enables the human-review controls and adds the reviews to the JSON export. */
  runId?: string;
  /** The run's review rows as stored, when re-opening a saved run. */
  reviews?: ReviewView[];
}

const STATUS_RANK: Record<Finding["verification"]["status"], number> = { verified: 0, unverified: 1, withheld: 2 };

/** The report as JSON; for a saved run also its id and every human review row (with reviewer and time). */
function downloadJson(report: TrustReport, runId?: string, reviews?: readonly ReviewView[]) {
  const payload = runId
    ? { ...report, runId, reviews: [...(reviews ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }
    : report;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `legaltrustrag-report-${stamp || "export"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatGeneratedAt(iso: string): string {
  // Deterministic (no locale/timezone) so server and client render the same string.
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]} UTC` : iso;
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 mb-5 max-w-[68ch] text-[1.0625rem] leading-[1.6] text-muted">{children}</p>;
}

function ExportButton({ report, runId }: { report: TrustReport; runId?: string }) {
  const reviews = useReviews();
  return (
    <button
      type="button"
      onClick={() => downloadJson(report, runId, reviews?.reviews)}
      className="link font-serif text-[0.9375rem] text-ink"
    >
      Export JSON
    </button>
  );
}

const NO_REVIEWS: ReviewView[] = [];

export function ReportView(props: Props) {
  if (!props.runId) return <ReportBody {...props} />;
  return (
    <ReviewProvider key={props.runId} runId={props.runId} initial={props.reviews ?? NO_REVIEWS}>
      <ReportBody {...props} />
    </ReviewProvider>
  );
}

function reviewControl(finding: Finding) {
  return <FindingReview findingId={finding.id} />;
}

function ReportBody({ report, docTexts, sectionNumber = "3", runId }: Props) {
  const review = runId ? reviewControl : undefined;
  const docs = useMemo<DocLookup>(() => {
    const names = new Map(report.documents.map((d) => [d.id, d.name]));
    return {
      name: (id) => names.get(id) ?? id,
      text: (id) => docTexts?.[id],
    };
  }, [report.documents, docTexts]);

  const conflicts = useMemo(
    () =>
      report.findings
        .filter((f) => f.kind === "conflict" && f.verification.status !== "withheld")
        .sort((a, b) => STATUS_RANK[a.verification.status] - STATUS_RANK[b.verification.status] || b.confidence - a.confidence),
    [report.findings],
  );

  const n = (sub: number) => `${sectionNumber}.${sub}`;
  const count = (k: number, one: string, many: string) => (
    <span className="font-mono text-[0.75rem] text-muted">
      {k} {k === 1 ? one : many}
    </span>
  );

  return (
    <div className="space-y-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule pb-3 font-mono text-[0.75rem] leading-5 text-muted">
        <p className="min-w-0 break-words">
          <span className="text-ink">{report.documents.map((d) => d.name).join(", ")}</span>
          <span aria-hidden="true" className="px-[0.6ch]">
            ·
          </span>
          generated {formatGeneratedAt(report.generatedAt)}
          {runId ? (
            <>
              <span aria-hidden="true" className="px-[0.6ch]">
                ·
              </span>
              saved as run{" "}
              <Link href={`/runs/${runId}`} className="link text-ink" title={runId}>
                {shortRunId(runId)}
              </Link>
            </>
          ) : null}
        </p>
        <ExportButton report={report} runId={runId} />
      </div>

      <section aria-labelledby="summary-heading">
        <NumberedHeading id="summary-heading" level={3} number={n(1)} title="Summary" />
        <div className="mt-4">
          <SummaryCards report={report} />
        </div>
      </section>

      <section aria-labelledby="findings-heading">
        <NumberedHeading
          id="findings-heading"
          level={3}
          number={n(2)}
          title="Findings"
          aside={count(conflicts.length, "finding", "findings")}
        />
        <Lede>
          Clause pairs that contradict one another or carve out an exception. The underlined words are the exact quote
          the verifier checked against the source.
          {runId ? " Any finding can be sent to a human reviewer; the system never decides on its own." : null}
        </Lede>
        {conflicts.length > 0 ? (
          <div className="border-b border-rule">
            {conflicts.map((f, i) => (
              <FindingCard key={f.id} finding={f} index={i} docs={docs} footer={review?.(f)} />
            ))}
          </div>
        ) : (
          <p className="border-y border-rule py-5 text-muted italic">No conflicts survived verification.</p>
        )}
      </section>

      <section aria-labelledby="compliance-heading">
        <NumberedHeading
          id="compliance-heading"
          level={3}
          number={n(3)}
          title="Compliance matrix"
          aside={count(report.compliance.length, "rule", "rules")}
        />
        <Lede>Each rule you supplied, checked against the documents.</Lede>
        {report.compliance.length > 0 ? (
          <ComplianceTable rows={report.compliance} docs={docs} review={review} />
        ) : (
          <p className="border-y border-rule py-5 text-muted italic">No compliance rules were supplied for this run.</p>
        )}
      </section>

      <section aria-labelledby="withheld-heading">
        <NumberedHeading
          id="withheld-heading"
          level={3}
          number={n(4)}
          title="Withheld for insufficient evidence"
          aside={count(report.withheld.length, "item", "items")}
        />
        <Lede>
          Candidate findings that failed verification. The system abstains rather than report them; they are listed
          here so the abstention can be checked.
        </Lede>
        {report.withheld.length > 0 ? (
          <WithheldList findings={report.withheld} docs={docs} review={review} />
        ) : (
          <p className="border-y border-rule py-5 text-muted italic">Nothing was withheld.</p>
        )}
      </section>

      <aside aria-label="Disclaimer" className="max-w-[68ch] border-t border-rule pt-4">
        <p className="text-[0.9375rem] leading-[1.6] text-muted">
          <span className="smallcaps font-semibold text-ink">Not legal advice.</span> {report.disclaimer}
        </p>
      </aside>
    </div>
  );
}
