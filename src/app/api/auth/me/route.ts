import { getSessionUser } from "@/lib/auth";
import { jsonNoStore } from "@/lib/http";

/** GET -> 200 {user} for a valid session, else 401 {error}. Never cached. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return jsonNoStore({ error: "Not signed in." }, { status: 401 });
  return jsonNoStore({ user });
}
