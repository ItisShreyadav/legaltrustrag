import { ArrowLeftIcon, FileSearchIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Shown for unknown, malformed or other users' run ids alike, so ids cannot be probed. */
export default function RunNotFound() {
  return (
    <>
      <PageHeader title="Run not found" />
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSearchIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>There is no saved run at this address</EmptyTitle>
          <EmptyDescription>The run may have been deleted, or the link may be incomplete.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href="/runs">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              Back to runs
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </>
  );
}
