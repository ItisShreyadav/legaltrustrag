import type { ComplianceRow } from "@/lib/types";
import type { DocLookup } from "./FindingCard";
import { ComplianceBadge, ConfidenceMeter, StatusBadge } from "./ui";

export function ComplianceTable({ rows, docs }: { rows: ComplianceRow[]; docs: DocLookup }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Compliance matrix: each rule, its status and the evidence quote</caption>
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
          <tr>
            <th scope="col" className="w-[32%] px-4 py-2.5 font-semibold">
              Rule
            </th>
            <th scope="col" className="w-[14%] px-4 py-2.5 font-semibold">
              Status
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Evidence
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 align-top dark:divide-zinc-800">
          {rows.map((row, i) => {
            const f = row.finding;
            return (
              <tr key={`${i}-${row.rule}`}>
                <th scope="row" className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">
                  {row.rule}
                </th>
                <td className="px-4 py-3">
                  <ComplianceBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {f ? (
                    <div className="space-y-2">
                      <blockquote className="border-l-2 border-amber-400 pl-3 leading-relaxed">
                        &ldquo;{f.clauseA.text}&rdquo;
                      </blockquote>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {docs.name(f.clauseA.docId)}
                        {f.clauseB ? ` · also ${docs.name(f.clauseB.docId)}` : ""}
                      </p>
                      {f.explanation ? <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{f.explanation}</p> : null}
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={f.verification.status} />
                        <ConfidenceMeter value={f.confidence} />
                      </div>
                    </div>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      No clause in the uploaded documents addresses this rule.
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
