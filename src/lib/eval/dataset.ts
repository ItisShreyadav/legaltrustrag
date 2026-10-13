/**
 * ContractConflict: clause pairs built from CUAD with known NLI labels (gap 8).
 *
 *   contradict     real clause + minimally edited twin (`makeContradictoryTwin`: modal flip,
 *                  number change, negation)
 *   exception      real clause + synthetic carve-out built from the clause's own subject
 *                  ("Notwithstanding the foregoing, the requirement that X shall Y shall not apply to Z.")
 *   agree          real clause + light paraphrase (fixed synonym swaps, conditional reordering;
 *                  numbers, modals and negations are guaranteed unchanged)
 *   not_mentioned  two real clauses from different contracts and unrelated category families
 *
 * Everything is deterministic for a given seed.
 */
import { CONFLICT_PAIRS } from "@/lib/types";
import type { CuadCategory, NliLabel } from "@/lib/types";
import { makeContradictoryTwin } from "@/lib/engine";
import type { CuadClause } from "./cuad";
import { Rng } from "./rng";

export type ConflictSource = "twin" | "carveout" | "paraphrase" | "unrelated";

export interface ConflictRecord {
  id: string;
  contractId: string;
  category: CuadCategory;
  clauseA: string;
  clauseB: string;
  label: NliLabel;
  source: ConflictSource;
  /** Human-readable description of how clauseB was derived from clauseA. */
  edit?: string;
  /** twin: number | modal | negation; paraphrase: synonym | reorder | synonym+reorder; carveout: specific | generic */
  editType?: string;
  /** not_mentioned only: provenance of clauseB. */
  contractIdB?: string;
  categoryB?: CuadCategory;
  /** Raw CUAD span of clauseA [start, end). */
  spanA?: [number, number];
}

export const LABELS: readonly NliLabel[] = ["contradict", "exception", "agree", "not_mentioned"];
export const SOURCE_FOR_LABEL: Record<NliLabel, ConflictSource> = {
  contradict: "twin",
  exception: "carveout",
  agree: "paraphrase",
  not_mentioned: "unrelated",
};
export const DEFAULT_MIX: Record<NliLabel, number> = { contradict: 0.35, exception: 0.2, agree: 0.25, not_mentioned: 0.2 };

// ---------------------------------------------------------------------------
// Clause pool
// ---------------------------------------------------------------------------

/** Metadata categories whose spans are names/dates rather than clauses. */
const SKIP_CATEGORIES = new Set<CuadCategory>(["Document Name", "Parties", "Agreement Date", "Effective Date"]);

export const MIN_CLAUSE_CHARS = 80;
export const MAX_CLAUSE_CHARS = 1100;

/** A CUAD span that reads like an operative clause of reasonable length. */
export function isUsableClause(c: CuadClause): boolean {
  const len = c.text.length;
  if (len < MIN_CLAUSE_CHARS || len > MAX_CLAUSE_CHARS) return false;
  if (SKIP_CATEGORIES.has(c.category)) return false;
  const letters = c.text.replace(/[^A-Za-z]/g, "").length;
  if (letters / len < 0.6) return false;
  if (!/[a-z]{3}/.test(c.text)) return false; // all-caps headings
  return /\b(shall|will|may|must|is|are|agrees?|has|have|grants?|be)\b/i.test(c.text);
}

export function clausePool(clauses: readonly CuadClause[]): CuadClause[] {
  const seen = new Set<string>();
  const out: CuadClause[] = [];
  for (const c of clauses) {
    if (!isUsableClause(c)) continue;
    const key = c.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diff helper
// ---------------------------------------------------------------------------

export interface DiffRegion {
  start: number;
  oldText: string;
  newText: string;
}

/** The single changed region between `a` and `b`, widened to whole words. */
export function diffRegion(a: string, b: string): DiffRegion {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  let endA = a.length - s;
  while (p > 0 && /\w/.test(a[p - 1])) p--;
  while (endA < a.length && /\w/.test(a[endA])) endA++;
  const opens = (t: string) => (t.match(/\(/g) ?? []).length - (t.match(/\)/g) ?? []).length;
  if (opens(a.slice(p, endA)) > 0 && a[endA] === ")") endA++;
  const endB = b.length - (a.length - endA);
  return { start: p, oldText: a.slice(p, endA), newText: b.slice(p, endB) };
}

// ---------------------------------------------------------------------------
// (a) contradictory twins
// ---------------------------------------------------------------------------

export type TwinEdit = "number" | "modal" | "negation";

const NUMBER_WORDS =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|fifteen|twenty|thirty|forty|forty-five|sixty|ninety|hundred)\b/i;
const MONTH_BEFORE = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*$/i;

function classifyTwin(d: DiffRegion): TwinEdit {
  const both = `${d.oldText} ${d.newText}`;
  if (/\d/.test(both) || NUMBER_WORDS.test(both)) return "number";
  if (/\b(shall|must|may|will|can|cannot|should)\b/i.test(both)) return "modal";
  return "negation";
}

/** Reference lists such as "Sections 7, 9 and 10" or "Sections 2(a), 2(b)" right before the number. */
const REF_LIST_BEFORE =
  /\b(?:sections?|articles?|attachments?|schedules?|exhibits?|annex(?:es)?|appendix|appendices|paragraphs?|clauses?|items?|parts?|rules?)\s+(?:[\dA-Za-z.()]+(?:,\s*|\s+(?:and|or|through|to)\s+))*$/i;

/** True when the edited number is a quantity (amount, period, percentage), not a date, citation or reference. */
function isQuantityEdit(text: string, d: DiffRegion): boolean {
  const before = text.slice(Math.max(0, d.start - 60), d.start);
  const after = text.slice(d.start + d.oldText.length);
  if (MONTH_BEFORE.test(before.slice(-14))) return false; // "December 31"
  if (/^(st|nd|rd|th)\b/i.test(after)) return false; // "31st"
  if (/\d{1,2}\/\d{1,2}/.test(d.oldText)) return false; // 12/31
  if (REF_LIST_BEFORE.test(before)) return false; // "Sections 7, 9 and 10", "Attachment 6"
  if (/^\([a-z0-9]{1,4}\)/i.test(after)) return false; // "2(b)"
  if (/^\s*U\.\s?S\.\s?C/i.test(after) || /^\s*C\.\s?F\.\s?R/i.test(after)) return false; // "17 U.S.C."
  if (/^\.\s*\d/.test(after) || /\d\.\s*$/.test(before)) return false; // "8. 3. 1."
  if (/\w-$/.test(before) || /\/$/.test(before)) return false; // "bw-3", "Section 7-101", "No/100"
  return true;
}

export interface Twin {
  text: string;
  editType: TwinEdit;
  edit: string;
}

/**
 * Contradictory twin of `text` via `makeContradictoryTwin`, preferring `prefer`, with quality
 * filters: no edits inside dates ("December 31" -> "December 62"), no "as the case may be",
 * no "shall not be unreasonably withheld" -> "shall be unreasonably withheld", edits kept short.
 */
export function twinFor(text: string, prefer: TwinEdit): Twin | null {
  const out = makeContradictoryTwin(text, { prefer });
  if (!out || out === text) return null;
  const d = diffRegion(text, out);
  if (d.oldText.length > 60 || d.newText.length > 60) return null;
  const ctx = text.slice(Math.max(0, d.start - 40), d.start + d.oldText.length + 40);
  if (/as the case may be/i.test(ctx)) return null;
  if (/unreasonably\s+(withheld|delayed|conditioned)/i.test(ctx)) return null;
  const editType = classifyTwin(d);
  // Inserting "not" after a "no ..." subject gives a double negative, not a clean contradiction.
  if (/\bnot\b/.test(d.newText) && !/\bnot\b/.test(d.oldText) && /\b(no|neither|nor|nothing|none)\b[^.;]{0,60}$/i.test(text.slice(0, d.start))) {
    return null;
  }
  if (editType === "number" && !isQuantityEdit(text, d)) return null;
  return { text: out, editType, edit: `${editType}: "${d.oldText}" -> "${d.newText}"` };
}

// ---------------------------------------------------------------------------
// (b) carve-outs
// ---------------------------------------------------------------------------

type Family = "term" | "license" | "ip" | "competition" | "assignment" | "liability" | "commercial" | "law" | "other";

export const CATEGORY_FAMILY: Record<CuadCategory, Family> = {
  "Document Name": "other",
  Parties: "other",
  "Agreement Date": "term",
  "Effective Date": "term",
  "Expiration Date": "term",
  "Renewal Term": "term",
  "Notice Period To Terminate Renewal": "term",
  "Termination For Convenience": "term",
  "Post-Termination Services": "term",
  "Governing Law": "law",
  "Most Favored Nation": "commercial",
  "Non-Compete": "competition",
  Exclusivity: "competition",
  "No-Solicit Of Customers": "competition",
  "Competitive Restriction Exception": "competition",
  "No-Solicit Of Employees": "competition",
  "Non-Disparagement": "competition",
  "Rofr/Rofo/Rofn": "competition",
  "Change Of Control": "assignment",
  "Anti-Assignment": "assignment",
  "Third Party Beneficiary": "assignment",
  "Revenue/Profit Sharing": "commercial",
  "Price Restrictions": "commercial",
  "Minimum Commitment": "commercial",
  "Volume Restriction": "commercial",
  "Audit Rights": "commercial",
  "Ip Ownership Assignment": "ip",
  "Joint Ip Ownership": "ip",
  "Covenant Not To Sue": "ip",
  "License Grant": "license",
  "Non-Transferable License": "license",
  "Affiliate License-Licensor": "license",
  "Affiliate License-Licensee": "license",
  "Unlimited/All-You-Can-Eat-License": "license",
  "Irrevocable Or Perpetual License": "license",
  "Source Code Escrow": "license",
  "Uncapped Liability": "liability",
  "Cap On Liability": "liability",
  "Liquidated Damages": "liability",
  "Warranty Duration": "liability",
  Insurance: "liability",
  Other: "other",
};

const SCOPES: Record<Family | "generic", string[]> = {
  generic: [
    "to any Affiliate of either party",
    "with respect to any transaction entered into before the Effective Date",
    "to the extent compliance would violate applicable law or a court order",
    "to any successor in interest following a merger or acquisition",
    "with respect to activities conducted outside the Territory",
    "during any period in which a Force Majeure Event is continuing",
  ],
  term: [
    "to any Statement of Work or purchase order then in effect, which shall continue until completed",
    "to obligations that by their nature are intended to survive the end of this Agreement",
  ],
  license: [
    "to sublicenses granted by the licensee to its Affiliates",
    "to use of the licensed materials solely for internal evaluation and testing",
    "to open source components, which are governed by their own license terms",
  ],
  ip: [
    "to any Intellectual Property owned or developed by a party before the Effective Date",
    "to improvements developed solely by one party without use of the other party's Confidential Information",
  ],
  competition: [
    "to general solicitations or advertisements that are not specifically directed at the other party's employees or customers",
    "to products or services that do not compete with the Products",
    "to any business acquired by a party after the Effective Date",
  ],
  assignment: [
    "to an assignment to an Affiliate or to a successor in connection with a merger, acquisition or sale of all or substantially all of the assets of the assigning party",
    "to a transfer resulting from a change in the ownership of a publicly traded parent company",
  ],
  liability: [
    "to claims arising from a party's gross negligence, fraud or willful misconduct",
    "to a party's indemnification obligations under this Agreement",
    "to any breach of the confidentiality obligations of this Agreement",
  ],
  commercial: [
    "to any calendar quarter in which a Force Majeure Event prevents performance",
    "to orders placed by Affiliates of the purchasing party",
    "to promotional units provided free of charge",
  ],
  law: [
    "to claims for injunctive or other equitable relief, which may be brought in any court of competent jurisdiction",
    "to disputes concerning the validity of a party's Intellectual Property",
  ],
  other: [],
};

/** Category-specific scopes that read better than the family list. */
const CATEGORY_SCOPES: Partial<Record<CuadCategory, string[]>> = {
  "Warranty Duration": [
    "to Products that have been modified, misused or repaired by anyone other than the Company",
    "to defects caused by accident, abuse or use contrary to the Documentation",
  ],
  Insurance: [
    "during any period in which the party maintains an equivalent program of self-insurance approved in writing by the other party",
    "to coverage that is not commercially available on reasonable terms",
  ],
  "Liquidated Damages": [
    "to any delay caused by a Force Majeure Event",
    "to any delay caused by the other party's failure to perform its obligations",
  ],
  "Audit Rights": [
    "to records older than three (3) years",
    "to information subject to confidentiality obligations owed to third parties",
  ],
  "Governing Law": SCOPES.law,
  "No-Solicit Of Employees": [
    "to general solicitations or advertisements that are not specifically directed at the other party's employees",
    "to any person whose employment with the other party ended at least six (6) months earlier",
  ],
  "No-Solicit Of Customers": [
    "to general advertisements that are not specifically directed at the other party's customers",
    "to customers with whom a party had a documented business relationship before the Effective Date",
  ],
  "Non-Compete": SCOPES.competition.slice(1),
  Exclusivity: SCOPES.competition.slice(1),
  "Competitive Restriction Exception": SCOPES.competition.slice(1),
  "Non-Disparagement": [
    "to truthful statements made in legal proceedings or as required by law",
    "to statements made in the ordinary course of comparative advertising permitted by law",
  ],
  "Rofr/Rofo/Rofn": ["to any transfer to an Affiliate", "to any transaction approved in writing by the holder of the right"],
  "Covenant Not To Sue": [
    "to proceedings to enforce the terms of this Agreement",
    "to claims of infringement of patents issued after the Effective Date",
  ],
  "Source Code Escrow": ["to Software that is no longer supported by the licensor", "to minor updates and bug-fix releases"],
  "Most Favored Nation": ["to prices offered under a government contract", "to one-time promotional discounts"],
};

/** Families whose scope list fits every category in them; others use CATEGORY_SCOPES or generic scopes. */
const FAMILY_SCOPES_FIT = new Set<Family>(["term", "license", "ip", "assignment", "liability", "commercial", "law"]);

/** Words that may precede a party name (clause boundary); anything else (e.g. "of", "to") means we are mid-phrase. */
const PARTY_BOUNDARY = new Set(["that", "which", "who", "and", "or", "but", "if", "unless", "when", "then", "where", "so", "thereafter", "hereby", "also"]);
const DETERMINERS = /^(each|either|neither|the|such|any|no|all)$/i;
const TRAILING_JUNK =
  /[\s,]+(and|or|the|to|of|with|for|in|by|a|an|any|such|that|which|as|on|at|from|in accordance|pursuant|according|subject|prior|due|in respect|on behalf|in connection|in relation|by reason|as a result|in excess|in lieu|instead|including)$/i;

interface Subject {
  party: string;
  modal: string;
  negated: boolean;
  vp: string;
}

/** A short party noun phrase ending right before the modal: [determiner] + 1-3 capitalised tokens (or "party"). */
function partyBefore(before: string): string | null {
  const tokens = before.trim().split(/\s+/).filter(Boolean);
  const name: string[] = [];
  let i = tokens.length - 1;
  for (; i >= 0 && name.length < 3; i--) {
    const t = tokens[i];
    if (!/^[A-Z][\w/&'\u2019.-]*$/.test(t) && !/^(party|parties)$/i.test(t)) break;
    name.unshift(t);
  }
  if (name.length === 0) return null;
  if (i >= 0 && DETERMINERS.test(tokens[i])) name.unshift(tokens[i--].toLowerCase());
  else if (name.length === 1 && /^(party|parties)$/i.test(name[0])) return null;
  if (i >= 0) {
    const prev = tokens[i];
    const boundary = /[,;:)]$/.test(prev) || PARTY_BOUNDARY.has(prev.toLowerCase());
    if (!boundary) return null;
  }
  if (/^(It|They|He|She|This|That|These|Those|Such)$/.test(name[name.length - 1])) return null;
  const text = name.join(" ");
  return /^(The|This|That|Each|Either|Neither|Such|Any|No|All) /.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** Verb phrases must start with a verb, not an adverbial ("during the Term, ..."). */
const NOT_A_VERB = /^(during|for|in|at|on|within|upon|after|before|from|to|by|with|without|as|if|unless|until|subject|following|prior|thereafter|then|also|only|either|both|not|thereupon|forthwith|promptly|immediately|directly|indirectly|at)\b/i;

function balanced(s: string): boolean {
  const open = (s.match(/\(/g) ?? []).length;
  const close = (s.match(/\)/g) ?? []).length;
  const quotes = (s.match(/["\u201c\u201d]/g) ?? []).length;
  const brackets = (s.match(/\[/g) ?? []).length === (s.match(/\]/g) ?? []).length;
  return open === close && quotes % 2 === 0 && brackets;
}

/** Shorten a verb phrase at a clean boundary (comma, "and", "or"); null if no clean cut exists. */
function trimVerbPhrase(raw: string): string | null {
  let vp = raw.split(/,\s*(?:provided|except|unless|subject|notwithstanding|including)\b/i)[0].replace(/[\s,]+$/, "");
  const MAX = 130;
  if (vp.length > MAX) {
    const comma = vp.lastIndexOf(",", MAX);
    const conj = Math.max(vp.lastIndexOf(" and ", MAX), vp.lastIndexOf(" or ", MAX));
    const cut = comma >= 30 ? comma : conj >= 30 ? conj : -1;
    if (cut < 0) return null;
    vp = vp.slice(0, cut);
  }
  vp = vp.replace(/[\s,]+$/, "");
  while (TRAILING_JUNK.test(vp)) vp = vp.replace(TRAILING_JUNK, "");
  if (!balanced(vp)) {
    const paren = vp.lastIndexOf("(");
    if (paren >= 30) vp = vp.slice(0, paren).replace(/[\s,]+$/, "");
    while (TRAILING_JUNK.test(vp)) vp = vp.replace(TRAILING_JUNK, "");
    if (!balanced(vp)) return null;
  }
  return vp.length >= 10 ? vp : null;
}

/** First "<Party> shall|will|must|may [not] <verb phrase>" in the clause. */
export function extractSubject(text: string): Subject | null {
  const re = /\b(shall|will|must|may)\s+(not\b,?\s*)?([a-z][^.;:]{10,})/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(0, m.index).split(/(?<=[.;:])\s+/).pop() ?? "";
    const party = partyBefore(before);
    if (!party) continue;
    if (NOT_A_VERB.test(m[3])) continue;
    const vp = trimVerbPhrase(m[3]);
    if (!vp) continue;
    return { party, modal: m[1], negated: Boolean(m[2]), vp };
  }
  return null;
}

function subjectPhrase(s: Subject): string {
  if (s.modal === "may" && !s.negated) {
    return /^be\b/.test(s.vp) ? `the provision that ${s.party} may ${s.vp}` : `the right of ${s.party} to ${s.vp}`;
  }
  const noun = s.negated ? "the restriction that" : "the requirement that";
  return `${noun} ${s.party} ${s.modal}${s.negated ? " not" : ""} ${s.vp}`;
}

const GENERIC_SUBJECT: Record<Family, string> = {
  term: "the term and termination provisions above",
  license: "the license terms above",
  ip: "the intellectual property provisions above",
  competition: "the foregoing restrictions",
  assignment: "the foregoing assignment provisions",
  liability: "the foregoing limitations",
  commercial: "the foregoing commercial terms",
  law: "the foregoing choice of law",
  other: "the foregoing provisions",
};

export interface Carveout {
  text: string;
  subject: string;
  scope: string;
  specific: boolean;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Synthetic carve-out of `text`. `anchor` names what it overrides ("the foregoing",
 * "Section 4 of the Agreement"); default: a template-dependent phrase.
 */
export function makeCarveout(text: string, category: CuadCategory, rng: Rng, anchor?: string): Carveout {
  const family = CATEGORY_FAMILY[category];
  const subj = extractSubject(text);
  const subject = subj ? subjectPhrase(subj) : GENERIC_SUBJECT[family];
  const specific = CATEGORY_SCOPES[category] ?? (FAMILY_SCOPES_FIT.has(family) ? SCOPES[family] : []);
  const scopes = specific.length && rng.next() < 0.7 ? specific : SCOPES.generic;
  const scope = rng.pick(scopes);
  const templates = anchor
    ? [(s: string, x: string) => `Notwithstanding ${anchor}, ${s} shall not apply ${x}.`]
    : [
        (s: string, x: string) => `Notwithstanding the foregoing, ${s} shall not apply ${x}.`,
        (s: string, x: string) => `Notwithstanding anything to the contrary in this Agreement, ${s} shall not apply ${x}.`,
        (s: string, x: string) => `${capitalise(s)} shall not apply ${x}, notwithstanding anything to the contrary herein.`,
        (s: string, x: string) => `Provided, however, that ${s} shall not apply ${x}.`,
      ];
  return { text: rng.pick(templates)(subject, scope), subject, scope, specific: subj !== null };
}

// ---------------------------------------------------------------------------
// (c) paraphrases
// ---------------------------------------------------------------------------

const SWAPS: Array<[RegExp, string]> = [
  [/\bset forth herein\b/gi, "set out in this Agreement"],
  [/\bset forth in\b/gi, "set out in"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\bpursuant to\b/gi, "under"],
  [/\bin the event that\b/gi, "if"],
  [/\bin the event of\b/gi, "in case of"],
  [/\bwith respect to\b/gi, "regarding"],
  [/\bin connection with\b/gi, "in relation to"],
  [/\bhereunder\b/gi, "under this Agreement"],
  [/\bany and all\b/gi, "all"],
  [/\butilize\b/gi, "use"],
  [/\butilizes\b/gi, "uses"],
  [/\butilized\b/gi, "used"],
  [/\bin order to\b/gi, "to"],
  [/\bat least\b/gi, "no less than"],
  [/\bno later than\b/gi, "not later than"],
  [/\bwritten notice\b/gi, "notice in writing"],
  [/\bprovided, however, that\b/gi, "provided that"],
  [/\beach of the parties\b/gi, "each party"],
  [/\bthe parties hereto\b/gi, "the parties"],
  [/\bshall be entitled to\b/gi, "shall have the right to"],
  [/\buntil such time as\b/gi, "until"],
  [/\bin lieu of\b/gi, "instead of"],
  [/\bby reason of\b/gi, "because of"],
  [/\bcommence\b/gi, "begin"],
  [/\bcommences\b/gi, "begins"],
  [/\bfor the purposes? of\b/gi, "for"],
  [/\bdeemed to be\b/gi, "deemed"],
  [/\bcomply with\b/gi, "abide by"],
  [/\bperiod of time\b/gi, "period"],
  [/\bincluding,?\s+without limitation,?\s*/gi, "including but not limited to "],
];

const CONDITIONAL = /^(If|In the event that|Upon|Unless|In case of)\s+([^,;]{8,160}),\s+([a-z][^,;]{8,}?)([.;])$/;

function matchCase(original: string, replacement: string): string {
  return /^[A-Z]/.test(original) ? capitalise(replacement) : replacement;
}

/** Tokens a paraphrase must never change: numbers, modals, negations. */
function invariantTokens(text: string): string {
  return (text.toLowerCase().match(/\d[\d,.]*|\b(shall|must|may|will|can|cannot|should|not|no|never|neither|nor|except|unless|notwithstanding)\b/g) ?? []).join(" ");
}

export interface Paraphrase {
  text: string;
  edits: string[];
  editType: string;
}

/** Light meaning-preserving paraphrase, or null when fewer than `minEdits` edits apply. */
export function makeParaphrase(text: string, minEdits = 1): Paraphrase | null {
  let out = text;
  const edits: string[] = [];
  for (const [re, rep] of SWAPS) {
    const hits: string[] = [];
    out = out.replace(re, (m) => {
      hits.push(m.trim());
      return matchCase(m, rep);
    });
    if (hits.length) edits.push(`${hits[0]} -> ${rep.trim()}`);
  }
  let reordered = false;
  const sentences = out.split(/(?<=[.;])\s+(?=[A-Z(])/);
  for (let i = 0; i < sentences.length && !reordered; i++) {
    const m = CONDITIONAL.exec(sentences[i]);
    if (m && !/^(then|it|they|he|she|such|this|that|these|those|its|their|the same)\b/i.test(m[3])) {
      sentences[i] = `${capitalise(m[3])} ${m[1].toLowerCase()} ${m[2]}${m[4]}`;
      edits.push(`moved "${m[1]} ..." condition after the main clause`);
      reordered = true;
    }
  }
  out = sentences.join(" ").replace(/\s{2,}/g, " ").trim();
  if (edits.length < minEdits || out === text) return null;
  if (invariantTokens(out) !== invariantTokens(text)) return null;
  const synonyms = edits.length - Number(reordered);
  const editType = reordered ? (synonyms > 0 ? "synonym+reorder" : "reorder") : "synonym";
  return { text: out, edits, editType };
}

// ---------------------------------------------------------------------------
// (d) unrelated pairs
// ---------------------------------------------------------------------------

const STOP = new Set(
  "the and for with this that such any all its their shall will may must not other each party parties agreement which from into upon under have has been being are was were than then thereof hereof herein hereto".split(
    " ",
  ),
);

export function contentWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const CONFLICT_KEYS = new Set(CONFLICT_PAIRS.map(([a, b]) => [a, b].sort().join("|")));

/** Categories that are not natural conflict candidates and belong to different families. */
export function unrelatedCategories(a: CuadCategory, b: CuadCategory): boolean {
  if (a === b) return false;
  if (CONFLICT_KEYS.has([a, b].sort().join("|"))) return false;
  return CATEGORY_FAMILY[a] !== CATEGORY_FAMILY[b];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildDatasetOptions {
  seed?: string;
  total?: number;
  mix?: Record<NliLabel, number>;
  /** Max records whose clauseA comes from the same contract. */
  maxPerContract?: number;
  /** Max Jaccard overlap for not_mentioned pairs. */
  maxUnrelatedOverlap?: number;
}

export interface DatasetSummary {
  seed: string;
  total: number;
  byLabel: Record<string, number>;
  bySource: Record<string, number>;
  byEditType: Record<string, number>;
  categories: number;
  contracts: number;
  poolSize: number;
}

function targetCounts(total: number, mix: Record<NliLabel, number>): Record<NliLabel, number> {
  const sum = LABELS.reduce((s, l) => s + mix[l], 0);
  const counts = Object.fromEntries(LABELS.map((l) => [l, Math.floor((total * mix[l]) / sum)])) as Record<NliLabel, number>;
  let rest = total - LABELS.reduce((s, l) => s + counts[l], 0);
  for (const l of LABELS) {
    if (rest <= 0) break;
    counts[l]++;
    rest--;
  }
  return counts;
}

/** Round-robin picker over categories so every category gets a fair share. */
class CategoryPicker {
  private readonly cats: CuadCategory[];
  private readonly lists = new Map<CuadCategory, CuadClause[]>();
  private cursor = 0;
  readonly used = new Set<CuadClause>();
  readonly contractUses = new Map<string, number>();

  constructor(pool: readonly CuadClause[], rng: Rng, private readonly maxPerContract: number) {
    for (const c of pool) {
      const l = this.lists.get(c.category);
      if (l) l.push(c);
      else this.lists.set(c.category, [c]);
    }
    this.cats = rng.shuffle([...this.lists.keys()].sort());
  }

  available(c: CuadClause): boolean {
    return !this.used.has(c) && (this.contractUses.get(c.contractId) ?? 0) < this.maxPerContract;
  }

  mark(c: CuadClause): void {
    this.used.add(c);
    this.contractUses.set(c.contractId, (this.contractUses.get(c.contractId) ?? 0) + 1);
  }

  take<T>(fn: (c: CuadClause) => T | null): { clause: CuadClause; value: T } | null {
    for (let n = 0; n < this.cats.length; n++) {
      const cat = this.cats[(this.cursor + n) % this.cats.length];
      for (const c of this.lists.get(cat) ?? []) {
        if (!this.available(c)) continue;
        const value = fn(c);
        if (value !== null) {
          this.cursor = (this.cursor + n + 1) % this.cats.length;
          this.mark(c);
          return { clause: c, value };
        }
      }
    }
    return null;
  }
}

const TWIN_MIX: Array<[TwinEdit, number]> = [
  ["number", 0.4],
  ["modal", 0.4],
  ["negation", 0.2],
];

export function buildContractConflict(
  clauses: readonly CuadClause[],
  opts: BuildDatasetOptions = {},
): { records: ConflictRecord[]; summary: DatasetSummary } {
  const seed = opts.seed ?? "contract-conflict-v1";
  const total = opts.total ?? 260;
  const rng = new Rng(seed);
  const pool = rng.shuffle(clausePool(clauses));
  const picker = new CategoryPicker(pool, rng, opts.maxPerContract ?? 2);
  const maxOverlap = opts.maxUnrelatedOverlap ?? 0.1;
  const counts = targetCounts(total, opts.mix ?? DEFAULT_MIX);

  const schedule = rng.shuffle(LABELS.flatMap((l) => Array.from({ length: counts[l] }, () => l)));
  const twinSchedule = rng.shuffle(
    TWIN_MIX.flatMap(([t, share]) => Array.from({ length: Math.round(counts.contradict * share) + 1 }, () => t)),
  );
  const records: Omit<ConflictRecord, "id">[] = [];
  const base = (c: CuadClause) => ({
    contractId: c.contractId,
    category: c.category,
    clauseA: c.text,
    spanA: [c.start, c.end] as [number, number],
  });

  for (const label of schedule) {
    if (label === "contradict") {
      const want = twinSchedule.pop() ?? "modal";
      const hit =
        picker.take((c) => {
          const t = twinFor(c.text, want);
          return t && t.editType === want ? t : null;
        }) ?? picker.take((c) => twinFor(c.text, want));
      if (hit) records.push({ ...base(hit.clause), clauseB: hit.value.text, label, source: "twin", edit: hit.value.edit, editType: hit.value.editType });
    } else if (label === "exception") {
      const hit = picker.take((c) => {
        const k = makeCarveout(c.text, c.category, rng);
        return k.specific ? k : null;
      });
      if (hit) {
        records.push({
          ...base(hit.clause),
          clauseB: hit.value.text,
          label,
          source: "carveout",
          edit: `carve-out of "${hit.value.subject}" ${hit.value.scope}`,
          editType: hit.value.specific ? "specific" : "generic",
        });
      }
    } else if (label === "agree") {
      const hit = picker.take((c) => makeParaphrase(c.text, 2)) ?? picker.take((c) => makeParaphrase(c.text, 1));
      if (hit) {
        records.push({
          ...base(hit.clause),
          clauseB: hit.value.text,
          label,
          source: "paraphrase",
          edit: `paraphrase: ${hit.value.edits.join("; ")}`,
          editType: hit.value.editType,
        });
      }
    } else {
      const start = rng.int(pool.length);
      const hit = picker.take((a) => {
        const wa = contentWords(a.text);
        for (let n = 0; n < pool.length; n++) {
          const b = pool[(start + n) % pool.length];
          if (b.contractId === a.contractId || !picker.available(b)) continue;
          if (!unrelatedCategories(a.category, b.category)) continue;
          if (jaccard(wa, contentWords(b.text)) > maxOverlap) continue;
          return b;
        }
        return null;
      });
      if (hit) {
        picker.mark(hit.value);
        records.push({
          ...base(hit.clause),
          clauseB: hit.value.text,
          label,
          source: "unrelated",
          contractIdB: hit.value.contractId,
          categoryB: hit.value.category,
        });
      }
    }
  }

  const final = rng.shuffle(records).map((r, i): ConflictRecord => ({ id: `cc-${String(i + 1).padStart(4, "0")}`, ...r }));
  const tally = (key: (r: ConflictRecord) => string | undefined) => {
    const out: Record<string, number> = {};
    for (const r of final) {
      const k = key(r);
      if (k) out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };
  return {
    records: final,
    summary: {
      seed,
      total: final.length,
      byLabel: tally((r) => r.label),
      bySource: tally((r) => r.source),
      byEditType: tally((r) => (r.editType ? `${r.source}:${r.editType}` : undefined)),
      categories: new Set(final.map((r) => r.category)).size,
      contracts: new Set(final.flatMap((r) => [r.contractId, r.contractIdB ?? r.contractId])).size,
      poolSize: pool.length,
    },
  };
}
