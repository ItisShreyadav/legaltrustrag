/**
 * Parser self-test: exact offset round-trips, whole-document coverage, determinism,
 * and structural expectations on the synthetic fixtures in ./__fixtures__, plus
 * PDF / DOCX loader smoke tests on files generated in memory.
 *
 *   npx tsx src/lib/parse/selftest.ts [-v]
 *   node --experimental-strip-types src/lib/parse/selftest.ts [-v]   (Node >= 22.6, no tsx)
 *
 * Exits non-zero on failure. Not imported by the app.
 */
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import type { Clause, SourceDocument } from "../types";

// Plain Node can't resolve the extensionless imports Next.js uses; retry with ".ts".
const RESOLVE_HOOK = `export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (err) {
    if (err && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "ERR_UNSUPPORTED_DIR_IMPORT") && /^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ext of [".ts", "/index.ts"]) { try { return await next(specifier + ext, context); } catch {} }
    }
    throw err;
  }
}`;
register(`data:text/javascript,${encodeURIComponent(RESOLVE_HOOK)}`);

const here = path.dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes("-v");
let failures = 0;
let checks = 0;

function expect(cond: unknown, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  FAIL ${msg}`);
  }
}

function byPath(clauses: Clause[], p: string[]): Clause[] {
  return clauses.filter((c) => c.path.length === p.length && c.path.every((x, i) => x === p[i]));
}

function one(clauses: Clause[], p: string[]): Clause {
  const hits = byPath(clauses, p);
  expect(hits.length >= 1, `clause with path ${JSON.stringify(p)} exists`);
  return hits[0] ?? ({ id: "missing", path: p, text: "", references: [], definedTerms: [] } as unknown as Clause);
}

function dump(doc: SourceDocument, clauses: Clause[]): void {
  for (const c of clauses) {
    const flags = [c.isException ? "EXC" : "", c.definedTerms.length ? `defines=${c.definedTerms.join("|")}` : ""]
      .filter(Boolean)
      .join(" ");
    console.log(
      `  ${c.id.padEnd(12)} ${c.path.join(" > ").padEnd(42)} [${c.start}-${c.end}] ${c.heading ? `"${c.heading}" ` : ""}${flags}`,
    );
    if (c.references.length) console.log(`  ${"".padEnd(12)} refs -> ${c.references.join(", ")}`);
    console.log(`  ${"".padEnd(12)} ${JSON.stringify(c.text.slice(0, 90))}`);
  }
  void doc;
}

// --- tiny in-memory PDF / DOCX builders for loader smoke tests -------------------------

function makePdf(lines: string[]): Uint8Array {
  let y = 720;
  const ops = lines
    .map((l) => {
      const s = `BT /F1 11 Tf 72 ${y} Td (${l.replace(/[()\\]/g, (c) => "\\" + c)}) Tj ET`;
      y -= 14;
      return s;
    })
    .join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

function makeZip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const n = Buffer.from(name);
    const d = Buffer.from(content);
    const crc = crc32(d);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(d.length, 18);
    h.writeUInt32LE(d.length, 22);
    h.writeUInt16LE(n.length, 26);
    parts.push(h, n, d);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(d.length, 20);
    c.writeUInt32LE(d.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(off, 42);
    central.push(c, n);
    off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

function makeDocx(paragraphs: string[]): Buffer {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`)
    .join("");
  const xml = '<?xml version="1.0" encoding="UTF-8"?>';
  return makeZip({
    "[Content_Types].xml": `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `${xml}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  });
}

// ----------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const parse = await import("./index");
  const { loadDocument, structureDocument, checkClauses, buildGraph, normalizeText, MAX_CLAUSE_CHARS } = parse;

  // normalisation
  expect(normalizeText("﻿a\r\nb  \r\n\r\n\r\n\r\n\r\nc\u0000\rd\n") === "a\nb\n\n\nc\nd", "normalizeText");

  const dir = path.join(here, "__fixtures__");
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  const results = new Map<string, Clause[]>();

  for (const [i, f] of files.entries()) {
    const doc = await loadDocument({ name: f, bytes: readFileSync(path.join(dir, f)) }, i + 1);
    const clauses = structureDocument(doc);
    console.log(`${f}: ${clauses.length} clauses from ${doc.text.length} chars (${doc.id})`);
    if (verbose) dump(doc, clauses);
    for (const p of checkClauses(doc, clauses)) expect(false, `${f}: ${p}`);
    for (const c of clauses) expect(doc.text.slice(c.start, c.end) === c.text, `${c.id} offsets round-trip`);
    expect(JSON.stringify(structureDocument(doc)) === JSON.stringify(clauses), `${f}: deterministic`);
    const crlf = await loadDocument(
      { name: f, bytes: Buffer.from(doc.text.replace(/\n/g, "\r\n") + "\r\n\r\n\r\n\r\n\u0000") },
      "doc_x",
    );
    expect(crlf.text === doc.text, `${f}: CRLF/NUL variant normalises to same text`);
    results.set(f, clauses);
  }

  // --- license_agreement.txt: ARTICLE / 2.2 / (a) / (i), definitions, exceptions -----------
  const lic = results.get("license_agreement.txt") ?? [];
  if (lic.length) {
    const pre = one(lic, ["Preamble"]);
    expect(pre.text.startsWith("SOFTWARE LICENSE AGREEMENT"), "license: title folded into preamble");
    for (const t of ["Agreement", "Effective Date", "Licensor", "Licensee", "Party", "Parties"])
      expect(pre.definedTerms.includes(t), `license: preamble defines ${t}`);
    one(lic, ["Recitals", "Recital 1"]);
    one(lic, ["Recitals", "Recital 2"]);
    const aff = one(lic, ["Article I", '"Affiliate"']);
    expect(aff.heading === "DEFINITIONS", "license: definition inherits DEFINITIONS heading");
    expect(aff.text.startsWith("ARTICLE I"), "license: header-only article folded into first child");
    expect(aff.definedTerms.includes("Affiliate"), "license: Affiliate defined");
    const sw = one(lic, ["Article I", '"Software"']);
    const territory = one(lic, ["Article I", '"Territory"']);
    expect(territory.definedTerms.includes("Territory"), "license: 'shall mean' definition");
    const g21 = one(lic, ["Article II", "2.1"]);
    const g22 = one(lic, ["Article II", "2.2"]);
    expect(g21.heading === "Grant", "license: inline heading 'Grant'");
    expect(g22.isException && g22.references.includes(g21.id), "license: 2.2 is an exception referencing 2.1");
    expect(g21.references.includes(g22.id), "license: 2.1 links back to its exception 2.2");
    expect(g21.references.includes(territory.id), "license: 2.1 links to Territory definition");
    one(lic, ["Article II", "2.2", "(a)"]);
    one(lic, ["Article II", "2.2", "(c)"]);
    one(lic, ["Article II", "2.2", "(c)", "(i)"]);
    one(lic, ["Article II", "2.2", "(c)", "(ii)"]);
    expect(one(lic, ["Article II", "2.2", "(b)"]).isException, "license: 'unless' marks (b) as exception");
    const exA = one(lic, ["Exhibit A"]);
    expect(exA.heading === "SOFTWARE DESCRIPTION", "license: exhibit title merged into heading");
    const u32 = one(lic, ["Article III", "3.2"]);
    expect(sw.references.includes(exA.id) && sw.references.includes(u32.id), "license: Software -> Exhibit A + Section 3.2");
    const audit = one(lic, ["Article III", "3.3"]);
    expect(audit.references.includes(g21.id), "license: 'Article II' resolves to Article II clauses");
    const t42b = one(lic, ["Article IV", "4.2", "(b)"]);
    expect(one(lic, ["Article IV", "4.3"]).references.includes(t42b.id), "license: 'clause 4.2(b)' resolves");
    const l51 = one(lic, ["Article V", "5.1"]);
    const l52 = one(lic, ["Article V", "5.2"]);
    expect(l52.isException && l52.references.includes(l51.id), "license: 5.2 notwithstanding 5.1");
    expect(l51.references.includes(l52.id), "license: 5.1 links back to carve-out 5.2");
    expect(one(lic, ["Article VI", "6.1"]).heading === "Governing Law", "license: Governing Law heading");
    const sig = byPath(lic, ["Signatures"]);
    expect(sig.length === 1 && sig[0].text.includes("Jane Doe") && sig[0].text.includes("John Roe"), "license: signature block kept whole");
    const graph = buildGraph(lic);
    expect(graph.definitions.get("Confidential Information") === one(lic, ["Article I", '"Confidential Information"']).id, "license: graph definitions");
    expect(graph.links.get(l51.id)?.includes(l52.id), "license: graph links 5.1 -> 5.2");
  }

  // --- services_agreement.txt: hard-wrapped lines, 1. / 1.1 numbering, long clause --------
  const msa = results.get("services_agreement.txt") ?? [];
  if (msa.length) {
    const pre = one(msa, ["Preamble"]);
    expect(pre.text.includes("each\na \"Party\"."), "msa: wrapped preamble kept in one clause");
    const long = byPath(msa, ["Section 4", "4.1"]);
    expect(long.length >= 2, "msa: >1500-char clause split into parts");
    expect(long.every((c) => c.text.length <= MAX_CLAUSE_CHARS && /[.;:]$/.test(c.text)), "msa: split parts end at sentence boundaries");
    const s11 = one(msa, ["Section 1", "1.1"]);
    expect(s11.heading === "Statements of Work", "msa: inline heading on numbered section");
    expect(s11.definedTerms.includes("Statement of Work") && s11.definedTerms.includes("SOW"), "msa: (each, a \"X\" or \"Y\") definitions");
    const s31 = one(msa, ["Section 3", "3.1"]);
    const s32 = one(msa, ["Section 3", "3.2"]);
    expect(s32.isException && s32.references.includes(s31.id), "msa: 3.2 notwithstanding 3.1");
    const s72 = one(msa, ["Section 7", "7.2"]);
    expect(s72.references.includes(s31.id) && s72.references.includes(s32.id), "msa: 'Sections 3.1 and 3.2'");
    expect(one(msa, ["Section 7", "7.1"]).references.includes(s72.id), "msa: 'Section 7' resolves to its subsections");
    const disc = byPath(msa, ["Section 5", "5.2"]);
    expect(disc.length === 1 && disc[0].heading === "DISCLAIMER", "msa: ALL-CAPS paragraph stays one clause");
    expect(one(msa, ["Section 8", "8.2"]).heading === "Governing Law", "msa: governing law heading");
  }

  // --- nda.txt: unnumbered paragraph headings, Title Case headings, schedule ---------------
  const nda = results.get("nda.txt") ?? [];
  if (nda.length) {
    one(nda, ["Recital 1"]);
    one(nda, ["Recital 2"]);
    const ci = one(nda, ["Definitions", '"Confidential Information"']);
    for (const t of ["Confidential Information", "Discloser", "Recipient"])
      expect(ci.definedTerms.includes(t), `nda: defines ${t}`);
    const reps = one(nda, ["Definitions", '"Representatives"']);
    const obl = one(nda, ["Obligations"]);
    expect(obl.references.includes(ci.id) && obl.references.includes(reps.id), "nda: defined-term uses link to definitions");
    expect(one(nda, ["Exceptions"]).isException, "nda: Exceptions paragraph flagged");
    expect(one(nda, ["Non-Solicitation"]).isException, "nda: 'unless' flagged");
    one(nda, ["Term"]);
    expect(one(nda, ["Governing Law"]).text.includes("laws of Germany"), "nda: Title Case heading + body");
    one(nda, ["Schedule 1"]);
  }

  // --- synthetic edge cases ----------------------------------------------------------------
  {
    const blob = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" "); // no sentence ends at all
    const doc: SourceDocument = { id: "doc_blob", name: "blob.txt", kind: "txt", text: blob };
    const cl = structureDocument(doc);
    expect(cl.length >= 2 && checkClauses(doc, cl).length === 0, "edge: unpunctuated blob hard-split with valid offsets");
    const empty = structureDocument({ id: "doc_e", name: "e.txt", kind: "txt", text: "" });
    expect(empty.length === 0, "edge: empty document -> no clauses");
  }

  // --- loader smoke tests ------------------------------------------------------------------
  {
    const lines = ["1. Definitions", '1.1 "Fees" means the amounts in Section 2.', "2. Payment. Fees are due monthly."];
    const pdf = await loadDocument({ name: "tiny.pdf", bytes: makePdf(lines) }, "doc_pdf");
    expect(pdf.kind === "pdf" && pdf.text.includes("Fees are due monthly"), "loader: PDF text extracted");
    const pdfClauses = structureDocument(pdf);
    expect(checkClauses(pdf, pdfClauses).length === 0 && pdfClauses.length >= 2, "loader: PDF structured");
    const docx = await loadDocument({ name: "tiny.docx", bytes: makeDocx(lines) }, "doc_docx");
    expect(docx.kind === "docx" && docx.text.includes("Fees are due monthly"), "loader: DOCX text extracted");
    const docxClauses = structureDocument(docx);
    expect(checkClauses(docx, docxClauses).length === 0 && docxClauses.length >= 2, "loader: DOCX structured");
    if (verbose) {
      console.log(`tiny.pdf -> ${JSON.stringify(pdf.text)}`);
      console.log(`tiny.docx -> ${JSON.stringify(docx.text)}`);
    }
    const sniffed = await loadDocument({ name: "upload", bytes: makePdf(lines) }, 7);
    expect(sniffed.kind === "pdf" && sniffed.id === "doc_7", "loader: magic-byte sniffing + numeric id");
  }

  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
