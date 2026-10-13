/**
 * CUAD v1 loader: contract texts and expert-annotated clause spans (SQuAD format,
 * `CUADv1.json` from https://github.com/TheAtticusProject/cuad `data.zip`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CUAD_CATEGORIES } from "@/lib/types";
import type { CuadCategory } from "@/lib/types";
import { RAW_DIR, download, fileExists, unzip } from "./io";

export const CUAD_ZIP_URL = "https://github.com/TheAtticusProject/cuad/raw/main/data.zip";
export const CUAD_DIR = join(RAW_DIR, "cuad");
export const CUAD_JSON = join(CUAD_DIR, "data", "CUADv1.json");

interface SquadAnswer {
  text: string;
  answer_start: number;
}
interface SquadQa {
  id: string;
  answers: SquadAnswer[];
}
interface SquadDoc {
  title: string;
  paragraphs: Array<{ context: string; qas: SquadQa[] }>;
}

export interface CuadContract {
  id: string; // CUAD title
  text: string;
}

export interface CuadClause {
  contractId: string;
  category: CuadCategory;
  /** Whitespace-collapsed clause text. */
  text: string;
  /** Raw span in the CUAD contract context. */
  start: number;
  end: number;
}

export interface CuadData {
  contracts: CuadContract[];
  clauses: CuadClause[];
}

/** Download + unzip CUAD v1 into eval/data/raw/cuad (no-op when cached). Returns the JSON path. */
export async function ensureCuad(log: (m: string) => void = () => {}): Promise<string> {
  if (fileExists(CUAD_JSON)) return CUAD_JSON;
  const zip = join(CUAD_DIR, "data.zip");
  log(`Downloading CUAD v1 from ${CUAD_ZIP_URL} ...`);
  await download(CUAD_ZIP_URL, zip);
  unzip(zip, join(CUAD_DIR, "data"));
  if (!fileExists(CUAD_JSON)) throw new Error(`CUADv1.json not found after extracting ${zip}`);
  return CUAD_JSON;
}

export function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const CATEGORY_SET = new Set<string>(CUAD_CATEGORIES);

/** Parse CUADv1.json into contracts and gold clause spans (every answer of every category). */
export function loadCuad(path = CUAD_JSON): CuadData {
  const json = JSON.parse(readFileSync(path, "utf8")) as { data: SquadDoc[] };
  const contracts: CuadContract[] = [];
  const clauses: CuadClause[] = [];
  for (const doc of json.data) {
    const context = doc.paragraphs.map((p) => p.context).join("\n");
    contracts.push({ id: doc.title, text: context });
    for (const p of doc.paragraphs) {
      for (const qa of p.qas) {
        const category = qa.id.split("__").pop() ?? "";
        if (!CATEGORY_SET.has(category)) continue;
        for (const a of qa.answers) {
          clauses.push({
            contractId: doc.title,
            category: category as CuadCategory,
            text: collapseWs(a.text),
            start: a.answer_start,
            end: a.answer_start + a.text.length,
          });
        }
      }
    }
  }
  return { contracts, clauses };
}
