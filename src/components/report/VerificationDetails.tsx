import type { VerificationCheck, VerificationResult } from "@/lib/types";
import { CheckIcon, CrossIcon } from "./ui";

const CHECK_ORDER: VerificationCheck["name"][] = ["relevance", "quote", "support", "conflict"];

const CHECK_INFO: Record<VerificationCheck["name"], { title: string; what: string }> = {
  relevance: { title: "Relevance gate", what: "The clauses address the same subject." },
  quote: { title: "Exact quote", what: "Quoted text equals the source at the cited offsets." },
  support: { title: "Support", what: "The quotes support the stated explanation." },
  conflict: { title: "Conflict re-check", what: "An independent pass reaches the same label." },
};

export function VerificationDetails({ verification }: { verification: VerificationResult }) {
  const byName = new Map(verification.checks.map((c) => [c.name, c]));
  const rows = CHECK_ORDER.map((name) => ({ name, check: byName.get(name) }));
  const passed = rows.filter((r) => r.check?.passed).length;

  return (
    <details className="group rounded-lg border border-zinc-200 dark:border-zinc-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm select-none hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:hover:bg-zinc-800/50 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-4 text-zinc-400 transition-transform group-open:rotate-90"
          >
            <path
              fillRule="evenodd"
              d="M7.2 4.2a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L11.5 10 7.2 5.6a1 1 0 0 1 0-1.4Z"
              clipRule="evenodd"
            />
          </svg>
          Verification
        </span>
        <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {passed}/{rows.length} checks passed
          {verification.retries > 0 ? ` · ${verification.retries} ${verification.retries === 1 ? "retry" : "retries"}` : ""}
        </span>
      </summary>
      <ul className="divide-y divide-zinc-100 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {rows.map(({ name, check }) => {
          const info = CHECK_INFO[name];
          const state = check === undefined ? "missing" : check.passed ? "pass" : "fail";
          return (
            <li key={name} className="flex gap-3 px-3 py-2 text-sm">
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                  state === "pass"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : state === "fail"
                      ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                }`}
              >
                {state === "pass" ? <CheckIcon className="size-3.5" /> : state === "fail" ? <CrossIcon className="size-3.5" /> : <span aria-hidden="true">&ndash;</span>}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-zinc-800 dark:text-zinc-200">
                  {info.title}
                  <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    {state === "pass" ? "Pass" : state === "fail" ? "Fail" : "Not run"}
                  </span>
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{check?.detail ?? info.what}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
