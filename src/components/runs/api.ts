/** Browser-side calls to /api/runs. Client-safe: no server imports. */

export type DeleteOutcome = "deleted" | "missing";

async function errorFromResponse(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // not JSON
  }
  if (res.status === 401) return "Your session has ended. Sign in again.";
  return `The server responded with ${res.status}. Please try again.`;
}

/**
 * Permanently deletes one of the user's runs (and its review rows). Resolves to
 * "missing" when the run was already gone, e.g. deleted from another tab;
 * throws with a readable message on any other failure.
 */
export async function deleteRunRequest(runId: string): Promise<DeleteOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { method: "DELETE", cache: "no-store" });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (res.status === 404) return "missing";
  if (!res.ok) throw new Error(await errorFromResponse(res));
  return "deleted";
}

export function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong.";
}
