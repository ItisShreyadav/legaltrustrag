/*
 * In-memory sliding-window rate limiter, keyed by any string (email, user id,
 * client IP). State lives on globalThis so dev-mode module reloads keep it.
 *
 * Per process only: it resets on restart and is not shared between instances,
 * so a horizontally scaled deployment needs a shared store instead (see the
 * README, "Scaling").
 */

export interface RateLimitResult {
  /** True when another event is allowed now. */
  allowed: boolean;
  /** Seconds until the next event is allowed (0 when allowed). */
  retryAfterSeconds: number;
  /** Events left in the current window after this check. */
  remaining: number;
}

export interface RateLimiterOptions {
  /** Unique name; limiters with the same name share state. */
  name: string;
  windowMs: number;
  /** Keys tracked at most; the oldest is evicted beyond this (default 10 000). */
  maxKeys?: number;
}

const MAX_EVENTS_PER_KEY = 1000;

type Store = Map<string, number[]>;
const globalForLimits = globalThis as typeof globalThis & { __ltrRateLimits?: Map<string, Store> };
const stores = (globalForLimits.__ltrRateLimits ??= new Map<string, Store>());

export class RateLimiter {
  private readonly store: Store;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys ?? 10_000;
    let store = stores.get(options.name);
    if (!store) {
      store = new Map();
      stores.set(options.name, store);
    }
    this.store = store;
  }

  private recent(key: string, now: number): number[] {
    const kept = (this.store.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (kept.length > 0) this.store.set(key, kept);
    else this.store.delete(key);
    return kept;
  }

  /** Whether `key` may have another event under `limit` per window. Does not record anything. limit <= 0 = unlimited. */
  check(key: string, limit: number, now = Date.now()): RateLimitResult {
    if (limit <= 0) return { allowed: true, retryAfterSeconds: 0, remaining: Number.POSITIVE_INFINITY };
    const times = this.recent(key, now);
    if (times.length < limit) return { allowed: true, retryAfterSeconds: 0, remaining: limit - times.length };
    const oldestCounted = times[times.length - limit];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldestCounted + this.windowMs - now) / 1000)),
      remaining: 0,
    };
  }

  /** Records one event for `key`. */
  record(key: string, now = Date.now()): void {
    if (!this.store.has(key) && this.store.size >= this.maxKeys) {
      for (const k of [...this.store.keys()]) this.recent(k, now);
      if (this.store.size >= this.maxKeys) {
        const oldest = this.store.keys().next().value;
        if (oldest !== undefined) this.store.delete(oldest);
      }
    }
    const times = this.recent(key, now);
    times.push(now);
    this.store.set(key, times.length > MAX_EVENTS_PER_KEY ? times.slice(-MAX_EVENTS_PER_KEY) : times);
  }

  /** check() and, when allowed, record() in one synchronous step. */
  consume(key: string, limit: number, now = Date.now()): RateLimitResult {
    const result = this.check(key, limit, now);
    if (result.allowed && limit > 0) {
      this.record(key, now);
      return { ...result, remaining: result.remaining - 1 };
    }
    return result;
  }

  reset(key: string): void {
    this.store.delete(key);
  }
}

/** "3 minutes", "1 hour": a human wait time for 429 messages. */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return seconds <= 1 ? "a moment" : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}
