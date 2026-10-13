/**
 * File, CSV, markdown and run-metadata helpers for the evaluation scripts. Node only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Repository root (scripts are run from it via npm). */
export const ROOT = resolve(process.cwd());
export const EVAL_DIR = join(ROOT, "eval");
export const DATA_DIR = join(EVAL_DIR, "data");
export const RAW_DIR = join(DATA_DIR, "raw");
export const RESULTS_DIR = join(EVAL_DIR, "results");
export const DATASET_PATH = join(DATA_DIR, "contract-conflict.jsonl");

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeText(path: string, text: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, JSON.stringify(value, null, 2));
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJsonl(path: string, rows: readonly unknown[]): void {
  writeText(path, rows.map((r) => JSON.stringify(r)).join("\n"));
}

export function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180: quoted fields, doubled quotes, newlines inside quotes)
// ---------------------------------------------------------------------------

function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<Record<string, unknown>>): string {
  return [header.map(csvField).join(","), ...rows.map((r) => header.map((h) => csvField(r[h])).join(","))].join("\n");
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    records.push(row);
  }
  const nonEmpty = records.filter((r) => r.some((c) => c.trim()));
  if (nonEmpty.length === 0) return [];
  const [header, ...body] = nonEmpty;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

// ---------------------------------------------------------------------------
// Markdown + formatting
// ---------------------------------------------------------------------------

export function pct(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined || !Number.isFinite(x) ? "n/a" : `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number | null | undefined, digits = 3): string {
  return x === null || x === undefined || !Number.isFinite(x) ? "n/a" : x.toFixed(digits);
}

export function mdTable(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const esc = (v: string | number) => String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${header.map(esc).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Run metadata
// ---------------------------------------------------------------------------

export interface RunMeta {
  timestamp: string;
  gitSha: string | null;
  gitDirty: boolean | null;
  node: string;
  model: string;
  hasApiKey: boolean;
  env: Record<string, string>;
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

export function runMeta(): RunMeta {
  const status = git(["status", "--porcelain"]);
  const env: Record<string, string> = {};
  for (const k of Object.keys(process.env).sort()) {
    if (k.startsWith("LTR_") || k === "ANTHROPIC_MODEL") env[k] = process.env[k] ?? "";
  }
  return {
    timestamp: new Date().toISOString(),
    gitSha: git(["rev-parse", "HEAD"]),
    gitDirty: status === null ? null : status.length > 0,
    node: process.version,
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    env,
  };
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Download `url` to `dest` (follows redirects). Skips the download when `dest` exists. */
export async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  ensureDir(dirname(dest));
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

/** Extract a zip archive with the system `unzip` (macOS/Linux). */
export function unzip(zipPath: string, destDir: string): void {
  ensureDir(destDir);
  try {
    execFileSync("unzip", ["-q", "-o", zipPath, "-d", destDir], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    // unzip exits 1 for warnings (e.g. the absolute "/" entry in the LegalBench-RAG archive).
    const status = (err as { status?: number }).status;
    if (status !== 1) throw new Error(`unzip failed for ${zipPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
