import { CheckIcon, ClockIcon, PencilLineIcon, XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { formatUtc } from "@/components/runs/format";
import { Badge } from "@/components/ui/badge";
import { REVIEW_STATUS_LABEL, type ReviewStatus, type ReviewView } from "@/lib/review/types";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const STATUS_STYLE: Record<ReviewStatus, { variant: BadgeVariant; icon: typeof CheckIcon }> = {
  queued: { variant: "outline", icon: ClockIcon },
  accepted: { variant: "default", icon: CheckIcon },
  rejected: { variant: "destructive", icon: XIcon },
  needs_edit: { variant: "secondary", icon: PencilLineIcon },
};

function statusText(status: ReviewStatus): string {
  const label = REVIEW_STATUS_LABEL[status];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The human-review status of a finding as a badge. */
export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const { variant, icon: Icon } = STATUS_STYLE[status];
  return (
    <Badge variant={variant}>
      <Icon data-icon="inline-start" />
      {statusText(status)}
    </Badge>
  );
}

/**
 * Status badge, "Reviewed by Jane Doe · 2026-10-13 14:12 UTC", an optional
 * action, then the reviewer's note. Every status is a person's decision, so the
 * line always names them.
 */
export function ReviewStatusLine({ review, action }: { review: ReviewView; action?: ReactNode }) {
  const decided = review.status !== "queued";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="sr-only">Human review status:</span>
        <ReviewStatusBadge status={review.status} />
        <span className="min-w-0 break-words">
          {decided ? "Reviewed by " : "Sent to review by "}
          <span className="font-medium text-foreground">{review.userName}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only"> on </span>
          <time dateTime={review.updatedAt} className="font-mono tabular-nums">
            {formatUtc(review.updatedAt)}
          </time>
        </span>
        {action ? <span className="flex items-center">{action}</span> : null}
      </div>
      {review.note ? (
        <p className="text-sm break-words">
          <span className="text-muted-foreground">Note: </span>
          <span className="italic">{review.note}</span>
        </p>
      ) : null}
    </div>
  );
}
