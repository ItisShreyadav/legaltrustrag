import type { TrustReport } from "@/lib/types";

interface Card {
  label: string;
  value: string;
  hint: string;
  accent?: string;
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "0%";
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
}

export function SummaryCards({ report }: { report: TrustReport }) {
  const { stats } = report;
  const cards: Card[] = [
    { label: "Clauses", value: String(report.clauseCount), hint: `across ${report.documents.length} document${report.documents.length === 1 ? "" : "s"}` },
    { label: "Candidate pairs", value: String(stats.candidatePairs), hint: "retrieved for NLI" },
    { label: "Verified", value: String(stats.verified), hint: "passed all checks", accent: "text-emerald-600 dark:text-emerald-400" },
    { label: "Unverified", value: String(stats.unverified), hint: "partially supported", accent: "text-amber-600 dark:text-amber-400" },
    { label: "Withheld", value: String(stats.withheld), hint: "failed verification", accent: "text-zinc-500 dark:text-zinc-400" },
    { label: "Abstain rate", value: formatRate(stats.abstainRate), hint: "withheld / all findings" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{card.label}</dt>
          <dd className={`mt-1 text-2xl font-semibold tabular-nums ${card.accent ?? "text-zinc-900 dark:text-zinc-100"}`}>
            {card.value}
          </dd>
          <dd className="text-xs text-zinc-500 dark:text-zinc-500">{card.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
