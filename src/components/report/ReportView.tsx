"use client";

import { useMemo } from "react";
import type { Finding, TrustReport } from "@/lib/types";
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

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 mb-5 max-w-[68ch] text-[1.0625rem] leading-[1.6] text-muted">{children}</p>;
}

export function ReportView({ report, docTexts, sectionNumber = "3" }: Props) {
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
        </p>
        <button type="button" onClick={() => downloadJson(report)} className="link font-serif text-[0.9375rem] text-ink">
          Export JSON
        </button>
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
        </Lede>
        {conflicts.length > 0 ? (
          <div className="border-b border-rule">
            {conflicts.map((f, i) => (
              <FindingCard key={f.id} finding={f} index={i} docs={docs} />
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
          <ComplianceTable rows={report.compliance} docs={docs} />
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
          <WithheldList findings={report.withheld} docs={docs} />
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
