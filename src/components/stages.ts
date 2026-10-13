import type { ProgressEvent } from "@/lib/types";

export type PipelineStage = Extract<ProgressEvent, { pct: number }>["stage"];

export const STAGES: ReadonlyArray<{ id: PipelineStage; label: string; hint: string }> = [
  { id: "structuring", label: "Structure", hint: "Sections, definitions, cross-references" },
  { id: "typing", label: "Classify", hint: "CUAD clause categories" },
  { id: "retrieval", label: "Retrieve", hint: "Hybrid BM25 + dense pairs" },
  { id: "conflict", label: "Detect", hint: "NLI over pairs and rules" },
  { id: "verification", label: "Verify", hint: "Quote, support, conflict checks" },
  { id: "report", label: "Report", hint: "Assemble the trust report" },
];

export function stageIndex(stage: PipelineStage): number {
  return STAGES.findIndex((s) => s.id === stage);
}
