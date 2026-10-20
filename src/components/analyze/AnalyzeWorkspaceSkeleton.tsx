import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the workspace's layout while the session is checked. */
export function AnalyzeWorkspaceSkeleton() {
  return (
    <div aria-busy="true" className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <span className="sr-only">Loading</span>
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-36 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-2 h-9 w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}
