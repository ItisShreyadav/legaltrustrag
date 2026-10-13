import type { TrustReport } from "@/lib/types";

interface Stat {
  label: string;
  value: string;
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "0%";
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/** One ruled row of figures: serif numerals above small-caps labels, hairlines between. */
export function SummaryCards({ report }: { report: TrustReport }) {
  const { stats } = report;
  const docCount = report.documents.length;
  const items: Stat[] = [
    { label: "Clauses", value: String(report.clauseCount) },
    { label: "Candidate pairs", value: String(stats.candidatePairs) },
    { label: "Verified", value: String(stats.verified) },
    { label: "Unverified", value: String(stats.unverified) },
    { label: "Withheld", value: String(stats.withheld) },
    { label: "Abstain rate", value: formatRate(stats.abstainRate) },
  ];
  return (
    <div>
      <dl className="grid grid-cols-3 border-y border-rule md:grid-cols-6">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-col-reverse justify-end border-l border-rule px-3 py-4 md:px-4 [&:nth-child(3n+1)]:border-l-0 [&:nth-child(3n+1)]:pl-0 [&:nth-child(n+4)]:border-t md:[&:nth-child(4)]:border-l md:[&:nth-child(4)]:pl-4 md:[&:nth-child(n+4)]:border-t-0"
          >
            <dt className="smallcaps mt-1 text-[0.9375rem] leading-tight text-muted">{item.label}</dt>
            <dd className="figures text-[2.25rem] leading-none font-normal sm:text-[2.625rem]">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 max-w-[68ch] text-[0.9375rem] leading-[1.55] text-muted italic">
        Clauses counted across {docCount} {docCount === 1 ? "document" : "documents"}. Candidate pairs were retrieved for
        comparison; verified findings passed every check, unverified ones passed some. The abstain rate is the share of
        candidate findings withheld.
      </p>
    </div>
  );
}
