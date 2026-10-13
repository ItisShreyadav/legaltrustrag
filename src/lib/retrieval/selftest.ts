/**
 * Self-test for stage 3 retrieval. Run:
 *   npx tsx src/lib/retrieval/selftest.ts            # BM25 only (offline, fast)
 *   npx tsx src/lib/retrieval/selftest.ts --dense    # also bge-small + bge-reranker (downloads models)
 */

import type { Clause, CuadCategory, SourceDocument } from "@/lib/types";
import { ClauseIndex, clearModelCache } from "./index";
import { tokenize } from "./text";

interface Spec {
  key: string;
  text: string;
  category: CuadCategory;
  heading?: string;
  definedTerms?: string[];
  references?: string[];
  isException?: boolean;
}

function makeDoc(id: string, name: string, specs: Spec[]): { doc: SourceDocument; clauses: Clause[] } {
  const preamble = `${name.toUpperCase()}\n\n`;
  let text = preamble;
  const spans: Array<[number, number]> = [];
  for (const s of specs) {
    const start = text.length;
    text += s.text;
    spans.push([start, text.length]);
    text += "\n\n";
  }
  const doc: SourceDocument = { id, name, kind: "txt", text };
  const clauses = specs.map((s, n): Clause => {
    const [start, end] = spans[n];
    return {
      id: `${id}:${s.key}`,
      docId: id,
      path: [s.text.split(" ")[0].replace(/\.$/, "")],
      heading: s.heading,
      text: doc.text.slice(start, end),
      start,
      end,
      category: s.category,
      categoryConfidence: 0.9,
      definedTerms: s.definedTerms ?? [],
      references: s.references ?? [],
      isException: s.isException ?? false,
    };
  });
  return { doc, clauses };
}

const MSA = makeDoc("doc_1", "Master License Agreement", [
  { key: "c_1", heading: "Definitions", category: "Other", definedTerms: ["Confidential Information"],
    text: '1. Definitions. "Confidential Information" means all non-public business and technical information disclosed by either Party.' },
  { key: "c_2", heading: "License Grant", category: "License Grant",
    text: "2.1 License Grant. Licensor grants Licensee a non-exclusive, worldwide license to use the Software during the Term." },
  { key: "c_3", heading: "Restrictions", category: "Non-Transferable License", references: ["doc_1:c_2"],
    text: "2.2 Restrictions. The license granted in Section 2.1 is non-transferable and Licensee shall not sublicense the Software." },
  { key: "c_4", heading: "Non-Compete", category: "Non-Compete",
    text: "3.1 Non-Compete. During the Term, Licensee shall not develop or market any product that competes with the Software." },
  { key: "c_5", heading: "Carve-out", category: "Competitive Restriction Exception", references: ["doc_1:c_4"], isException: true,
    text: "3.2 Carve-out. Notwithstanding Section 3.1, Licensee may continue to market its existing analytics products listed in Schedule B." },
  { key: "c_6", heading: "Limitation of Liability", category: "Cap On Liability", references: ["doc_1:c_8"], isException: true,
    text: "4.1 Limitation of Liability. Except for breaches of Section 6, each Party's total liability shall not exceed the fees paid in the twelve months preceding the claim." },
  { key: "c_7", heading: "Uncapped Liability", category: "Uncapped Liability",
    text: "4.2 Uncapped Liability. Liability for gross negligence, fraud or wilful misconduct shall be unlimited." },
  { key: "c_8", heading: "Confidentiality", category: "Other", references: ["doc_1:c_1"],
    text: "6. Confidentiality. Each Party shall protect the other Party's Confidential Information with at least reasonable care and shall not disclose it." },
  { key: "c_9", heading: "Term", category: "Expiration Date",
    text: "7.1 Term. This Agreement expires three (3) years after the Effective Date." },
  { key: "c_10", heading: "Renewal", category: "Renewal Term",
    text: "7.2 Renewal. This Agreement renews automatically for successive one (1) year terms unless either Party gives ninety (90) days notice of non-renewal." },
  { key: "c_11", heading: "Assignment", category: "Anti-Assignment",
    text: "8. Assignment. Neither Party may assign this Agreement without the prior written consent of the other Party." },
  { key: "c_12", heading: "Governing Law", category: "Governing Law",
    text: "9. Governing Law. This Agreement is governed by the laws of the State of New York." },
]);

const AMEND = makeDoc("doc_2", "Amendment No. 1", [
  { key: "c_1", heading: "Governing Law", category: "Governing Law",
    text: "1. Governing Law. Section 9 of the Agreement is amended so that this Agreement is governed by the laws of the State of Delaware." },
  { key: "c_2", heading: "Liability", category: "Cap On Liability",
    text: "2. Liability. Each Party's total liability under the Agreement shall not exceed two times the fees paid." },
  { key: "c_3", heading: "Assignment", category: "Change Of Control",
    text: "3. Assignment. Either Party may assign the Agreement to an Affiliate or in connection with a change of control without consent." },
  { key: "c_4", heading: "Term", category: "Expiration Date",
    text: "4. Term. The Agreement shall expire five (5) years after the Effective Date." },
]);

const DOCS = [MSA, AMEND];
const ALL: Clause[] = DOCS.flatMap((d) => d.clauses);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  }
}

const ids = (xs: Array<{ clause: Clause }>) => xs.map((x) => x.clause.id);
const pairKey = (a: Clause, b: Clause) => [a.id, b.id].sort().join(" <> ");

async function runSuite(label: string, embed: boolean) {
  console.log(`\n== ${label} ==`);
  const progress: Array<[number, number]> = [];
  const t0 = Date.now();
  const index = await ClauseIndex.build(ALL, { embed, onProgress: (d, t) => progress.push([d, t]) });
  console.log(`  built in ${Date.now() - t0}ms (dense=${index.denseEnabled}, rerank=${index.rerankEnabled})`);
  check("progress reaches total", progress.length > 0 && progress[progress.length - 1][0] === ALL.length, progress);
  check("index size", index.size === ALL.length);
  if (embed) check("dense enabled when embed=true", index.denseEnabled);
  else check("dense disabled when embed=false", !index.denseEnabled && !index.rerankEnabled);

  // --- search ---
  const t1 = Date.now();
  const liab = await index.search("cap on total liability limited to fees paid", { k: 3 });
  console.log(`  search took ${Date.now() - t1}ms:`, liab.map((r) => `${r.clause.id} s=${r.score.toFixed(3)} bm25=${r.bm25Score?.toFixed(2)} dense=${r.denseScore?.toFixed(3)}`));
  check("liability query top-2 are the two caps", new Set(ids(liab).slice(0, 2)).size === 2 &&
    ids(liab).slice(0, 2).every((id) => ["doc_1:c_6", "doc_2:c_2"].includes(id)), ids(liab));
  check("bm25Score filled", liab.every((r) => typeof r.bm25Score === "number"));
  check("denseScore iff embeddings", liab.every((r) => (r.denseScore !== undefined) === index.denseEnabled));
  check("scores sorted desc", liab.every((r, i) => i === 0 || liab[i - 1].score >= r.score));
  const c6 = liab.find((r) => r.clause.id === "doc_1:c_6");
  check("c_6 links forward reference c_8", !!c6 && c6.linked.some((c) => c.id === "doc_1:c_8"), c6?.linked.map((c) => c.id));

  const nc = await index.search("restriction on competing products (non-compete)", { k: 3 });
  check("non-compete query hits c_4 first", nc[0]?.clause.id === "doc_1:c_4", ids(nc));
  const nc4 = nc.find((r) => r.clause.id === "doc_1:c_4");
  check("c_4 linked includes reverse exception c_5", !!nc4 && nc4.linked.some((c) => c.id === "doc_1:c_5"), nc4?.linked.map((c) => c.id));
  check("linked never includes self and <= 5", [...liab, ...nc].every((r) => r.linked.length <= 5 && !r.linked.some((c) => c.id === r.clause.id)));

  const gl = await index.search("which state's law governs", { category: "Governing Law" });
  check("category filter", gl.length === 2 && gl.every((r) => r.clause.category === "Governing Law"), ids(gl));
  const gl2 = await index.search("governing law", { category: ["Governing Law", "Other"], docIds: ["doc_2"] });
  check("docIds filter", gl2.length >= 1 && gl2.every((r) => r.clause.docId === "doc_2"), ids(gl2));
  const ex = await index.search("governing law New York", { excludeClauseIds: ["doc_1:c_12"], k: 5 });
  check("excludeClauseIds", !ids(ex).includes("doc_1:c_12"), ids(ex));
  check("empty query -> []", (await index.search("   ")).length === 0);
  check("k respected", (await index.search("Agreement Party", { k: 2 })).length <= 2);

  // --- similar ---
  const simGl = index.similar("doc_1:c_12", { crossDocOnly: true, k: 1 });
  check("similar cross-doc: NY law -> Delaware amendment", simGl[0]?.clause.id === "doc_2:c_1", ids(simGl));
  const simTerm = index.similar("doc_1:c_9", { sameCategoryOnly: true });
  check("similar same-category: term -> amended term", simTerm.length === 1 && simTerm[0].clause.id === "doc_2:c_4", ids(simTerm));
  const simAny = index.similar("doc_1:c_6", { k: 4 });
  check("similar excludes self, sorted", !ids(simAny).includes("doc_1:c_6") && simAny.every((r, i) => i === 0 || simAny[i - 1].score >= r.score), ids(simAny));
  check("similar unknown id -> []", index.similar("nope").length === 0);

  // --- candidatePairs ---
  const pairs = index.candidatePairs();
  const byKey = new Map(pairs.map(([a, b, r]) => [pairKey(a, b), r]));
  console.log(`  ${pairs.length} candidate pairs:`);
  for (const [a, b, r] of pairs) console.log(`    ${r.padEnd(15)} ${a.id} (${a.category}) <> ${b.id} (${b.category})  sim=${index.similarity(a, b).toFixed(3)}`);
  const expect: Array<[string, string, string]> = [
    ["doc_1:c_4", "doc_1:c_5", "cross_reference"],
    ["doc_1:c_2", "doc_1:c_3", "cross_reference"],
    ["doc_1:c_6", "doc_1:c_7", "conflict_pair"],
    ["doc_1:c_9", "doc_1:c_10", "conflict_pair"],
    ["doc_1:c_12", "doc_2:c_1", "cross_document"],
    ["doc_1:c_6", "doc_2:c_2", "cross_document"],
    ["doc_1:c_9", "doc_2:c_4", "cross_document"],
    ["doc_1:c_11", "doc_2:c_3", "conflict_pair"],
    ["doc_1:c_6", "doc_1:c_8", "cross_reference"],
  ];
  for (const [a, b, r] of expect) {
    const got = byKey.get([a, b].sort().join(" <> "));
    check(`pair ${a} <> ${b} = ${r}`, got === r, got ?? "missing");
  }
  check("pairs deduped", byKey.size === pairs.length);
  check("no self pairs", pairs.every(([a, b]) => a.id !== b.id));
  check("maxPairs cap", index.candidatePairs({ maxPairs: 3 }).length === 3);
  const pos = (a: string, b: string) => pairs.findIndex(([x, y]) => pairKey(x, y) === [a, b].sort().join(" <> "));
  check("explicit exception link outranks a lexically closer same-category pair",
    pos("doc_1:c_4", "doc_1:c_5") < pos("doc_1:c_6", "doc_2:c_2"),
    [pos("doc_1:c_4", "doc_1:c_5"), pos("doc_1:c_6", "doc_2:c_2")]);
}

async function main() {
  console.log("== tokenizer ==");
  const toks = tokenize("Notwithstanding Section 3.1, Licensee shall not assign, except as provided; no Party may do so unless agreed.");
  console.log("  ", toks.join(" "));
  for (const w of ["notwithstanding", "shall", "not", "except", "no", "unless", "3.1"]) check(`keeps "${w}"`, toks.includes(w), toks);
  check("contraction negation", tokenize("Licensee shan't assign").includes("not"));
  check("stems match", tokenize("terminated termination terminate").every((t) => t === "terminat"));
  check("licensee != license", tokenize("licensee")[0] !== tokenize("license")[0]);

  console.log("\n== fixtures ==");
  for (const { doc, clauses } of DOCS) {
    check(`${doc.id}: offsets exact`, clauses.every((c) => doc.text.slice(c.start, c.end) === c.text));
  }

  await runSuite("BM25 only (embed: false)", false);

  const wantDense = process.argv.includes("--dense") || process.env.LTR_SELFTEST_DENSE === "1";
  if (wantDense && process.env.LTR_DISABLE_EMBEDDINGS !== "1") {
    await runSuite("hybrid (bge-small + bge-reranker)", true);
    const t = Date.now();
    await ClauseIndex.build(ALL, { embed: true });
    console.log(`  rebuild with warm embedding cache: ${Date.now() - t}ms`);
    await clearModelCache();
  } else {
    console.log("\n(skipping dense suite; pass --dense to download/run the models)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
