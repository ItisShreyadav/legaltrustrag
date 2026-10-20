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
import { getEnv } from "@/lib/env";
import { clientIp, crossSiteResponse, isCrossSiteRequest, jsonNoStore } from "@/lib/http";
import { log } from "@/lib/log";
import { formatRetryAfter } from "@/lib/rate-limit";

const INCORRECT = "Incorrect email or password.";

/**
 * POST JSON {email, password} -> 200 {user} and the session cookie; 400 invalid;
 * 401 bad credentials; 403 cross-site; 429 rate limited (Retry-After header).
 * Every response is `Cache-Control: no-store`; errors are `{ error, fields? }`.
 */
export async function POST(request: Request): Promise<Response> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const parsed = await parseJsonBody(request, LoginInput);
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.data;
  const ip = clientIp(request, getEnv().LTR_TRUST_PROXY);

  const retryAfter = loginRetryAfterSeconds(email, ip);
  if (retryAfter > 0) {
    log.warn("auth.login.rate_limited", { ip, retryAfter });
    return jsonNoStore(
      { error: `Too many sign-in attempts. Try again in ${formatRetryAfter(retryAfter)}.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // Count the attempt before the slow hash, so a burst of parallel requests
  // cannot all pass the check above; a successful sign-in clears it below.
  recordLoginFailure(email, ip);

  // Unknown emails burn the same scrypt work, so timing does not reveal which accounts exist.
  const user = findUserByEmail(email);
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
  if (!user || !ok) {
    log.info("auth.login.failed", { ip });
    return jsonNoStore({ error: INCORRECT }, { status: 401 });
  }

  clearLoginFailures(email);
  await createSession(user.id);
  log.info("auth.login", { userId: user.id });
  return jsonNoStore({ user: { id: user.id, email: user.email, name: user.name } });
}
