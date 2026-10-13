/**
 * Shared contract for the LegalTrustRAG pipeline.
 * Every module imports from here. Do not change shapes without updating all consumers.
 */

/** CUAD's 41 clause categories plus "Other". */
export const CUAD_CATEGORIES = [
  "Document Name", "Parties", "Agreement Date", "Effective Date", "Expiration Date",
  "Renewal Term", "Notice Period To Terminate Renewal", "Governing Law", "Most Favored Nation",
  "Non-Compete", "Exclusivity", "No-Solicit Of Customers", "Competitive Restriction Exception",
  "No-Solicit Of Employees", "Non-Disparagement", "Termination For Convenience",
  "Rofr/Rofo/Rofn", "Change Of Control", "Anti-Assignment", "Revenue/Profit Sharing",
  "Price Restrictions", "Minimum Commitment", "Volume Restriction", "Ip Ownership Assignment",
  "Joint Ip Ownership", "License Grant", "Non-Transferable License", "Affiliate License-Licensor",
  "Affiliate License-Licensee", "Unlimited/All-You-Can-Eat-License", "Irrevocable Or Perpetual License",
  "Source Code Escrow", "Post-Termination Services", "Audit Rights", "Uncapped Liability",
  "Cap On Liability", "Liquidated Damages", "Warranty Duration", "Insurance", "Covenant Not To Sue",
  "Third Party Beneficiary", "Other",
] as const;
export type CuadCategory = (typeof CUAD_CATEGORIES)[number];

/** Pairs of categories that are natural conflict candidates. */
export const CONFLICT_PAIRS: ReadonlyArray<readonly [CuadCategory, CuadCategory]> = [
  ["Non-Compete", "Competitive Restriction Exception"],
  ["Cap On Liability", "Uncapped Liability"],
  ["Exclusivity", "Competitive Restriction Exception"],
  ["License Grant", "Non-Transferable License"],
  ["Anti-Assignment", "Change Of Control"],
  ["Termination For Convenience", "Post-Termination Services"],
  ["Expiration Date", "Renewal Term"],
  ["Ip Ownership Assignment", "Joint Ip Ownership"],
  ["Irrevocable Or Perpetual License", "Expiration Date"],
];

export interface SourceDocument {
  id: string;            // stable id, e.g. "doc_1"
  name: string;          // file name
  kind: "pdf" | "docx" | "txt";
  text: string;          // full normalised plain text; every offset below indexes into this string
}

/** A clause-level chunk. `start`/`end` are character offsets into SourceDocument.text (end exclusive). */
export interface Clause {
  id: string;            // "doc_1:c_12"
  docId: string;
  path: string[];        // hierarchy, e.g. ["Article 5", "5.2", "(a)"]
  heading?: string;
  text: string;          // === doc.text.slice(start, end)
  start: number;
  end: number;
  category: CuadCategory;
  categoryConfidence: number;   // 0..1
  definedTerms: string[];       // terms this clause defines, e.g. ["Confidential Information"]
  references: string[];         // clause ids this clause links to (exceptions, definitions, cross-refs)
  isException: boolean;         // contains "except", "notwithstanding", "subject to", etc.
}

export interface StructuredDocument {
  doc: SourceDocument;
  clauses: Clause[];
}

export interface Quote {
  clauseId: string;
  docId: string;
  start: number;         // absolute offsets into doc.text
  end: number;
  text: string;          // must equal doc.text.slice(start, end) exactly
}

export type NliLabel = "agree" | "contradict" | "exception" | "not_mentioned";

export interface RetrievedClause {
  clause: Clause;
  score: number;             // final reranked score, higher is better
  bm25Score?: number;
  denseScore?: number;
  linked: Clause[];          // exceptions/definitions attached via Clause.references
}

export interface Finding {
  id: string;
  kind: "conflict" | "compliance";
  label: NliLabel;           // conflict: contradict | exception ; compliance: agree(met) | contradict(violated) | not_mentioned
  clauseA: Quote;            // for compliance: the rule statement is in `rule`, clauseA is the evidence
  clauseB?: Quote;           // second clause for conflicts
  rule?: string;             // compliance only: the user-supplied rule statement
  explanation: string;       // plain-language, 1-3 sentences
  confidence: number;        // 0..1 combined score
  verification: VerificationResult;
}

export interface VerificationCheck {
  name: "relevance" | "quote" | "support" | "conflict";
  passed: boolean;
  detail?: string;
}

export interface VerificationResult {
  checks: VerificationCheck[];
  status: "verified" | "unverified" | "withheld";
  retries: number;
}

export interface ComplianceRow {
  rule: string;
  status: "met" | "violated" | "not_addressed";
  finding?: Finding;
}

export interface TrustReport {
  documents: Array<Pick<SourceDocument, "id" | "name" | "kind">>;
  clauseCount: number;
  findings: Finding[];               // conflicts, verified + unverified
  compliance: ComplianceRow[];
  withheld: Finding[];               // findings that failed verification entirely
  stats: {
    candidatePairs: number;
    verified: number;
    unverified: number;
    withheld: number;
    abstainRate: number;             // withheld / (all)
  };
  disclaimer: string;
  generatedAt: string;               // ISO
}

/** Pipeline request from the UI. */
export interface AnalyzeRequest {
  documents: SourceDocument[];
  rules?: string[];
}

/** Server-sent progress events for the UI. */
export type ProgressEvent =
  | { stage: "structuring" | "typing" | "retrieval" | "conflict" | "verification" | "report"; message: string; pct: number }
  | { stage: "done"; report: TrustReport; runId?: string } // runId: the saved run (/runs/[id]), when it was persisted
  | { stage: "error"; message: string };

/** The signed-in user as exposed to pages, the header and /api/auth/*. Never includes the password hash. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}
