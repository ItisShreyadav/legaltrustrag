import type { VerificationCheck, VerificationResult } from "@/lib/types";

const CHECK_ORDER: VerificationCheck["name"][] = ["relevance", "quote", "support", "conflict"];

const CHECK_INFO: Record<VerificationCheck["name"], { title: string; what: string }> = {
  relevance: { title: "Relevance gate", what: "The clauses address the same subject." },
  quote: { title: "Exact quote", what: "Quoted text equals the source at the cited offsets." },
  support: { title: "Support", what: "The quotes support the stated explanation." },
  conflict: { title: "Conflict re-check", what: "An independent pass reaches the same label." },
};

type CheckState = "pass" | "fail" | "missing";

const GLYPH: Record<CheckState, string> = { pass: "✓", fail: "✗", missing: "–" };
const SPOKEN: Record<CheckState, string> = { pass: "passed", fail: "failed", missing: "not run" };
const WORD: Record<CheckState, string> = { pass: "pass", fail: "fail", missing: "not run" };

/** Compact mono line of check results that expands to the verifier's notes. */
export function VerificationDetails({ verification }: { verification: VerificationResult }) {
  const byName = new Map(verification.checks.map((c) => [c.name, c]));
  const rows = CHECK_ORDER.map((name) => {
    const check = byName.get(name);
    const state: CheckState = check === undefined ? "missing" : check.passed ? "pass" : "fail";
    return { name, check, state };
  });

  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none flex-wrap items-baseline gap-x-[2ch] gap-y-1 font-mono text-[0.75rem] leading-6 text-muted select-none hover:text-ink">
        <span className="sr-only">Verification checks: </span>
        {rows.map(({ name, state }) => (
          <span key={name} className={state === "fail" ? "font-bold text-ink" : undefined}>
            {name}
            <span aria-hidden="true" className="ml-[1ch]">
              {GLYPH[state]}
            </span>
            <span className="sr-only"> {SPOKEN[state]},</span>
          </span>
        ))}
        {verification.retries > 0 ? (
          <span>
            {verification.retries} {verification.retries === 1 ? "retry" : "retries"}
          </span>
        ) : null}
        <span aria-hidden="true" className="text-ink">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">×</span>
        </span>
      </summary>
      <dl className="mt-2 max-w-[68ch] border-t border-rule">
        {rows.map(({ name, check, state }) => {
          const info = CHECK_INFO[name];
          return (
            <div
              key={name}
              className="grid grid-cols-[11ch_7ch] gap-x-3 border-b border-rule py-2 md:grid-cols-[11ch_7ch_minmax(0,1fr)]"
            >
              <dt className="font-mono text-[0.75rem] leading-6">{name}</dt>
              <dd className={`font-mono text-[0.75rem] leading-6 ${state === "fail" ? "font-bold" : "text-muted"}`}>
                {WORD[state]}
              </dd>
              <dd className="col-span-2 text-[0.9375rem] leading-[1.55] md:col-span-1">
                <span className="italic">{info.title}.</span> {check?.detail ?? info.what}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
