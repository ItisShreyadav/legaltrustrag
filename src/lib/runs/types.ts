/*
 * Client-safe shapes for saved runs: no Node or database imports, so client
 * components can import this file directly (./index.ts loads node:sqlite).
 */
import type { TrustReport } from "@/lib/types";

/** Review rows per status for one run. */
export interface RunReviewCounts {
  queued: number;
  accepted: number;
  rejected: number;
  needs_edit: number;
}

/** One row of the /runs table. Counts are read from the stored report. */
export interface RunSummary {
  id: string;
  createdAt: string; // ISO
  documentNames: string[];
  ruleCount: number;
  findingCount: number; // conflicts shown in the report (verified + unverified)
  withheldCount: number;
  reviews: RunReviewCounts;
}

/** A saved analysis with everything needed to re-render its report, quotes in context included. */
export interface SavedRun {
  id: string;
  createdAt: string; // ISO
  documentNames: string[];
  ruleCount: number;
  report: TrustReport;
  /** Full document text keyed by document id; quote offsets index into these strings. */
  docTexts: Record<string, string>;
}

/** Run ids are UUIDs; anything else is treated as not found. */
export const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
