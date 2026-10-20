import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the review queue's shape: status tabs, then finding cards. */
export function ReviewQueueSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading review queue" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-full max-w-md rounded-lg" />
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} className="gap-3 px-4">
          <Skeleton className="h-3 w-56 max-w-full" />
          <Skeleton className="h-4 w-40" />
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-4 w-3/4" />
        </Card>
      ))}
    </div>
  );
}
