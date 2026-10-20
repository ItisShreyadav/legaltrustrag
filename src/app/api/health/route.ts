import { connection } from "next/server";
import { getDb, getSessionUser } from "@/lib/auth";
import { getEnv, hasAnthropicCredentials } from "@/lib/env";
import { jsonNoStore } from "@/lib/http";
import { log } from "@/lib/log";
import { modelStatus } from "@/lib/retrieval";
import type { SessionUser } from "@/lib/types";

/**
 * GET. Anonymous callers (load balancers, the Docker HEALTHCHECK) get the
 * liveness answer `{ ok: true }` only. A signed-in user also gets the
 * configuration the analyze page needs plus readiness details:
 *
 *   { ok, hasApiKey, model, limits: { maxFiles, maxUploadMb, analysesPerHour },
 *     database: { ok }, embeddings: { enabled, model, cached, loaded },
 *     reranker: { model, cached, loaded, failed } }
 *
 * `ok` stays true while the process can answer; check `database.ok` for readiness.
 */
export async function GET(): Promise<Response> {
  // Request time only: the answer depends on the cookie and the runtime environment.
  await connection();

  let user: SessionUser | null = null;
  try {
    user = await getSessionUser();
  } catch (err) {
    log.error("health.session_lookup_failed", { err });
  }
  if (!user) return jsonNoStore({ ok: true });

  const env = getEnv();
  let databaseOk = true;
  try {
    getDb().prepare("SELECT 1").get();
  } catch (err) {
    databaseOk = false;
    log.error("health.database_unreachable", { err });
  }
  const models = await modelStatus();

  return jsonNoStore({
    ok: true,
    hasApiKey: hasAnthropicCredentials(env),
    model: env.ANTHROPIC_MODEL,
    limits: {
      maxFiles: env.LTR_MAX_FILES,
      maxUploadMb: env.LTR_MAX_UPLOAD_MB,
      analysesPerHour: env.LTR_ANALYZE_RATE_LIMIT,
    },
    database: { ok: databaseOk },
    embeddings: {
      enabled: !models.disabled && !models.runtimeError,
      model: models.embedModel,
      cached: models.embedCached,
      loaded: models.embedLoaded,
    },
    reranker: {
      model: models.rerankModel,
      cached: models.rerankCached,
      loaded: models.rerankLoaded,
      failed: models.rerankFailed,
    },
  });
}
