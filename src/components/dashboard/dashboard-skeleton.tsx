import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the dashboard's shape while the session and runs load. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="@container/main flex flex-col gap-4">
      <span className="sr-only">Loading dashboard…</span>
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @4xl/main:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-3">
            <CardHeader className="gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-40 max-w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 @4xl/main:grid-cols-3">
        <Skeleton className="h-80 rounded-xl @4xl/main:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
