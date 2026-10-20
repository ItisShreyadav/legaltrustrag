import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/auth";
import type { Finding, SourceDocument, TrustReport } from "@/lib/types";
import { RUN_ID_PATTERN, type RunSummary, type SavedRun } from "./types";

export const MAX_LISTED_RUNS = 200;

type Row = Record<string, unknown>;

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stringArray(raw: unknown): string[] {
  const value = parseJson<unknown>(raw, []);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toSavedRun(row: Row): SavedRun | null {
  const report = parseJson<TrustReport | null>(row.report, null);
  if (!report || typeof report !== "object" || !Array.isArray(report.findings)) return null;
  const texts = parseJson<unknown>(row.doc_texts, {});
  const docTexts: Record<string, string> = {};
  if (texts && typeof texts === "object") {
    for (const [id, text] of Object.entries(texts)) if (typeof text === "string") docTexts[id] = text;
  }
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    documentNames: stringArray(row.document_names),
    ruleCount: Number(row.rule_count) || 0,
    report,
    docTexts,
  };
}

/**
 * Persists a finished analysis for its owner, with the full document texts so
 * quotes can be shown in their clause context later. Returns the new run id.
 */
export function saveRun(input: {
  userId: string;
  documents: SourceDocument[];
  ruleCount: number;
  report: TrustReport;
}): string {
  const id = randomUUID();
  const docTexts = Object.fromEntries(input.documents.map((d) => [d.id, d.text]));
  getDb()
    .prepare(
      `INSERT INTO runs (id, user_id, created_at, document_names, rule_count, report, doc_texts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.userId,
      new Date().toISOString(),
      JSON.stringify(input.documents.map((d) => d.name)),
      input.ruleCount,
      JSON.stringify(input.report),
      JSON.stringify(docTexts),
    );
  return id;
}

/*
 * Summary columns for the runs table. Finding and withheld counts come from the
 * stored report via SQLite's JSON functions, so neither the report nor the
 * document texts are loaded into JS.
 */
const SELECT_SUMMARY = `
  SELECT r.id, r.created_at, r.document_names, r.rule_count,
         CASE WHEN json_valid(r.report) THEN COALESCE(json_array_length(r.report, '$.findings'), 0) ELSE 0 END AS finding_count,
         CASE WHEN json_valid(r.report) THEN COALESCE(json_array_length(r.report, '$.withheld'), 0) ELSE 0 END AS withheld_count,
         COALESCE(c.queued, 0) AS queued, COALESCE(c.accepted, 0) AS accepted,
         COALESCE(c.rejected, 0) AS rejected, COALESCE(c.needs_edit, 0) AS needs_edit
    FROM runs r
    LEFT JOIN (
      SELECT run_id,
             SUM(status = 'queued') AS queued, SUM(status = 'accepted') AS accepted,
             SUM(status = 'rejected') AS rejected, SUM(status = 'needs_edit') AS needs_edit
        FROM reviews GROUP BY run_id
    ) c ON c.run_id = r.id`;

function toSummary(row: Row): RunSummary {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    documentNames: stringArray(row.document_names),
    ruleCount: Number(row.rule_count) || 0,
    findingCount: Number(row.finding_count) || 0,
    withheldCount: Number(row.withheld_count) || 0,
    reviews: {
      queued: Number(row.queued) || 0,
      accepted: Number(row.accepted) || 0,
      rejected: Number(row.rejected) || 0,
      needs_edit: Number(row.needs_edit) || 0,
    },
  };
}

/** The user's most recent runs (at most MAX_LISTED_RUNS), newest first. */
export function listRuns(userId: string): RunSummary[] {
  return getDb()
    .prepare(
      `${SELECT_SUMMARY}
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC, r.rowid DESC
        LIMIT ${MAX_LISTED_RUNS}`,
    )
    .all(userId)
    .map(toSummary);
}

/** How many runs the user has in total (listRuns returns at most MAX_LISTED_RUNS of them). */
export function countRuns(userId: string): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM runs WHERE user_id = ?").get(userId);
  return Number(row?.n) || 0;
}

/** One of the user's runs as a table row (no report or texts loaded), or null. */
export function getRunSummary(userId: string, runId: string): RunSummary | null {
  if (!RUN_ID_PATTERN.test(runId)) return null;
  const row = getDb().prepare(`${SELECT_SUMMARY} WHERE r.user_id = ? AND r.id = ?`).get(userId, runId);
  return row ? toSummary(row) : null;
}

/**
 * Permanently deletes one of the user's runs. Its review rows go with it
 * (reviews.run_id is ON DELETE CASCADE). False when the run does not exist or
 * belongs to someone else.
 */
export function deleteRun(userId: string, runId: string): boolean {
  if (!RUN_ID_PATTERN.test(runId)) return false;
  const result = getDb().prepare("DELETE FROM runs WHERE id = ? AND user_id = ?").run(runId, userId);
  return Number(result.changes) > 0;
}

/** One of the user's runs, or null if it does not exist or belongs to someone else. */
export function getRun(userId: string, runId: string): SavedRun | null {
  if (!RUN_ID_PATTERN.test(runId)) return null;
  const row = getDb().prepare("SELECT * FROM runs WHERE id = ? AND user_id = ?").get(runId, userId);
  return row ? toSavedRun(row) : null;
}

/** Just the report of one of the user's runs (skips the document texts). */
export function getRunReport(userId: string, runId: string): TrustReport | null {
  if (!RUN_ID_PATTERN.test(runId)) return null;
  const row = getDb().prepare("SELECT report FROM runs WHERE id = ? AND user_id = ?").get(runId, userId);
  if (!row) return null;
  const report = parseJson<TrustReport | null>(row.report, null);
  return report && Array.isArray(report.findings) ? report : null;
}

/** Several of the user's runs by id; ids that are unknown or not the user's are left out. */
export function loadRuns(userId: string, runIds: readonly string[]): Map<string, SavedRun> {
  const ids = [...new Set(runIds)].filter((id) => RUN_ID_PATTERN.test(id));
  const runs = new Map<string, SavedRun>();
  if (ids.length === 0) return runs;
  const rows = getDb()
    .prepare(`SELECT * FROM runs WHERE user_id = ? AND id IN (${ids.map(() => "?").join(", ")})`)
    .all(userId, ...ids);
  for (const row of rows) {
    const run = toSavedRun(row);
    if (run) runs.set(run.id, run);
  }
  return runs;
}

/** A finding anywhere in a report: conflicts, withheld candidates or a compliance row's evidence. */
export function findFinding(report: TrustReport, findingId: string): Finding | undefined {
  return (
    report.findings.find((f) => f.id === findingId) ??
    report.withheld.find((f) => f.id === findingId) ??
    report.compliance.find((row) => row.finding?.id === findingId)?.finding
  );
}
