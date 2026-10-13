/**
 * Clause-level text analysis: defined terms, exception language, and
 * cross-reference extraction/resolution. Pure functions, no I/O.
 */

const OPEN_Q = `"\u201C`;
const CLOSE_Q = `"\u201D`;
const QUOTED = `[${OPEN_Q}]([^${OPEN_Q}${CLOSE_Q}\\n]{1,80}?)[${CLOSE_Q}]`;

const MEANS_RE = new RegExp(
  `${QUOTED}\\s*(?:\\([^()\\n]{0,80}\\)\\s*)?,?\\s*(?:shall\\s+mean|means|mean|shall\\s+have\\s+the\\s+meanings?|has\\s+the\\s+meanings?|have\\s+the\\s+meanings?|shall\\s+include|includes|refers\\s+to|is\\s+defined\\s+as)\\b`,
  "g",
);
/** `referred to herein as a "Party"`, `collectively as the "Parties"`, `hereinafter "Buyer"` */
const AS_RE = new RegExp(
  `\\b(?:referred\\s+to|known|hereinafter|collectively|individually|together|jointly)\\b[^.${OPEN_Q}${CLOSE_Q}\\n]{0,40}?(?:\\bas\\s+|\\bhereinafter\\s+)(?:the\\s+|a\\s+|an\\s+)?${QUOTED}`,
  "g",
);
const PAREN_RE = /\(([^()]{1,240})\)/g;
const QUOTED_RE = new RegExp(QUOTED, "g");
/** Words allowed inside a defining parenthetical besides the quoted terms. */
const PAREN_FILLER = new Set([
  "the", "each", "a", "an", "collectively", "together", "individually", "jointly", "severally",
  "and", "or", "hereinafter", "hereafter", "referred", "to", "as", "herein", "also", "called",
  "respectively", "its", "any", "such", "being", "known", "defined", "below", "hereunder",
  "with", "in", "this", "agreement", "which", "is", "are", "may", "be", "all", "of", "them",
]);

function cleanTerm(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().replace(/[,;:]+$/, "");
  if (!t || t.length > 60) return null;
  if (t.split(" ").length > 8) return null;
  if (!/^[A-Z0-9]/.test(t)) return null;
  return t;
}

/** Terms this text defines: `"Term" means`, `"Term" shall mean`, `(the "Term")`, etc. */
export function extractDefinedTerms(text: string): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const t = cleanTerm(raw);
    if (t && !out.includes(t)) out.push(t);
  };

  for (const m of text.matchAll(MEANS_RE)) add(m[1]);
  for (const m of text.matchAll(AS_RE)) add(m[1]);

  for (const m of text.matchAll(PAREN_RE)) {
    const inner = m[1];
    const terms = [...inner.matchAll(QUOTED_RE)].map((q) => q[1]);
    if (terms.length === 0) continue;
    const rest = inner
      .replace(QUOTED_RE, " ")
      .toLowerCase()
      .split(/[\s,;:]+/)
      .filter(Boolean);
    if (rest.every((w) => PAREN_FILLER.has(w))) terms.forEach(add);
  }
  return out;
}

const EXCEPTION_RE =
  /\b(?:except(?:ing|ions?)?|notwithstanding|subject\s+to|provided,?\s+(?:however,?\s+)?that|unless)\b/i;
/** Trailing exception keyword within ~100 chars before a cross-reference. */
const EXCEPTION_BEFORE_RE =
  /\b(?:except(?:ing)?|notwithstanding|subject\s+to|provided,?\s+(?:however,?\s+)?that|unless|other\s+than|exclusive\s+of)\b[^.;]{0,100}$/i;

export function isExceptionText(text: string): boolean {
  return EXCEPTION_RE.test(text);
}

export type RefKind = "section" | "article" | "exhibit";

export interface RawRef {
  kind: RefKind;
  /** for section: "4.2", for article: "5" (roman converted), for exhibit: "exhibit:a" */
  base: string;
  /** enumerator suffixes, e.g. ["b", "i"] for 4.2(b)(i) */
  parens: string[];
  /** true when an exception keyword precedes the reference ("Notwithstanding Section 5") */
  exception: boolean;
  /** offset of the match within the analysed text */
  index: number;
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export function romanToInt(s: string): number | null {
  const u = s.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(u)) return null;
  let total = 0;
  for (let i = 0; i < u.length; i++) {
    const v = ROMAN[u[i]];
    const next = ROMAN[u[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total > 0 && total < 4000 ? total : null;
}

/** Normalise an article token (roman, arabic or letter) to a comparable key. */
export function articleKey(token: string): string {
  if (/^\d+$/.test(token)) return String(parseInt(token, 10));
  const r = romanToInt(token);
  return r !== null ? String(r) : token.toUpperCase();
}

const KEYWORDS =
  "Sections?|SECTIONS?|sections?|Clauses?|CLAUSES?|clauses?|Paragraphs?|paragraphs?|Articles?|ARTICLES?|articles?|Exhibits?|EXHIBITS?|exhibits?|Schedules?|SCHEDULES?|schedules?|Annex(?:es)?|ANNEX(?:ES)?|annex(?:es)?|Appendi(?:x|ces)|APPENDI(?:X|CES)|appendi(?:x|ces)|Attachments?|ATTACHMENTS?";
const REF_BASE = "(?:\\d{1,3}(?:\\.\\d{1,3}){0,4}|[IVXLCDM]{1,6}(?![A-Za-z])|[A-Z](?![A-Za-z]))";
const REF_TOKEN = `${REF_BASE}(?:\\s?\\([a-zA-Z0-9]{1,4}\\))*`;
const REF_RE = new RegExp(
  `(?:\\b(${KEYWORDS})\\s+|(\u00A7\u00A7?)\\s*)(${REF_TOKEN}(?:\\s*(?:,|and|or|through|to|-|\\u2013)\\s*(?:${REF_TOKEN}))*)`,
  "g",
);
const ITEM_RE = new RegExp(`(${REF_BASE})((?:\\s?\\([a-zA-Z0-9]{1,4}\\))*)`, "g");

function kindOf(keyword: string): RefKind {
  const k = keyword.toLowerCase();
  if (k.startsWith("article")) return "article";
  if (k.startsWith("section") || k.startsWith("clause") || k.startsWith("paragraph") || k.startsWith("\u00A7"))
    return "section";
  return "exhibit";
}

function exhibitPrefix(keyword: string): string {
  const k = keyword.toLowerCase();
  if (k.startsWith("schedule")) return "schedule";
  if (k.startsWith("annex")) return "annex";
  if (k.startsWith("appendi")) return "appendix";
  if (k.startsWith("attachment")) return "attachment";
  return "exhibit";
}

/** Extract cross-references like "Section 5", "Article III", "clause 4.2(b)", "Sections 5.1 and 5.2". */
export function extractRefs(text: string): RawRef[] {
  const out: RawRef[] = [];
  for (const m of text.matchAll(REF_RE)) {
    const keyword = m[1] ?? m[2];
    const kind = kindOf(keyword);
    const index = m.index ?? 0;
    const before = text.slice(Math.max(0, index - 120), index);
    const exception = EXCEPTION_BEFORE_RE.test(before);
    for (const item of m[3].matchAll(ITEM_RE)) {
      const token = item[1];
      const parens = [...item[2].matchAll(/\(([a-zA-Z0-9]{1,4})\)/g)].map((p) => p[1]);
      if (kind === "section") {
        if (!/^\d/.test(token)) continue; // "Section A" is not a numbered section
        out.push({ kind, base: token.replace(/\.$/, ""), parens, exception, index });
      } else if (kind === "article") {
        out.push({ kind, base: articleKey(token), parens, exception, index });
      } else {
        out.push({ kind, base: `${exhibitPrefix(keyword)}:${token.toUpperCase()}`, parens, exception, index });
      }
    }
  }
  return out;
}

/** Structural keys of a clause, used to resolve cross-references to clause indices. */
export interface ClauseKeys {
  /** numeric section key incl. enumerators, e.g. "5.2(a)(i)" */
  ref?: string;
  /** article number key, e.g. "5" */
  article?: string;
  /** exhibit key, e.g. "exhibit:A" */
  exhibit?: string;
}

const MAX_TARGETS_PER_REF = 12;

export class RefResolver {
  private readonly keys: ClauseKeys[];

  constructor(keys: ClauseKeys[]) {
    this.keys = keys;
  }

  private collect(pred: (k: ClauseKeys) => "exact" | "desc" | null): number[] {
    const exact: number[] = [];
    const desc: number[] = [];
    this.keys.forEach((k, i) => {
      const r = pred(k);
      if (r === "exact") exact.push(i);
      else if (r === "desc") desc.push(i);
    });
    return [...exact, ...desc].slice(0, MAX_TARGETS_PER_REF);
  }

  private bySection(key: string): number[] {
    return this.collect((k) => {
      if (!k.ref) return null;
      if (k.ref === key) return "exact";
      if (k.ref.startsWith(key + ".") || k.ref.startsWith(key + "(")) return "desc";
      return null;
    });
  }

  private byArticle(key: string): number[] {
    return this.collect((k) => (k.article === key ? "exact" : null));
  }

  private byExhibit(key: string): number[] {
    return this.collect((k) => (k.exhibit === key ? "exact" : null));
  }

  resolve(ref: RawRef): number[] {
    if (ref.kind === "section") {
      // Try the most specific key first, then drop enumerators one by one.
      for (let n = ref.parens.length; n >= 0; n--) {
        const key = ref.base + ref.parens.slice(0, n).map((p) => `(${p})`).join("");
        const hits = this.bySection(key);
        if (hits.length) return hits;
      }
      // "Section 5" in a document whose top level is "Article 5".
      if (/^\d+$/.test(ref.base)) return this.byArticle(ref.base);
      return [];
    }
    if (ref.kind === "article") {
      const hits = this.byArticle(ref.base);
      if (hits.length) return hits;
      return /^\d+$/.test(ref.base) ? this.bySection(ref.base) : [];
    }
    return this.byExhibit(ref.base);
  }
}

/** Escape a string for use inside a RegExp. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Defined terms that are used almost everywhere and add no signal as links. */
export const UBIQUITOUS_TERMS = new Set(["Agreement", "This Agreement", "Party", "Parties"]);
