import type { ReviewStatus, ReviewView } from "@/lib/review/types";

/** Browser-side calls to /api/review. Each resolves to the stored review or throws with a readable message. */

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

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<ReviewView> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(await errorFromResponse(res));
  const data = (await res.json().catch(() => null)) as { review?: ReviewView } | null;
  if (!data?.review) throw new Error("The server sent an unexpected response.");
  return data.review;
}

/** Queue a finding of a saved run for human review (idempotent). */
export function requestReview(runId: string, findingId: string): Promise<ReviewView> {
  return send("/api/review", "POST", { runId, findingId });
}

/** Record a human decision, or return the item to the queue. */
export function recordDecision(reviewId: string, status: ReviewStatus, note: string): Promise<ReviewView> {
  return send(`/api/review/${encodeURIComponent(reviewId)}`, "PATCH", { status, note });
}

export function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong.";
}
