"use client";

import { DownloadIcon, FileTextIcon, InfoIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { FindingReview } from "@/components/review/FindingReview";
import { ReviewProvider, useReviews } from "@/components/review/ReviewProvider";
import { formatUtc, shortRunId } from "@/components/runs/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReviewView } from "@/lib/review/types";
import type { Finding, TrustReport } from "@/lib/types";
import { ComplianceTable } from "./ComplianceTable";
import { downloadReportJson } from "./export";
import { FindingCard, type DocLookup } from "./FindingCard";
import { SummaryCards } from "./SummaryCards";
import { WithheldList } from "./WithheldList";

export interface ReportViewProps {
  report: TrustReport;
  /** Parsed document texts keyed by doc id, used to show quotes in clause context. */
  docTexts?: Record<string, string>;
  /** Id of the saved run. Enables the human-review controls and adds the reviews to the JSON export. */
  runId?: string;
  /** The run's review rows as stored, when re-opening a saved run. */
  reviews?: ReviewView[];
}

const STATUS_RANK: Record<Finding["verification"]["status"], number> = { verified: 0, unverified: 1, withheld: 2 };

const NO_REVIEWS: ReviewView[] = [];

function reviewControl(finding: Finding) {
  return <FindingReview findingId={finding.id} />;
}

function ExportButton({ report, runId }: { report: TrustReport; runId?: string }) {
  const reviews = useReviews();
  return (
    <Button variant="outline" size="sm" onClick={() => downloadReportJson(report, runId, reviews?.reviews)}>
      <DownloadIcon data-icon="inline-start" />
      Export JSON
    </Button>
  );
}

function TabCount({ value }: { value: number }) {
  return (
    <Badge variant="secondary" className="h-4 min-w-4 px-1 tabular-nums">
      {value}
    </Badge>
  );
}

function SectionCard({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function NothingHere({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Empty className="border py-10">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * A TrustReport: header (documents, time, saved run, export), summary figures,
 * then tabs for findings, the compliance matrix and withheld candidates. With a
 * `runId`, every entry carries the human-review control.
 */
export function ReportView(props: ReportViewProps) {
  if (!props.runId) return <ReportBody {...props} />;
  return (
    <ReviewProvider key={props.runId} runId={props.runId} initial={props.reviews ?? NO_REVIEWS}>
      <ReportBody {...props} />
    </ReviewProvider>
  );
}

function ReportBody({ report, docTexts, runId }: ReportViewProps) {
  const review = runId ? reviewControl : undefined;
  const docs = useMemo<DocLookup>(() => {
    const names = new Map(report.documents.map((d) => [d.id, d.name]));
    return {
      name: (id) => names.get(id) ?? id,
      text: (id) => docTexts?.[id],
    };
  }, [report.documents, docTexts]);

  const conflicts = useMemo(
    () =>
      report.findings
        .filter((f) => f.kind === "conflict" && f.verification.status !== "withheld")
        .sort((a, b) => STATUS_RANK[a.verification.status] - STATUS_RANK[b.verification.status] || b.confidence - a.confidence),
    [report.findings],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <ul aria-label="Documents" className="flex flex-wrap gap-1.5">
            {report.documents.map((d) => (
              <li key={d.id} className="max-w-full">
                <Badge variant="outline" className="h-6 max-w-full gap-1.5 px-2.5" title={d.name}>
                  <FileTextIcon data-icon="inline-start" className="text-muted-foreground" />
                  <span className="min-w-0 truncate">{d.name}</span>
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Generated{" "}
            <time dateTime={report.generatedAt} className="font-mono tabular-nums">
              {formatUtc(report.generatedAt)}
            </time>
            {runId ? (
              <>
                <span aria-hidden="true"> · </span>
                Saved as run{" "}
                <Link
                  href={`/runs/${runId}`}
                  title={runId}
                  className="font-mono text-foreground underline-offset-4 hover:underline"
                >
                  {shortRunId(runId)}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <ExportButton report={report} runId={runId} />
      </div>

      <SummaryCards report={report} />

      <Tabs defaultValue="findings" className="gap-4">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="findings" className="sm:px-3">
            Findings <TabCount value={conflicts.length} />
          </TabsTrigger>
          <TabsTrigger value="compliance" className="sm:px-3">
            Compliance <TabCount value={report.compliance.length} />
          </TabsTrigger>
          <TabsTrigger value="withheld" className="sm:px-3">
            Withheld <TabCount value={report.withheld.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="findings">
          <SectionCard
            title="Findings"
            description={
              <>
                Clause pairs that contradict one another or carve out an exception. Highlighted text is the exact quote the
                verifier matched against the source.
                {runId ? " Send any finding to review to record a human decision." : null}
              </>
            }
          >
            {conflicts.length > 0 ? (
              <ol className="flex flex-col gap-4">
                {conflicts.map((f, i) => (
                  <li key={f.id}>
                    <FindingCard finding={f} index={i} docs={docs} footer={review?.(f)} />
                  </li>
                ))}
              </ol>
            ) : (
              <NothingHere title="No conflicts found">No clause pair produced a finding that survived verification.</NothingHere>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="compliance">
          <SectionCard title="Compliance" description="Each rule supplied for this run, checked against the documents.">
            {report.compliance.length > 0 ? (
              <ComplianceTable rows={report.compliance} docs={docs} review={review} />
            ) : (
              <NothingHere title="No rules checked">No compliance rules were supplied for this run.</NothingHere>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="withheld">
          <SectionCard
            title="Withheld"
            description="Candidate findings that failed verification. The system abstains rather than report them; they are listed so the abstention can be checked."
          >
            {report.withheld.length > 0 ? (
              <WithheldList findings={report.withheld} docs={docs} review={review} />
            ) : (
              <NothingHere title="Nothing withheld">No candidate finding failed verification.</NothingHere>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {report.disclaimer ? (
        <Alert role="note">
          <InfoIcon />
          <AlertTitle>Not legal advice</AlertTitle>
          <AlertDescription>{report.disclaimer}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
