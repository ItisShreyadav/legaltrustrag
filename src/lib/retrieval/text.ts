/**
 * Tokenisation for lexical retrieval (BM25 / TF-IDF).
 *
 * Design notes:
 * - Lowercase, strip diacritics, split on anything that is not [a-z0-9].
 * - Contractions that carry negation are expanded ("shan't" -> "shall not") so the
 *   negation survives as its own token.
 * - The stopword list deliberately KEEPS conflict-bearing and modal terms
 *   (not, no, nor, except, unless, notwithstanding, shall, may, must, will, without,
 *   only, subject, provided, ...). They change the meaning of a clause and are exactly
 *   what the conflict engine needs to see.
 * - A light suffix stemmer (inflectional + a few derivational rules) instead of full
 *   Porter, so legal terms stay recognisable and role nouns stay distinct
 *   ("licensee" != "license").
 */

const STOPWORDS = new Set<string>([
  "a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "this", "that", "these", "those", "it", "its", "itself",
  "and", "or", "such", "which", "who", "whom", "whose", "what",
  "their", "theirs", "there", "they", "them", "he", "she", "his", "her", "hers", "him",
  "we", "our", "ours", "us", "you", "your", "yours", "i", "me", "my",
  "into", "onto", "upon", "than", "then", "so", "do", "does", "did", "doing",
  "has", "have", "had", "having", "also", "very", "can", "could", "would", "should",
  "here", "herein", "hereof", "hereto", "hereby", "hereunder", "therein", "thereof",
  "thereto", "thereby", "thereunder", "said", "same", "about", "between", "both",
  "each", "either", "own", "per", "via", "etc",
]);

/**
 * Words that must never be dropped or stemmed: they carry modality, negation or
 * carve-out signal. (Listed for documentation and as a guard; none of them are in
 * STOPWORDS.)
 */
export const PROTECTED_TERMS = new Set<string>([
  "not", "no", "nor", "none", "neither", "never", "except", "unless", "notwithstanding",
  "shall", "may", "must", "will", "without", "only", "subject", "provided", "however",
  "any", "all", "if", "until",
]);

const CONTRACTIONS: Array<[RegExp, string]> = [
  [/\bshan['’]t\b/g, "shall not"],
  [/\bwon['’]t\b/g, "will not"],
  [/\bcan['’]t\b/g, "can not"],
  [/\bcannot\b/g, "can not"],
  [/n['’]t\b/g, " not"],
];

function isVowel(ch: string): boolean {
  return ch === "a" || ch === "e" || ch === "i" || ch === "o" || ch === "u";
}

function hasVowel(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (isVowel(s[i]) || (i > 0 && s[i] === "y")) return true;
  return false;
}

function replaceSuffix(word: string, suffix: string, repl: string, minStem = 3): string | null {
  if (!word.endsWith(suffix)) return null;
  const stem = word.slice(0, word.length - suffix.length);
  if (stem.length < minStem || !hasVowel(stem)) return null;
  return stem + repl;
}

/** Light, deterministic English stemmer tuned for contract language. */
export function stem(word: string): string {
  if (word.length <= 3 || PROTECTED_TERMS.has(word) || /\d/.test(word)) return word;
  let w = word;

  // Step 1: inflectional endings.
  const step1: Array<[string, string, number?]> = [
    ["sses", "ss"],
    ["ies", "y", 2],
    ["ied", "y", 2],
    ["eed", "ee", 2],
    ["ing", ""],
    ["ed", ""],
    ["ably", "able"],
    ["ibly", "ible"],
  ];
  let changed = false;
  for (const [suf, rep, min] of step1) {
    if (suf === "eed" && w.endsWith("ceed")) continue; // proceed, exceed, succeed
    if (suf === "ed" && w.endsWith("eed")) break; // "proceed" etc. are base forms
    const r = replaceSuffix(w, suf, rep, min ?? 3);
    if (r !== null) {
      w = r;
      changed = true;
      break;
    }
  }
  if (!changed && w.endsWith("ly")) {
    // "promptly" -> "prompt", but not "supply"/"apply"/"daily".
    const base = w.slice(0, -2);
    if (base.length >= 4 && hasVowel(base) && !/(p|i|l)$/.test(base)) {
      w = base;
      changed = true;
    }
  }
  if (!changed && w.endsWith("s") && !/(ss|us|is)$/.test(w) && w.length > 3) {
    w = w.slice(0, -1);
  }

  // Step 2: a handful of derivational endings, longest first, at most two passes
  // ("confidentiality" -> "confidential" -> "confidenti").
  const step2: Array<[string, string]> = [
    ["ification", "ify"],
    ["ization", "ize"],
    ["fulness", "ful"],
    ["iveness", "ive"],
    ["ility", "le"],
    ["ment", ""],
    ["ness", ""],
    ["tion", "t"],
    ["sion", "s"],
    ["able", ""],
    ["ible", ""],
    ["ity", ""],
    ["al", ""],
  ];
  for (let pass = 0; pass < 2; pass++) {
    let hit = false;
    for (const [suf, rep] of step2) {
      const r = replaceSuffix(w, suf, rep, 4);
      if (r !== null) {
        w = r;
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }

  // Step 3: tidy up. Undouble trailing consonants ("transferr" -> "transfer"),
  // drop a single trailing "e" ("terminate" -> "terminat", but "licensee" stays).
  if (w.length > 4) {
    const a = w[w.length - 1];
    const b = w[w.length - 2];
    if (a === b && !isVowel(a) && a !== "l" && a !== "s" && a !== "z") w = w.slice(0, -1);
  }
  if (w.length > 4 && w.endsWith("e") && !w.endsWith("ee")) w = w.slice(0, -1);
  return w;
}

/** Normalise raw text before splitting (lowercase, diacritics, contractions). */
export function normalise(text: string): string {
  let t = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  return t;
}

/** Tokenise + stopword filter + stem. Order is preserved; duplicates kept. */
export function tokenize(text: string): string[] {
  const raw = normalise(text).match(/\d+(?:\.\d+)+|[a-z0-9]+/g);
  if (!raw) return [];
  const out: string[] = [];
  for (const tok of raw) {
    if (tok.length === 1 && !/\d/.test(tok)) continue; // stray letters like "(a)"
    if (STOPWORDS.has(tok)) continue;
    out.push(stem(tok));
  }
  return out;
}
