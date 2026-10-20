import { Card } from "@/components/ui/card";
import type { TrustReport } from "@/lib/types";

interface Stat {
  label: string;
  value: string;
  hint: string;
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "0%";
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Six headline figures of a report, as a grid of small stat cards. */
export function SummaryCards({ report }: { report: TrustReport }) {
  const { stats } = report;
  const items: Stat[] = [
    { label: "Clauses", value: String(report.clauseCount), hint: `Across ${plural(report.documents.length, "document", "documents")}` },
    { label: "Candidate pairs", value: String(stats.candidatePairs), hint: "Retrieved for comparison" },
    { label: "Verified", value: String(stats.verified), hint: "Passed every check" },
    { label: "Unverified", value: String(stats.unverified), hint: "Passed some checks" },
    { label: "Withheld", value: String(stats.withheld), hint: "Failed verification" },
    { label: "Abstain rate", value: formatRate(stats.abstainRate), hint: "Share of candidates withheld" },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label} size="sm" className="gap-1">
          <dt className="px-(--card-spacing) text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="px-(--card-spacing) text-2xl font-semibold tracking-tight tabular-nums">{item.value}</dd>
          <dd className="px-(--card-spacing) text-xs text-muted-foreground">{item.hint}</dd>
        </Card>
      ))}
    </dl>
  );
}
