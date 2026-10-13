import Link from "next/link";
import type { ReviewItem } from "@/lib/review/types";
import type { SavedRun } from "@/lib/runs/types";
import { FindingCard, type DocLookup } from "../report/FindingCard";
import { Sep } from "../report/ui";
import { documentList, formatUtc } from "../runs/format";
import { ReviewDecision } from "./ReviewDecision";

/** Server-side lookup over a saved run, so quotes render in context without shipping document texts. */
export function runDocLookup(run: SavedRun | undefined): DocLookup {
  const names = new Map((run?.report.documents ?? []).map((d) => [d.id, d.name]));
  return {
    name: (id) => names.get(id) ?? id,
    text: (id) => run?.docTexts[id],
  };
}

/** One queue entry: the finding exactly as the report shows it, its run, and the human decision. */
export function ReviewEntry({ item, docs }: { item: ReviewItem; docs: DocLookup }) {
  const { review, finding, run } = item;
  return (
    <li id={`review-${review.id}`} className="scroll-mt-6">
      <FindingCard
        finding={finding}
        index={0}
        docs={docs}
        label={finding.kind === "compliance" ? "Compliance" : "Conflict"}
        idPrefix={`review-${review.id}`}
        meta={
          <>
            <Link href={`/runs/${run.id}`} className="link text-ink">
              {documentList(run.documentNames)}
            </Link>
            <Sep />
            run of <span className="figures">{formatUtc(run.createdAt)}</span>
          </>
        }
        footer={<ReviewDecision review={review} />}
      />
    </li>
  );
}
