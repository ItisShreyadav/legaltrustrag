import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the saved-run page's shape: header, fact cards, report blocks. */
export function RunSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading run" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Card size="sm" className="col-span-2 gap-2 px-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} size="sm" className="gap-2 px-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-10" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
