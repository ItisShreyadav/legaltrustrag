import { ClipboardCheck, EyeOff, FileWarning, History, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatUtc } from "@/components/runs/format";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  footer: ReactNode;
}

function StatCard({ label, value, icon: Icon, footer }: StatCardProps) {
  return (
    <Card className="@container/card gap-3">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[15rem]/card:text-3xl">
          {value.toLocaleString("en-US")}
        </CardTitle>
        <CardAction>
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{footer}</CardContent>
    </Card>
  );
}

export interface StatCardsProps {
  runCount: number;
  findingCount: number;
  withheldCount: number;
  queuedCount: number;
  /** ISO timestamp of the newest run. */
  latestRunAt: string | null;
}

/** The four headline numbers at the top of the dashboard. */
export function StatCards({ runCount, findingCount, withheldCount, queuedCount, latestRunAt }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @4xl/main:grid-cols-4">
      <StatCard
        label="Runs"
        value={runCount}
        icon={History}
        footer={
          latestRunAt ? (
            <>
              Last run <time dateTime={latestRunAt} className="font-mono">{formatUtc(latestRunAt)}</time>
            </>
          ) : (
            "No runs saved yet"
          )
        }
      />
      <StatCard
        label="Findings"
        value={findingCount}
        icon={FileWarning}
        footer="Conflicts and exceptions reported across all runs"
      />
      <StatCard
        label="Withheld"
        value={withheldCount}
        icon={EyeOff}
        footer="Candidates held back because they failed verification"
      />
      <StatCard
        label="Review queue"
        value={queuedCount}
        icon={ClipboardCheck}
        footer={
          <Link href="/review" className="font-medium text-foreground underline-offset-4 hover:underline">
            {queuedCount > 0 ? "Open the review queue" : "View past decisions"}
          </Link>
        }
      />
    </div>
  );
}
