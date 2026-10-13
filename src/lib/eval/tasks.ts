/**
 * Run-and-save tasks shared by the individual eval scripts and `eval-all`. Each task writes its
 * JSON + markdown into eval/results and returns the markdown section for REPORT.md.
 */
import { join } from "node:path";
import { judgePair } from "@/lib/engine";
import { buildContractConflict } from "./dataset";
import type { ConflictRecord, DatasetSummary } from "./dataset";
import { ensureCuad, loadCuad } from "./cuad";
import type { CuadData } from "./cuad";
import { buildE2eCases, e2eCurveItems, runE2e } from "./e2e";
import type { E2eCase, E2eRunResult } from "./e2e";
import { ablationMarkdown, e2eMarkdown, pairsMarkdown, retrievalMarkdown } from "./format";
import type { AblationRow } from "./format";
import { curveCsv, curveMarkdown, curveSvg, seriesFromItems, syntheticItems } from "./curve";
import type { CurveSeries } from "./curve";
import { DATA_DIR, DATASET_PATH, RESULTS_DIR, fileExists, hasApiKey, mdTable, num, pct, readJson, readJsonl, runMeta, writeJson, writeJsonl, writeText } from "./io";
import type { RunMeta } from "./io";
import { runPairEval } from "./pairs";
import type { PairEvalResult } from "./pairs";
import { runRetrievalEval } from "./retrieval";
import type { RetrievalEvalResult } from "./retrieval";
import { stubJudgePair } from "./stub";

export type Log = (m: string) => void;

export interface TaskOutput<T> {
  markdown: string;
  result: T;
  files: string[];
}

const suffix = (dryRun: boolean) => (dryRun ? ".dry-run" : "");

/** Refuse LLM-dependent runs without credentials unless --dry-run. */
export function requireApiOrDryRun(dryRun: boolean, what: string): void {
  if (!dryRun && !hasApiKey()) {
    throw new Error(`${what} calls Claude but ANTHROPIC_API_KEY is not set. Set it, or pass --dry-run to verify the plumbing with the deterministic stub judge.`);
  }
}

let cuadCache: CuadData | null = null;
async function cuad(log: Log): Promise<CuadData> {
  cuadCache ??= loadCuad(await ensureCuad(log));
  return cuadCache;
}

// ---------------------------------------------------------------------------

export async function taskDataset(opts: { seed?: string; total?: number; rebuild?: boolean; log: Log }): Promise<TaskOutput<DatasetSummary>> {
  const metaPath = DATASET_PATH.replace(/\.jsonl$/, ".meta.json");
  if (!opts.rebuild && fileExists(DATASET_PATH) && fileExists(metaPath)) {
    const meta = readJson<DatasetSummary>(metaPath);
    opts.log(`Dataset present: ${meta.total} pairs (use --rebuild to regenerate).`);
    return { markdown: datasetMarkdown(meta), result: meta, files: [DATASET_PATH] };
  }
  const data = await cuad(opts.log);
  const { records, summary } = buildContractConflict(data.clauses, { seed: opts.seed, total: opts.total });
  writeJsonl(DATASET_PATH, records);
  writeJson(metaPath, { ...summary, source: "CUAD v1 (CUADv1.json, https://github.com/TheAtticusProject/cuad)", builtAt: new Date().toISOString() });
  opts.log(`Built ${records.length} pairs -> ${DATASET_PATH}`);
  return { markdown: datasetMarkdown(summary), result: summary, files: [DATASET_PATH, metaPath] };
}

export function datasetMarkdown(s: DatasetSummary): string {
  const rows = Object.entries(s.byLabel).map(([label, n]) => [label, n, pct(n / s.total)]);
  return [
    `${s.total} clause pairs (seed \`${s.seed}\`) from ${s.contracts} CUAD contracts and ${s.categories} categories, drawn from a pool of ${s.poolSize} usable CUAD clause spans.`,
    "",
    mdTable(["label", "pairs", "share"], rows),
    "",
    `Edit types: ${Object.entries(s.byEditType)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------

export async function taskRetrieval(opts: { limitDocs?: number; limitQueries?: number; configs?: string[]; rerankDepth?: number; rerankQueries?: number; log: Log; meta?: RunMeta; outDir?: string }): Promise<TaskOutput<Omit<RetrievalEvalResult, "perQuery">>> {
  const dir = opts.outDir ?? RESULTS_DIR;
  const meta = opts.meta ?? runMeta();
  const files = [join(dir, "retrieval.json"), join(dir, "retrieval.md"), join(dir, "retrieval-queries.jsonl")];
  const save = (r: RetrievalEvalResult) => {
    const { perQuery, ...summary } = r;
    writeJson(files[0], { meta, ...summary });
    writeText(files[1], `# Retrieval: LegalBench-RAG-mini\n\n_${meta.timestamp}, git ${meta.gitSha?.slice(0, 10) ?? "n/a"}_\n\n${retrievalMarkdown(r)}`);
    writeJsonl(files[2], perQuery);
    return summary;
  };
  const result = await runRetrievalEval({
    limitDocs: opts.limitDocs,
    limitQueries: opts.limitQueries,
    configs: opts.configs,
    rerankDepth: opts.rerankDepth,
    rerankQueries: opts.rerankQueries,
    log: opts.log,
    onConfig: (partial) => {
      save(partial);
      opts.log(`  saved results for ${partial.configs.map((c) => c.config.name).join(", ")}`);
    },
  });
  return { markdown: retrievalMarkdown(result), result: save(result), files };
}

// ---------------------------------------------------------------------------

export async function taskPairs(opts: { limit?: number; subset?: string; dryRun: boolean; concurrency?: number; log: Log; meta?: RunMeta; outDir?: string }): Promise<TaskOutput<PairEvalResult>> {
  const dir = opts.outDir ?? RESULTS_DIR;
  requireApiOrDryRun(opts.dryRun, "The pair eval");
  const meta = opts.meta ?? runMeta();
  let records = readJsonl<ConflictRecord>(DATASET_PATH);
  if (opts.subset) records = records.filter((r) => r.source === opts.subset || r.label === opts.subset);
  if (opts.limit) records = records.slice(0, opts.limit);
  if (records.length === 0) throw new Error(`no records${opts.subset ? ` for subset "${opts.subset}"` : ""}`);
  opts.log(`Judging ${records.length} pairs${opts.dryRun ? " with the stub judge (dry run)" : ` with ${meta.model}`} ...`);
  let lastLogged = 0;
  const result = await runPairEval(
    records,
    {
      judge: opts.dryRun ? stubJudgePair : judgePair,
      concurrency: opts.concurrency,
      onProgress: (done, total) => {
        if (done - lastLogged >= 25 || done === total) {
          lastLogged = done;
          opts.log(`  ${done}/${total}`);
        }
      },
    },
    opts.subset,
  );
  const base = `pairs${opts.subset ? `.${opts.subset}` : ""}${suffix(opts.dryRun)}`;
  const files = [join(dir, `${base}.json`), join(dir, `${base}.md`)];
  writeJson(files[0], { meta, dryRun: opts.dryRun, limit: opts.limit ?? null, ...result });
  const md = pairsMarkdown(result, opts.dryRun);
  writeText(files[1], `# Pair NLI on ContractConflict${opts.dryRun ? " (dry run)" : ""}\n\n_${meta.timestamp}, model ${opts.dryRun ? "stub" : meta.model}, git ${meta.gitSha?.slice(0, 10) ?? "n/a"}_\n\n${md}`);
  return { markdown: md, result, files };
}

// ---------------------------------------------------------------------------

export async function loadE2eCases(n: number, seed: string | undefined, log: Log, outDir = DATA_DIR): Promise<E2eCase[]> {
  const data = await cuad(log);
  const cases = buildE2eCases(data.clauses, { n, seed });
  writeJson(join(outDir, "e2e-cases.json"), cases);
  return cases;
}

export async function taskE2e(opts: {
  cases?: number;
  seed?: string;
  only?: "baseline" | "full";
  dryRun: boolean;
  embed?: boolean;
  rerank?: boolean;
  log: Log;
  meta?: RunMeta;
  outDir?: string;
}): Promise<TaskOutput<E2eRunResult[]>> {
  const dir = opts.outDir ?? RESULTS_DIR;
  requireApiOrDryRun(opts.dryRun, "The end-to-end eval");
  const meta = opts.meta ?? runMeta();
  const cases = await loadE2eCases(opts.cases ?? 20, opts.seed, opts.log, opts.outDir ?? DATA_DIR);
  opts.log(`${cases.length} cases, ${cases.reduce((s, c) => s + c.gold.length, 0)} gold conflicts`);
  const index = opts.embed === undefined && opts.rerank === undefined ? undefined : { embed: opts.embed, rerank: opts.rerank };
  const runs: E2eRunResult[] = [];
  for (const verify of opts.only === "baseline" ? [false] : opts.only === "full" ? [true] : [true, false]) {
    opts.log(`Running ${verify ? "full pipeline (verification on)" : "baseline (verification off)"}${opts.dryRun ? " [dry run]" : ""} ...`);
    runs.push(await runE2e(cases, { verify, dryRun: opts.dryRun, index, log: opts.log }));
  }
  const files = [join(dir, `e2e${suffix(opts.dryRun)}.json`), join(dir, `e2e${suffix(opts.dryRun)}.md`)];
  writeJson(files[0], { meta, dryRun: opts.dryRun, runs });
  const md = e2eMarkdown(runs);
  writeText(files[1], `# End-to-end (Legal RAG Bench grading)${opts.dryRun ? " (dry run)" : ""}\n\n_${meta.timestamp}, model ${opts.dryRun ? "stub" : meta.model}, git ${meta.gitSha?.slice(0, 10) ?? "n/a"}_\n\n${md}`);
  return { markdown: md, result: runs, files };
}

// ---------------------------------------------------------------------------

interface SavedPairs {
  dryRun: boolean;
  predictions: Array<{ confidence: number | null; correct: boolean; pred: string | null }>;
}
interface SavedE2e {
  dryRun: boolean;
  runs: E2eRunResult[];
}

/** Build curve series from saved pair / e2e results (real runs preferred over dry runs) and/or synthetic inputs. */
export function taskCurve(opts: { synthetic?: boolean; log: Log; outDir?: string }): TaskOutput<CurveSeries[]> {
  const dir = opts.outDir ?? RESULTS_DIR;
  const series: CurveSeries[] = [];
  const notes: string[] = [];
  const pick = (base: string) => [join(dir, `${base}.json`), join(dir, `${base}.dry-run.json`)].find(fileExists);
  const pairsPath = pick("pairs");
  if (pairsPath) {
    const p = readJson<SavedPairs>(pairsPath);
    const items = p.predictions.filter((x) => x.pred !== null).map((x) => ({ confidence: x.confidence ?? 0, correct: x.correct }));
    series.push(seriesFromItems(`pairs NLI${p.dryRun ? " (dry run)" : ""}`, items));
    notes.push(`pairs: ${pairsPath.split("/").pop()}`);
  }
  const e2ePath = pick("e2e");
  if (e2ePath) {
    const e = readJson<SavedE2e>(e2ePath);
    for (const r of e.runs) {
      series.push(seriesFromItems(`e2e ${r.config.verify ? "full" : "baseline"}${e.dryRun ? " (dry run)" : ""}`, e2eCurveItems(r.grades)));
    }
    notes.push(`e2e: ${e2ePath.split("/").pop()}`);
  }
  if (opts.synthetic || series.length === 0) {
    series.push(seriesFromItems("synthetic calibrated", syntheticItems("calibrated")));
    if (series.length < 4) series.push(seriesFromItems("synthetic overconfident", syntheticItems("overconfident")));
    notes.push("synthetic inputs");
  }
  const shown = series.slice(0, 4);
  const dry = shown.some((s) => /dry run|synthetic/.test(s.name));
  const files = [join(dir, "coverage-accuracy.csv"), join(dir, "coverage-accuracy.md"), join(dir, "coverage-accuracy.svg")];
  writeText(files[0], curveCsv(series));
  const md = curveMarkdown(shown);
  writeText(files[1], `# Coverage vs accuracy\n\nSources: ${notes.join("; ")}. Threshold swept 0.00-1.00 in 0.05 steps; a finding is kept when its confidence >= t and it did not fail a hard check (quote, conflict).\n\n${md}`);
  writeText(
    files[2],
    curveSvg(shown, {
      title: "Coverage vs accuracy",
      subtitle: `Confidence threshold swept 0.00-1.00 (step 0.05)${dry ? "; includes dry-run / synthetic series (plumbing check, not model results)" : ""}`,
    }),
  );
  opts.log(`Curve: ${series.map((s) => s.name).join(", ")} -> ${files[2]}`);
  return { markdown: md, result: series, files };
}

// ---------------------------------------------------------------------------

export async function taskAblate(opts: { cases?: number; seed?: string; dryRun: boolean; models?: string[]; log: Log; meta?: RunMeta; outDir?: string }): Promise<TaskOutput<AblationRow[]>> {
  const dir = opts.outDir ?? RESULTS_DIR;
  requireApiOrDryRun(opts.dryRun, "The ablation grid");
  const meta = opts.meta ?? runMeta();
  const cases = await loadE2eCases(opts.cases ?? 20, opts.seed, opts.log, opts.outDir ?? DATA_DIR);
  const models = opts.dryRun ? ["stub"] : opts.models?.length ? opts.models : [meta.model];
  const rows: AblationRow[] = [];
  const prevModel = process.env.ANTHROPIC_MODEL;
  try {
    for (const model of models) {
      if (!opts.dryRun) process.env.ANTHROPIC_MODEL = model;
      for (const embed of [false, true]) {
        for (const rerank of [false, true]) {
          for (const verify of [false, true]) {
            const t0 = Date.now();
            opts.log(`[${model}] embeddings=${embed ? "on" : "off"} rerank=${rerank ? "on" : "off"} verify=${verify ? "on" : "off"}`);
            const run = await runE2e(cases, { verify, dryRun: opts.dryRun, index: { embed, rerank } });
            rows.push({ model, embed, rerank, verify, summary: run.summary, seconds: (Date.now() - t0) / 1000 });
          }
        }
      }
    }
  } finally {
    if (prevModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = prevModel;
  }
  const files = [join(dir, `ablations${suffix(opts.dryRun)}.json`), join(dir, `ablations${suffix(opts.dryRun)}.md`)];
  writeJson(files[0], { meta, dryRun: opts.dryRun, cases: cases.length, rows });
  const md = `${ablationMarkdown(rows, opts.dryRun)}\n\n**Main effects** (mean over the other factors, on minus off):\n\n${mainEffects(rows)}`;
  writeText(files[1], `# Ablations (factorial)${opts.dryRun ? " (dry run)" : ""}\n\n_${meta.timestamp}, ${cases.length} cases, git ${meta.gitSha?.slice(0, 10) ?? "n/a"}_\n\n${md}`);
  return { markdown: md, result: rows, files };
}

function mainEffects(rows: readonly AblationRow[]): string {
  const factors: Array<[string, (r: AblationRow) => boolean]> = [
    ["embeddings", (r) => r.embed],
    ["rerank", (r) => r.rerank],
    ["verify", (r) => r.verify],
  ];
  const metrics: Array<[string, (r: AblationRow) => number | null]> = [
    ["precision", (r) => r.summary.precision],
    ["recall", (r) => r.summary.recall],
    ["F1", (r) => r.summary.f1],
    ["retrieval recall", (r) => r.summary.retrievalRecall],
    ["abstain rate", (r) => r.summary.abstainRate],
    ["invented", (r) => r.summary.errors.invented],
  ];
  const avg = (xs: Array<number | null>) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  return mdTable(
    ["factor", ...metrics.map(([m]) => `Δ ${m}`)],
    factors.map(([name, on]) => [
      name,
      ...metrics.map(([, get]) => {
        const a = avg(rows.filter(on).map(get));
        const b = avg(rows.filter((r) => !on(r)).map(get));
        return a === null || b === null ? "n/a" : num(a - b);
      }),
    ]),
  );
}
