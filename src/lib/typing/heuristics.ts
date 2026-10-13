import type { Clause, CuadCategory } from "../types";

export interface TypeGuess {
  category: CuadCategory;
  confidence: number;
}

/** Heuristic guesses at or above this confidence skip the LLM. */
export const HEURISTIC_SKIP_THRESHOLD = 0.9;

interface Ctx {
  clause: Clause;
  text: string;
  heading: string;
  top: string;
  last: string;
}

interface Rule {
  category: CuadCategory;
  confidence: number;
  test: (c: Ctx) => boolean;
}

const has = (re: RegExp) => (c: Ctx) => re.test(c.text);

const BOILERPLATE_HEADING =
  /^(?:notices?|counterparts|entire agreement|severability|headings|captions|waiver|no waiver|force majeure|amendments?|amendment and waiver|relationship of the parties|independent contractors?|interpretation|construction|further assurances|publicity|definitions?|defined terms|recitals|witnesseth|confidentiality|confidential information)$/i;

/** "may not assign this Agreement", "assign any of its rights ... without ... consent" */
const ASSIGNMENT_RE =
  /\b(?:may|shall|will)\s+not\b[^.]{0,40}\b(?:assign|transfer)\b[^.]{0,60}\b(?:this\s+agreement|rights|obligations|interests?)\b|\bassign\w*\b[^.]{0,40}\b(?:this\s+agreement|its\s+rights|any\s+(?:of\s+its\s+)?rights)\b[^.]{0,160}\bwithout\b[^.]{0,80}\bconsent\b/i;

const DATE =
  /\b(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/;

/**
 * Keyword rules. Strong rules (>= HEURISTIC_SKIP_THRESHOLD) are trusted without the LLM;
 * weaker ones are only used as a fallback when the LLM is unavailable or fails.
 */
const RULES: Rule[] = [
  // --- strong -------------------------------------------------------------------------
  { category: "Other", confidence: 0.95, test: (c) => c.top === "Signatures" },
  {
    category: "Document Name",
    confidence: 0.95,
    test: (c) =>
      c.top === "Preamble" &&
      c.text.length <= 120 &&
      !/[.;]\s/.test(c.text) &&
      /\b(?:AGREEMENT|CONTRACT|LICENSE|LICENCE|LEASE|ADDENDUM|AMENDMENT|TERMS|ORDER|MEMORANDUM)\b/i.test(c.text),
  },
  {
    category: "Parties",
    confidence: 0.92,
    test: (c) => c.top === "Preamble" && /\b(?:by\s+and\s+)?between\b[\s\S]{3,400}?\band\b/i.test(c.text),
  },
  {
    category: "Agreement Date",
    confidence: 0.9,
    test: (c) =>
      c.top === "Preamble" &&
      DATE.test(c.text) &&
      /\b(?:dated|made|entered\s+into|executed)\b/i.test(c.text) &&
      !/\bbetween\b/i.test(c.text),
  },
  {
    category: "Governing Law",
    confidence: 0.95,
    test: (c) =>
      /\bgoverned\s+by\b[^.]{0,120}\blaws?\b/i.test(c.text) ||
      /\blaws?\s+of\b[^.]{0,80}\bshall\s+govern\b/i.test(c.text) ||
      (/governing\s+law|choice\s+of\s+law|applicable\s+law/i.test(c.heading) && /\blaws?\b/i.test(c.text)),
  },
  { category: "Other", confidence: 0.9, test: (c) => /^Recital/.test(c.last) },
  {
    category: "Other",
    confidence: 0.9,
    test: (c) => c.last.startsWith('"') && /^["“][^"”]{1,80}["”]\s*(?:shall\s+mean|means|mean)\b/.test(c.text),
  },
  { category: "Other", confidence: 0.9, test: (c) => c.text.length < 40 && !/[.;]\s*\S/.test(c.text) },
  { category: "Other", confidence: 0.9, test: (c) => BOILERPLATE_HEADING.test(c.heading) && !/\blaws?\s+of\b/i.test(c.text) },
  { category: "Source Code Escrow", confidence: 0.93, test: (c) => /source\s+code/i.test(c.text) && /\bescrow/i.test(c.text) },
  { category: "Insurance", confidence: 0.92, test: (c) => /insurance/i.test(c.heading) && /\binsurance\b/i.test(c.text) },
  { category: "Audit Rights", confidence: 0.9, test: (c) => /\baudit/i.test(c.heading) && /\b(?:audit|inspect)/i.test(c.text) },
  { category: "Rofr/Rofo/Rofn", confidence: 0.9, test: has(/\bright\s+of\s+first\s+(?:refusal|offer|negotiation)\b/i) },
  { category: "Non-Compete", confidence: 0.9, test: (c) => /non-?compet/i.test(c.heading) && /\bcompet/i.test(c.text) && !c.clause.isException },
  {
    category: "No-Solicit Of Employees",
    confidence: 0.9,
    test: (c) => /non-?solicit/i.test(c.heading) && /\b(?:employ|personnel|staff|hire)/i.test(c.text) && !/\bcustomer|client/i.test(c.text),
  },
  {
    category: "Cap On Liability",
    confidence: 0.9,
    test: (c) =>
      /limitation\s+of\s+liability|liability\s+cap|limits?\s+on\s+liability/i.test(c.heading) &&
      /\b(?:shall|will)\s+not\s+exceed\b|\bin\s+no\s+event\b[^.]{0,160}\bexceed|\b(?:aggregate|total|maximum|cumulative)\s+liability\b/i.test(c.text) &&
      !c.clause.isException,
  },
  {
    category: "Anti-Assignment",
    confidence: 0.9,
    test: (c) =>
      /^assignment/i.test(c.heading) && ASSIGNMENT_RE.test(c.text),
  },

  // --- weak (fallback only) -----------------------------------------------------------
  { category: "Liquidated Damages", confidence: 0.85, test: has(/\bliquidated\s+damages\b|\btermination\s+fee\b/i) },
  { category: "Non-Disparagement", confidence: 0.85, test: has(/\bdisparag/i) },
  {
    category: "Termination For Convenience",
    confidence: 0.8,
    test: (c) =>
      /\b(?:for\s+convenience|without\s+cause|for\s+any\s+reason\s+or\s+no\s+reason|for\s+any\s+reason)\b/i.test(c.text) &&
      /\bterminat/i.test(`${c.text} ${c.heading}`),
  },
  { category: "Covenant Not To Sue", confidence: 0.8, test: has(/\b(?:covenants?|agrees?)\s+not\s+to\s+(?:sue|bring|assert|challenge|contest)\b|\bshall\s+not\s+(?:contest|challenge)\b[^.]{0,80}\b(?:validity|ownership)/i) },
  { category: "Third Party Beneficiary", confidence: 0.8, test: has(/\bthird[-\s]party\s+beneficiar/i) },
  { category: "Joint Ip Ownership", confidence: 0.8, test: has(/\bjoint(?:ly)?\s+own/i) },
  { category: "Renewal Term", confidence: 0.8, test: has(/\bautomatically\s+(?:renew|extend)|\bauto-?renew|\brenewal\s+term\b|\bsuccessive\s+(?:\w+\s+){0,3}(?:year|month|period|term)s?\b/i) },
  { category: "Most Favored Nation", confidence: 0.8, test: has(/\bmost\s+favou?red\b|\bno\s+less\s+favou?rable\b|\bmore\s+favou?rable\s+(?:terms|pricing|prices)\b/i) },
  { category: "Change Of Control", confidence: 0.8, test: has(/\bchange\s+(?:of|in)\s+control\b/i) },
  { category: "License Grant", confidence: 0.75, test: has(/\bhereby\s+grants?\b[^.]{0,200}\blicen[cs]e\b/i) },
  { category: "Irrevocable Or Perpetual License", confidence: 0.75, test: has(/\b(?:perpetual|irrevocable)\b[^.]{0,100}\blicen[cs]e/i) },
  { category: "Ip Ownership Assignment", confidence: 0.75, test: has(/\bhereby\s+assigns?\b|\bworks?\s+made\s+for\s+hire\b|\bshall\s+(?:be|become|remain)\s+the\s+(?:sole\s+(?:and\s+exclusive\s+)?)?(?:exclusive\s+)?property\s+of\b/i) },
  { category: "Minimum Commitment", confidence: 0.75, test: has(/\bminimum\s+(?:purchase|order|commitment|quantity|volume|annual|spend)\b|\bnot\s+less\s+than\b[^.]{0,100}\b(?:units|of\s+(?:services|products))\b/i) },
  { category: "Insurance", confidence: 0.75, test: has(/\bmaintain\b[^.]{0,80}\binsurance\b/i) },
  { category: "Audit Rights", confidence: 0.75, test: has(/\b(?:right\s+to\s+)?audit\b[^.]{0,80}\b(?:books|records|accounts)\b|\binspect\b[^.]{0,60}\b(?:books|records)\b/i) },
  { category: "No-Solicit Of Employees", confidence: 0.75, test: has(/\bsolicit\w*\b[^.]{0,120}\b(?:employees?|personnel|staff|contractors)\b|\bhire\b[^.]{0,60}\bemployees?\b/i) },
  { category: "No-Solicit Of Customers", confidence: 0.75, test: has(/\bsolicit\w*\b[^.]{0,120}\b(?:customers?|clients?)\b/i) },
  { category: "Anti-Assignment", confidence: 0.75, test: has(ASSIGNMENT_RE) },
  { category: "Cap On Liability", confidence: 0.75, test: has(/\b(?:aggregate|total|maximum|cumulative)\s+liability\b|\bliability\b[^.]{0,120}\b(?:shall|will)\s+not\s+exceed\b|\bin\s+no\s+event\b[^.]{0,160}\bexceed/i) },
  { category: "Uncapped Liability", confidence: 0.7, test: (c) => /\bliabil/i.test(c.text) && /\b(?:shall|will)\s+not\s+apply\s+to\b|\bexclu\w+\s+from\b[^.]{0,80}\b(?:limitation|cap)\b|\bunlimited\s+liability\b/i.test(c.text) },
  { category: "Warranty Duration", confidence: 0.7, test: has(/\bwarrant\w*\b[^.]{0,200}\b(?:for\s+a\s+period\s+of|within|for)\b[^.]{0,40}\b(?:days|months|years)\b/i) },
  { category: "Non-Transferable License", confidence: 0.7, test: (c) => /\bnon-?transferable\b|\bmay\s+not\s+(?:sublicense|transfer)\b/i.test(c.text) && /\blicen[cs]e/i.test(c.text) },
  { category: "Revenue/Profit Sharing", confidence: 0.7, test: has(/\broyalt|\brevenue\s+shar|\bprofit\s+shar|\bpercent(?:age)?\s+of\s+(?:net|gross)\s+(?:revenue|sales|profits?|receipts)/i) },
  { category: "Exclusivity", confidence: 0.7, test: has(/\b(?:sole\s+and\s+)?exclusive\s+(?:supplier|provider|distributor|reseller|dealer|partner)\b|\ball\s+of\s+its\s+requirements\b/i) },
  { category: "Price Restrictions", confidence: 0.65, test: has(/\b(?:increase|raise)\b[^.]{0,80}\b(?:prices?|rates|fees)\b[^.]{0,100}\b(?:not\s+exceed|more\s+than\s+once|no\s+more\s+than)\b|\bprices?\s+(?:shall|will)\s+(?:remain|be)\s+fixed\b/i) },
  { category: "Notice Period To Terminate Renewal", confidence: 0.65, test: has(/\bnotice\s+of\s+non-?renewal\b|\b(?:intent(?:ion)?\s+)?not\s+to\s+renew\b/i) },
  { category: "Unlimited/All-You-Can-Eat-License", confidence: 0.65, test: has(/\bunlimited\b[^.]{0,60}\b(?:licen|use|users|copies|seats|installations)/i) },
  { category: "Expiration Date", confidence: 0.6, test: has(/\binitial\s+term\b|\b(?:continue|remain)\s+in\s+(?:full\s+)?(?:force|effect)\s+(?:until|for)\b|\bexpire[sd]?\s+on\b/i) },
  { category: "Competitive Restriction Exception", confidence: 0.55, test: (c) => c.clause.isException && /\bcompet|\bexclusiv|\bsolicit/i.test(c.text) },
  { category: "Exclusivity", confidence: 0.55, test: (c) => /\bexclusive(?:ly)?\b/i.test(c.text) && !/\bnon-?exclusive\b|\bexclusive\s+jurisdiction\b|\bexclusive\s+remedy\b/i.test(c.text) },
  { category: "Affiliate License-Licensee", confidence: 0.55, test: has(/\blicen[cs]e\b[^.]{0,120}\b(?:to|for)\b[^.]{0,40}\b(?:its|licensee'?s)\s+affiliates\b/i) },
  { category: "Post-Termination Services", confidence: 0.5, test: has(/\b(?:upon|after|following)\s+(?:any\s+)?(?:the\s+)?(?:termination|expiration)\b[^.]{0,160}\b(?:transition|continue\s+to\s+(?:provide|support)|wind[-\s]down)\b/i) },
  { category: "Effective Date", confidence: 0.5, test: has(/\beffective\s+(?:as\s+of|on)\b/i) },
  { category: "Volume Restriction", confidence: 0.5, test: has(/\b(?:exceed|in\s+excess\s+of)\b[^.]{0,60}\b(?:users|units|copies|volume|transactions|seats)\b/i) },
  { category: "Non-Compete", confidence: 0.6, test: has(/\b(?:shall|will|may)\s+not\b[^.]{0,120}\b(?:compete|competitive|competing)\b/i) },
  { category: "Termination For Convenience", confidence: 0.55, test: (c) => /\bterminat/i.test(c.text) && /\bat\s+any\s+time\b|\bupon\s+\w+\s+\(\d+\)\s+days'?\s+(?:prior\s+)?(?:written\s+)?notice\b/i.test(c.text) },
];

/** Best keyword guess for a clause, or null if no rule fires. Pure. */
export function heuristicType(clause: Clause): TypeGuess | null {
  const ctx: Ctx = {
    clause,
    text: clause.text,
    heading: (clause.heading ?? "").trim(),
    top: clause.path[0] ?? "",
    last: clause.path[clause.path.length - 1] ?? "",
  };
  let best: TypeGuess | null = null;
  for (const r of RULES) {
    if ((!best || r.confidence > best.confidence) && r.test(ctx)) best = { category: r.category, confidence: r.confidence };
  }
  return best;
}
