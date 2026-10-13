import { destroySession } from "@/lib/auth";

/** POST -> 200; deletes the session row and clears the cookie. Safe to call when signed out. */
export async function POST(): Promise<Response> {
  await destroySession();
  return Response.json({ ok: true });
}
