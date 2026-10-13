/**
 * Turn a model-produced span string into a Quote with exact offsets.
 * The returned Quote.text is always doc.text.slice(start, end), so it satisfies the
 * verifier's exact-substring check by construction (when the doc is known).
 */
import type { Clause, Quote, SourceDocument } from "@/lib/types";

const QUOTE_CHARS = "\"\u201C\u201D\u201E\u00AB\u00BB";
const APOS_CHARS = "'\u2018\u2019\u201A";
const DASH_CHARS = "\\-\u2010\u2011\u2012\u2013\u2014\u2015";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex that matches `span` modulo whitespace runs and typographic quote/dash variants. */
function looseRegex(span: string): RegExp | null {
  const tokens = span.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 400) return null;
  const parts = tokens.map((tok) =>
    Array.from(tok)
      .map((ch) => {
        if (QUOTE_CHARS.includes(ch)) return `[${QUOTE_CHARS}]`;
        if (APOS_CHARS.includes(ch)) return `[${APOS_CHARS}]`;
        if (ch === "-" || DASH_CHARS.includes(ch)) return `[${DASH_CHARS}]`;
        return escapeRegex(ch);
      })
      .join(""),
  );
  return new RegExp(parts.join("\\s+"));
}

/** Strip wrapping quote marks / ellipses the model sometimes adds around a span. */
function cleanSpan(span: string): string {
  let s = span.trim();
  s = s.replace(/^(\.\.\.|\u2026)\s*/, "").replace(/\s*(\.\.\.|\u2026)$/, "");
  const wrap = /^["'\u201C\u2018]([\s\S]*)["'\u201D\u2019]$/.exec(s);
  if (wrap) s = wrap[1].trim();
  return s;
}

/** The clause's text as it appears in the source (falls back to clause.text if the doc is unknown). */
function clauseSource(clause: Clause, docs: Map<string, SourceDocument>): string {
  const doc = docs.get(clause.docId);
  return doc ? doc.text.slice(clause.start, clause.end) : clause.text;
}

function makeQuote(clause: Clause, hay: string, relStart: number, relEnd: number): Quote {
  return {
    clauseId: clause.id,
    docId: clause.docId,
    start: clause.start + relStart,
    end: clause.start + relEnd,
    text: hay.slice(relStart, relEnd),
  };
}

/**
 * Locate `span` inside `clause` (indexOf first, then a whitespace/typography-tolerant
 * match). Returns null when the span is not in the clause.
 */
export function locateInClause(clause: Clause, span: string, docs: Map<string, SourceDocument>): Quote | null {
  const hay = clauseSource(clause, docs);
  const candidates = Array.from(new Set([span, span.trim(), cleanSpan(span)])).filter((s) => s.length > 0);
  for (const s of candidates) {
    const idx = hay.indexOf(s);
    if (idx >= 0) return makeQuote(clause, hay, idx, idx + s.length);
  }
  for (const s of candidates) {
    const re = looseRegex(s);
    const m = re?.exec(hay);
    if (m && m[0].length > 0) return makeQuote(clause, hay, m.index, m.index + m[0].length);
  }
  return null;
}

/** The whole clause as a quote (used as a fallback when a span cannot be located). */
export function wholeClauseQuote(clause: Clause, docs: Map<string, SourceDocument>): Quote {
  const hay = clauseSource(clause, docs);
  return makeQuote(clause, hay, 0, hay.length);
}

/**
 * Locate `span` or fall back to the whole clause. `located` is false on fallback; the
 * caller should then discount its probability (x0.7).
 */
export function quoteOrWholeClause(
  clause: Clause,
  span: string | null | undefined,
  docs: Map<string, SourceDocument>,
): { quote: Quote; located: boolean } {
  const q = span ? locateInClause(clause, span, docs) : null;
  return q ? { quote: q, located: true } : { quote: wholeClauseQuote(clause, docs), located: false };
}

/** Prompt-friendly label for a clause. */
export function describeClause(clause: Clause, docs: Map<string, SourceDocument>): string {
  const doc = docs.get(clause.docId);
  const where = [doc?.name ?? clause.docId, clause.path.join(" > ") || undefined, clause.heading || undefined]
    .filter(Boolean)
    .join(" | ");
  return `id=${clause.id}; ${where}; category=${clause.category}`;
}
