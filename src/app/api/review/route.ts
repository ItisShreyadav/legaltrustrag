import { getSessionUser, parseJsonBody } from "@/lib/auth";
import { crossSiteResponse, isCrossSiteRequest } from "@/lib/http";
import { ReviewCreateInput, ReviewListQuery, listReviews, queueReview, reviewCounts } from "@/lib/review";

const NO_STORE = { "Cache-Control": "no-store" };

function unauthorized(): Response {
  return Response.json({ error: "Sign in to use the review queue." }, { status: 401, headers: NO_STORE });
}

/**
 * GET ?status=queued|accepted|rejected|needs_edit|all (default queued)
 *   -> 200 {status, counts, items: [{review, finding, run}], truncated}; 400 bad status; 401 without a session.
 * Items are the user's own reviews only, most recent human action first.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const raw = new URL(request.url).searchParams.get("status");
  const query = ReviewListQuery.safeParse({ status: raw ?? undefined });
  if (!query.success) {
    return Response.json({ error: query.error.issues[0]?.message ?? "Invalid status." }, { status: 400, headers: NO_STORE });
  }

  const { status } = query.data;
  const { items, truncated } = listReviews(user.id, status);
  return Response.json({ status, counts: reviewCounts(user.id), items, truncated }, { headers: NO_STORE });
}

/**
 * POST JSON {runId, findingId} -> 201 {review} queued for human review (200 with the
 * existing row if the finding was already sent); 400 invalid body; 401 without a
 * session; 403 cross-site; 404 when the run is not the user's or has no such finding.
 */
export async function POST(request: Request): Promise<Response> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = await parseJsonBody(request, ReviewCreateInput);
  if (!parsed.ok) return parsed.response;

  const result = queueReview(user.id, parsed.data.runId, parsed.data.findingId);
  if (!result) return Response.json({ error: "Run or finding not found." }, { status: 404, headers: NO_STORE });
  return Response.json({ review: result.review }, { status: result.created ? 201 : 200, headers: NO_STORE });
}
