import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getEnv } from "@/lib/env";
import type { SessionUser } from "@/lib/types";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./constants";
import { getDb } from "./db";

// 32 random bytes, base64url: exactly 43 characters.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

const globalForSessions = globalThis as typeof globalThis & { __ltrSessionsPrunedAt?: number };

/**
 * The cookie carries the raw token; the sessions table stores only its SHA-256,
 * so a copy of the database does not hand out live sessions.
 */
function sessionId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** `Secure` cookies in production unless LTR_COOKIE_SECURE=false (plain-HTTP deployments only). */
function secureCookies(): boolean {
  const env = getEnv();
  return env.LTR_COOKIE_SECURE ?? env.NODE_ENV === "production";
}

/** Delete expired sessions at most once an hour, piggybacking on normal traffic. */
function pruneExpiredSessions(now: Date, force = false): void {
  const last = globalForSessions.__ltrSessionsPrunedAt ?? 0;
  if (!force && now.getTime() - last < PRUNE_INTERVAL_MS) return;
  globalForSessions.__ltrSessionsPrunedAt = now.getTime();
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
}

/**
 * Starts a 30-day session for the user and sets the `ltr_session` cookie. A
 * session the browser already carried is deleted first, so signing in always
 * rotates the token. Route Handlers / Server Functions only.
 */
export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  const token = randomBytes(32).toString("base64url");
  pruneExpiredSessions(now, true);
  const previous = store.get(SESSION_COOKIE)?.value;
  if (previous && TOKEN_PATTERN.test(previous)) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId(previous));
  }
  getDb()
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sessionId(token), userId, expires.toISOString(), now.toISOString());
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires,
  });
}

/**
 * The signed-in user, or null when the cookie is missing, malformed, unknown or
 * expired. Memoised per request with React `cache`, so the layout and the page
 * share one lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  // The expiry check reads the clock. Under cacheComponents that must happen at
  // request time, not in a cookie-aware runtime prefetch.
  await connection();
  const now = new Date();
  pruneExpiredSessions(now);
  const id = sessionId(token);
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(id);
  if (!row) return null;
  if (String(row.expires_at) <= now.toISOString()) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  return { id: String(row.id), email: String(row.email), name: String(row.name) };
});

/** Ends the current session (row and cookie). Route Handlers / Server Functions only. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId(token));
  store.delete({ name: SESSION_COOKIE, path: "/" });
}

/**
 * For Server Components: the signed-in user, or a redirect to /login. A cookie
 * that is present but no longer valid is first cleared by /api/auth/expired;
 * otherwise the proxy (which only sees cookie presence) would bounce /login
 * straight back here.
 */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;
  const next = encodeURIComponent(nextPath);
  const hasCookie = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  redirect(hasCookie ? `/api/auth/expired?next=${next}` : `/login?next=${next}`);
}
