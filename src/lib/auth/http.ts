import type { z } from "zod";

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Parses and validates a JSON request body. Requiring the JSON content type also
 * keeps plain cross-site HTML forms (which cannot send it) from posting here.
 */
export async function parseJsonBody<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.output<S>>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: Response.json({ error: "Expected a JSON body." }, { status: 415 }) };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: Response.json({ error: "Malformed JSON body." }, { status: 400 }) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    const error = result.error.issues[0]?.message ?? "Invalid request.";
    return { ok: false, response: Response.json({ error, fields }, { status: 400 }) };
  }
  return { ok: true, data: result.data };
}
