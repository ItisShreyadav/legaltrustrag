/**
 * Pure self-test for the exact quote checker (no API calls, no network).
 * Run: npx jiti src/lib/verify/selftest.ts
 */
import type { Clause, Quote, SourceDocument } from "@/lib/types";
import { checkQuote, lexicalRelevance } from "./quote";

const text =
  "1. Term. This Agreement commences on the Effective Date and continues for two (2) years.\n" +
  "2. Termination. Either party may terminate this Agreement on thirty (30) days’ written notice.\n" +
  "3. Notwithstanding Section 2, Licensee shall not terminate during the first year.\n";

const doc: SourceDocument = { id: "doc_1", name: "msa.txt", kind: "txt", text };
const docs = new Map([[doc.id, doc]]);

function clauseFor(id: string, marker: string, nextMarker: string | null): Clause {
  const start = text.indexOf(marker);
  const end = nextMarker ? text.indexOf(nextMarker) : text.length;
  return {
    id,
    docId: doc.id,
    path: [marker.trim()],
    text: text.slice(start, end),
    start,
    end,
    category: "Other",
    categoryConfidence: 1,
    definedTerms: [],
    references: [],
    isException: false,
  };
}

const c1 = clauseFor("doc_1:c_1", "1. Term.", "2. Termination.");
const c2 = clauseFor("doc_1:c_2", "2. Termination.", "3. Notwithstanding");
const c3 = clauseFor("doc_1:c_3", "3. Notwithstanding", null);
const clauses = new Map([c1, c2, c3].map((c) => [c.id, c]));

function quoteOf(clause: Clause, span: string): Quote {
  const start = text.indexOf(span, clause.start);
  if (start < 0) throw new Error(`fixture span not found: ${span}`);
  return { clauseId: clause.id, docId: clause.docId, start, end: start + span.length, text: span };
}

let failures = 0;
function expect(name: string, actual: boolean, expected: boolean, detail?: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}

const good = quoteOf(c2, "thirty (30) days’ written notice");
const r = (q: Quote, withClauses = true) => checkQuote(q, docs, withClauses ? clauses : undefined);

// Correct quotes.
expect("exact quote passes", r(good).passed, true, r(good).detail);
expect("exact quote passes without clause map", r(good, false).passed, true);
expect("whole-clause quote passes", r({ clauseId: c3.id, docId: doc.id, start: c3.start, end: c3.end, text: c3.text }).passed, true);
expect("check name is 'quote'", r(good).name === "quote", true);

// Off-by-one offsets with the original text.
expect("start + 1 fails", r({ ...good, start: good.start + 1 }).passed, false, r({ ...good, start: good.start + 1 }).detail);
expect("start - 1 fails", r({ ...good, start: good.start - 1 }).passed, false);
expect("end + 1 fails", r({ ...good, end: good.end + 1 }).passed, false);
expect("end - 1 fails", r({ ...good, end: good.end - 1 }).passed, false, r({ ...good, end: good.end - 1 }).detail);
expect("window shifted by one fails", r({ ...good, start: good.start + 1, end: good.end + 1 }).passed, false);

// Text that is off by one character.
expect("dropped trailing char fails", r({ ...good, text: good.text.slice(0, -1) }).passed, false);
expect("straight vs curly apostrophe fails", r({ ...good, text: good.text.replace("’", "'") }).passed, false);
expect("changed digit fails", r({ ...good, text: good.text.replace("30", "60") }).passed, false);

// Range / identity checks.
const shiftedIntoNext = (() => {
  const start = c2.end - 5;
  const end = c2.end + 5;
  return { clauseId: c2.id, docId: doc.id, start, end, text: text.slice(start, end) };
})();
expect("exact text crossing the clause boundary fails range check", r(shiftedIntoNext).passed, false, r(shiftedIntoNext).detail);
expect("same quote passes when clause range is not checked", r(shiftedIntoNext, false).passed, true);
expect("quote attributed to the wrong clause fails", r({ ...good, clauseId: c1.id }).passed, false);
expect("unknown clause fails", r({ ...good, clauseId: "doc_1:c_99" }).passed, false);
expect("unknown document fails", r({ ...good, docId: "doc_9" }).passed, false);
expect("empty quote fails", r({ ...good, end: good.start, text: "" }).passed, false);
expect("out-of-bounds end fails", r({ ...good, end: text.length + 1 }).passed, false);
expect("non-integer offset fails", r({ ...good, start: good.start + 0.5 }).passed, false);

// Lexical relevance gate (LTR_FAST_VERIFY=1 path).
expect(
  "lexical gate: on-topic evidence passes",
  lexicalRelevance("Either party may terminate on 30 days notice", [good.text]).passed,
  true,
);
expect(
  "lexical gate: off-topic evidence fails",
  lexicalRelevance("Governing law is the State of New York", [good.text]).passed,
  false,
);

console.log(failures === 0 ? "\nAll quote checks behaved as expected." : `\n${failures} check(s) failed.`);
if (failures > 0) process.exit(1);
