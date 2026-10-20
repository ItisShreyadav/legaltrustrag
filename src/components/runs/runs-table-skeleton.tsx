import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the runs table's shape while the session and rows load. */
export function RunsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading runs" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-full sm:max-w-xs" />
        <Skeleton className="ml-auto h-7 w-20" />
      </div>
      <Card className="gap-0 py-0">
        <div className="flex h-10 items-center gap-6 border-b bg-muted/50 px-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-3 w-32" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-12 items-center gap-6 border-b px-3 last:border-b-0">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-full max-w-64" />
            <Skeleton className="ml-auto hidden h-3 w-24 sm:block" />
            <Skeleton className="size-6" />
          </div>
        ))}
      </Card>
    </div>
  );
}
