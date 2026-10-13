import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);

-- Saved analyses (src/lib/runs). document_names, report and doc_texts are JSON:
-- string[], TrustReport and { [docId]: full document text }.
CREATE TABLE IF NOT EXISTS runs (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL,
  document_names TEXT NOT NULL,
  rule_count     INTEGER NOT NULL,
  report         TEXT NOT NULL,
  doc_texts      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_user_created ON runs(user_id, created_at);

-- Human review queue (src/lib/review). user_id is the person who last acted on
-- the row: who queued it, then who decided it. The system never writes a status.
CREATE TABLE IF NOT EXISTS reviews (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('queued', 'accepted', 'rejected', 'needs_edit')),
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, finding_id)
);
CREATE INDEX IF NOT EXISTS reviews_status_updated ON reviews(status, updated_at);
`;

// One connection per server process. Kept on globalThis so dev-mode module
// reloads reuse it instead of opening a new handle on every edit.
const globalForDb = globalThis as typeof globalThis & { __ltrDb?: DatabaseSync };

/** Absolute path of the SQLite file: LTR_DB_PATH (relative to the cwd) or ./data/ltr.sqlite. */
export function databasePath(): string {
  const configured = process.env.LTR_DB_PATH?.trim();
  return path.resolve(configured || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "ltr.sqlite"));
}

/** The shared connection, opened (and the schema created) on first use, never at import time. */
export function getDb(): DatabaseSync {
  if (globalForDb.__ltrDb) return globalForDb.__ltrDb;
  const file = databasePath();
  mkdirSync(path.dirname(file), { recursive: true });
  // Loaded on first use rather than imported at module scope, so builds and
  // pages that never touch the database skip node:sqlite and its
  // ExperimentalWarning. Turbopack leaves process.getBuiltinModule alone.
  const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  const db = new sqlite.DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  globalForDb.__ltrDb = db;
  return db;
}
