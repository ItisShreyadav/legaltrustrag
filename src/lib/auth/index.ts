/*
 * Server-only auth API (imports node:sqlite). Client components and src/proxy.ts
 * must import from ./constants instead.
 */
export { MIN_PASSWORD_LENGTH, SESSION_COOKIE, safeNextPath } from "./constants";
export { databasePath, getDb } from "./db";
export { parseJsonBody } from "./http";
export { hashPassword, verifyAgainstDummy, verifyPassword } from "./password";
export { clearLoginFailures, consumeSignupAttempt, loginRetryAfterSeconds, recordLoginFailure } from "./rate-limit";
export { LoginInput, SignupInput } from "./schemas";
export { createSession, destroySession, getSessionUser, requireUser } from "./session";
export { EmailTakenError, createUser, findUserByEmail, type UserRecord } from "./users";
