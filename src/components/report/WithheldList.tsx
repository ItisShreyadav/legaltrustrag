import { EyeOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Finding, Quote } from "@/lib/types";
import { ConfidenceText, LabelBadge } from "./badges";
import { quoteMatches } from "./context";
import type { DocLookup } from "./FindingCard";
import { VerificationDetails } from "./VerificationDetails";

/**
 * Candidate findings that failed verification. Shown for transparency, never as
 * results. `review` renders the human-review control: a reviewer may want to
 * check what the system declined to report.
 */
export function WithheldList({
  findings,
  docs,
  review,
}: {
  findings: Finding[];
  docs: DocLookup;
  review?: (finding: Finding) => ReactNode;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {findings.map((f, n) => {
        const failed = f.verification.checks.filter((c) => !c.passed).map((c) => c.name);
        const quotes = [f.clauseA, f.clauseB].filter((q): q is Quote => q !== undefined);
        const titleId = `withheld-${f.id}-title`;
        return (
          <li key={f.id}>
            <article
              aria-labelledby={titleId}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-dashed bg-muted/40 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={titleId} className="mr-1 text-sm font-semibold text-muted-foreground">
                  Candidate {String(n + 1).padStart(2, "0")}
                </h3>
                <LabelBadge label={f.label} muted />
                <ConfidenceText value={f.confidence} className="sm:ml-auto" />
              </div>

              <p className="text-sm leading-relaxed">
                {f.rule ? <span className="font-medium">Rule: {f.rule} </span> : null}
                {f.explanation}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <EyeOffIcon className="size-3.5" />
                {failed.length > 0 ? (
                  <>
                    <span>Withheld after failing</span>
                    {failed.map((name) => (
                      <Badge key={name} variant="destructive" className="font-mono">
                        {name}
                      </Badge>
                    ))}
                  </>
                ) : (
                  <span>Withheld: the checks did not pass.</span>
                )}
              </div>

              {quotes.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {quotes.map((q, i) => {
                    const text = docs.text(q.docId);
                    const exact = quoteMatches(text, q);
                    return (
                      <li key={i} className="flex flex-col gap-1 rounded-lg bg-background/60 px-3 py-2 text-sm">
                        <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                          {docs.name(q.docId)}
                          {!exact && text !== undefined ? (
                            <Badge variant="outline" className="font-sans text-destructive">
                              Not in source
                            </Badge>
                          ) : null}
                        </span>
                        <q className={exact ? "break-words" : "break-words text-muted-foreground line-through"}>{q.text}</q>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              <VerificationDetails verification={f.verification} />

              {review ? <div className="border-t pt-3">{review(f)}</div> : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
