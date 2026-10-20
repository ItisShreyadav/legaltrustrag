import { CheckCircle2Icon, ClipboardCheckIcon, HistoryIcon, InboxIcon, PencilLineIcon, XCircleIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { ReviewFilter } from "@/lib/review/types";

const EMPTY: Record<ReviewFilter, { icon: LucideIcon; title: string; description: string; showRuns: boolean }> = {
  queued: {
    icon: InboxIcon,
    title: "Nothing waiting for review",
    description: "Open a saved run and send any finding to review. It will wait here for a decision.",
    showRuns: true,
  },
  accepted: {
    icon: CheckCircle2Icon,
    title: "No accepted findings",
    description: "Findings a reviewer accepts are listed here.",
    showRuns: false,
  },
  rejected: {
    icon: XCircleIcon,
    title: "No rejected findings",
    description: "Findings a reviewer rejects are listed here.",
    showRuns: false,
  },
  needs_edit: {
    icon: PencilLineIcon,
    title: "Nothing marked as needing an edit",
    description: "Findings a reviewer marks as needing an edit are listed here.",
    showRuns: false,
  },
  all: {
    icon: ClipboardCheckIcon,
    title: "No findings sent to review yet",
    description: "Open a saved run and send any finding to review to start the queue.",
    showRuns: true,
  },
};

/** Empty state for one status filter of the review queue. */
export function ReviewQueueEmpty({ filter }: { filter: ReviewFilter }) {
  const { icon: Icon, title, description, showRuns } = EMPTY[filter];
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {showRuns ? (
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href="/runs">
              <HistoryIcon aria-hidden="true" data-icon="inline-start" />
              Open runs
            </Link>
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
