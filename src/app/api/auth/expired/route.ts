import { destroySession, getSessionUser, safeNextPath } from "@/lib/auth";

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}

/**
 * GET ?next=/path. Pages send a request here (via requireUser) when the session
 * cookie is present but no longer valid: clear it, then go to /login. A still
 * valid session is left alone, so a cross-site link cannot sign anyone out.
 */
export async function GET(request: Request): Promise<Response> {
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  if (await getSessionUser()) return seeOther(next);
  await destroySession();
  return seeOther(`/login?next=${encodeURIComponent(next)}`);
}
