import { CheckIcon, ClockIcon, PencilLineIcon, XIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { REVIEW_STATUSES, REVIEW_STATUS_LABEL, type ReviewStatus } from "@/lib/review/types";
import type { RunReviewCounts } from "@/lib/runs/types";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Badge tone and icon per review status; matches ReviewStatusBadge in
 * components/review/ReviewStatusLine so a status looks the same everywhere.
 */
export const REVIEW_STATUS_BADGE: Record<ReviewStatus, { variant: BadgeVariant; icon: LucideIcon }> = {
  queued: { variant: "outline", icon: ClockIcon },
  accepted: { variant: "default", icon: CheckIcon },
  rejected: { variant: "destructive", icon: XIcon },
  needs_edit: { variant: "secondary", icon: PencilLineIcon },
};

/** One Badge per review status that has rows, e.g. "2 queued", "1 accepted"; a dash when nothing was sent to review. */
export function ReviewCountBadges({ counts, className }: { counts: RunReviewCounts; className?: string }) {
  const present = REVIEW_STATUSES.filter((status) => counts[status] > 0);
  if (present.length === 0) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        <span aria-hidden="true">&mdash;</span>
        <span className="sr-only">No reviews</span>
      </span>
    );
  }
  return (
    <ul aria-label="Reviews" className={cn("flex flex-wrap gap-1", className)}>
      {present.map((status) => {
        const { variant, icon: Icon } = REVIEW_STATUS_BADGE[status];
        return (
          <li key={status}>
            <Badge variant={variant}>
              <Icon aria-hidden="true" data-icon="inline-start" />
              <span className="tabular-nums">{counts[status]}</span> {REVIEW_STATUS_LABEL[status]}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
