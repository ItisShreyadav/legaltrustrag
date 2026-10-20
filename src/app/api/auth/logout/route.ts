import { destroySession } from "@/lib/auth";
import { crossSiteResponse, isCrossSiteRequest, jsonNoStore } from "@/lib/http";

/**
 * POST -> 200 {ok: true}; deletes the session row and clears the cookie. Safe to
 * call when signed out or with a stale cookie. 403 for cross-site requests.
 */
export async function POST(request: Request): Promise<Response> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  await destroySession();
  return jsonNoStore({ ok: true });
}
