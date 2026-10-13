"use client";

import { useMemo } from "react";
import type { Finding, TrustReport } from "@/lib/types";
import { ComplianceTable } from "./ComplianceTable";
import { FindingCard, type DocLookup } from "./FindingCard";
import { SummaryCards } from "./SummaryCards";
import { SectionHeading } from "./ui";
import { WithheldList } from "./WithheldList";

interface Props {
  report: TrustReport;
  /** Parsed document texts keyed by doc id, used to show quotes in clause context. */
  docTexts?: Record<string, string>;
}

const STATUS_RANK: Record<Finding["verification"]["status"], number> = { verified: 0, unverified: 1, withheld: 2 };

function downloadJson(report: TrustReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
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

export function ReportView({ report, docTexts }: Props) {
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Trust report</h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {report.documents.map((d) => d.name).join(", ")} &middot; generated {formatGeneratedAt(report.generatedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadJson(report)}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.6L6.3 8.4a.75.75 0 1 0-1.1 1.03l4.25 4.5a.75.75 0 0 0 1.1 0l4.25-4.5a.75.75 0 1 0-1.1-1.03l-2.95 3.1V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Export JSON
        </button>
      </div>

      <section aria-label="Summary">
        <SummaryCards report={report} />
      </section>

      <section aria-labelledby="findings-heading">
        <SectionHeading
          id="findings-heading"
          title="Findings"
          count={conflicts.length}
          description="Clause pairs that contradict each other or carve out an exception. Highlighted text is the exact quote the verifier checked."
        />
        {conflicts.length > 0 ? (
          <div className="space-y-4">
            {conflicts.map((f, i) => (
              <FindingCard key={f.id} finding={f} index={i} docs={docs} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No conflicts survived verification.
          </p>
        )}
      </section>

      <section aria-labelledby="compliance-heading">
        <SectionHeading
          id="compliance-heading"
          title="Compliance matrix"
          count={report.compliance.length}
          description="Each rule you supplied, checked against the documents."
        />
        {report.compliance.length > 0 ? (
          <ComplianceTable rows={report.compliance} docs={docs} />
        ) : (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No compliance rules were supplied for this run.
          </p>
        )}
      </section>

      <section aria-labelledby="withheld-heading">
        <SectionHeading
          id="withheld-heading"
          title="Withheld / insufficient evidence"
          count={report.withheld.length}
          description="Candidate findings that failed verification. The system abstains rather than report them as results."
        />
        {report.withheld.length > 0 ? (
          <WithheldList findings={report.withheld} docs={docs} />
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing was withheld.</p>
        )}
      </section>

      <aside
        aria-label="Disclaimer"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      >
        <p className="font-semibold">Not legal advice</p>
        <p className="mt-1 leading-relaxed">{report.disclaimer}</p>
      </aside>
    </div>
  );
}
