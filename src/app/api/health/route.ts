import { connection } from "next/server";

export async function GET(): Promise<Response> {
  // Read env at request time, not at build-time prerender.
  await connection();
  return Response.json({
    ok: true,
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  });
}
