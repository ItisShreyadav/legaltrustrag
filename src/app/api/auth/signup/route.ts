import {
  EmailTakenError,
  SignupInput,
  consumeSignupAttempt,
  createSession,
  createUser,
  findUserByEmail,
  hashPassword,
  parseJsonBody,
} from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { clientIp, crossSiteResponse, isCrossSiteRequest, jsonNoStore } from "@/lib/http";
import { log } from "@/lib/log";
import { formatRetryAfter } from "@/lib/rate-limit";

const TAKEN = "An account with this email already exists. Sign in instead.";
const DISABLED = "Sign-up is disabled on this server. Ask an administrator for an account.";

/**
 * POST JSON {name, email, password} -> 201 {user} and the session cookie; 400 invalid;
 * 403 sign-up disabled (LTR_ALLOW_SIGNUP=false) or cross-site; 409 email taken;
 * 429 rate limited (Retry-After header). Every response is `Cache-Control: no-store`;
 * errors are `{ error, fields? }`.
 */
export async function POST(request: Request): Promise<Response> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const env = getEnv();
  if (!env.LTR_ALLOW_SIGNUP) return jsonNoStore({ error: DISABLED, code: "signup_disabled" }, { status: 403 });

  const parsed = await parseJsonBody(request, SignupInput);
  if (!parsed.ok) return parsed.response;
  const { name, email, password } = parsed.data;

  // Counted before the email lookup, so the 409 below cannot be used to probe many addresses.
  const ip = clientIp(request, env.LTR_TRUST_PROXY);
  const retryAfter = consumeSignupAttempt(ip);
  if (retryAfter > 0) {
    log.warn("auth.signup.rate_limited", { ip, retryAfter });
    return jsonNoStore(
      { error: `Too many sign-up attempts. Try again in ${formatRetryAfter(retryAfter)}.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  if (findUserByEmail(email)) return jsonNoStore({ error: TAKEN }, { status: 409 });

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = createUser({ name, email, passwordHash });
  } catch (err) {
    // Lost a race with a concurrent signup for the same email.
    if (err instanceof EmailTakenError) return jsonNoStore({ error: TAKEN }, { status: 409 });
    throw err;
  }

  await createSession(user.id);
  log.info("auth.signup", { userId: user.id });
  return jsonNoStore({ user }, { status: 201 });
}
