import { getSessionUser, parseJsonBody } from "@/lib/auth";
import { ReviewIdParam, ReviewUpdateInput, updateReview } from "@/lib/review";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * PATCH JSON {status: queued|accepted|rejected|needs_edit, note?} -> 200 {review}.
 * Records a human decision, stamped with the signed-in user and the time.
 * 400 invalid body; 401 without a session; 404 when the review is not the user's.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to use the review queue." }, { status: 401, headers: NO_STORE });

  const param = ReviewIdParam.safeParse(await params);
  if (!param.success) return Response.json({ error: "Review not found." }, { status: 404, headers: NO_STORE });

  const parsed = await parseJsonBody(request, ReviewUpdateInput);
  if (!parsed.ok) return parsed.response;

  const review = updateReview(user.id, param.data.id, parsed.data);
  if (!review) return Response.json({ error: "Review not found." }, { status: 404, headers: NO_STORE });
  return Response.json({ review }, { headers: NO_STORE });
}
