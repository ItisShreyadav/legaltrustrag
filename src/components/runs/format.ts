import type { RunReviewCounts } from "@/lib/runs/types";

/*
 * Display helpers for saved runs. Pure functions with no locale or timezone
 * dependence, so server and client render identical strings.
 */

/** "2026-10-13 14:02 UTC". Deterministic (no locale or timezone), so server and client render the same string. */
export function formatUtc(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]} UTC` : iso;
}

/** First block of a run's UUID, enough to tell runs apart in a reference line. */
export function shortRunId(id: string): string {
  return id.slice(0, 8);
}

/** "msa.txt, amendment.txt", or a placeholder for a run with no recorded names. */
export function documentList(names: readonly string[]): string {
  return names.length > 0 ? names.join(", ") : "Untitled run";
}

/**
 * documentList for headings: at most `max` names, then "+N more", so a run of
 * five contracts still fits a title line. "msa.pdf, sow.pdf +3 more".
 */
export function documentTitle(names: readonly string[], max = 2): string {
  if (names.length <= max) return documentList(names);
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

/** "1 rule", "3 rules". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Review rows of a run across every status. */
export function reviewTotal(counts: RunReviewCounts): number {
  return counts.queued + counts.accepted + counts.rejected + counts.needs_edit;
}
