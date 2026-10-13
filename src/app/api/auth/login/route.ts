import {
  LoginInput,
  clearLoginFailures,
  createSession,
  findUserByEmail,
  loginRetryAfterSeconds,
  parseJsonBody,
  recordLoginFailure,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/auth";

const INCORRECT = "Incorrect email or password.";

/** POST JSON {email, password} -> 200 {user} and the session cookie; 401 on bad credentials; 429 when rate limited. */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, LoginInput);
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.data;

  const retryAfter = loginRetryAfterSeconds(email);
  if (retryAfter > 0) {
    const minutes = Math.ceil(retryAfter / 60);
    return Response.json(
      { error: `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const user = findUserByEmail(email);
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
  if (!user || !ok) {
    recordLoginFailure(email);
    return Response.json({ error: INCORRECT }, { status: 401 });
  }

  clearLoginFailures(email);
  await createSession(user.id);
  return Response.json({ user: { id: user.id, email: user.email, name: user.name } });
}
