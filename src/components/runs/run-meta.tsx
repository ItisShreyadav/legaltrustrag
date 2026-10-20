import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RunReviewCounts, SavedRun } from "@/lib/runs/types";
import { cn } from "@/lib/utils";
import { plural, reviewTotal } from "./format";
import { ReviewCountBadges } from "./review-badges";

function Stat({ label, children, detail, className }: { label: string; children: ReactNode; detail?: string; className?: string }) {
  return (
    <Card size="sm" className={cn("gap-1 px-(--card-spacing)", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{children}</dd>
      {detail ? <dd className="text-xs text-muted-foreground">{detail}</dd> : null}
    </Card>
  );
}

function joinParts(parts: Array<string | false>, empty: string): string {
  const shown = parts.filter((p): p is string => Boolean(p));
  return shown.length > 0 ? shown.join(" · ") : empty;
}

/** Key facts of a saved run above its report: documents, rules, findings, withheld, review progress. */
export function RunMeta({ run, reviews }: { run: SavedRun; reviews: RunReviewCounts }) {
  const { report } = run;
  const documents =
    report.documents.length > 0
      ? report.documents.map((d) => ({ key: d.id, name: d.name, kind: d.kind as string | undefined }))
      : run.documentNames.map((name, i) => ({ key: String(i), name, kind: undefined }));
  const verified = report.findings.filter((f) => f.verification.status === "verified").length;
  const unverified = report.findings.length - verified;
  const violated = report.compliance.filter((row) => row.status === "violated").length;
  const met = report.compliance.filter((row) => row.status === "met").length;
  const unaddressed = report.compliance.filter((row) => row.status === "not_addressed").length;

  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <Card size="sm" className="col-span-2 gap-2 px-(--card-spacing)">
        <dt className="text-sm text-muted-foreground">Documents</dt>
        <dd>
          <ul className="flex flex-col gap-1.5">
            {documents.map((doc) => (
              <li key={doc.key} className="flex min-w-0 items-center gap-2">
                <FileTextIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-medium" title={doc.name}>
                  {doc.name}
                </span>
                {doc.kind ? (
                  <Badge variant="outline" className="font-mono uppercase">
                    {doc.kind}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </dd>
      </Card>
      <Stat
        label="Rules"
        detail={
          run.ruleCount === 0
            ? "No compliance rules"
            : joinParts(
                [violated > 0 && `${violated} violated`, met > 0 && `${met} met`, unaddressed > 0 && `${unaddressed} not addressed`],
                "Checked",
              )
        }
      >
        {run.ruleCount}
      </Stat>
      <Stat
        label="Findings"
        detail={joinParts([verified > 0 && `${verified} verified`, unverified > 0 && `${unverified} unverified`], "No conflicts found")}
      >
        {report.findings.length}
      </Stat>
      <Stat label="Withheld" detail={report.withheld.length > 0 ? "Failed verification" : "None withheld"}>
        {report.withheld.length}
      </Stat>
      <Card size="sm" className="gap-2 px-(--card-spacing)">
        <dt className="text-sm text-muted-foreground">Review</dt>
        <dd>
          <ReviewCountBadges counts={reviews} />
        </dd>
        <dd className="text-xs text-muted-foreground">
          {plural(reviewTotal(reviews), "finding")} sent to review
        </dd>
      </Card>
    </dl>
  );
}
