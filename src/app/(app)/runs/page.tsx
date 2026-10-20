import { FilePlus2Icon, HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { RunsTable } from "@/components/runs/runs-table";
import { RunsTableSkeleton } from "@/components/runs/runs-table-skeleton";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { countRuns, listRuns } from "@/lib/runs";

export const metadata: Metadata = { title: "Runs" };

function NoRuns() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HistoryIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No analyses yet</EmptyTitle>
        <EmptyDescription>
          Every analysis is saved here when it finishes, with its documents, so you can reopen the report and send
          findings to review.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/analyze">
            <FilePlus2Icon aria-hidden="true" data-icon="inline-start" />
            New analysis
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Validates the session and lists only the user's own runs (newest first, capped server-side). */
async function Runs() {
  const user = await requireUser("/runs");
  const runs = listRuns(user.id);
  if (runs.length === 0) return <NoRuns />;
  return <RunsTable runs={runs} total={countRuns(user.id)} />;
}

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Runs"
        description="Saved analyses with their documents. Reopen a report, send findings to review, or delete a run."
        actions={
          <Button asChild>
            <Link href="/analyze">
              <FilePlus2Icon aria-hidden="true" data-icon="inline-start" />
              New analysis
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<RunsTableSkeleton />}>
        <Runs />
      </Suspense>
    </>
  );
}
