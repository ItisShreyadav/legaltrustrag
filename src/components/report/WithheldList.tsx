import type { ReactNode } from "react";
import type { Finding, Quote } from "@/lib/types";
import type { DocLookup } from "./FindingCard";
import { quoteMatches } from "./context";
import { Confidence, Sep } from "./ui";
import { VerificationDetails } from "./VerificationDetails";

/** Plain label: a withheld candidate is not a finding, so it gets no accent. */
const LABEL_WORD: Record<Finding["label"], string> = {
  contradict: "Contradict",
  exception: "Exception",
  agree: "Agree",
  not_mentioned: "Not mentioned",
};

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * Findings that failed verification. Shown for transparency, never as results.
 * `review` renders the human-review control: a lawyer may want to check what the system declined to say.
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
    <ol className="border-t border-rule">
      {findings.map((f, n) => {
        const failed = f.verification.checks.filter((c) => !c.passed).map((c) => c.name);
        const quotes = [f.clauseA, f.clauseB].filter((q): q is Quote => q !== undefined);
        return (
          <li key={f.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)] border-b border-rule py-5">
            <span aria-hidden="true" className="font-mono text-[0.8125rem] leading-[1.7rem] text-muted">
              {n + 1}.
            </span>
            <div className="max-w-[68ch]">
              <p className="text-[1.0625rem] leading-[1.6]">
                {f.rule ? <span className="font-semibold">Rule: {f.rule} </span> : null}
                {f.explanation}
              </p>
              <p className="mt-1 text-[0.9375rem] leading-[1.55] text-muted italic">
                Withheld{failed.length > 0 ? ` after failing the ${joinWords(failed)} ${failed.length === 1 ? "check" : "checks"}` : ""}.
              </p>
              <p className="mt-2 font-mono text-[0.75rem] leading-5 text-muted">
                candidate: {LABEL_WORD[f.label]}
                <Sep />
                <span className="figures">
                  <Confidence value={f.confidence} />
                </span>
              </p>
              <ul className="mt-2 space-y-1.5">
                {quotes.map((q, i) => {
                  const text = docs.text(q.docId);
                  const exact = quoteMatches(text, q);
                  return (
                    <li key={i} className="text-[0.9375rem] leading-[1.55]">
                      <span className="font-mono text-[0.75rem] text-muted">{docs.name(q.docId)}</span>{" "}
                      <q className={exact ? "" : "line-through decoration-1"}>{q.text}</q>
                      {!exact && text !== undefined ? <span className="ml-1 italic">(not in source)</span> : null}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3">
                <VerificationDetails verification={f.verification} />
              </div>
              {review ? <div className="mt-3">{review(f)}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
