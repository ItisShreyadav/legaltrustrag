import { useEffect, useState } from "react";
import { DEFAULT_LIMITS, type UploadLimits } from "./files";

export type ServerHealth =
  | { status: "loading" }
  /** `hasApiKey` / `model` are null when the server did not report them. */
  | { status: "ready"; hasApiKey: boolean | null; model: string | null; limits: UploadLimits }
  | { status: "unavailable" };

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function parseHealth(body: unknown): ServerHealth {
  if (!body || typeof body !== "object") return { status: "unavailable" };
  const record = body as Record<string, unknown>;
  // Signed-in callers get `limits: { maxFiles, maxUploadMb }`; anonymous ones only `{ ok }`.
  const limits = record.limits && typeof record.limits === "object" ? (record.limits as Record<string, unknown>) : {};
  const maxFiles = positive(limits.maxFiles);
  const maxUploadMb = positive(limits.maxUploadMb);
  return {
    status: "ready",
    hasApiKey: typeof record.hasApiKey === "boolean" ? record.hasApiKey : null,
    model: typeof record.model === "string" && record.model ? record.model : null,
    limits: {
      maxFiles: maxFiles !== null ? Math.floor(maxFiles) : DEFAULT_LIMITS.maxFiles,
      maxFileBytes: maxUploadMb !== null ? Math.floor(maxUploadMb * 1024 * 1024) : DEFAULT_LIMITS.maxFileBytes,
    },
  };
}

/** Upload limits from the health response, or the server defaults until it arrives. */
export function uploadLimits(health: ServerHealth): UploadLimits {
  return health.status === "ready" ? health.limits : DEFAULT_LIMITS;
}

/** GET /api/health once on mount. Advisory only: the analysis itself reports any real failure. */
export function useServerHealth(): ServerHealth {
  const [health, setHealth] = useState<ServerHealth>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`health ${res.status}`);
        setHealth(parseHealth(await res.json()));
      })
      .catch(() => {
        if (!controller.signal.aborted) setHealth({ status: "unavailable" });
      });
    return () => controller.abort();
  }, []);

  return health;
}
