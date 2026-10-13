import { getSessionUser } from "@/lib/auth";

/** GET -> 200 {user} for a valid session, else 401. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  const headers = { "Cache-Control": "no-store" };
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401, headers });
  return Response.json({ user }, { headers });
}
