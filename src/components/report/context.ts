import type { Quote } from "@/lib/types";

export interface QuoteContext {
  /** Text before the quote, within the surrounding clause. */
  before: string;
  /** The quote itself, sliced from the source at its offsets. */
  match: string;
  after: string;
  truncatedStart: boolean;
  truncatedEnd: boolean;
}

/** Line that starts a new clause: "4.2 ...", "(a) ...", "Section 5", "ARTICLE II", etc. */
const CLAUSE_START = /^\s*(?:\d+(?:\.\d+)*\.?\s|\(?[a-z]{1,4}\)\s|\(\d+\)\s|(?:section|article|clause|schedule)\s)/i;

const MAX_SIDE = 420;

/** True when the quote's offsets point at exactly its text in `docText`. */
export function quoteMatches(docText: string | undefined, quote: Quote): boolean {
  if (docText === undefined) return false;
  if (quote.start < 0 || quote.end > docText.length || quote.start >= quote.end) return false;
  return docText.slice(quote.start, quote.end) === quote.text;
}

/**
 * Expand a quote to the clause around it: back to the nearest blank line or
 * numbered line start, forward to the next one, capped at MAX_SIDE characters
 * on each side. Returns null if the quote does not match the source exactly.
 */
export function clauseContext(docText: string | undefined, quote: Quote): QuoteContext | null {
  if (docText === undefined || !quoteMatches(docText, quote)) return null;
  const { start, end } = quote;

  // Backwards: walk line starts until a blank line or a clause-numbered line.
  let from = 0;
  let lineStart = docText.lastIndexOf("\n", start - 1) + 1;
  for (;;) {
    const lineEnd = docText.indexOf("\n", lineStart);
    const line = docText.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (CLAUSE_START.test(line) || lineStart === 0) {
      from = lineStart;
      break;
    }
    if (lineStart >= 2 && docText[lineStart - 2] === "\n") {
      from = lineStart; // previous line is blank
      break;
    }
    if (start - lineStart > MAX_SIDE) {
      from = lineStart;
      break;
    }
    lineStart = docText.lastIndexOf("\n", lineStart - 2) + 1;
  }

  // Forwards: stop before the next blank line or clause-numbered line.
  let to = docText.length;
  let next = docText.indexOf("\n", Math.max(end - 1, 0));
  while (next !== -1) {
    const following = docText.indexOf("\n", next + 1);
    const line = docText.slice(next + 1, following === -1 ? undefined : following);
    if (line.trim() === "" || CLAUSE_START.test(line) || next - end > MAX_SIDE) {
      to = next;
      break;
    }
    next = following;
  }
  if (to < end) to = end;

  let truncatedStart = false;
  let truncatedEnd = false;
  if (start - from > MAX_SIDE) {
    const cut = docText.indexOf(" ", start - MAX_SIDE);
    from = cut === -1 || cut >= start ? start - MAX_SIDE : cut + 1;
    truncatedStart = true;
  }
  if (to - end > MAX_SIDE) {
    const cut = docText.lastIndexOf(" ", end + MAX_SIDE);
    to = cut <= end ? end + MAX_SIDE : cut;
    truncatedEnd = true;
  }

  return {
    before: docText.slice(from, start).replace(/^\s+/, ""),
    match: docText.slice(start, end),
    after: docText.slice(end, to).replace(/\s+$/, ""),
    truncatedStart,
    truncatedEnd,
  };
}
