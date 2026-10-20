"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REVIEW_FILTERS, type ReviewCounts, type ReviewFilter } from "@/lib/review/types";
import { cn } from "@/lib/utils";

const TABS: ReadonlyArray<{ filter: ReviewFilter; label: string }> = [
  { filter: "queued", label: "Queued" },
  { filter: "accepted", label: "Accepted" },
  { filter: "rejected", label: "Rejected" },
  { filter: "needs_edit", label: "Needs edit" },
  { filter: "all", label: "All" },
];

function isFilter(value: string): value is ReviewFilter {
  return (REVIEW_FILTERS as readonly string[]).includes(value);
}

/** The queue URL for a filter; the default (queued) has no query string. */
export function reviewHref(filter: ReviewFilter): string {
  return filter === "queued" ? "/review" : `/review?status=${filter}`;
}

/**
 * Status filter for /review, driven by the `?status=` search param. Selecting a
 * tab navigates; the tab switches at once while the server renders the new
 * list, and the current list is dimmed until it arrives. Manual activation, so
 * arrow keys move focus without loading every list on the way.
 */
export function ReviewTabs({
  active,
  counts,
  children,
}: {
  active: ReviewFilter;
  counts: ReviewCounts;
  /** The server-rendered list for `active`. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(active);

  function select(value: string) {
    if (!isFilter(value) || value === selected) return;
    startTransition(() => {
      setSelected(value);
      router.push(reviewHref(value), { scroll: false });
    });
  }

  return (
    <Tabs value={selected} onValueChange={select} activationMode="manual" className="gap-4">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList aria-label="Review status">
          {TABS.map(({ filter, label }) => (
            <TabsTrigger key={filter} value={filter} className="px-2.5">
              {label}
              <Badge
                variant={filter === selected ? "secondary" : "outline"}
                className="h-4.5 min-w-5 px-1.5 tabular-nums"
              >
                {counts[filter]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent
        value={selected}
        aria-busy={pending}
        className={cn("flex flex-col gap-4 transition-opacity", pending && "pointer-events-none opacity-60")}
      >
        {children}
      </TabsContent>
    </Tabs>
  );
}
