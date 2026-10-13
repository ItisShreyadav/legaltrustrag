/**
 * Stage 6: assemble the TrustReport.
 */
import type { Clause, ComplianceRow, Finding, NliLabel, SourceDocument, TrustReport } from "@/lib/types";

export const DISCLAIMER =
  "This report is an aid for review and not legal advice. Findings are generated automatically by AI models and may be " +
  "incomplete or wrong. Every quoted passage was checked character for character against the uploaded document, but the " +
  "conclusions drawn from those passages must be confirmed by a qualified lawyer before anyone relies on them. Withheld " +
  "findings did not pass verification and are listed for transparency only.";

export interface BuildReportInput {
  docs: SourceDocument[];
  clauses: Clause[];
  findings: Finding[];
  compliance: ComplianceRow[];
  candidatePairs: number;
}

const LABEL_ORDER: Record<NliLabel, number> = { contradict: 0, exception: 1, agree: 2, not_mentioned: 3 };
const STATUS_ORDER = { verified: 0, unverified: 1, withheld: 2 } as const;

/** Contradictions before exceptions, then confidence (desc), then id for stability. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    LABEL_ORDER[a.label] - LABEL_ORDER[b.label] ||
    b.confidence - a.confidence ||
    STATUS_ORDER[a.verification.status] - STATUS_ORDER[b.verification.status] ||
    a.id.localeCompare(b.id)
  );
}

export function buildReport(input: BuildReportInput): TrustReport {
  // Every finding, conflict and compliance, counted once (a compliance finding may also be passed in `findings`).
  const all = new Map<string, Finding>();
  for (const f of input.findings) all.set(f.id, f);
  for (const row of input.compliance) if (row.finding) all.set(row.finding.id, row.finding);

  const everything = [...all.values()];
  const findings = everything
    .filter((f) => f.kind === "conflict" && f.verification.status !== "withheld")
    .sort(compareFindings);
  const withheld = everything.filter((f) => f.verification.status === "withheld").sort(compareFindings);

  const count = (s: Finding["verification"]["status"]) => everything.filter((f) => f.verification.status === s).length;
  const verified = count("verified");
  const unverified = count("unverified");
  const withheldCount = count("withheld");

  return {
    documents: input.docs.map(({ id, name, kind }) => ({ id, name, kind })),
    clauseCount: input.clauses.length,
    findings,
    compliance: [...input.compliance],
    withheld,
    stats: {
      candidatePairs: input.candidatePairs,
      verified,
      unverified,
      withheld: withheldCount,
      abstainRate: everything.length === 0 ? 0 : withheldCount / everything.length,
    },
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}
