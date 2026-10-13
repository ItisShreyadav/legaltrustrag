/**
 * Stage 1: document loading and structuring.
 *
 * - loadDocument: PDF (unpdf) / DOCX (mammoth) / TXT -> SourceDocument with normalised text.
 * - structureDocument: SourceDocument -> Clause[] with exact offsets, hierarchy path,
 *   defined terms, exception flag and resolved references. Pure + deterministic.
 * - buildGraph: definition and link maps for retrieval.
 */
export { loadDocument, normalizeText, type InputFile } from "./load";
export { structureDocument, checkClauses, MAX_CLAUSE_CHARS } from "./structure";
export { buildGraph, type ClauseGraph } from "./graph";
