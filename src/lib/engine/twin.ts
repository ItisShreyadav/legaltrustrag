/**
 * Pure-TS synthetic contradiction generator for the evaluation dataset.
 * Given a clause, produce a minimally edited "twin" that contradicts it, or null when
 * no supported edit applies. Deterministic: the same input always gives the same output.
 *
 * Edits (first applicable wins, in order of `prefer`):
 * - modal: "shall not" <-> "shall", "must not" <-> "must", "may not" <-> "may",
 *          "will not" <-> "will", "cannot" -> "can"
 * - number: "thirty (30) days" -> "sixty (60) days", word numbers before a unit,
 *           digits (amounts, percentages, periods) flipped/doubled; section numbers and years skipped
 * - negation: remove "not" after an auxiliary ("is not" -> "is"), else insert one ("is" -> "is not")
 */

type Edit = "modal" | "number" | "negation";

export interface TwinOptions {
  /** Which edit family to try first. Default "modal". */
  prefer?: Edit;
}

/** Word numbers and the value they flip to (kept consistent with the digit flips below). */
const WORD_FLIPS: Record<string, [string, number, number]> = {
  // word: [replacement word, original value, replacement value]
  one: ["two", 1, 2],
  two: ["four", 2, 4],
  three: ["six", 3, 6],
  four: ["eight", 4, 8],
  five: ["ten", 5, 10],
  six: ["twelve", 6, 12],
  seven: ["fourteen", 7, 14],
  eight: ["sixteen", 8, 16],
  nine: ["eighteen", 9, 18],
  ten: ["twenty", 10, 20],
  twelve: ["twenty-four", 12, 24],
  fourteen: ["seven", 14, 7],
  fifteen: ["thirty", 15, 30],
  twenty: ["ten", 20, 10],
  "twenty-one": ["forty-two", 21, 42],
  "twenty-four": ["twelve", 24, 12],
  thirty: ["sixty", 30, 60],
  "forty-five": ["ninety", 45, 90],
  forty: ["eighty", 40, 80],
  sixty: ["thirty", 60, 30],
  ninety: ["thirty", 90, 30],
  "one hundred twenty": ["sixty", 120, 60],
  "one hundred eighty": ["ninety", 180, 90],
};

/** Digit flips consistent with WORD_FLIPS ("30" <-> "60"); anything else is doubled. */
const DIGIT_FLIPS = new Map<number, number>(Object.values(WORD_FLIPS).map(([, from, to]) => [from, to]));

const UNIT = String.raw`(?:business\s+|calendar\s+|working\s+)?(?:days?|weeks?|months?|years?|hours?|minutes?|percent|per\s+cent|%|times|installments?|instalments?)`;

const WORD_ALT = Object.keys(WORD_FLIPS)
  .sort((a, b) => b.length - a.length)
  .map((w) => w.replace(/[-\s]/g, "[-\\s]"))
  .join("|");

function matchCase(original: string, replacement: string): string {
  if (original.length > 1 && original === original.toUpperCase() && /[A-Z]/.test(original)) return replacement.toUpperCase();
  if (/^[A-Z]/.test(original)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

function flipWord(word: string): { word: string; from: number; to: number } | null {
  const key = word.toLowerCase().replace(/[-\s]+/g, (m) => (m.includes("-") ? "-" : " "));
  const hit = WORD_FLIPS[key] ?? WORD_FLIPS[key.replace(/ /g, "-")];
  return hit ? { word: matchCase(word, hit[0]), from: hit[1], to: hit[2] } : null;
}

/** "one (1) year" -> "two (2) years": pluralise a singular unit right after `pos` when the new value is not 1. */
function pluraliseUnitAfter(text: string, pos: number, value: number): string {
  if (value === 1) return text;
  const m = /^(\s+(?:business\s+|calendar\s+|working\s+)?)(day|week|month|year|hour|minute)\b/i.exec(text.slice(pos));
  if (!m) return text;
  const at = pos + m[0].length;
  return text.slice(0, at) + (m[2] === m[2].toUpperCase() ? "S" : "s") + text.slice(at);
}

function flipNumber(n: number): number {
  const mapped = DIGIT_FLIPS.get(n);
  if (mapped !== undefined) return mapped;
  return n === 0 ? 1 : n * 2;
}

function formatLike(original: string, value: number): string {
  const decimals = /\.(\d+)$/.exec(original)?.[1].length ?? 0;
  const fixed = value.toFixed(decimals);
  if (!original.includes(",")) return fixed;
  const [int, frac] = fixed.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${withCommas}.${frac}` : withCommas;
}

function replaceAt(text: string, start: number, end: number, replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

function modalEdit(text: string): string | null {
  // Remove an existing negation first ("shall not" -> "shall").
  const neg = /\b(shall|must|will|may|should)\s+not\b/i.exec(text);
  if (neg) return replaceAt(text, neg.index, neg.index + neg[0].length, neg[1]);
  const cannot = /\b(can)not\b/i.exec(text);
  if (cannot) return replaceAt(text, cannot.index, cannot.index + cannot[0].length, cannot[1]);
  // Otherwise insert one. "may"/"will" only in lower case so "May" (month) and "Will" (name) are left alone.
  const pos = /\b(shall|must|SHALL|MUST|Shall|Must|may|will)\b/.exec(text);
  if (pos) {
    const not = pos[1] === pos[1].toUpperCase() ? "NOT" : "not";
    return replaceAt(text, pos.index, pos.index + pos[0].length, `${pos[1]} ${not}`);
  }
  return null;
}

const SECTION_PREFIX = /(section|sections|article|clause|schedule|exhibit|annex|appendix|paragraph|item|part|rule|§|no\.)\s*$/i;

function numberEdit(text: string): string | null {
  // 1. "thirty (30)" style: flip word and digits together.
  const paired = new RegExp(String.raw`\b(${WORD_ALT})\s*\(\s*(\d[\d,]*(?:\.\d+)?)\s*\)`, "i").exec(text);
  if (paired) {
    const fw = flipWord(paired[1]);
    const n = Number(paired[2].replace(/,/g, ""));
    if (fw && Number.isFinite(n)) {
      const to = n === fw.from ? fw.to : flipNumber(n);
      const replacement = `${fw.word} (${formatLike(paired[2], to)})`;
      const out = replaceAt(text, paired.index, paired.index + paired[0].length, replacement);
      return pluraliseUnitAfter(out, paired.index + replacement.length, to);
    }
  }

  // 2. Word number before a unit: "sixty days", "five percent".
  const worded = new RegExp(String.raw`\b(${WORD_ALT})(\s+${UNIT})\b`, "i").exec(text);
  if (worded) {
    const fw = flipWord(worded[1]);
    if (fw) {
      const out = replaceAt(text, worded.index, worded.index + worded[1].length, fw.word);
      return pluraliseUnitAfter(out, worded.index + fw.word.length, fw.to);
    }
  }

  // 3. Digits: amounts, percentages, periods. Skip section refs, list markers, years and dotted numbering.
  const re = /\d[\d,]*(?:\.\d+)*/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const raw = m[0].replace(/[.,]+$/, "");
    const start = m.index;
    const end = start + raw.length;
    const before = text.slice(Math.max(0, start - 14), start);
    const prevCh = text[start - 1] ?? "";
    const nextCh = text[end] ?? "";
    if (/[A-Za-z]/.test(prevCh) || /[A-Za-z]/.test(nextCh)) continue; // part of an identifier
    if (SECTION_PREFIX.test(before)) continue;
    if ((raw.match(/\./g) ?? []).length > 1) continue; // 5.2.1
    if (/^\d+\.\d+$/.test(raw) && !/[$€£]\s*$/.test(before) && nextCh !== "%") continue; // 5.2 (section) unless money/percent
    if (prevCh === "(" && nextCh === ")") continue; // (1) list marker or restated number
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (/^\d{4}$/.test(raw) && n >= 1900 && n <= 2100) continue; // year
    const to = flipNumber(n);
    const replacement = formatLike(raw, to);
    return pluraliseUnitAfter(replaceAt(text, start, end, replacement), start + replacement.length, to);
  }
  return null;
}

function negationEdit(text: string): string | null {
  const neg = /\b(is|are|was|were|do|does|did|has|have|had|be|been|need)\s+not\b/i.exec(text);
  if (neg) return replaceAt(text, neg.index, neg.index + neg[0].length, neg[1]);
  const aux = /\b(is|are)\b/.exec(text);
  if (aux) return replaceAt(text, aux.index, aux.index + aux[0].length, `${aux[1]} not`);
  return null;
}

const EDITS: Record<Edit, (t: string) => string | null> = {
  modal: modalEdit,
  number: numberEdit,
  negation: negationEdit,
};

/**
 * Produce a minimally edited contradictory version of `text`, or null if no edit applies.
 */
export function makeContradictoryTwin(text: string, opts: TwinOptions = {}): string | null {
  const order: Edit[] = ["modal", "number", "negation"];
  const prefer = opts.prefer ?? "modal";
  order.sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : 0));
  for (const edit of order) {
    const out = EDITS[edit](text);
    if (out !== null && out !== text) return out;
  }
  return null;
}
