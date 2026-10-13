import type { Clause } from "../types";

export interface ClauseGraph {
  /** defined term -> id of the clause that defines it (first definition wins across documents) */
  definitions: Map<string, string>;
  /** clause id -> linked clause ids (cross-references, definitions used, exceptions that modify it) */
  links: Map<string, string[]>;
}

/**
 * Build lookup maps over (possibly multi-document) clauses so retrieval can attach
 * linked exceptions/definitions to a hit. Dangling ids are dropped.
 */
export function buildGraph(clauses: Clause[]): ClauseGraph {
  const ids = new Set(clauses.map((c) => c.id));
  const definitions = new Map<string, string>();
  const links = new Map<string, string[]>();

  for (const c of clauses) {
    for (const t of c.definedTerms) if (!definitions.has(t)) definitions.set(t, c.id);
  }
  for (const c of clauses) {
    const out: string[] = [];
    for (const r of c.references) if (r !== c.id && ids.has(r) && !out.includes(r)) out.push(r);
    links.set(c.id, out);
  }
  // Exceptions point at what they modify; make sure the modified clause points back.
  for (const c of clauses) {
    if (!c.isException) continue;
    for (const r of c.references) {
      const back = links.get(r);
      const target = clauses.find((x) => x.id === r);
      // Only clause-to-clause carve-outs, not "uses a defined term" links.
      if (!back || !target || target.definedTerms.length > 0 || back.includes(c.id)) continue;
      if (target.references.includes(c.id)) continue; // already linked by the parser
      back.push(c.id);
    }
  }
  return { definitions, links };
}
