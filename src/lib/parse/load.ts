import type { SourceDocument } from "../types";

export interface InputFile {
  name: string;
  bytes: Uint8Array | Buffer;
}

let docCounter = 0;

/**
 * Normalise extracted text so offsets are stable:
 * CRLF/CR -> LF, strip NUL and BOM, form feeds -> LF, strip trailing spaces per line,
 * collapse 3+ blank lines to 2, trim the ends of the document.
 */
export function normalizeText(raw: string): string {
  return raw
    .replaceAll("\u0000", "")
    .replaceAll("\uFEFF", "")
    .replace(/\r\n?/g, "\n")
    .replaceAll("\f", "\n")
    .replace(/[ \t\u00A0]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/^\s+/, "")
    .replace(/\s+$/, "");
}

function detectKind(name: string, bytes: Uint8Array): SourceDocument["kind"] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") {
    throw new Error(`${name}: legacy .doc files are not supported; save as .docx or .pdf`);
  }
  if (["txt", "text", "md"].includes(ext)) return "txt";
  // Unknown extension: sniff magic bytes.
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"; // %PDF
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "docx"; // PK zip
  return "txt";
}

/**
 * Load a PDF / DOCX / TXT file into a SourceDocument with normalised text.
 * `id` may be a full id ("doc_3") or a number (3 -> "doc_3"); when omitted a
 * process-wide counter is used, so pass it explicitly when ids must be stable.
 */
export async function loadDocument(file: InputFile, id?: string | number): Promise<SourceDocument> {
  const bytes: Uint8Array = file.bytes;
  const kind = detectKind(file.name, bytes);
  let raw: string;

  if (kind === "pdf") {
    const { extractText } = await import("unpdf");
    // Copy: pdf.js may detach/transfer the buffer it is given.
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
    raw = text;
  } else if (kind === "docx") {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    raw = result.value;
  } else {
    raw = new TextDecoder("utf-8").decode(bytes);
  }

  const text = normalizeText(raw);
  if (!text) {
    throw new Error(
      kind === "pdf"
        ? `${file.name}: no extractable text (scanned PDF? OCR is not supported)`
        : `${file.name}: document is empty`,
    );
  }

  const docId =
    typeof id === "number" ? `doc_${id}` : typeof id === "string" && id ? id : `doc_${++docCounter}`;

  return { id: docId, name: file.name, kind, text };
}
