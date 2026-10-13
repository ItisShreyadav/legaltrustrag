/*
 * Client- and proxy-safe auth constants and helpers: no Node or database imports,
 * so src/proxy.ts and client components can import this file directly
 * (src/lib/auth/index.ts pulls in node:sqlite).
 */

export const SESSION_COOKIE = "ltr_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A same-origin path to return to after signing in. Anything else (absolute or
 * protocol-relative URLs, backslash tricks, control characters) falls back to "/",
 * so `?next=` cannot be used as an open redirect.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return /[\u0000-\u001f\u007f\\]/.test(raw) ? "/" : raw;
}
