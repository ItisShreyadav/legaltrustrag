import { CircleCheck, CircleX, Inbox, PencilLine, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { REVIEW_STATUSES, type ReviewCounts, type ReviewStatus } from "@/lib/review/types";

const STATUS_ROWS: Record<ReviewStatus, { title: string; description: string; icon: LucideIcon }> = {
  queued: { title: "Queued", description: "Waiting for a decision", icon: Inbox },
  accepted: { title: "Accepted", description: "Confirmed by a reviewer", icon: CircleCheck },
  rejected: { title: "Rejected", description: "Dismissed by a reviewer", icon: CircleX },
  needs_edit: { title: "Needs edit", description: "Flagged for changes", icon: PencilLine },
};

/** Findings sent to human review, counted by decision, each row opening the filtered queue. */
export function ReviewActivityCard({ counts }: { counts: ReviewCounts }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Review activity</h2>
        </CardTitle>
        <CardDescription>
          {counts.all === 0
            ? "No findings have been sent to review yet."
            : `${counts.all.toLocaleString("en-US")} ${counts.all === 1 ? "finding" : "findings"} sent to human review.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        <ul className="flex flex-col gap-0.5">
          {REVIEW_STATUSES.map((status) => {
            const { title, description, icon: Icon } = STATUS_ROWS[status];
            const count = counts[status];
            return (
              <li key={status}>
                <Item asChild size="sm">
                  <Link href={`/review?status=${status}`}>
                    <ItemMedia variant="icon" className="text-muted-foreground">
                      <Icon aria-hidden />
                    </ItemMedia>
                    <ItemContent className="gap-0">
                      <ItemTitle>{title}</ItemTitle>
                      <ItemDescription className="text-xs">{description}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Badge
                        variant={status === "queued" && count > 0 ? "default" : "secondary"}
                        className="min-w-8 tabular-nums"
                      >
                        {count.toLocaleString("en-US")}
                      </Badge>
                    </ItemActions>
                  </Link>
                </Item>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
