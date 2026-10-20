import { getSessionUser } from "@/lib/auth";
import { countRuns, listRuns } from "@/lib/runs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET -> 200 {runs: RunSummary[], total: number}: the signed-in user's most
 * recent saved analyses (newest first, at most MAX_LISTED_RUNS) and how many
 * they have in all; 401 without a session.
 */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to see your runs." }, { status: 401, headers: NO_STORE });
  return Response.json({ runs: listRuns(user.id), total: countRuns(user.id) }, { headers: NO_STORE });
}
