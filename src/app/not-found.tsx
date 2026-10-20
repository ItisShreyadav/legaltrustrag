import { ArrowLeft, FileQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center p-4 sm:p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion aria-hidden />
          </EmptyMedia>
          <p className="font-mono text-xs text-muted-foreground">404</p>
          <EmptyTitle>
            <h1 className="text-lg">Page not found</h1>
          </EmptyTitle>
          <EmptyDescription>The page you were looking for does not exist or has moved.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">
              <ArrowLeft data-icon="inline-start" aria-hidden />
              Back to dashboard
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
