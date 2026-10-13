/*
 * In-memory limit on failed sign-ins: 10 per email per 15 minutes (sliding
 * window). Per process only; it resets on restart and is not shared between
 * instances. A successful sign-in clears the email's history.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const MAX_TRACKED = 10_000;

const globalForLimits = globalThis as typeof globalThis & { __ltrLoginFailures?: Map<string, number[]> };
const failures = (globalForLimits.__ltrLoginFailures ??= new Map<string, number[]>());

function recent(key: string, now: number): number[] {
  const kept = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (kept.length > 0) failures.set(key, kept);
  else failures.delete(key);
  return kept;
}

/** Seconds until another attempt is allowed, or 0 if the email is not limited. */
export function loginRetryAfterSeconds(email: string, now = Date.now()): number {
  const times = recent(email, now);
  if (times.length < MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((times[times.length - MAX_FAILURES] + WINDOW_MS - now) / 1000));
}

export function recordLoginFailure(email: string, now = Date.now()): void {
  if (failures.size >= MAX_TRACKED) {
    for (const key of failures.keys()) recent(key, now);
    if (failures.size >= MAX_TRACKED) failures.delete(failures.keys().next().value as string);
  }
  failures.set(email, [...recent(email, now), now]);
}

export function clearLoginFailures(email: string): void {
  failures.delete(email);
}
