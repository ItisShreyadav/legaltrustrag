import Link from "next/link";
import type { ReviewItem } from "@/lib/review/types";
import type { SavedRun } from "@/lib/runs/types";
import { FindingCard, type DocLookup } from "../report/FindingCard";
import { documentTitle, formatUtc } from "../runs/format";
import { ReviewDecision } from "./ReviewDecision";

/** Server-side lookup over a saved run, so quotes render in context without shipping document texts. */
export function runDocLookup(run: SavedRun | undefined): DocLookup {
  const names = new Map((run?.report.documents ?? []).map((d) => [d.id, d.name]));
  return {
    name: (id) => names.get(id) ?? id,
    text: (id) => run?.docTexts[id],
  };
}

/**
 * One queue entry, rendered on the server: the finding exactly as the report
 * shows it, the run it came from, and the human decision (the only client part).
 */
export function ReviewEntry({ item, docs }: { item: ReviewItem; docs: DocLookup }) {
  const { review, finding, run } = item;
  return (
    <li id={`review-${review.id}`} className="scroll-mt-20">
      <FindingCard
        finding={finding}
        index={0}
        docs={docs}
        label={finding.kind === "compliance" ? "Compliance" : "Conflict"}
        idPrefix={`review-${review.id}`}
        meta={
          <>
            <Link
              href={`/runs/${run.id}`}
              title={run.documentNames.join(", ")}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {documentTitle(run.documentNames)}
            </Link>
            <span aria-hidden="true"> &middot; </span>
            <span className="sr-only">, </span>
            run of{" "}
            <time dateTime={run.createdAt} className="font-mono">
              {formatUtc(run.createdAt)}
            </time>
          </>
        }
        footer={<ReviewDecision review={review} />}
      />
    </li>
  );
}
