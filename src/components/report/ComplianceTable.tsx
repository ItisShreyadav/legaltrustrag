import type { ComplianceRow } from "@/lib/types";
import type { DocLookup } from "./FindingCard";
import { QuoteRef } from "./QuotePanel";
import { ComplianceText, Confidence, Sep, StatusText } from "./ui";

/** Hairline table; stacks into ruled blocks below 768px. */
export function ComplianceTable({ rows, docs }: { rows: ComplianceRow[]; docs: DocLookup }) {
  return (
    <table className="block w-full border-collapse text-left md:table">
      <caption className="sr-only">Compliance matrix: each rule, its status and the evidence quote</caption>
      <thead className="hidden md:table-header-group">
        <tr className="border-b border-rule">
          <th scope="col" className="smallcaps w-[30%] py-2 pr-6 text-[0.9375rem] font-semibold text-muted">
            Rule
          </th>
          <th scope="col" className="smallcaps w-[13%] py-2 pr-6 text-[0.9375rem] font-semibold text-muted">
            Status
          </th>
          <th scope="col" className="smallcaps py-2 text-[0.9375rem] font-semibold text-muted">
            Evidence
          </th>
        </tr>
      </thead>
      <tbody className="block md:table-row-group">
        {rows.map((row, i) => {
          const f = row.finding;
          return (
            <tr key={`${i}-${row.rule}`} className="block border-b border-rule py-4 first:border-t md:table-row md:py-0 md:first:border-t-0">
              <th scope="row" className="block pr-6 align-top text-[1.0625rem] leading-[1.55] font-normal md:table-cell md:py-4">
                {row.rule}
              </th>
              <td className="block pt-1 pr-6 align-top text-[1.0625rem] leading-[1.55] md:table-cell md:py-4">
                <span className="sr-only md:hidden">Status: </span>
                <ComplianceText status={row.status} />
              </td>
              <td className="block pt-3 align-top md:table-cell md:py-4">
                {f ? (
                  <div className="max-w-[68ch]">
                    <blockquote className="text-[1.0625rem] leading-[1.6]">&ldquo;{f.clauseA.text}&rdquo;</blockquote>
                    <p className="mt-1.5 font-mono text-[0.75rem] leading-5 text-muted">
                      <QuoteRef quote={f.clauseA} docName={docs.name(f.clauseA.docId)} docText={docs.text(f.clauseA.docId)} />
                      {f.clauseB ? (
                        <>
                          <Sep />
                          also{" "}
                          <QuoteRef
                            quote={f.clauseB}
                            docName={docs.name(f.clauseB.docId)}
                            docText={docs.text(f.clauseB.docId)}
                          />
                        </>
                      ) : null}
                      <Sep />
                      <StatusText status={f.verification.status} />
                      <Sep />
                      <span className="figures">
                        <Confidence value={f.confidence} />
                      </span>
                    </p>
                    {f.explanation ? (
                      <p className="mt-2 text-[0.9375rem] leading-[1.55] text-muted">{f.explanation}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[0.9375rem] text-muted italic">No clause in the uploaded documents addresses this rule.</p>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
