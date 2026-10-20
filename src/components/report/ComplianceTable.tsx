import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ComplianceRow, Finding } from "@/lib/types";
import { ComplianceBadge, ConfidenceText, VerificationBadge } from "./badges";
import type { DocLookup } from "./FindingCard";
import { QuoteRef } from "./QuotePanel";

function Evidence({ finding, docs, review }: { finding: Finding; docs: DocLookup; review?: (finding: Finding) => ReactNode }) {
  const { clauseA, clauseB } = finding;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <blockquote className="border-l-2 pl-3 text-sm leading-relaxed break-words whitespace-pre-line">
        &ldquo;{clauseA.text}&rdquo;
      </blockquote>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <QuoteRef quote={clauseA} docName={docs.name(clauseA.docId)} docText={docs.text(clauseA.docId)} />
        {clauseB ? (
          <>
            <span>also</span>
            <QuoteRef quote={clauseB} docName={docs.name(clauseB.docId)} docText={docs.text(clauseB.docId)} />
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge status={finding.verification.status} />
        <ConfidenceText value={finding.confidence} />
      </div>
      {finding.explanation ? <p className="text-sm leading-relaxed text-muted-foreground">{finding.explanation}</p> : null}
      {review ? <div className="pt-1">{review(finding)}</div> : null}
    </div>
  );
}

/**
 * Compliance matrix: Rule / Status / Evidence. A table from md up; below md each
 * row reflows into a stacked card (same DOM, so the review controls exist once).
 */
export function ComplianceTable({
  rows,
  docs,
  review,
}: {
  rows: ComplianceRow[];
  docs: DocLookup;
  review?: (finding: Finding) => ReactNode;
}) {
  return (
    <Table className="block md:table md:table-fixed">
      <caption className="sr-only">Compliance matrix: each rule, its status and the evidence quote</caption>
      <TableHeader className="hidden md:table-header-group">
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[32%] px-3">Rule</TableHead>
          <TableHead className="w-36 px-3">Status</TableHead>
          <TableHead className="px-3">Evidence</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="flex flex-col gap-3 md:table-row-group">
        {rows.map((row, i) => (
          <TableRow
            key={`${i}-${row.rule}`}
            className="flex flex-col gap-3 rounded-lg border-b-0 p-3 ring-1 ring-border hover:bg-transparent md:table-row md:rounded-none md:border-b md:p-0 md:ring-0"
          >
            <th scope="row" className="block text-left align-top text-sm font-medium break-words md:table-cell md:p-3">
              {row.rule}
            </th>
            <TableCell className="block p-0 align-top md:table-cell md:p-3">
              <span className="sr-only">Status: </span>
              <ComplianceBadge status={row.status} />
            </TableCell>
            <TableCell className="block p-0 align-top whitespace-normal md:table-cell md:p-3">
              {row.finding ? (
                <Evidence finding={row.finding} docs={docs} review={review} />
              ) : (
                <p className="text-sm text-muted-foreground italic">No clause in the documents addresses this rule.</p>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
