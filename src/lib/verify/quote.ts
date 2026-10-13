/**
 * Pure checks used by the verifier. No I/O, no model calls.
 */
import type { Clause, Quote, SourceDocument, VerificationCheck } from "@/lib/types";

function preview(s: string, max = 40): string {
  const flat = s.replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

/**
 * Exact quote check: `doc.text.slice(q.start, q.end) === q.text`, offsets are sane, and
 * (when `clauses` is given) the quote lies inside its clause's [start, end) range in the
 * same document. Never delegate this to a model.
 */
export function checkQuote(
  q: Quote,
  docs: Map<string, SourceDocument>,
  clauses?: Map<string, Clause>,
): VerificationCheck {
  const fail = (detail: string): VerificationCheck => ({ name: "quote", passed: false, detail });

  const doc = docs.get(q.docId);
  if (!doc) return fail(`document "${q.docId}" not found`);
  if (!Number.isInteger(q.start) || !Number.isInteger(q.end)) return fail(`offsets must be integers (got ${q.start}, ${q.end})`);
  if (q.start < 0 || q.end > doc.text.length || q.start >= q.end) {
    return fail(`offsets [${q.start}, ${q.end}) out of bounds for document of length ${doc.text.length}`);
  }
  if (typeof q.text !== "string" || q.text.length === 0) return fail("quote text is empty");

  const actual = doc.text.slice(q.start, q.end);
  if (actual !== q.text) {
    let i = 0;
    while (i < actual.length && i < q.text.length && actual[i] === q.text[i]) i++;
    return fail(
      `text mismatch at offset ${q.start + i}: document has "${preview(actual.slice(i))}", quote has "${preview(q.text.slice(i))}"` +
        (actual.length !== q.text.length ? ` (length ${actual.length} vs ${q.text.length})` : ""),
    );
  }

  if (clauses) {
    const clause = clauses.get(q.clauseId);
    if (!clause) return fail(`clause "${q.clauseId}" not found`);
    if (clause.docId !== q.docId) return fail(`clause "${q.clauseId}" belongs to "${clause.docId}", not "${q.docId}"`);
    if (q.start < clause.start || q.end > clause.end) {
      return fail(`quote [${q.start}, ${q.end}) lies outside clause "${clause.id}" range [${clause.start}, ${clause.end})`);
    }
  }

  return { name: "quote", passed: true, detail: `exact match at [${q.start}, ${q.end})` };
}

const STOPWORDS = new Set(
  (
    "a an the and or nor but if then else of to in on at by for from with without within into onto upon as is are was were be been " +
    "being this that these those such any all each every either neither both other another its it their them they he she his her " +
    "which who whom whose what when where how than so not no yes do does did done has have had having shall will would may might must " +
    "can could should under over between per via about above below after before during until up down out off same also only own " +
    "clause clauses section agreement party parties contract provision provisions says states said says"
  ).split(/\s+/),
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function contentTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9]+(?:[.,][0-9]+)*/g) ?? []) {
    if (/^\d/.test(raw)) {
      out.add(raw.replace(/,/g, ""));
      continue;
    }
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

/**
 * Lexical relevance gate (LTR_FAST_VERIFY=1): share of the claim's content words that
 * also appear in the evidence. Returns a pseudo-probability and a pass flag.
 */
export function lexicalRelevance(claim: string, evidence: string[]): { passed: boolean; probability: number; overlap: number } {
  const c = contentTokens(claim);
  const e = contentTokens(evidence.join(" "));
  if (c.size === 0) return { passed: false, probability: 0, overlap: 0 };
  let hit = 0;
  for (const t of c) if (e.has(t)) hit++;
  const overlap = hit / c.size;
  const probability = Math.min(1, Math.max(0, 0.25 + 1.5 * overlap));
  return { passed: probability >= 0.5, probability, overlap };
}
