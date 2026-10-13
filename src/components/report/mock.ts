import type {
  Finding,
  ProgressEvent,
  Quote,
  SourceDocument,
  TrustReport,
  VerificationCheck,
} from "@/lib/types";

/*
 * Realistic TrustReport fixture for the `/?mock=1` preview, so the UI can be
 * exercised without an API key. The document texts are identical to
 * public/samples/msa.txt and public/samples/amendment.txt, and every exact quote
 * is located with indexOf, so offsets always satisfy
 * `doc.text.slice(q.start, q.end) === q.text`.
 */

const MSA_TEXT = `MASTER SERVICES AGREEMENT

This Master Services Agreement (the "Agreement") is made on 1 April 2026 between Acme Analytics Private Limited, a company incorporated in India ("Provider"), and Bluefin Retail Limited ("Customer").

1. DEFINITIONS
1.1 "Confidential Information" means all non-public business, technical or financial information disclosed by one party to the other in connection with this Agreement.
1.2 "Deliverables" means all reports, dashboards, models and other materials prepared by Provider for Customer under a Statement of Work.
1.3 "Fees" means the charges payable by Customer for the Services as set out in each Statement of Work.
1.4 "Intellectual Property Rights" means patents, copyrights, trade marks, database rights, trade secrets and all similar rights anywhere in the world.
1.5 "Services" means the data analytics services described in each Statement of Work.

2. SERVICES
2.1 Provider shall perform the Services with reasonable skill and care and in accordance with good industry practice.
2.2 Each Statement of Work shall be signed by both parties and shall form part of this Agreement.

3. FEES AND PAYMENT
3.1 Customer shall pay the Fees within thirty (30) days of receipt of a valid invoice.
3.2 Late payments shall bear interest at the rate of one percent (1%) per month.

4. TERM AND TERMINATION
4.1 This Agreement commences on 1 April 2026 and continues for an initial term of two (2) years.
4.2 Either party may terminate this Agreement for convenience by giving the other party not less than thirty (30) days' prior written notice.
4.3 Either party may terminate this Agreement immediately if the other party commits a material breach that is not remedied within fifteen (15) days of written notice.

5. INDEMNITY
5.1 Provider shall indemnify Customer against all losses arising from any third-party claim that the Deliverables infringe that third party's Intellectual Property Rights.
5.2 Customer shall indemnify Provider against all losses arising from Customer's misuse of the Deliverables.

6. LIMITATION OF LIABILITY
6.1 Except as provided in Section 5, the total aggregate liability of either party arising out of or in connection with this Agreement shall not exceed the total Fees paid by Customer under this Agreement.
6.2 Neither party shall be liable for any indirect, special or consequential loss, including loss of profits.

7. INTELLECTUAL PROPERTY
7.1 All Intellectual Property Rights in the Deliverables shall vest in Customer upon payment of the applicable Fees.
7.2 Provider retains all Intellectual Property Rights in its pre-existing tools and grants Customer a non-exclusive, non-transferable licence to use them solely with the Deliverables.

8. CONFIDENTIALITY
8.1 Each party shall keep the other party's Confidential Information confidential and shall use it only to perform its obligations under this Agreement.

9. GOVERNING LAW AND JURISDICTION
9.1 This Agreement shall be governed by and construed in accordance with the laws of India, and the courts at Pune shall have exclusive jurisdiction.

10. GENERAL
10.1 Neither party may assign this Agreement without the prior written consent of the other party.
10.2 This Agreement may be amended only by a written instrument signed by both parties.
`;

const AMENDMENT_TEXT = `AMENDMENT NO. 1 TO MASTER SERVICES AGREEMENT

This Amendment No. 1 (the "Amendment") is made on 15 September 2026 between Acme Analytics Private Limited ("Provider") and Bluefin Retail Limited ("Customer") and amends the Master Services Agreement dated 1 April 2026 (the "Agreement").

1. DEFINITIONS
1.1 Capitalised terms used but not defined in this Amendment have the meanings given to them in the Agreement.
1.2 "Amendment Effective Date" means 1 October 2026.
1.3 "Priority Support" means the extended support services described in Schedule A to this Amendment.

2. TERMINATION
2.1 Either party may terminate the Agreement for convenience by giving the other party not less than sixty (60) days' prior written notice.
2.2 Customer shall pay all Fees for Services performed up to the effective date of termination.

3. LIABILITY FOR INTELLECTUAL PROPERTY BREACH
3.1 Notwithstanding anything to the contrary in the Agreement, Provider's liability for any breach of Section 7 of the Agreement or any infringement of a third party's Intellectual Property Rights shall be unlimited.
3.2 Subject to Section 3.1, Section 6 of the Agreement continues to apply.

4. PRIORITY SUPPORT
4.1 From the Amendment Effective Date, Provider shall provide Priority Support to Customer for an additional monthly fee set out in Schedule A.
4.2 Priority Support requests shall be acknowledged within four (4) business hours.

5. FEES
5.1 The Fees for Priority Support shall be invoiced monthly in arrears and are payable within forty-five (45) days of receipt of a valid invoice.

6. GOVERNING LAW
6.1 This Amendment shall be governed by and construed in accordance with the laws of Singapore.

7. GENERAL
7.1 Except as expressly amended by this Amendment, the Agreement remains in full force and effect.
7.2 In the event of any inconsistency between this Amendment and the Agreement, this Amendment shall prevail.
7.3 This Amendment may be executed in counterparts, each of which shall be deemed an original.

Signed for and on behalf of Acme Analytics Private Limited: ____________________
Signed for and on behalf of Bluefin Retail Limited: ____________________
`;

export const mockDocuments: SourceDocument[] = [
  { id: "doc_1", name: "msa.txt", kind: "txt", text: MSA_TEXT },
  { id: "doc_2", name: "amendment.txt", kind: "txt", text: AMENDMENT_TEXT },
];

const TEXT_BY_ID: Record<string, string> = Object.fromEntries(
  mockDocuments.map((d) => [d.id, d.text]),
);

/** Build an exact quote by locating `needle` in the document text. */
function quote(docId: string, clause: string, needle: string): Quote {
  const text = TEXT_BY_ID[docId] ?? "";
  const start = text.indexOf(needle);
  if (start === -1) throw new Error(`mock.ts: quote not found in ${docId}: ${needle}`);
  return { clauseId: `${docId}:${clause}`, docId, start, end: start + needle.length, text: needle };
}

function check(name: VerificationCheck["name"], passed: boolean, detail: string): VerificationCheck {
  return { name, passed, detail };
}

const EXACT = "Quoted text matches the source document exactly at the cited offsets.";

const conflicts: Finding[] = [
  {
    id: "f_1",
    kind: "conflict",
    label: "contradict",
    clauseA: quote(
      "doc_1",
      "c_12",
      "Either party may terminate this Agreement for convenience by giving the other party not less than thirty (30) days' prior written notice.",
    ),
    clauseB: quote(
      "doc_2",
      "c_5",
      "Either party may terminate the Agreement for convenience by giving the other party not less than sixty (60) days' prior written notice.",
    ),
    explanation:
      "The MSA lets either party terminate for convenience on 30 days' notice, while Amendment No. 1 sets 60 days for the same right. The MSA clause was never expressly deleted, so the two notice periods conflict; Amendment Section 7.2 suggests the 60-day period prevails.",
    confidence: 0.92,
    verification: {
      status: "verified",
      retries: 0,
      checks: [
        check("relevance", true, "Both clauses typed as Termination For Convenience (0.97 / 0.95)."),
        check("quote", true, EXACT),
        check("support", true, "Both notice periods (30 and 60 days) appear verbatim in the quoted text."),
        check("conflict", true, "Independent re-check agreed: contradict (0.94)."),
      ],
    },
  },
  {
    id: "f_2",
    kind: "conflict",
    label: "exception",
    clauseA: quote(
      "doc_1",
      "c_16",
      "the total aggregate liability of either party arising out of or in connection with this Agreement shall not exceed the total Fees paid by Customer under this Agreement",
    ),
    clauseB: quote(
      "doc_2",
      "c_7",
      "Notwithstanding anything to the contrary in the Agreement, Provider's liability for any breach of Section 7 of the Agreement or any infringement of a third party's Intellectual Property Rights shall be unlimited.",
    ),
    explanation:
      "The MSA caps each party's total liability at the Fees paid (apart from the Section 5 indemnity). The Amendment carves out IP breaches and third-party IP infringement, making the Provider's liability for those claims unlimited, so the cap no longer covers them.",
    confidence: 0.86,
    verification: {
      status: "verified",
      retries: 1,
      checks: [
        check("relevance", true, "Cap On Liability vs Uncapped Liability: a known conflict pair."),
        check("quote", true, "First attempt quoted \"liability shall be uncapped\", which is not in the source. Regenerated quote matches exactly."),
        check("support", true, "\"shall be unlimited\" and \"shall not exceed the total Fees\" are both present in the quotes."),
        check("conflict", true, "Re-check agreed: exception (0.88). Linked via MSA 6.1 \"Except as provided in Section 5\"."),
      ],
    },
  },
  {
    id: "f_3",
    kind: "conflict",
    label: "contradict",
    clauseA: quote(
      "doc_1",
      "c_21",
      "This Agreement shall be governed by and construed in accordance with the laws of India",
    ),
    clauseB: quote(
      "doc_2",
      "c_13",
      "This Amendment shall be governed by and construed in accordance with the laws of Singapore.",
    ),
    explanation:
      "The MSA selects Indian law while the Amendment selects Singapore law. Because the Amendment is part of the same contract, a court could have to apply two different governing laws.",
    confidence: 0.54,
    verification: {
      status: "unverified",
      retries: 1,
      checks: [
        check("relevance", true, "Both clauses typed as Governing Law (0.99 / 0.98)."),
        check("quote", true, EXACT),
        check("support", true, "Both governing-law choices appear verbatim."),
        check(
          "conflict",
          false,
          "Re-check returned not_mentioned: the Singapore clause may govern only the Amendment itself, not the Agreement.",
        ),
      ],
    },
  },
];

const withheld: Finding[] = (() => {
  const amendmentFeesAt = AMENDMENT_TEXT.indexOf("are payable within forty-five");
  const paraphrase = "All Fees are payable within forty-five (45) days.";
  return [
    {
      id: "w_1",
      kind: "conflict",
      label: "contradict",
      clauseA: quote("doc_1", "c_8", "Customer shall pay the Fees within thirty (30) days of receipt of a valid invoice."),
      clauseB: {
        clauseId: "doc_2:c_11",
        docId: "doc_2",
        start: amendmentFeesAt,
        end: amendmentFeesAt + paraphrase.length,
        text: paraphrase,
      },
      explanation: "Possible conflict between the 30-day payment term in the MSA and a 45-day term in the Amendment.",
      confidence: 0.31,
      verification: {
        status: "withheld",
        retries: 2,
        checks: [
          check("relevance", true, "Both clauses concern payment terms."),
          check(
            "quote",
            false,
            "Quote B is a paraphrase and does not match the source at the cited offsets (2 retries exhausted).",
          ),
          check("support", false, "Amendment 5.1 applies only to Priority Support fees, not to all Fees."),
          check("conflict", false, "Not evaluated: earlier checks failed."),
        ],
      },
    },
    {
      id: "w_2",
      kind: "conflict",
      label: "contradict",
      clauseA: quote(
        "doc_1",
        "c_23",
        "Neither party may assign this Agreement without the prior written consent of the other party.",
      ),
      clauseB: quote(
        "doc_1",
        "c_19",
        "grants Customer a non-exclusive, non-transferable licence to use them solely with the Deliverables",
      ),
      explanation: "Candidate pair from retrieval: assignment restriction vs licence transferability.",
      confidence: 0.18,
      verification: {
        status: "withheld",
        retries: 0,
        checks: [
          check("relevance", false, "Clauses address different subjects (contract assignment vs licence scope)."),
          check("quote", true, EXACT),
          check("support", false, "No shared obligation found between the two clauses."),
          check("conflict", false, "Not evaluated: relevance gate failed."),
        ],
      },
    },
  ];
})();

const lawFinding: Finding = {
  id: "r_1",
  kind: "compliance",
  label: "agree",
  rule: "The agreement must be governed by the laws of India.",
  clauseA: quote(
    "doc_1",
    "c_21",
    "This Agreement shall be governed by and construed in accordance with the laws of India, and the courts at Pune shall have exclusive jurisdiction.",
  ),
  explanation:
    "MSA Section 9.1 selects Indian law with exclusive jurisdiction in Pune. Note that Amendment Section 6.1 selects Singapore law for the Amendment itself (see Findings).",
  confidence: 0.88,
  verification: {
    status: "verified",
    retries: 0,
    checks: [
      check("relevance", true, "Clause typed as Governing Law."),
      check("quote", true, EXACT),
      check("support", true, "\"laws of India\" appears verbatim."),
      check("conflict", true, "Re-check agreed: agree (0.90)."),
    ],
  },
};

const capFinding: Finding = {
  id: "r_2",
  kind: "compliance",
  label: "contradict",
  rule: "Liability must be capped at the total fees paid.",
  clauseA: quote(
    "doc_2",
    "c_7",
    "Provider's liability for any breach of Section 7 of the Agreement or any infringement of a third party's Intellectual Property Rights shall be unlimited",
  ),
  explanation:
    "MSA Section 6.1 caps liability at the Fees paid, but Amendment Section 3.1 makes the Provider's liability for IP breaches unlimited, so liability is not fully capped.",
  confidence: 0.9,
  verification: {
    status: "verified",
    retries: 0,
    checks: [
      check("relevance", true, "Clause typed as Uncapped Liability."),
      check("quote", true, EXACT),
      check("support", true, "\"shall be unlimited\" directly contradicts a cap."),
      check("conflict", true, "Re-check agreed: contradict (0.91)."),
    ],
  },
};

const paymentFinding: Finding = {
  id: "r_3",
  kind: "compliance",
  label: "agree",
  rule: "Invoices must be payable within 60 days or less.",
  clauseA: quote("doc_1", "c_8", "Customer shall pay the Fees within thirty (30) days of receipt of a valid invoice."),
  explanation:
    "The MSA sets a 30-day payment term. The Amendment's 45-day term for Priority Support fees is also within 60 days.",
  confidence: 0.81,
  verification: {
    status: "verified",
    retries: 0,
    checks: [
      check("relevance", true, "Clause concerns payment terms."),
      check("quote", true, EXACT),
      check("support", true, "\"thirty (30) days\" appears verbatim."),
      check("conflict", true, "Re-check agreed: agree (0.84)."),
    ],
  },
};

export const mockReport: TrustReport = {
  documents: mockDocuments.map(({ id, name, kind }) => ({ id, name, kind })),
  clauseCount: 38,
  findings: conflicts,
  compliance: [
    { rule: lawFinding.rule ?? "", status: "met", finding: lawFinding },
    { rule: capFinding.rule ?? "", status: "violated", finding: capFinding },
    { rule: paymentFinding.rule ?? "", status: "met", finding: paymentFinding },
    { rule: "Personal data must not be transferred outside India without prior written consent.", status: "not_addressed" },
  ],
  withheld,
  stats: {
    candidatePairs: 18,
    verified: 5,
    unverified: 1,
    withheld: 2,
    abstainRate: 0.25,
  },
  disclaimer:
    "LegalTrustRAG is an automated research aid, not legal advice. Findings are machine-generated, may be incomplete or wrong, and must be reviewed by a qualified lawyer before anyone relies on them.",
  generatedAt: "2026-10-13T09:30:00.000Z",
};

/** Scripted progress events for the simulated run in mock mode. */
export const mockProgress: ProgressEvent[] = [
  { stage: "structuring", message: "Parsed 2 documents into 38 clauses; 9 defined terms, 4 cross-references.", pct: 10 },
  { stage: "typing", message: "Classifying clauses into CUAD categories (batch 1 of 2).", pct: 22 },
  { stage: "typing", message: "Classifying clauses into CUAD categories (batch 2 of 2).", pct: 32 },
  { stage: "retrieval", message: "Hybrid BM25 + dense retrieval: 18 candidate clause pairs.", pct: 45 },
  { stage: "conflict", message: "Running NLI on 18 clause pairs and 4 compliance rules.", pct: 60 },
  { stage: "verification", message: "Verifying 8 findings: quotes, support and conflict re-checks.", pct: 78 },
  { stage: "verification", message: "Retrying 2 findings with failed checks.", pct: 88 },
  { stage: "report", message: "Assembling trust report.", pct: 96 },
];
