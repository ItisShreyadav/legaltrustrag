import { getSessionUser } from "@/lib/auth";
import { crossSiteResponse, isCrossSiteRequest } from "@/lib/http";
import { reviewsForRun } from "@/lib/review";
import { RunIdParam, deleteRun, getRun } from "@/lib/runs";

const NO_STORE = { "Cache-Control": "no-store" };

type Context = { params: Promise<{ id: string }> };

function unauthorized(): Response {
  return Response.json({ error: "Sign in to see your runs." }, { status: 401, headers: NO_STORE });
}

function notFound(): Response {
  return Response.json({ error: "Run not found." }, { status: 404, headers: NO_STORE });
}

/**
 * GET -> 200 {run: SavedRun, reviews: ReviewView[]}; 401 without a session;
 * 404 when the run does not exist or belongs to another user.
 */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const param = RunIdParam.safeParse(await params);
  const run = param.success ? getRun(user.id, param.data.id) : null;
  if (!run) return notFound();

  return Response.json({ run, reviews: reviewsForRun(user.id, run.id) }, { headers: NO_STORE });
}

/**
 * DELETE -> 204 once the run and its review rows are permanently removed;
 * 401 without a session; 403 cross-site; 404 when the run does not exist or
 * belongs to another user (a malformed id is answered the same way).
 */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const param = RunIdParam.safeParse(await params);
  if (!param.success || !deleteRun(user.id, param.data.id)) return notFound();

  return new Response(null, { status: 204, headers: NO_STORE });
}
