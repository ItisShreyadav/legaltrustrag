/*
 * Client-side intake rules for /analyze. They mirror the limits that
 * POST /api/analyze enforces, so problems surface before an upload starts.
 */

export const ACCEPTED_EXTENSIONS = ["pdf", "docx", "txt"] as const;
export const MAX_RULES = 50;
export const MAX_RULE_CHARS = 1000;

/** Upload limits. The server's are configurable (LTR_MAX_FILES, LTR_MAX_UPLOAD_MB); GET /api/health reports them to signed-in users. */
export interface UploadLimits {
  maxFiles: number;
  maxFileBytes: number;
}

/** The server's defaults, used until /api/health reports otherwise. */
export const DEFAULT_LIMITS: UploadLimits = { maxFiles: 5, maxFileBytes: 10 * 1024 * 1024 };

/** "10 MB", "2.5 MB". */
export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** Value for the file input's `accept` attribute. */
export const ACCEPT_ATTR = [
  ".pdf",
  ".docx",
  ".txt",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
].join(",");

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** "PDF", "DOCX", "TXT"; "FILE" when the name has no extension. */
export function fileKind(name: string): string {
  const ext = extensionOf(name);
  return ext ? ext.toUpperCase() : "FILE";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface FileIntake {
  /** The selection after adding every acceptable incoming file. */
  files: File[];
  /** One readable line per rejected file. */
  problems: string[];
}

/** Add `incoming` to `current`, rejecting unsupported, empty, oversized and duplicate files and anything past the limit. */
export function addFiles(current: readonly File[], incoming: readonly File[], limits: UploadLimits): FileIntake {
  const files = [...current];
  const problems: string[] = [];
  for (const file of incoming) {
    const ext = extensionOf(file.name);
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      problems.push(`${file.name}: unsupported type. Use PDF, DOCX or TXT.`);
    } else if (file.size === 0) {
      problems.push(`${file.name}: the file is empty.`);
    } else if (file.size > limits.maxFileBytes) {
      problems.push(`${file.name}: ${formatBytes(file.size)} exceeds the ${formatMb(limits.maxFileBytes)} limit.`);
    } else if (files.some((f) => f.name === file.name && f.size === file.size)) {
      problems.push(`${file.name}: already added.`);
    } else if (files.length >= limits.maxFiles) {
      problems.push(`${file.name}: the limit of ${limits.maxFiles} ${limits.maxFiles === 1 ? "file" : "files"} is reached.`);
    } else {
      files.push(file);
    }
  }
  return { files, problems };
}

/**
 * The rules the server will check, parsed the same way as POST /api/analyze:
 * one per line, blank lines dropped, list markers ("-", "*", "1.") stripped,
 * duplicates removed.
 */
export function parseRules(raw: string): string[] {
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const line of raw.split(/\r\n|\r|\n/)) {
    const rule = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!rule || seen.has(rule)) continue;
    seen.add(rule);
    rules.push(rule);
  }
  return rules;
}

/** Why the rules cannot be submitted, or null when they are within the server's limits. */
export function rulesProblem(rules: readonly string[]): string | null {
  if (rules.length > MAX_RULES) return `${rules.length} rules entered. The limit is ${MAX_RULES}.`;
  const long = rules.findIndex((rule) => rule.length > MAX_RULE_CHARS);
  if (long !== -1) return `Rule ${long + 1} is longer than ${MAX_RULE_CHARS} characters.`;
  return null;
}
