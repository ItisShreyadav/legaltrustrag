import { FileSearch, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { FindingsChart, type FindingsChartRow } from "@/components/dashboard/findings-chart";
import { RecentRunsCard } from "@/components/dashboard/recent-runs-card";
import { ReviewActivityCard } from "@/components/dashboard/review-activity-card";
import { StatCards } from "@/components/dashboard/stat-cards";
import { PageHeader } from "@/components/layout/page-header";
import { documentList, formatUtc } from "@/components/runs/format";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { reviewCounts } from "@/lib/review";
import { listRuns, type RunSummary } from "@/lib/runs";

export const metadata: Metadata = { title: "Dashboard" };

const RECENT_RUNS = 5;
const CHART_RUNS = 10;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 13" from an ISO timestamp, in UTC so server and client agree. */
function shortDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[1]) - 1] ?? m[1]} ${Number(m[2])}`;
}

function chartRows(runs: readonly RunSummary[]): FindingsChartRow[] {
  return runs
    .slice(0, CHART_RUNS)
    .reverse()
    .map((run) => ({
      id: run.id,
      label: shortDate(run.createdAt),
      date: formatUtc(run.createdAt),
      documents: documentList(run.documentNames),
      findings: run.findingCount,
      withheld: run.withheldCount,
    }));
}

function NewAnalysisButton() {
  return (
    <Button asChild>
      <Link href="/analyze">
        <Plus data-icon="inline-start" aria-hidden />
        New analysis
      </Link>
    </Button>
  );
}

function NoRuns() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileSearch aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h2>No analyses yet</h2>
        </EmptyTitle>
        <EmptyDescription>
          Upload one to five contracts to find clauses that conflict and check them against your compliance rules.
          Every finished analysis is saved here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <NewAnalysisButton />
      </EmptyContent>
    </Empty>
  );
}

/** Validates the session (the proxy only checks the cookie) and reads only this user's runs and reviews. */
async function DashboardContent() {
  const user = await requireUser("/");
  const runs = listRuns(user.id);
  if (runs.length === 0) return <NoRuns />;

  const counts = reviewCounts(user.id);
  const findingCount = runs.reduce((sum, run) => sum + run.findingCount, 0);
  const withheldCount = runs.reduce((sum, run) => sum + run.withheldCount, 0);

  return (
    <div className="@container/main flex flex-col gap-4">
      <StatCards
        runCount={runs.length}
        findingCount={findingCount}
        withheldCount={withheldCount}
        queuedCount={counts.queued}
        latestRunAt={runs[0]?.createdAt ?? null}
      />
      {runs.length > 1 ? <FindingsChart rows={chartRows(runs)} /> : null}
      <div className="grid gap-4 @4xl/main:grid-cols-3">
        <div className="min-w-0 @4xl/main:col-span-2">
          <RecentRunsCard runs={runs.slice(0, RECENT_RUNS)} total={runs.length} />
        </div>
        <ReviewActivityCard counts={counts} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your contract analyses and the human review queue at a glance."
        actions={<NewAnalysisButton />}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}
