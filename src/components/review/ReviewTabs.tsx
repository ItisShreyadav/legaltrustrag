import Link from "next/link";
import type { ReviewCounts, ReviewFilter } from "@/lib/review/types";

const TABS: ReadonlyArray<{ filter: ReviewFilter; label: string }> = [
  { filter: "queued", label: "Queued" },
  { filter: "accepted", label: "Accepted" },
  { filter: "rejected", label: "Rejected" },
  { filter: "needs_edit", label: "Needs edit" },
  { filter: "all", label: "All" },
];

/** Status filter for /review as plain text links, each with its count in mono. */
export function ReviewTabs({ active, counts }: { active: ReviewFilter; counts: ReviewCounts }) {
  return (
    <nav aria-label="Review status" className="border-b border-rule pb-3">
      <ul className="flex flex-wrap items-baseline gap-x-7 gap-y-2 text-[1.0625rem]">
        {TABS.map(({ filter, label }) => {
          const current = filter === active;
          return (
            <li key={filter} className="flex items-baseline">
              <Link
                href={filter === "queued" ? "/review" : `/review?status=${filter}`}
                aria-current={current ? "page" : undefined}
                className={current ? "font-semibold text-ink" : "link text-muted hover:text-ink"}
              >
                {label}
              </Link>
              <span className="figures ml-[0.75ch] font-mono text-[0.75rem] text-muted">
                <span className="sr-only">(</span>
                {counts[filter]}
                <span className="sr-only">)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
