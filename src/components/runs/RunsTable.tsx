import Link from "next/link";
import type { RunReviewCounts, RunSummary } from "@/lib/runs/types";
import { documentList, formatUtc } from "./format";

const TH = "smallcaps py-2 pr-6 text-[0.9375rem] font-semibold text-muted";
const TH_NUM = `${TH} text-right`;
const TD_NUM =
  "figures inline-block pr-5 align-baseline text-[1.0625rem] leading-[1.55] md:table-cell md:py-4 md:pr-6 md:text-right";

const REVIEW_ORDER: ReadonlyArray<[keyof RunReviewCounts, string]> = [
  ["queued", "queued"],
  ["accepted", "accepted"],
  ["rejected", "rejected"],
  ["needs_edit", "needs edit"],
];

function ReviewSummary({ counts }: { counts: RunReviewCounts }) {
  const parts = REVIEW_ORDER.filter(([key]) => counts[key] > 0).map(([key, word]) => `${counts[key]} ${word}`);
  if (parts.length === 0) return <span className="text-muted italic">none</span>;
  return <span className="figures font-mono text-[0.75rem] leading-6">{parts.join(" · ")}</span>;
}

/** Hairline table of saved runs; stacks into ruled blocks below 768px. */
export function RunsTable({ runs }: { runs: RunSummary[] }) {
  return (
    <table className="block w-full border-collapse text-left md:table">
      <caption className="sr-only">Saved runs, newest first</caption>
      <thead className="hidden md:table-header-group">
        <tr className="border-b border-rule">
          <th scope="col" className={`${TH} w-[11rem]`}>
            Date
          </th>
          <th scope="col" className={TH}>
            Documents
          </th>
          <th scope="col" className={TH_NUM}>
            Rules
          </th>
          <th scope="col" className={TH_NUM}>
            Findings
          </th>
          <th scope="col" className={TH_NUM}>
            Withheld
          </th>
          <th scope="col" className={`${TH} w-[14rem] pr-0`}>
            Review
          </th>
        </tr>
      </thead>
      <tbody className="block md:table-row-group">
        {runs.map((run) => (
          <tr
            key={run.id}
            className="block border-b border-rule py-4 first:border-t md:table-row md:py-0 md:first:border-t-0"
          >
            <td className="figures block pr-6 align-baseline font-mono text-[0.75rem] leading-6 text-muted md:table-cell md:py-4">
              {formatUtc(run.createdAt)}
            </td>
            <th
              scope="row"
              className="block pt-0.5 pr-6 pb-2 align-baseline text-[1.0625rem] leading-[1.55] font-normal break-words md:table-cell md:py-4"
            >
              <Link href={`/runs/${run.id}`} className="link">
                {documentList(run.documentNames)}
              </Link>
            </th>
            <td className={TD_NUM}>
              {run.ruleCount}
              <span className="text-[0.9375rem] text-muted md:sr-only"> {run.ruleCount === 1 ? "rule" : "rules"}</span>
            </td>
            <td className={TD_NUM}>
              {run.findingCount}
              <span className="text-[0.9375rem] text-muted md:sr-only">
                {" "}
                {run.findingCount === 1 ? "finding" : "findings"}
              </span>
            </td>
            <td className={TD_NUM}>
              {run.withheldCount}
              <span className="text-[0.9375rem] text-muted md:sr-only"> withheld</span>
            </td>
            <td className="block pt-1 align-baseline text-[0.9375rem] md:table-cell md:py-4">
              <span className="smallcaps mr-[1ch] text-muted md:hidden">Review</span>
              <ReviewSummary counts={run.reviews} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
