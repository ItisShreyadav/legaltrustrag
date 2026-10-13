/**
 * Offline self-test for clause typing: heuristic-only mode, and the Claude path against a
 * mocked fetch (request shape, prompt caching, structured output, category normalisation,
 * transient-error retry, truncated-output batch splitting). No network, no API spend.
 *
 *   npx tsx src/lib/typing/selftest.ts [-v]
 *   node --experimental-strip-types src/lib/typing/selftest.ts [-v]   (Node >= 22.6, no tsx)
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Clause } from "../types";

const RESOLVE_HOOK = `export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (err) {
    if (err && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "ERR_UNSUPPORTED_DIR_IMPORT") && /^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ext of [".ts", "/index.ts"]) { try { return await next(specifier + ext, context); } catch {} }
    }
    throw err;
  }
}`;
register(`data:text/javascript,${encodeURIComponent(RESOLVE_HOOK)}`);

const here = path.dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes("-v");
let failures = 0;
let checks = 0;
function expect(cond: unknown, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  FAIL ${msg}`);
  }
}

interface Call {
  body: Record<string, unknown>;
  headers: Headers;
  ids: string[];
}

type Responder = (call: Call, n: number) => { status: number; body: unknown; headers?: Record<string, string> };

function mockFetch(responder: Responder, calls: Call[]) {
  return async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const messages = body.messages as Array<{ content: string }>;
    const ids = [...messages[0].content.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
    const call = { body, headers: new Headers(init?.headers as HeadersInit), ids };
    calls.push(call);
    const r = responder(call, calls.length);
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  };
}

function message(text: string, stop_reason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function answer(ids: string[], category = "Exclusivity") {
  return JSON.stringify({ results: ids.map((id) => ({ id, category, confidence: 0.8 })) });
}

async function main(): Promise<void> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { loadDocument, structureDocument } = await import("../parse");
  const { typeClauses, heuristicType, normalizeCategory } = await import("./index");

  const fixtures = path.join(here, "..", "parse", "__fixtures__");
  const clauses: Clause[] = [];
  for (const [i, f] of ["license_agreement.txt", "services_agreement.txt", "nda.txt"].entries()) {
    const doc = await loadDocument({ name: f, bytes: readFileSync(path.join(fixtures, f)) }, i + 1);
    clauses.push(...structureDocument(doc));
  }
  const find = (re: RegExp) => clauses.find((c) => re.test(c.text)) as Clause;

  // --- heuristics ---------------------------------------------------------------------
  expect(heuristicType(find(/governed by and construed/))?.category === "Governing Law", "heuristic: governing law");
  expect(heuristicType(find(/^SOFTWARE LICENSE AGREEMENT/))?.category === "Parties", "heuristic: parties");
  expect(heuristicType(find(/^IN WITNESS WHEREOF/))?.category === "Other", "heuristic: signature block");
  expect(heuristicType(find(/aggregate liability arising/))?.category === "Cap On Liability", "heuristic: liability cap");
  expect(heuristicType(find(/for convenience upon one hundred/))?.category === "Termination For Convenience", "heuristic: convenience");
  expect(normalizeCategory("anti assignment") === "Anti-Assignment", "normalize: fuzzy match");
  expect(normalizeCategory("Indemnification") === "Other", "normalize: unknown -> Other");

  // --- no credentials: heuristics only, warns once ------------------------------------
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const savedToken = process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  const warn = console.warn;
  const warnings: string[] = [];
  console.warn = (...a: unknown[]) => void warnings.push(a.join(" "));
  const progress: Array<[number, number]> = [];
  const offline = await typeClauses(clauses, { onProgress: (d, t) => progress.push([d, t]) });
  await typeClauses(clauses.slice(0, 3));
  console.warn = warn;
  expect(offline.length === clauses.length && offline.every((c, i) => c.id === clauses[i].id), "offline: same clauses, same order");
  expect(offline.every((c) => c.categoryConfidence > 0), "offline: every clause has a confidence");
  expect(clauses.every((c) => c.category === "Other" && c.categoryConfidence === 0), "offline: input not mutated");
  expect(warnings.filter((w) => w.includes("ANTHROPIC_API_KEY")).length === 1, "offline: warning logged once");
  expect(progress.at(-1)?.[0] === progress.at(-1)?.[1], "offline: progress reaches total");
  if (verbose) {
    for (const c of offline) console.log(`  ${c.id.padEnd(12)} ${c.category.padEnd(34)} ${c.categoryConfidence.toFixed(2)} ${c.path.join(" > ")}`);
  }
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  if (savedToken !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = savedToken;

  // --- mocked Claude: request shape + parsing -----------------------------------------
  {
    const calls: Call[] = [];
    const client = new Anthropic({
      apiKey: "test-key",
      maxRetries: 0,
      fetch: mockFetch((call) => {
        const [first, ...rest] = call.ids;
        const text = JSON.stringify({
          results: [
            { id: first, category: "Not A Category", confidence: 0.7 },
            ...rest.map((id) => ({ id, category: "anti-assignment", confidence: 1.7 })),
            { id: "doc_999:c_1", category: "Insurance", confidence: 0.9 },
          ],
        });
        return { status: 200, body: message(text) };
      }, calls),
    });
    const seen: number[] = [];
    const typed = await typeClauses(clauses, { client, batchSize: 7, concurrency: 3, onProgress: (d) => seen.push(d) });
    const sent = new Set(calls.flatMap((c) => c.ids));
    const b = calls[0]?.body ?? {};
    const system = b.system as Array<{ text: string; cache_control?: { type: string } }>;
    const oc = b.output_config as { effort?: string; format?: { type?: string; schema?: unknown } };
    expect(b.model === (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"), "llm: model from env/default");
    expect(system?.[0]?.cache_control?.type === "ephemeral", "llm: system prompt cached");
    expect(system?.[0]?.text.includes("Third Party Beneficiary:") && system[0].text.includes("Competitive Restriction Exception:"), "llm: all categories in system prompt");
    expect(oc?.effort === "low" && oc.format?.type === "json_schema", "llm: structured output + effort");
    const schema = oc?.format?.schema as {
      properties: { results: { items: { properties: { category: { enum?: string[] } } } } };
    };
    expect(schema?.properties.results.items.properties.category.enum?.length === 42, "llm: category constrained by enum");
    if (b.model === "claude-sonnet-5-5") {
      expect(b.fallbacks === "default" && (calls[0].headers.get("anthropic-beta") ?? "").includes("server-side-fallback-2026-07-01"), "llm: refusal fallback enabled");
    }
    expect(calls.every((c) => c.ids.length <= 7), "llm: batch size respected");
    expect(
      clauses.every((c) => sent.has(c.id) === (heuristicType(c)?.confidence ?? 0) < 0.9),
      "llm: exactly the non-trivial clauses are sent",
    );
    const skipped = typed.filter((c) => !sent.has(c.id));
    expect(skipped.length > 0 && skipped.every((c) => c.categoryConfidence >= 0.9), "llm: heuristic pre-pass skipped obvious clauses");
    const llmTyped = typed.filter((c) => sent.has(c.id));
    expect(llmTyped.some((c) => c.category === "Other" && c.categoryConfidence === 0.7), "llm: unknown category mapped to Other");
    expect(llmTyped.some((c) => c.category === "Anti-Assignment" && c.categoryConfidence === 1), "llm: category normalised, confidence clamped");
    expect(seen.at(-1) === clauses.length, "llm: progress reaches total");
    if (verbose) console.log(`  mocked run: ${calls.length} calls, ${sent.size} clauses sent, ${skipped.length} skipped by heuristics`);
  }

  // --- transient error retry (529 then success) -----------------------------------------
  {
    const calls: Call[] = [];
    const client = new Anthropic({
      apiKey: "test-key",
      maxRetries: 0,
      fetch: mockFetch((call, n) =>
        n === 1
          ? { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, headers: { "retry-after": "0" } }
          : { status: 200, body: message(answer(call.ids)) },
      calls),
    });
    const pending = clauses.filter((c) => /exclusive|license/i.test(c.text)).slice(0, 3);
    const typed = await typeClauses(pending, { client });
    const sentIds = new Set(calls.flatMap((c) => c.ids));
    expect(calls.length >= 2, "retry: 529 retried");
    expect(typed.filter((c) => sentIds.has(c.id)).every((c) => c.category === "Exclusivity"), "retry: result used after retry");
  }

  // --- truncated output -> batch split; missing ids -> follow-up call -------------------
  {
    const calls: Call[] = [];
    const client = new Anthropic({
      apiKey: "test-key",
      maxRetries: 0,
      fetch: mockFetch((call) => {
        if (call.ids.length > 2) return { status: 200, body: message('{"results": [', "max_tokens") };
        return { status: 200, body: message(answer(call.ids.slice(0, Math.max(1, call.ids.length - 1)))) };
      }, calls),
    });
    const pending = clauses.filter((c) => (heuristicType(c)?.confidence ?? 0) < 0.9).slice(0, 8);
    const typed = await typeClauses(pending, { client, batchSize: 8 });
    expect(calls.some((c) => c.ids.length <= 2), "split: truncated batch split into smaller calls");
    expect(typed.every((c) => c.category === "Exclusivity"), "split: every clause typed after split + follow-up");
  }

  // --- permanent failure -> heuristics fallback, no throw --------------------------------
  {
    const calls: Call[] = [];
    const client = new Anthropic({
      apiKey: "test-key",
      maxRetries: 0,
      fetch: mockFetch(() => ({ status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "bad" } } }), calls),
    });
    const warn2 = console.warn;
    console.warn = () => {};
    const typed = await typeClauses(clauses, { client, batchSize: 5 });
    console.warn = warn2;
    expect(typed.length === clauses.length && typed.every((c) => c.categoryConfidence > 0), "failure: falls back to heuristics");
    expect(calls.length === 1, "failure: 400 stops further calls");
  }

  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
