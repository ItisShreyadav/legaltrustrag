import { getSessionUser } from "@/lib/auth";
import { listRuns } from "@/lib/runs";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET -> 200 {runs: RunSummary[]}, the signed-in user's saved analyses, newest first; 401 without a session. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to see your runs." }, { status: 401, headers: NO_STORE });
  return Response.json({ runs: listRuns(user.id) }, { headers: NO_STORE });
}
