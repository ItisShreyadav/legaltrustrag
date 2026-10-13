import {
  EmailTakenError,
  SignupInput,
  createSession,
  createUser,
  findUserByEmail,
  hashPassword,
  parseJsonBody,
} from "@/lib/auth";

const TAKEN = "An account with this email already exists. Sign in instead.";

/** POST JSON {name, email, password} -> 201 {user} and the session cookie; 400 invalid; 409 email taken. */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, SignupInput);
  if (!parsed.ok) return parsed.response;
  const { name, email, password } = parsed.data;

  if (findUserByEmail(email)) return Response.json({ error: TAKEN }, { status: 409 });

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = createUser({ name, email, passwordHash });
  } catch (err) {
    // Lost a race with a concurrent signup for the same email.
    if (err instanceof EmailTakenError) return Response.json({ error: TAKEN }, { status: 409 });
    throw err;
  }

  await createSession(user.id);
  return Response.json({ user }, { status: 201 });
}
