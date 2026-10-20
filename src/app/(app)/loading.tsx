import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a dashboard page streams in: the shape of a PageHeader and a content area. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-1 flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
