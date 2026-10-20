"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorStateProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/** Card shown by error boundaries: what happened, the server log reference, and a way to recover. */
export function ErrorState({ error, retry }: ErrorStateProps) {
  return (
    <Card className="w-full max-w-md" role="alert">
      <CardHeader>
        <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <TriangleAlert className="size-4" aria-hidden />
        </div>
        <CardTitle>
          <h1>Something went wrong</h1>
        </CardTitle>
        <CardDescription>
          This page could not be displayed. Try again; if the problem persists, share the reference below with
          your administrator.
        </CardDescription>
      </CardHeader>
      {error.digest ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">Reference</p>
          <p className="mt-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{error.digest}</p>
        </CardContent>
      ) : null}
      <CardFooter className="gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw data-icon="inline-start" aria-hidden />
          Try again
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">Go to dashboard</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
