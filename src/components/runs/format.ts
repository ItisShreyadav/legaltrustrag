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
