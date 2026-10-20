/*
 * Small request/response helpers shared by the Route Handlers.
 */

/** Response headers that keep a reply out of every cache (auth, health, errors). */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Response.json with `Cache-Control: no-store` merged into the headers. */
export function jsonNoStore(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

/** A fresh opaque id for correlating a response, its log lines and a user's report. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * True for a browser request sent from another site (Fetch Metadata). Requests
 * without the header (curl, older browsers) pass; SameSite=Lax cookies and the
 * JSON content type on the auth routes still apply to them. Use on every
 * state-changing route as defence in depth against CSRF.
 */
export function isCrossSiteRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site === "cross-site" || site === "same-site";
}

export function crossSiteResponse(): Response {
  return jsonNoStore({ error: "Cross-site requests are not allowed." }, { status: 403 });
}

const IP_PATTERN = /^[0-9a-f.:]{2,45}$/i;

/**
 * The client IP from X-Forwarded-For, or null when it cannot be trusted.
 *
 * `trustedHops` is LTR_TRUST_PROXY: the number of reverse proxies in front of
 * the app that append to X-Forwarded-For. With 0 the header is ignored, because
 * a client can send any value and Next.js keeps it. With N, the Nth entry from
 * the right is the address the outermost trusted proxy saw.
 */
export function clientIp(request: Request, trustedHops: number): string | null {
  if (trustedHops <= 0) return null;
  const header = request.headers.get("x-forwarded-for");
  if (!header) return null;
  const hops = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = hops[hops.length - trustedHops] ?? hops[0];
  if (!candidate) return null;
  const ip = candidate.replace(/^::ffff:/i, "");
  return IP_PATTERN.test(ip) ? ip.toLowerCase() : null;
}
