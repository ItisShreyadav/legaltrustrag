/*
 * Sign-in and sign-up limits on top of the shared in-memory limiter
 * (src/lib/rate-limit.ts). Per process only; they reset on restart.
 *
 * - Failed sign-ins: 10 per email and 50 per client IP per 15 minutes. A
 *   successful sign-in clears the email's history. Failures are counted for
 *   unknown emails too, so the limit does not reveal which accounts exist.
 * - Sign-ups: 10 per client IP per hour. When the client IP is unknown
 *   (LTR_TRUST_PROXY unset), all sign-ups share one bucket of 50 per hour.
 */
import { RateLimiter } from "@/lib/rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURES_PER_EMAIL = 10;
const LOGIN_FAILURES_PER_IP = 50;

const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUPS_PER_IP = 10;
const SIGNUPS_UNKNOWN_IP = 50;
const UNKNOWN_IP_KEY = "unknown";

const loginByEmail = new RateLimiter({ name: "login-email", windowMs: LOGIN_WINDOW_MS });
const loginByIp = new RateLimiter({ name: "login-ip", windowMs: LOGIN_WINDOW_MS });
const signupByIp = new RateLimiter({ name: "signup-ip", windowMs: SIGNUP_WINDOW_MS });

/** Seconds until another sign-in attempt is allowed, or 0 if neither the email nor the IP is limited. */
export function loginRetryAfterSeconds(email: string, ip: string | null = null, now = Date.now()): number {
  const byEmail = loginByEmail.check(email, LOGIN_FAILURES_PER_EMAIL, now).retryAfterSeconds;
  const byIp = ip ? loginByIp.check(ip, LOGIN_FAILURES_PER_IP, now).retryAfterSeconds : 0;
  return Math.max(byEmail, byIp);
}

export function recordLoginFailure(email: string, ip: string | null = null, now = Date.now()): void {
  loginByEmail.record(email, now);
  if (ip) loginByIp.record(ip, now);
}

export function clearLoginFailures(email: string): void {
  loginByEmail.reset(email);
}

/** Records one sign-up attempt for the IP (or the shared bucket) if allowed; returns seconds to wait, or 0. */
export function consumeSignupAttempt(ip: string | null, now = Date.now()): number {
  const result = ip
    ? signupByIp.consume(ip, SIGNUPS_PER_IP, now)
    : signupByIp.consume(UNKNOWN_IP_KEY, SIGNUPS_UNKNOWN_IP, now);
  return result.retryAfterSeconds;
}
