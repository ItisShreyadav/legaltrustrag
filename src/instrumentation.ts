import type { Instrumentation } from "next";

/**
 * Runs once when a server instance starts: validates the environment and logs a
 * one-line configuration summary (never secret values), so a misconfigured
 * deployment is visible in the logs before the first request.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { getEnv, hasAnthropicCredentials } = await import("@/lib/env");
  const { log } = await import("@/lib/log");
  try {
    const env = getEnv();
    log.info("server.start", {
      nodeEnv: env.NODE_ENV,
      model: env.ANTHROPIC_MODEL,
      hasApiKey: hasAnthropicCredentials(env),
      signupAllowed: env.LTR_ALLOW_SIGNUP,
      maxFiles: env.LTR_MAX_FILES,
      maxUploadMb: env.LTR_MAX_UPLOAD_MB,
      analysesPerHour: env.LTR_ANALYZE_RATE_LIMIT,
      trustedProxyHops: env.LTR_TRUST_PROXY,
      dbPathSet: Boolean(env.LTR_DB_PATH),
      modelCacheDirSet: Boolean(env.LTR_MODEL_CACHE_DIR),
    });
    if (!hasAnthropicCredentials(env)) {
      log.warn("server.not_configured", { reason: "ANTHROPIC_API_KEY is not set; analyses will be refused with 503" });
    }
  } catch (err) {
    log.error("server.invalid_env", { err });
  }
}

/** Unhandled server errors as structured log lines. No headers (cookies) and no query string. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("@/lib/log");
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  log.error("request.unhandled_error", {
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
    digest,
    err,
  });
};
