/**
 * Lazy, process-wide model singletons for dense retrieval and reranking.
 * Node runtime only: `@huggingface/transformers` is imported dynamically so that
 * importing this module never pulls ONNX into a client/edge bundle and BM25-only
 * runs never touch the model stack.
 *
 * Downloaded models are cached on disk in `LTR_MODEL_CACHE_DIR` (absolute, or relative
 * to the working directory) when it is set, else in transformers.js' default
 * `node_modules/@huggingface/transformers/.cache/`. Point it at a persistent volume in
 * containers so models are fetched from the Hub once, not on every deploy.
 */
import { log } from "@/lib/log";


export const EMBED_MODEL = "Xenova/bge-small-en-v1.5";
/** Stock cross-encoder (ONNX port of BAAI/bge-reranker-base), fetched from the HF Hub / local HF cache. */
export const DEFAULT_RERANK_MODEL = "Xenova/bge-reranker-base";

/**
 * Reranker in use, resolved at runtime from the environment (re-resolved on every (re)load):
 *  - `LTR_RERANK_MODEL`: a Hugging Face model id (default `Xenova/bge-reranker-base`) or a local
 *    model directory, absolute or relative to the working directory, e.g. `public/models/legal-reranker`
 *    as written by `training/export_onnx.py` (config.json, tokenizer.json, onnx/model_quantized.onnx).
 *  - `LTR_LOCAL_MODELS_DIR`: optional folder of local models; when `<dir>/<LTR_RERANK_MODEL>/config.json`
 *    exists the reranker is loaded from there instead of the Hub.
 * Local models load with remote downloads disabled, so a missing file fails loudly instead of
 * silently fetching a different model.
 */
export let RERANK_MODEL: string = rerankModelName();

/** bge v1.5 retrieval instruction for short queries (passages are embedded as-is). */
const QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: ";

/** Max chars of a clause handed to the models (bge truncates at 512 tokens anyway). */
const MAX_MODEL_CHARS = 2000;

type DType = "fp32" | "fp16" | "q8" | "int8" | "uint8" | "q4";
function envVar(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}
function rerankModelName(): string {
  return envVar("LTR_RERANK_MODEL")?.trim() || DEFAULT_RERANK_MODEL;
}
/** fp32 (~133MB) for the embedder; q8 (~280MB vs 1.1GB fp32) for the reranker. Overridable. */
const embedDtype = (): DType => (envVar("LTR_EMBED_DTYPE") as DType | undefined) ?? "fp32";
const rerankDtype = (): DType => (envVar("LTR_RERANK_DTYPE") as DType | undefined) ?? "q8";

// Minimal structural types; the library's own generics are very heavy for tsc.
interface TensorLike {
  dims: number[];
  data: ArrayLike<number>;
  dispose?: () => void;
}
type Embedder = ((texts: string[], opts: { pooling: "cls"; normalize: boolean }) => Promise<TensorLike>) & {
  dispose?: () => Promise<void>;
};
type Tokenizer = (
  text: string[],
  opts: { text_pair: string[]; padding: boolean; truncation: boolean; max_length: number },
) => Record<string, unknown>;
type SeqClassifier = ((inputs: Record<string, unknown>) => Promise<{ logits: TensorLike }>) & {
  dispose?: () => Promise<void>;
};

/** Global off switch: LTR_DISABLE_EMBEDDINGS=1 forces BM25-only everywhere. */
export function modelsDisabled(): boolean {
  if (typeof window !== "undefined") return true; // never in the browser
  return envVar("LTR_DISABLE_EMBEDDINGS") === "1";
}

let embedderPromise: Promise<Embedder> | null = null;
let rerankerPromise: Promise<{ tokenizer: Tokenizer; model: SeqClassifier }> | null = null;
let rerankerFailed = false;
let rerankerWarned = false;
let embedderWarned = false;

interface CachedVec {
  key: string; // cheap content fingerprint so a reused clause id with new text is re-embedded
  vec: Float32Array;
}
const clauseEmbeddingCache = new Map<string, CachedVec>();
const queryEmbeddingCache = new Map<string, Float32Array>();
const QUERY_CACHE_MAX = 256;

function fingerprint(text: string): string {
  // FNV-1a 32-bit + length.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

function clip(text: string): string {
  return text.length > MAX_MODEL_CHARS ? text.slice(0, MAX_MODEL_CHARS) : text;
}

function modelCacheDirSetting(): string | undefined {
  return envVar("LTR_MODEL_CACHE_DIR")?.trim() || undefined;
}

async function loadTransformers() {
  const mod = await import("@huggingface/transformers");
  const cacheDir = modelCacheDirSetting();
  if (cacheDir) {
    const path = await import("node:path");
    mod.env.cacheDir = path.resolve(cacheDir);
  }
  return mod;
}

interface RerankSource {
  /** What the user configured (LTR_RERANK_MODEL or the default). */
  name: string;
  /** Id handed to from_pretrained (relative to `localRoot` when loading from disk). */
  modelId: string;
  /** Absolute folder that transformers.js must use as `env.localModelPath`; undefined = Hub. */
  localRoot?: string;
}

/** Map LTR_RERANK_MODEL / LTR_LOCAL_MODELS_DIR onto a Hub id or a local model folder. */
async function resolveRerankSource(): Promise<RerankSource> {
  const name = rerankModelName();
  const fs = await import("node:fs");
  const path = await import("node:path");
  const isModelDir = (dir: string) => fs.existsSync(path.join(dir, "config.json"));
  const localDir = envVar("LTR_LOCAL_MODELS_DIR")?.trim();
  if (localDir) {
    const root = path.resolve(localDir);
    if (isModelDir(path.join(root, name))) return { name, modelId: name, localRoot: root };
  }
  const dir = path.resolve(name);
  if (isModelDir(dir)) return { name, modelId: path.basename(dir), localRoot: path.dirname(dir) };
  if (path.isAbsolute(name) || name.startsWith(".") || name.split(/[\\/]/).length > 2) {
    throw new Error(`LTR_RERANK_MODEL=${name} is not a model directory (no config.json at ${dir})`);
  }
  return { name, modelId: name };
}

type TransformersEnv = Awaited<ReturnType<typeof loadTransformers>>["env"];
let modelLoadLock: Promise<unknown> = Promise.resolve();

/**
 * Serialise model loads. transformers.js keeps `localModelPath` / `allowRemoteModels` on a global
 * `env`, so a local-folder load points them at that folder (remote off) and restores them afterwards;
 * the lock keeps a concurrent Hub load (e.g. the embedder) from running with remote models disabled.
 */
function withModelEnv<T>(env: TransformersEnv, localRoot: string | undefined, load: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (!localRoot) return load();
    const saved = {
      localModelPath: env.localModelPath,
      allowLocalModels: env.allowLocalModels,
      allowRemoteModels: env.allowRemoteModels,
    };
    env.localModelPath = localRoot;
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    try {
      return await load();
    } finally {
      Object.assign(env, saved);
    }
  };
  const result = modelLoadLock.then(run, run);
  modelLoadLock = result.catch(() => undefined);
  return result;
}

function getEmbedder(): Promise<Embedder> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const { pipeline, env } = await loadTransformers();
      const pipe = await withModelEnv(env, undefined, () =>
        (pipeline as unknown as (
          task: string,
          model: string,
          opts: Record<string, unknown>,
        ) => Promise<Embedder>)("feature-extraction", EMBED_MODEL, { dtype: embedDtype() }),
      );
      return pipe;
    })();
    // Allow a retry on the next call if loading failed (e.g. transient network error).
    embedderPromise.catch(() => {
      embedderPromise = null;
    });
  }
  return embedderPromise;
}

function getReranker(): Promise<{ tokenizer: Tokenizer; model: SeqClassifier }> {
  if (!rerankerPromise) {
    rerankerPromise = (async () => {
      const { AutoTokenizer, AutoModelForSequenceClassification, env } = await loadTransformers();
      const src = await resolveRerankSource();
      RERANK_MODEL = src.name;
      const dtype = rerankDtype();
      const opts = src.localRoot ? { local_files_only: true } : {};
      const [tokenizer, model] = await withModelEnv(env, src.localRoot, () =>
        Promise.all([
          AutoTokenizer.from_pretrained(src.modelId, opts),
          AutoModelForSequenceClassification.from_pretrained(src.modelId, { ...opts, dtype }),
        ]),
      );
      log.info("retrieval.reranker_loaded", {
        model: src.name,
        source: src.localRoot ? "local" : "hub-or-cache",
        dtype,
      });
      return {
        tokenizer: tokenizer as unknown as Tokenizer,
        model: model as unknown as SeqClassifier,
      };
    })();
  }
  return rerankerPromise;
}

function rowsOf(t: TensorLike): Float32Array[] {
  const [n, d] = t.dims.length === 2 ? t.dims : [1, t.dims[t.dims.length - 1]];
  const out: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Float32Array(d);
    for (let j = 0; j < d; j++) row[j] = Number(t.data[i * d + j]);
    out.push(row);
  }
  return out;
}

async function embedRaw(texts: string[]): Promise<Float32Array[]> {
  const embed = await getEmbedder();
  const t = await embed(texts.map(clip), { pooling: "cls", normalize: true });
  const rows = rowsOf(t);
  t.dispose?.();
  return rows;
}

export interface EmbedItem {
  id: string;
  text: string;
}

/**
 * Embed clauses (passage side), using and filling the per-clause-id cache.
 * Returns null if the embedding model could not be loaded (caller falls back to BM25).
 */
export async function embedClauses(
  items: EmbedItem[],
  onProgress?: (done: number, total: number) => void,
  batchSize = 16,
): Promise<Map<string, Float32Array> | null> {
  const result = new Map<string, Float32Array>();
  const todo: Array<EmbedItem & { key: string }> = [];
  for (const it of items) {
    const key = fingerprint(it.text);
    const hit = clauseEmbeddingCache.get(it.id);
    if (hit && hit.key === key) result.set(it.id, hit.vec);
    else todo.push({ ...it, key });
  }
  const total = items.length;
  onProgress?.(result.size, total);
  try {
    for (let i = 0; i < todo.length; i += batchSize) {
      const batch = todo.slice(i, i + batchSize);
      const vecs = await embedRaw(batch.map((b) => b.text));
      batch.forEach((b, j) => {
        clauseEmbeddingCache.set(b.id, { key: b.key, vec: vecs[j] });
        result.set(b.id, vecs[j]);
      });
      onProgress?.(result.size, total);
    }
  } catch (err) {
    if (!embedderWarned) {
      embedderWarned = true;
      log.warn("retrieval.embedder_unavailable", { model: EMBED_MODEL, fallback: "bm25", err });
    }
    return null;
  }
  return result;
}

/** Embed a search query (with the bge query instruction). Null if the model is unavailable. */
export async function embedQuery(query: string): Promise<Float32Array | null> {
  const cached = queryEmbeddingCache.get(query);
  if (cached) return cached;
  try {
    const [vec] = await embedRaw([QUERY_INSTRUCTION + query]);
    if (queryEmbeddingCache.size >= QUERY_CACHE_MAX) {
      const first = queryEmbeddingCache.keys().next().value;
      if (first !== undefined) queryEmbeddingCache.delete(first);
    }
    queryEmbeddingCache.set(query, vec);
    return vec;
  } catch (err) {
    if (!embedderWarned) {
      embedderWarned = true;
      log.warn("retrieval.query_embedding_failed", { model: EMBED_MODEL, fallback: "bm25", err });
    }
    return null;
  }
}

/**
 * Cross-encoder relevance for (query, passage) pairs, as sigmoid(logit) in 0..1.
 * Returns null (and logs once) if the reranker cannot be loaded or run; callers
 * then keep the fused score.
 */
export async function rerankScores(query: string, passages: string[], batchSize = 8): Promise<number[] | null> {
  if (rerankerFailed || passages.length === 0) return passages.length === 0 ? [] : null;
  try {
    const { tokenizer, model } = await getReranker();
    const out: number[] = [];
    for (let i = 0; i < passages.length; i += batchSize) {
      const batch = passages.slice(i, i + batchSize).map(clip);
      const inputs = tokenizer(new Array<string>(batch.length).fill(query), {
        text_pair: batch,
        padding: true,
        truncation: true,
        max_length: 512,
      });
      const { logits } = await model(inputs);
      const width = logits.dims[logits.dims.length - 1] ?? 1;
      for (let j = 0; j < batch.length; j++) {
        const z = Number(logits.data[j * width]);
        out.push(1 / (1 + Math.exp(-z)));
      }
      logits.dispose?.();
    }
    return out;
  } catch (err) {
    rerankerFailed = true;
    rerankerPromise = null;
    if (!rerankerWarned) {
      rerankerWarned = true;
      log.warn("retrieval.reranker_unavailable", { model: RERANK_MODEL, fallback: "fused-score", err });
    }
    return null;
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  // Vectors are L2-normalised by the pipeline, so cosine == dot product.
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/**
 * Drop all cached embeddings and release the model singletons.
 * The next dense/rerank call reloads the models (from the on-disk HF cache), re-reading
 * LTR_RERANK_MODEL / LTR_LOCAL_MODELS_DIR, so a process can switch rerankers (e.g. for ablations).
 */
export async function clearModelCache(): Promise<void> {
  clauseEmbeddingCache.clear();
  queryEmbeddingCache.clear();
  const e = embedderPromise;
  const r = rerankerPromise;
  embedderPromise = null;
  rerankerPromise = null;
  rerankerFailed = false;
  rerankerWarned = false;
  embedderWarned = false;
  RERANK_MODEL = rerankModelName();
  await Promise.allSettled([
    e?.then((p) => p.dispose?.()),
    r?.then(({ model }) => model.dispose?.()),
  ]);
}

export interface ModelStatus {
  /** LTR_DISABLE_EMBEDDINGS=1: retrieval is BM25 only. */
  disabled: boolean;
  embedModel: string;
  rerankModel: string;
  /** Model files are in the on-disk cache (or a local model folder), so no download is needed. */
  embedCached: boolean;
  rerankCached: boolean;
  /** Loaded into memory by this process. */
  embedLoaded: boolean;
  rerankLoaded: boolean;
  /** The reranker failed to load or run and is off until the cache is cleared. */
  rerankFailed: boolean;
  /** transformers.js could not be imported (e.g. the ONNX runtime is missing). */
  runtimeError?: string;
}

/** Snapshot of the model stack for /api/health. Imports transformers.js (once) to find its cache folder. */
export async function modelStatus(): Promise<ModelStatus> {
  const status: ModelStatus = {
    disabled: modelsDisabled(),
    embedModel: EMBED_MODEL,
    rerankModel: rerankModelName(),
    embedCached: false,
    rerankCached: false,
    embedLoaded: embedderPromise !== null,
    rerankLoaded: rerankerPromise !== null && !rerankerFailed,
    rerankFailed: rerankerFailed,
  };
  if (status.disabled) return status;
  try {
    const { env } = await loadTransformers();
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cacheDir = env.cacheDir;
    const cached = (id: string) => Boolean(cacheDir) && fs.existsSync(path.join(cacheDir as string, id, "config.json"));
    status.embedCached = cached(EMBED_MODEL);
    try {
      const src = await resolveRerankSource();
      status.rerankCached = src.localRoot ? true : cached(src.modelId);
    } catch {
      status.rerankCached = false;
    }
  } catch (err) {
    status.runtimeError = err instanceof Error ? err.name : "Error";
  }
  return status;
}
