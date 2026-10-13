import type { Clause, SourceDocument } from "../types";
import {
  RefResolver,
  UBIQUITOUS_TERMS,
  articleKey,
  escapeRe,
  extractDefinedTerms,
  extractRefs,
  isExceptionText,
  romanToInt,
  type ClauseKeys,
} from "./refs";

/** Clauses longer than this are split at sentence boundaries (same path). */
export const MAX_CLAUSE_CHARS = 1500;
const MIN_SPLIT_CHARS = 200;

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

type Style =
  | "article"
  | "section"
  | "heading"
  | "subheading"
  | "exhibit"
  | "signature"
  | "para-heading"
  | "letter"
  | "roman"
  | "upper"
  | "upper-roman"
  | "paren-num"
  | "definition"
  | "recital";

/** Enumerator styles that contribute "(x)" suffixes to section keys. */
const ENUM_STYLES = new Set<Style>(["letter", "roman", "upper", "upper-roman", "paren-num"]);

interface Marker {
  style: Style;
  /** Structural markers pop the stack by rank; list markers pop by style. */
  structural: boolean;
  rank: number;
  label: string;
  heading?: string;
  /** The marker line carries no body text (e.g. "ARTICLE 5 - LICENSE"). */
  headerOnly: boolean;
  num?: string;
  article?: string;
  exhibit?: string;
  enumToken?: string;
  /** Document title: popped by whatever marker comes next. */
  isTitle?: boolean;
}

/** Unnumbered paragraph headings ("Term. This ...") and Title Case heading lines. */
const SUBHEADING_RANK = 50;
const LIST_RANK = 100;

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to",
  "upon", "with", "without", "under", "vs", "via", "per", "its", "their", "not", "non",
]);
const ABBREVIATIONS = new Set([
  "Inc", "Ltd", "Co", "Corp", "No", "Nos", "Sec", "Secs", "Art", "Mr", "Mrs", "Ms", "Dr", "St", "Jr",
  "Sr", "Fig", "Vol", "Para", "Cl", "Sch", "Exh", "LLC", "L.L.C", "N.A", "S.A", "U.S", "U.K", "Rev",
]);

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function isAllCaps(s: string): boolean {
  const upper = s.match(/[A-Z]/g)?.length ?? 0;
  return upper >= 3 && !/[a-z]/.test(s);
}

function isTitleCase(s: string): boolean {
  const ws = words(s).filter((w) => /[A-Za-z]/.test(w));
  if (ws.length === 0) return false;
  if (!/^[^A-Za-z]*[A-Z0-9]/.test(ws[0])) return false;
  return ws.every((w) => /^[^A-Za-z]*[A-Z0-9]/.test(w) || SMALL_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")));
}

/** Short phrase that reads as a heading ("Exclusivity", "LICENSE GRANT", "Term and Termination"). */
function isHeadingish(s: string, maxWords = 12): boolean {
  const t = s.replace(/[.:]$/, "").trim();
  if (!t || /_{2,}/.test(t)) return false;
  if (words(t).length > maxWords) return false;
  if (/[.;!?]\s+\S/.test(t)) return false; // contains a sentence break
  if (/[,;]$/.test(s.trim())) return false;
  return isAllCaps(t) || isTitleCase(t);
}

function stripHeadingPunct(s: string): string {
  return s.replace(/^[\s\-\u2013\u2014:.]+/, "").replace(/[\s.:\-\u2013\u2014]+$/, "").trim();
}

function toTitle(s: string): string {
  if (!isAllCaps(s)) return s;
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

/**
 * Split the text that follows a number marker into an inline heading and body.
 * "Exclusivity. During the Term ..." -> heading "Exclusivity", has body.
 * "LICENSE GRANT" -> heading, header only.
 */
function splitInlineHeading(rest: string): { heading?: string; headerOnly: boolean } {
  const r = rest.trim();
  if (!r) return { headerOnly: true };
  if (isHeadingish(r) && !/[.;]\s+\S/.test(r)) return { heading: stripHeadingPunct(r), headerOnly: true };
  const m = r.match(/^([^.;:\n]{1,80}?)[.:]\s+(?=["\u201C(A-Z0-9])/);
  if (m && isHeadingish(m[1], 8) && !ABBREVIATIONS.has(m[1].trim())) {
    return { heading: stripHeadingPunct(m[1]), headerOnly: false };
  }
  return { headerOnly: false };
}

const PREV_LETTER = (t: string) => String.fromCharCode(t.charCodeAt(0) - 1);

interface DetectCtx {
  stack: Marker[];
  /** Paragraph start: first line, blank line before, or previous line was a header. */
  strictStart: boolean;
  inSignature: boolean;
  inDefinitions: boolean;
  nextLine: string | null; // next non-empty trimmed line (null at end)
  blankAfter: boolean;
  nextRecital: () => number;
}

function stackHas(stack: Marker[], style: Style): Marker | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].style === style) return stack[i];
  return undefined;
}

function enumMarker(style: Style, token: string, rest: string, paren: boolean): Marker {
  const label = paren ? `(${token})` : `${token}.`;
  return { style, structural: false, rank: LIST_RANK, label, headerOnly: !rest.trim(), enumToken: token };
}

/** Classify an enumerator token: letter "(h)" vs roman "(i)" etc. */
function classifyEnum(token: string, stack: Marker[]): Style | null {
  const isLower = /^[a-z]+$/.test(token);
  const isUpper = /^[A-Z]+$/.test(token);
  if (/^\d+$/.test(token)) return "paren-num";
  if (!isLower && !isUpper) return null;
  const roman = romanToInt(token) !== null;
  const letterStyle: Style = isLower ? "letter" : "upper";
  const romanStyle: Style = isLower ? "roman" : "upper-roman";
  const sameLetter = token.length === 1 || /^([a-zA-Z])\1+$/.test(token); // "a" or "aa"
  if (!roman) return sameLetter ? letterStyle : null;
  // Ambiguous roman/letter token.
  const activeLetter = stackHas(stack, letterStyle);
  if (token.length === 1 && activeLetter?.enumToken && activeLetter.enumToken === PREV_LETTER(token)) {
    return letterStyle; // (h) -> (i)
  }
  if (stackHas(stack, romanStyle)) return romanStyle;
  if (token.length === 1 && /^[cdlmCDLM]$/.test(token)) return letterStyle;
  if (token.length === 1 && !"ivxIVX".includes(token)) return letterStyle;
  return romanStyle;
}

const DEF_STRICT_RE =
  /^["\u201C]([^"\u201C\u201D\n]{1,80})["\u201D]\s*(?:\([^()\n]{0,80}\)\s*)?,?\s*(?:shall\s+mean|means|mean|shall\s+have\s+the\s+meaning|has\s+the\s+meaning|shall\s+include|includes|refers\s+to|is\s+defined\s+as)\b/;
const DEF_LOOSE_RE = /^["\u201C]([^"\u201C\u201D\n]{1,80})["\u201D]\s*(?:[:\-\u2013\u2014]|\s(?:shall|is|are|refers|includes)\b)/;

function detectMarker(line: string, ctx: DetectCtx): Marker | null {
  let m: RegExpMatchArray | null;

  // Exhibits / schedules
  m = line.match(/^(EXHIBIT|SCHEDULE|ANNEX|APPENDIX|ATTACHMENT|Exhibit|Schedule|Annex|Appendix|Attachment)\s+([A-Z0-9]{1,4}(?:[.-]\d{1,3})?)(?![A-Za-z0-9])[.:\-\u2013\u2014]?\s*(.*)$/);
  if (m && (m[1] === m[1].toUpperCase() || !m[3].trim() || isHeadingish(m[3]))) {
    const kind = m[1].toLowerCase();
    const label = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${m[2]}`;
    const rest = splitInlineHeading(m[3]);
    return {
      style: "exhibit", structural: true, rank: 0, label, heading: rest.heading,
      headerOnly: rest.headerOnly, exhibit: `${kind}:${m[2].toUpperCase()}`,
    };
  }

  // Signature block
  if (/^IN\s+WITNESS\s+WHEREOF\b/i.test(line)) {
    return { style: "signature", structural: true, rank: 0, label: "Signatures", headerOnly: false };
  }

  // ARTICLE V / Article 5
  m = line.match(/^(ARTICLE|Article)\s+([IVXLCDM]{1,6}|\d{1,3}|[A-Z])(?![A-Za-z0-9])\.?\s*[-\u2013\u2014:.]?\s*(.*)$/);
  if (m && (m[1] === "ARTICLE" || !m[3].trim() || isHeadingish(m[3]))) {
    const rest = splitInlineHeading(m[3]);
    return {
      style: "article", structural: true, rank: 0, label: `Article ${m[2]}`, heading: rest.heading,
      headerOnly: rest.headerOnly, article: articleKey(m[2]),
    };
  }

  // Part I. / II. (upper roman with period at top level)
  m = line.match(/^([IVX]{1,5})\.\s+(\S.*)$/);
  if (m && romanToInt(m[1]) !== null && isHeadingish(m[2]) && !stackHas(ctx.stack, "upper-roman")) {
    return {
      style: "article", structural: true, rank: 0, label: `Part ${m[1]}`, heading: stripHeadingPunct(m[2]),
      headerOnly: true, article: articleKey(m[1]),
    };
  }

  // Section 5.2 / § 5.2
  m = line.match(/^(?:SECTION|Section|Sec\.|\u00A7)\s*(\d{1,3}(?:\.\d{1,3}){0,4})\.?(?=\s|$)\s*[-\u2013\u2014:]?\s*(.*)$/);
  if (m && (!m[2] || /^["\u201C(\[A-Z]/.test(m[2]))) {
    const num = m[1];
    const depth = num.split(".").length;
    const rest = splitInlineHeading(m[2]);
    return {
      style: "section", structural: true, rank: depth, label: depth === 1 ? `Section ${num}` : num,
      heading: rest.heading, headerOnly: rest.headerOnly, num,
    };
  }

  // 5. / 5.2 / 5.2.1 / 5)
  m = line.match(/^(\d{1,3}(?:\.\d{1,3}){0,4})(\.|\))?(?=\s|$)\s*(.*)$/);
  if (m) {
    const num = m[1];
    const depth = num.split(".").length;
    const rest = m[3];
    const okTerm = depth > 1 || !!m[2];
    const okRest = !rest || /^["\u201C(\[A-Z]/.test(rest);
    if (okTerm && okRest && (depth > 1 || parseInt(num, 10) <= 300)) {
      const r = splitInlineHeading(rest);
      return {
        style: "section", structural: true, rank: depth, label: depth === 1 ? `Section ${num}` : num,
        heading: r.heading, headerOnly: r.headerOnly, num,
      };
    }
  }

  // "Term" means ...
  m = line.match(DEF_STRICT_RE) ?? (ctx.inDefinitions ? line.match(DEF_LOOSE_RE) : null);
  if (m) {
    return { style: "definition", structural: false, rank: LIST_RANK, label: `"${m[1].trim()}"`, headerOnly: false };
  }

  // Recitals
  if (/^WHEREAS\b/i.test(line)) {
    return { style: "recital", structural: false, rank: LIST_RANK, label: `Recital ${ctx.nextRecital()}`, headerOnly: false };
  }
  if (/^NOW,?\s+THEREFORE\b/i.test(line)) {
    return { style: "recital", structural: false, rank: LIST_RANK, label: "Recitals (operative)", headerOnly: false };
  }

  // (a) / (iv) / (A) / (1)
  m = line.match(/^\(([a-z]{1,4}|[A-Z]{1,4}|\d{1,2})\)\s*(.*)$/);
  if (m) {
    const style = classifyEnum(m[1], ctx.stack);
    if (style) return enumMarker(style, m[1], m[2], true);
  }
  // a. / a) / iv. / A.
  m = line.match(/^([a-z]|[ivx]{2,5}|[A-Z])[.)]\s+(\S.*)$/);
  if (m && /^["\u201C(A-Za-z]/.test(m[2])) {
    const style = classifyEnum(m[1], ctx.stack);
    if (style) return enumMarker(style, m[1], m[2], false);
  }

  // Inline paragraph heading: "Confidentiality. Each party shall ..."
  if (ctx.strictStart) {
    m = line.match(/^([A-Z][\w'\u2019&\/-]*(?:\s+[\w'\u2019&\/-]+){0,6})\.\s+(?=["\u201C(A-Z])/);
    if (m && !ABBREVIATIONS.has(m[1]) && isTitleCase(m[1]) && words(m[1]).length <= 7) {
      return { style: "para-heading", structural: true, rank: SUBHEADING_RANK, label: m[1], heading: m[1], headerOnly: false };
    }
  }

  if (ctx.inSignature) return null;

  // ALL-CAPS heading line ("RECITALS", "LIMITATION OF LIABILITY")
  if (
    isAllCaps(line) &&
    words(line).length <= 12 &&
    line.length <= 100 &&
    !/[,;]$/.test(line) &&
    !/_{2,}/.test(line) &&
    (ctx.blankAfter || ctx.nextLine === null || !isAllCaps(ctx.nextLine))
  ) {
    const heading = stripHeadingPunct(line);
    return { style: "heading", structural: true, rank: 0, label: toTitle(heading), heading, headerOnly: true };
  }

  // Standalone Title Case heading line ("Definitions", "Governing Law")
  if (
    ctx.strictStart &&
    ctx.nextLine !== null &&
    words(line).length <= 8 &&
    !/[.;,]$/.test(line) &&
    isTitleCase(line.replace(/:$/, "")) &&
    !/_{2,}/.test(line)
  ) {
    const heading = stripHeadingPunct(line);
    return { style: "subheading", structural: true, rank: SUBHEADING_RANK, label: heading, heading, headerOnly: true };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

interface Block {
  start: number;
  end: number;
  path: string[];
  heading?: string;
  hasBody: boolean;
  keys: ClauseKeys;
}

interface Line {
  start: number;
  /** trimmed content offsets */
  cStart: number;
  cEnd: number;
  text: string; // trimmed
}

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  while (pos <= text.length) {
    let nl = text.indexOf("\n", pos);
    if (nl === -1) nl = text.length;
    const raw = text.slice(pos, nl);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    out.push({ start: pos, cStart: pos + lead, cEnd: pos + lead + trimmed.length, text: trimmed });
    pos = nl + 1;
  }
  return out;
}

function keysFor(stack: Marker[]): ClauseKeys {
  let ref: string | undefined;
  let article: string | undefined;
  let exhibit: string | undefined;
  for (const e of stack) {
    if (e.num) ref = e.num;
    else if (ref && ENUM_STYLES.has(e.style) && e.enumToken) ref += `(${e.enumToken})`;
    if (e.article) {
      article = e.article;
      ref = undefined;
    }
    if (e.exhibit) {
      exhibit = e.exhibit;
      article = undefined;
      ref = undefined;
    }
  }
  return { ref, article, exhibit };
}

function nearestHeading(stack: Marker[]): string | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].heading) return stack[i].heading;
  return undefined;
}

function endsAtBoundary(s: string): boolean {
  return /[.;:!?]["'\u201D\u2019)\]]*$/.test(s) || /[;,]\s*(?:and|or)$/i.test(s);
}

/** Returns the blocks plus the offsets of every marker line (so "ARTICLE II" headers are not read as cross-refs). */
function buildBlocks(text: string): { blocks: Block[]; markerStarts: Set<number> } {
  const lines = splitLines(text);
  const blocks: Block[] = [];
  const markerStarts = new Set<number>();
  let stack: Marker[] = [];
  let cur: Block | null = null;
  let curOwnHeading = false;
  let prev: Line | null = null;
  let blankSincePrev = false;
  let prevWasHeader = false;
  let inSignature = false;
  let recitals = 0;

  // Pre-compute next non-empty line + whether a blank line follows each line.
  const nextNonEmpty: Array<string | null> = new Array(lines.length).fill(null);
  const blankAfter: boolean[] = new Array(lines.length).fill(false);
  {
    let next: string | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      nextNonEmpty[i] = next;
      blankAfter[i] = i + 1 < lines.length && lines[i + 1].text === "";
      if (lines[i].text) next = lines[i].text;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.text) {
      blankSincePrev = true;
      continue;
    }
    const first = prev === null;
    const strictStart: boolean = first || blankSincePrev || prevWasHeader;
    const boundary: boolean = strictStart || (prev !== null && endsAtBoundary(prev.text));
    const inDefinitions = stack.some((e) => e.heading && /definition/i.test(e.heading));

    const marker: Marker | null = boundary
      ? detectMarker(line.text, {
          stack,
          strictStart,
          inSignature,
          inDefinitions,
          nextLine: nextNonEmpty[i],
          blankAfter: blankAfter[i],
          nextRecital: () => ++recitals,
        })
      : null;

    if (marker) {
      markerStarts.add(line.cStart);
      // A heading line right after a header-only marker names that marker ("ARTICLE V" / "CONFIDENTIALITY").
      const isHeadingLine = marker.style === "heading" || marker.style === "subheading";
      if (isHeadingLine && cur && !cur.hasBody && !curOwnHeading && stack.length) {
        const top = stack[stack.length - 1];
        top.heading = marker.heading;
        cur.heading = marker.heading;
        cur.end = line.cEnd;
        curOwnHeading = true;
        prevWasHeader = true;
        prev = line;
        blankSincePrev = false;
        continue;
      }

      // The very first heading of the document is its title: call it the preamble.
      if (isHeadingLine && blocks.length === 0) {
        marker.label = "Preamble";
        marker.isTitle = true;
        marker.rank = 0;
      }

      if (marker.style === "signature") inSignature = true;
      else if (marker.style === "exhibit" || marker.style === "article" || marker.style === "section") inSignature = false;

      stack = stack.filter((e) => !e.isTitle);
      if (marker.structural) {
        while (stack.length && stack[stack.length - 1].rank >= marker.rank) stack.pop();
      } else {
        const idx = stack.map((e) => e.style).lastIndexOf(marker.style);
        if (idx >= 0) stack = stack.slice(0, idx);
      }
      stack = [...stack, { ...marker }];

      cur = {
        start: line.cStart,
        end: line.cEnd,
        path: stack.map((e) => e.label),
        heading: nearestHeading(stack),
        hasBody: !marker.headerOnly,
        keys: keysFor(stack),
      };
      curOwnHeading = !!marker.heading;
      blocks.push(cur);
      prevWasHeader = marker.headerOnly;
    } else {
      if (!cur) {
        cur = { start: line.cStart, end: line.cEnd, path: ["Preamble"], hasBody: true, keys: {} };
        blocks.push(cur);
      }
      cur.end = line.cEnd;
      cur.hasBody = true;
      prevWasHeader = false;
    }
    prev = line;
    blankSincePrev = false;
  }
  return { blocks, markerStarts };
}

/** Fold header-only blocks ("ARTICLE 5 LICENSE") into their first child block. */
function mergeHeaderBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let pending: Block | null = null;
  for (const b of blocks) {
    if (pending) {
      const isChild =
        b.path.length > pending.path.length && pending.path.every((p, i) => b.path[i] === p);
      if (isChild) {
        b.start = pending.start;
        b.heading = b.heading ?? pending.heading;
      } else {
        out.push(pending);
      }
      pending = null;
    }
    if (!b.hasBody) pending = b;
    else out.push(b);
  }
  if (pending) out.push(pending);
  return out;
}

// ---------------------------------------------------------------------------
// Long-clause splitting
// ---------------------------------------------------------------------------

/** Relative offsets where a sentence (or paragraph) ends, i.e. candidate cut points. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /[.;:!?]["'\u201D\u2019)\]]*(?=\s+["'\u201C\u2018(\[A-Z0-9])|\n\s*\n/g;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (m[0].startsWith("\n")) {
      ends.push(idx);
      continue;
    }
    if (m[0][0] === ".") {
      const before = text.slice(Math.max(0, idx - 12), idx);
      const tok = before.match(/([A-Za-z.]+)$/)?.[1] ?? "";
      if (ABBREVIATIONS.has(tok) || /^[A-Z]$/.test(tok) || /\.[A-Za-z]$/.test(tok)) continue; // Inc. / J. / U.S.
      if (/\d$/.test(before) && /^\.\d/.test(text.slice(idx, idx + 2))) continue; // 5.2
    }
    ends.push(idx + m[0].length);
  }
  return ends;
}

function splitSpan(text: string, start: number, end: number): Array<[number, number]> {
  const len = end - start;
  if (len <= MAX_CLAUSE_CHARS) return [[start, end]];
  const local = text.slice(start, end);
  const ends = sentenceEnds(local);
  const out: Array<[number, number]> = [];
  let s = 0;
  while (local.length - s > MAX_CLAUSE_CHARS) {
    const remaining = local.length - s;
    const pieces = Math.ceil(remaining / MAX_CLAUSE_CHARS);
    const target = s + remaining / pieces;
    const candidates = ends.filter((e) => e > s + MIN_SPLIT_CHARS && e <= s + MAX_CLAUSE_CHARS);
    let cut: number;
    if (candidates.length) {
      cut = candidates.reduce((best, e) => (Math.abs(e - target) < Math.abs(best - target) ? e : best));
    } else {
      const ws = local.lastIndexOf(" ", s + MAX_CLAUSE_CHARS);
      cut = ws > s + MIN_SPLIT_CHARS ? ws : s + MAX_CLAUSE_CHARS;
    }
    const pieceEnd = s + local.slice(s, cut).trimEnd().length;
    out.push([start + s, start + pieceEnd]);
    s = cut;
    while (s < local.length && /\s/.test(local[s])) s++;
  }
  if (s < local.length) out.push([start + s, start + s + local.slice(s).trimEnd().length]);
  return out;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/**
 * Split a document into clauses along its natural hierarchy. Pure and deterministic.
 * Invariant: `doc.text.slice(c.start, c.end) === c.text` for every clause, clauses are
 * ordered and non-overlapping, and only whitespace lies between consecutive clauses.
 */
export function structureDocument(doc: SourceDocument): Clause[] {
  const text = doc.text;
  const built = buildBlocks(text);
  const blocks = mergeHeaderBlocks(built.blocks);

  const spans: Array<{ start: number; end: number; block: Block }> = [];
  for (const b of blocks) {
    for (const [s, e] of splitSpan(text, b.start, b.end)) {
      if (e > s) spans.push({ start: s, end: e, block: b });
    }
  }

  const clauses: Clause[] = spans.map((sp, i) => {
    const t = text.slice(sp.start, sp.end);
    return {
      id: `${doc.id}:c_${i + 1}`,
      docId: doc.id,
      path: [...sp.block.path],
      ...(sp.block.heading ? { heading: sp.block.heading } : {}),
      text: t,
      start: sp.start,
      end: sp.end,
      category: "Other",
      categoryConfidence: 0,
      definedTerms: extractDefinedTerms(t),
      references: [],
      isException: isExceptionText(t),
    };
  });

  linkReferences(clauses, spans.map((s) => s.block.keys), built.markerStarts);
  return clauses;
}

function linkReferences(clauses: Clause[], keys: ClauseKeys[], markerStarts: Set<number>): void {
  const resolver = new RefResolver(keys);
  const refs: string[][] = clauses.map(() => []);
  const add = (i: number, id: string) => {
    if (clauses[i].id !== id && !refs[i].includes(id)) refs[i].push(id);
  };

  // 1. Explicit cross-references (+ reverse links from exceptions to the clause they carve out of).
  const reverse: Array<Array<number>> = clauses.map(() => []);
  clauses.forEach((c, i) => {
    for (const r of extractRefs(c.text)) {
      if (markerStarts.has(c.start + r.index)) continue; // the clause's own "ARTICLE II" / "Section 5" label
      for (const j of resolver.resolve(r)) {
        add(i, clauses[j].id);
        if (r.exception && j !== i && !reverse[j].includes(i)) reverse[j].push(i);
      }
    }
  });

  // 2. Uses of defined terms -> the defining clause.
  const definer = new Map<string, number>();
  clauses.forEach((c, i) => {
    for (const t of c.definedTerms) if (!definer.has(t) && !UBIQUITOUS_TERMS.has(t)) definer.set(t, i);
  });
  if (definer.size) {
    const terms = [...definer.keys()].sort((a, b) => b.length - a.length);
    const termRe = new RegExp(`(?<![\\w-])(${terms.map(escapeRe).join("|")})(?:s|es|'s|\u2019s)?(?![\\w-])`, "g");
    const uses: Array<Set<string>> = clauses.map((c) => {
      const found = new Set<string>();
      for (const m of c.text.matchAll(termRe)) found.add(m[1]);
      return found;
    });
    // Skip preamble-defined terms used nearly everywhere (party aliases such as "Licensee").
    const usage = new Map<string, number>();
    uses.forEach((s) => s.forEach((t) => usage.set(t, (usage.get(t) ?? 0) + 1)));
    const ubiquitous = (t: string) => {
      const j = definer.get(t);
      if (j === undefined || clauses[j].path[0] !== "Preamble") return false;
      return (usage.get(t) ?? 0) > Math.max(3, clauses.length * 0.35);
    };
    uses.forEach((s, i) => {
      for (const t of s) {
        const j = definer.get(t);
        if (j === undefined || j === i || ubiquitous(t) || clauses[i].definedTerms.includes(t)) continue;
        add(i, clauses[j].id);
      }
    });
  }

  // 3. Exceptions are attached to the clause they modify.
  reverse.forEach((from, j) => from.forEach((i) => add(j, clauses[i].id)));

  clauses.forEach((c, i) => {
    c.references = refs[i];
  });
}

/**
 * Check structural invariants. Returns a list of problems (empty = OK).
 * Used by the self-test; cheap enough to run in production as a guard.
 */
export function checkClauses(doc: SourceDocument, clauses: Clause[]): string[] {
  const problems: string[] = [];
  let pos = 0;
  const ids = new Set<string>();
  for (const c of clauses) {
    if (ids.has(c.id)) problems.push(`${c.id}: duplicate id`);
    ids.add(c.id);
    if (doc.text.slice(c.start, c.end) !== c.text) problems.push(`${c.id}: text does not match offsets`);
    if (c.start < pos) problems.push(`${c.id}: overlaps previous clause`);
    const gap = doc.text.slice(pos, c.start);
    if (gap.trim()) problems.push(`${c.id}: non-whitespace gap before clause: ${JSON.stringify(gap.slice(0, 60))}`);
    if (!c.text.trim()) problems.push(`${c.id}: empty clause`);
    if (c.text !== c.text.trim()) problems.push(`${c.id}: clause has surrounding whitespace`);
    if (c.text.length > MAX_CLAUSE_CHARS) problems.push(`${c.id}: longer than ${MAX_CLAUSE_CHARS} chars`);
    for (const r of c.references) if (r === c.id) problems.push(`${c.id}: self reference`);
    pos = c.end;
  }
  const tail = doc.text.slice(pos);
  if (tail.trim()) problems.push(`non-whitespace tail after last clause: ${JSON.stringify(tail.slice(0, 60))}`);
  const all = new Set(clauses.map((c) => c.id));
  for (const c of clauses) for (const r of c.references) if (!all.has(r)) problems.push(`${c.id}: dangling reference ${r}`);
  return problems;
}
