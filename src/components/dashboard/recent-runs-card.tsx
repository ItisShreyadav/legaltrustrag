import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { documentList, formatUtc } from "@/components/runs/format";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RunSummary } from "@/lib/runs/types";

/** The newest few runs, each linking to its saved report. */
export function RecentRunsCard({ runs, total }: { runs: readonly RunSummary[]; total: number }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Recent runs</h2>
        </CardTitle>
        <CardDescription>
          {runs.length === total ? "Your saved analyses." : `The latest ${runs.length} of ${total} saved analyses.`}
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/runs">
              View all
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Documents</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead className="text-right">Findings</TableHead>
              <TableHead className="pr-4 text-right">Withheld</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="w-full max-w-0 pl-4">
                  <Link
                    href={`/runs/${run.id}`}
                    className="block truncate font-medium underline-offset-4 hover:underline"
                    title={documentList(run.documentNames)}
                  >
                    {documentList(run.documentNames)}
                  </Link>
                  <time dateTime={run.createdAt} className="font-mono text-xs text-muted-foreground sm:hidden">
                    {formatUtc(run.createdAt)}
                  </time>
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                  <time dateTime={run.createdAt}>{formatUtc(run.createdAt)}</time>
                </TableCell>
                <TableCell className="text-right tabular-nums">{run.findingCount}</TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">{run.withheldCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
