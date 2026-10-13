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

/** "4. TERM AND TERMINATION", "ARTICLE V", "Section 5 – Indemnity", "SCHEDULE A". */
const TOP_HEADING =
  /^\s*(?:(article|section|clause|schedule|part|annex|appendix|exhibit)\s+([0-9]+[a-z]?|[ivxlcdm]+|[a-z])\b|(\d+)\.\s+\S)/i;
/** "4.2 ", "10.1. " */
const NUMBERED = /^\s*(\d+(?:\.\d+)+)\.?\s/;
/** "(a) ", "(iv) ", "(2) " */
const SUB_ITEM = /^\s*\(([a-z]{1,4}|\d{1,2})\)\s/i;

const MAX_LINES_BACK = 400;

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Best-effort clause path for a quote, derived from the source text around it,
 * e.g. ["Section 4", "4.2"] or ["Article V", "5.2", "(a)"]. Walks back from the
 * quote's line to the nearest numbered clause and top-level heading. Returns an
 * empty array when the text has no recognisable numbering (e.g. a preamble).
 */
export function clausePath(docText: string | undefined, quote: Quote): string[] {
  if (docText === undefined || quote.start < 0 || quote.start > docText.length) return [];
  let sub: string | null = null;
  let numbered: string | null = null;
  let top: string | null = null;

  let lineStart = docText.lastIndexOf("\n", quote.start - 1) + 1;
  for (let i = 0; i < MAX_LINES_BACK; i++) {
    const lineEnd = docText.indexOf("\n", lineStart);
    const line = docText.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

    if (!numbered && !sub) {
      const s = SUB_ITEM.exec(line);
      if (s) sub = `(${s[1]})`;
    }
    if (!numbered) {
      const n = NUMBERED.exec(line);
      if (n) numbered = n[1];
    }
    const t = TOP_HEADING.exec(line);
    if (t && !NUMBERED.test(line)) {
      if (t[1] && t[2]) {
        const id = /^[ivxlcdm]+$/i.test(t[2]) || /^[a-z]$/i.test(t[2]) ? t[2].toUpperCase() : t[2];
        top = `${titleCase(t[1])} ${id}`;
      } else if (t[3]) {
        top = `Section ${t[3]}`;
      }
      if (top) break;
    }
    if (lineStart === 0) break;
    lineStart = docText.lastIndexOf("\n", lineStart - 2) + 1;
  }

  // A numbered clause from a different top-level section means the heading we
  // found is not its parent (e.g. headings are unnumbered); drop the heading.
  if (top && numbered && /^Section \d+$/.test(top) && !numbered.startsWith(`${top.slice(8)}.`)) top = null;
  return [top, numbered, sub].filter((p): p is string => p !== null);
}
