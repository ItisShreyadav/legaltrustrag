import { getSessionUser } from "@/lib/auth";
import { reviewsForRun } from "@/lib/review";
import { RunIdParam, getRun } from "@/lib/runs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET -> 200 {run: SavedRun, reviews: ReviewView[]}; 401 without a session;
 * 404 when the run does not exist or belongs to another user.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to see your runs." }, { status: 401, headers: NO_STORE });

  const param = RunIdParam.safeParse(await params);
  const run = param.success ? getRun(user.id, param.data.id) : null;
  if (!run) return Response.json({ error: "Run not found." }, { status: 404, headers: NO_STORE });

  return Response.json({ run, reviews: reviewsForRun(user.id, run.id) }, { headers: NO_STORE });
}
