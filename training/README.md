# Legal reranker: fine-tuning bge-reranker-base on LegalBench-RAG

This folder closes **research gap 3** ("bad search is the biggest cause of wrong answers") and
implements the reranker described in **synopsis section 6.3**: the hybrid BM25 + dense candidates of
`src/lib/retrieval` are reordered by a cross-encoder that we fine-tune on LegalBench-RAG
question/passage pairs, because LegalBench-RAG showed a general-purpose reranker hurting legal search.

The app keeps working without any of this: by default it loads the stock `Xenova/bge-reranker-base`.
After training you point it at the exported model with one environment variable.

```
prepare_data.py ──> data/<variant>/{train,val}.jsonl ──> train_reranker.py ──> out/legal-reranker/
                                                                                     │
          eval_reranker.py <── public/models/legal-reranker/ <── export_onnx.py ─────┘
```

| File | What it does |
|---|---|
| `requirements.txt` | Python dependencies (torch, transformers, sentence-transformers, datasets, onnx, onnxruntime, rank_bm25, ...) |
| `prepare_data.py` | Downloads LegalBench-RAG, chunks the contracts like the TS section parser, mines BM25 hard negatives, splits by document, writes JSONL |
| `train_reranker.py` | Fine-tunes `BAAI/bge-reranker-base` as a sentence-transformers `CrossEncoder`, keeps the best epoch, compares against the untuned model |
| `export_onnx.py` | Exports the checkpoint to the transformers.js layout (`onnx/model.onnx` + int8 `onnx/model_quantized.onnx`) |
| `eval_reranker.py` | Re-runs the held-out evaluation for any checkpoint or exported ONNX folder and prints a Markdown table for the report |
| `colab.ipynb` | Runs all of the above on a Colab T4 and zips the exported model for download |

## 1. Data (`prepare_data.py`)

**Source.** [LegalBench-RAG](https://github.com/zeroentropy-ai/legalbenchrag) (Pipitone & Houir Alami, 2024):
6,889 questions over 714 documents from four sub-benchmarks (ContractNLI, CUAD, MAUD, PrivacyQA); each
answer is an exact character span of one corpus file. The script downloads the authors' corpus +
benchmark zip (~90 MB, Dropbox link from the repo README) into `training/data/raw/` once. If that link is
blocked, download it by hand and pass `--source <folder with corpus/ and benchmarks/>`. The underlying
datasets have their own licences (CUAD, ContractNLI, MAUD, PrivacyQA); check them before redistributing
anything derived from the corpus.

**Query selection.** Default is **LegalBench-RAG-mini**: 194 queries per sub-benchmark, picked exactly as
`legalbenchrag/benchmark.py` does (`MAX_TESTS_PER_BENCHMARK = 194`, `SORT_BY_DOCUMENT = True`), i.e. the
same 776 queries the synopsis evaluation plan refers to. `--full` uses all queries.

**Chunking.** Every corpus file is cut into clause-like spans that roughly mirror
`src/lib/parse/structure.ts`, so the reranker is trained on the same kind of passages it sees in the
app: a new chunk starts after a blank line, or at a numbered / lettered heading (`5.`, `5.2`, `(a)`,
`ARTICLE V`, `Section 3`, `EXHIBIT A`, `WHEREAS`, `"Term" means`, ALL-CAPS heading lines) when the
previous line ended a sentence; header-only lines are folded into the following chunk; blocks longer than
1,500 characters are split at sentence ends near evenly spaced targets (never into pieces under 200
characters). Result: chunks of 100-1,500 characters (99.9% of them; page-number fragments are dropped).
Offsets index the corpus text exactly as LegalBench-RAG reads it, so gold spans line up (checked on 1,856 gold snippets: 0
mismatches against the benchmark's own `answer` strings).

**Training triples.** For every query:
- **positives**: chunks overlapping a gold span (at least 40 characters, or half the span if it is
  shorter), up to 3 per query, best overlap first;
- **4 hard negatives**: the highest-scoring BM25 (`rank_bm25.BM25Okapi`) chunks *of the same document*
  that do not touch any gold span;
- **2 random negatives**: chunks from other documents of the same split.

Texts are deduplicated (whitespace/case-normalised); duplicate (query, positives) records are dropped.

**Split.** About 10% of each sub-benchmark's queries are held out **by document** (whole documents go to
validation), so the model never sees a validation contract during training. Every validation query also
gets a **BM25 candidate list**: the top 50 chunks of its gold document (`--candidate-scope doc`, how
LegalTrustRAG searches an uploaded contract) or of all validation documents pooled (`--candidate-scope
corpus`, the LegalBench-RAG setting), each labelled relevant / not relevant.

Variants (sizes from an actual run of the script, seed 13):

| Command | Output folder | Train queries / pairs | Val queries | Val docs | Val BM25 R@10 / R@50 (macro) |
|---|---|---|---|---|---|
| `python training/prepare_data.py` | `data/mini` | 698 / 5,250 | 76 | 11 | 45.8% / 88.7% |
| `python training/prepare_data.py --full` | `data/full` | 6,170 / 46,351 | 709 | 75 | 47.5% / 83.8% |
| `python training/prepare_data.py --full --val-mini --candidate-scope corpus` | `data/full-valmini` | 6,100 / 45,788 | 774 | 72 | 23.6% / 45.1% |

`full-valmini` trains on every document *outside* LegalBench-RAG-mini and validates on exactly the mini
queries with corpus-wide candidates, which is the configuration to quote next to the published
LegalBench-RAG-mini numbers. In that variant PrivacyQA has no training queries (all 7 privacy policies are
in mini). `--max-queries N` caps the selection for quick experiments.

Record format (`train.jsonl`; `val.jsonl` adds `candidates` and `num_relevant`):

```json
{"qid": "cuad-123", "benchmark": "cuad", "doc": "cuad/....txt", "query": "Consider the ...; ...?",
 "positives": ["..."], "hard_negatives": ["...", "...", "...", "..."], "random_negatives": ["...", "..."],
 "gold_spans": [["cuad/....txt", 1200, 1450]], "positive_spans": [[1100, 1720]], "hard_negative_spans": [[...]]}
```

## 2. Training (`train_reranker.py`)

- Model: `BAAI/bge-reranker-base` (XLM-RoBERTa base, 278M parameters) as a sentence-transformers
  `CrossEncoder` with one output logit, `max_length=512`. This is the same network the app ships as
  `Xenova/bge-reranker-base`, so "untuned" vs "fine-tuned" is a clean comparison.
- Loss: `BinaryCrossEntropyLoss` (positive pairs 1, hard + random negatives 0); `--pos-weight` and
  `--no-random-negatives` are available for ablations.
- Optimiser: AdamW, lr 2e-5, batch 16, 2 epochs (`--epochs 1` for the full data on a one-hour budget),
  10% linear warmup, fp16 mixed precision on CUDA, seed 13.
- Model selection: `CrossEncoderRerankingEvaluator` (the current name of `CERerankingEvaluator`) runs on the
  validation BM25 candidate lists after every epoch (`always_rerank_positives=False`, so positives BM25
  missed stay missed); the epoch with the best **MRR@10** is restored and saved to
  `training/out/legal-reranker/`.
- Report: before training the untuned base model is scored, after training the fine-tuned one; the script
  prints and saves (`out/legal-reranker/eval_results.{json,md}`) P@1 / R@10 / MRR@10 for BM25 order,
  untuned and fine-tuned, overall and per sub-benchmark, plus the per-epoch evaluator metrics and the full
  training log.

Per-epoch trainer checkpoints go to `training/out/checkpoints/` (about 3 GB each with optimiser state; at
most 2 are kept, delete the folder when done).

## 3. Evaluation (`eval_reranker.py`)

All systems rerank the *same* BM25 candidate lists of the held-out queries:

| Metric | Definition |
|---|---|
| P@1 | share of queries whose top chunk overlaps a gold span |
| R@10 | relevant chunks in the top 10 / all relevant chunks of the gold document (two-stage recall: chunks BM25 did not retrieve count as misses) |
| MRR@10 | reciprocal rank of the first relevant chunk in the top 10 |
| R@all | recall of the whole candidate list, the ceiling for any reranker |

```bash
# report numbers: BM25 vs untuned vs fine-tuned, all held-out queries (GPU recommended)
python training/eval_reranker.py --data training/data/mini \
    --model BAAI/bge-reranker-base --model training/out/legal-reranker --out training/out/eval_results.json

# parity of the exported graphs the app runs (onnxruntime on CPU, so on a subset)
python training/eval_reranker.py --data training/data/mini --model training/out/legal-reranker \
    --onnx public/models/legal-reranker --limit 20 --top-candidates 10 --no-fp16 --out training/out/onnx_parity.json
```

`--onnx` scores the exported `onnx/model.onnx` and `onnx/model_quantized.onnx` with onnxruntime, i.e. the
exact weights the app loads, so quantisation loss is visible. CPU inference of a 278M-parameter
cross-encoder is slow (thousands of pairs take tens of minutes on a 2-vCPU Colab VM), hence the subset
flags; the PyTorch row in the same run is computed on the same subset. Results go to `--out` (default
`<first model>/eval_results.json`) plus a `.md` table.

These are chunk-level metrics. LegalBench-RAG's published numbers (e.g. 6.4% precision at rank 1 on mini)
are character-level precision/recall over a corpus-wide index, so quote ours as "chunk-level P@1 on the
held-out split" rather than as a like-for-like replication; `full-valmini` with `--candidate-scope corpus`
is the closest setting.

Reference point, measured here without any training: the untuned model on `data/mini` (76 held-out
queries from 11 documents, 2,979 candidate pairs, doc-scope candidates, PyTorch):

| System | P@1 | R@10 | MRR@10 | R@all | P@1 contractnli | P@1 cuad | P@1 maud | P@1 privacy_qa |
|---|---|---|---|---|---|---|---|---|
| BM25 | 13.2 | 45.8 | 26.7 | 88.7 | 22.7 | 0.0 | 0.0 | 38.5 |
| BAAI/bge-reranker-base (untuned) | 11.8 | 53.5 | 30.6 | 88.7 | 18.2 | 0.0 | 9.5 | 23.1 |

The general-purpose reranker improves R@10 and MRR@10 but *lowers* P@1 below BM25, the same effect
LegalBench-RAG reported. The fine-tuned model has to beat this row. With only 76 queries one query is
1.3 points (and 4-5 points per sub-benchmark), so for the report prefer `full` / `full-valmini`.

## 4. Export (`export_onnx.py`)

```bash
python training/export_onnx.py                       # training/out/legal-reranker -> public/models/legal-reranker
python training/export_onnx.py --model BAAI/bge-reranker-base --out /tmp/bge-reranker-base   # export the stock model
```

Resulting folder, which is what transformers.js `from_pretrained(<dir>)` expects for a local model:

```
public/models/legal-reranker/
├── config.json               XLMRobertaForSequenceClassification, num_labels = 1
├── tokenizer.json            fast tokenizer (transformers.js needs this file)
├── tokenizer_config.json     model_max_length 512, special tokens
├── export_info.json          source, exporter, opset, quantisation, PyTorch parity checks
└── onnx/
    ├── model.onnx            fp32, inputs input_ids + attention_mask, output logits [batch, 1]   ~1.1 GB  (dtype "fp32")
    └── model_quantized.onnx  dynamic int8 (QInt8 weights)                                         ~280 MB  (dtype "q8", the app default)
```

How: `torch.onnx.export` (TorchScript exporter, opset 17; falls back to the dynamo exporter on torch
versions without it) and `onnxruntime.quantization.quantize_dynamic`, the same dynamic int8 scheme
optimum's `ORTQuantizer` and the transformers.js conversion script apply. **optimum is not used**:
optimum 2.x dropped the `[exporters]` extra (the exporter moved to `optimum-onnx`), and `optimum-onnx` 0.1
pins `transformers<4.58`, which conflicts with sentence-transformers 6 / transformers 5.

Both graphs are checked against PyTorch on sample pairs at two different batch/sequence shapes. Measured
when exporting the stock `BAAI/bge-reranker-base` here: fp32 max |logit difference| 3.5e-5 (i.e. exact);
int8 differs by up to ~2-3 logits on individual pairs. That is inherent to dynamic int8 on this model, not
to the export: on 30 held-out queries x top-10 BM25 candidates, the top-ranked chunk matched the fp32
model for 86.7% of queries with the default QInt8 export (Kendall tau 0.86), versus 80.0% (tau 0.84) for
the int8 `Xenova/bge-reranker-base` the app ships today, 70.0% for `--quant-type quint8` and 80.0% for
`--per-channel`. So check the `onnx/model.onnx` vs `onnx/model_quantized.onnx` rows of the ONNX parity run
before relying on int8; if int8 costs too much, run the app with `LTR_RERANK_DTYPE=fp32` (1.1 GB, slower).

`public/` is served by Next.js, so anything under `public/models/` is downloadable from the site; the
folder is git-ignored (the files exceed GitHub's 100 MB limit). Use `--out models/legal-reranker` plus
`LTR_LOCAL_MODELS_DIR=models` if you would rather not serve it.

## 5. Using the model in the app

`src/lib/retrieval/models.ts` resolves the reranker at runtime:

| Variable | Meaning |
|---|---|
| `LTR_RERANK_MODEL` | Hugging Face id (default `Xenova/bge-reranker-base`) **or** a local model directory, absolute or relative to the working directory |
| `LTR_LOCAL_MODELS_DIR` | optional folder of local models; if `<dir>/<LTR_RERANK_MODEL>/config.json` exists it is loaded from there |
| `LTR_RERANK_DTYPE` | `q8` (default, `onnx/model_quantized.onnx`) or `fp32` (`onnx/model.onnx`) |

```bash
LTR_RERANK_MODEL=public/models/legal-reranker npm run dev
# or
LTR_LOCAL_MODELS_DIR=public/models LTR_RERANK_MODEL=legal-reranker npm run dev
```

Local models are loaded with `env.localModelPath` set to the model's parent folder and
`env.allowRemoteModels = false` for that load only (restored afterwards; model loads are serialised so the
embedder's Hub load never runs with remote models disabled). The server logs which reranker loaded, e.g.
`[retrieval] reranker loaded: public/models/legal-reranker (local /abs/path/public/models/legal-reranker, dtype q8)`.
If the folder is missing or broken the app logs a warning and falls back to the fused BM25 + dense score,
exactly as it does when the default reranker cannot be downloaded. `RERANK_MODEL` (exported from
`@/lib/retrieval`) reports the configured reranker; `clearModelCache()` re-reads the variables, so an
evaluation script can switch rerankers in one process.

## 6. Running it

### Google Colab (T4, about one hour)

1. Commit and push the `training/` folder (the notebook clones the repo; for a private repo add a Colab
   secret `GITHUB_TOKEN` with read access).
2. Open `training/colab.ipynb` in Colab (File -> Upload notebook, or open it from GitHub),
   `Runtime -> Change runtime type -> T4 GPU`.
3. Set `VARIANT` in the first code cell (`mini` for a quick run, `full-valmini` for the report numbers,
   with `EPOCHS = 1`) and `Runtime -> Run all`.
4. The last cells download `legal-reranker.zip` (int8 model, tokenizer, config; add the fp32 graph with
   `INCLUDE_FP32_IN_ZIP = True`) and `legal-reranker-eval.zip` (all metrics). Unzip the model into
   `public/models/` of the app.

Budget (estimates for a T4, not yet measured on Colab): installs ~3 min; data ~1 min; model download
~1 min; training ~1.5 min per epoch on `mini` and ~12 min per epoch on `full` / `full-valmini` (~2,900
steps of 16 pairs); each evaluation pass ~10 s on `mini` and ~2 min on the full validation sets (fp16
autocast); export ~3 min; the ONNX parity check on CPU a few minutes. `mini` finishes in ~15-20 min,
`full-valmini` with one epoch in ~45-55 min. If the GPU runs out of memory, use `--batch-size 8` (or
`--max-length 384`).

### Locally

```bash
python3 -m venv ~/.venvs/ltr-training          # keep the venv OUTSIDE the repo, see note below
source ~/.venvs/ltr-training/bin/activate
pip install -r training/requirements.txt

python training/prepare_data.py                 # ~2 s after the 90 MB download (mini); ~10 s for --full
python training/train_reranker.py               # needs a CUDA GPU in practice (CPU / Apple MPS run, but far slower)
python training/export_onnx.py                  # a few minutes on a laptop CPU
python training/eval_reranker.py --data training/data/mini --model BAAI/bge-reranker-base --model training/out/legal-reranker
python training/eval_reranker.py --data training/data/mini --model training/out/legal-reranker \
    --onnx public/models/legal-reranker --limit 20 --top-candidates 10 --no-fp16
```

Note: do not create the virtualenv inside the repository. `npm run lint` lints every `.js`/`.mjs` file
under the project root except `node_modules`, and torch ships JavaScript files
(`torch/utils/model_dump/*.js`) that fail the Next.js ESLint rules. (`.gitignore` still lists
`training/.venv/` in case one is created there; adding `"training/**"` to `globalIgnores` in
`eslint.config.mjs` would also fix it.)

Smoke test without a GPU (a few optimizer steps, only proves the scripts run):

```bash
python training/train_reranker.py --max-steps 4 --eval-steps 2 --limit-train 20 --limit-val 8 \
    --batch-size 4 --max-length 128 --out /tmp/smoke-reranker --checkpoints /tmp/smoke-ckpt
```

## 7. Versions

Written against and smoke-tested with Python 3.14, torch 2.14.1, transformers 5.19.0,
sentence-transformers 6.1.0, datasets 5.1.0, onnx 1.23.2, onnxruntime 1.31.0, onnxscript 0.7.2,
rank_bm25 0.2.2; the scripts need Python >= 3.10. `train_reranker.py` also handles transformers 4.x
(it switches between `warmup_ratio` and a float `warmup_steps`), but only transformers 5.19 was run.
Exported models were loaded with `@huggingface/transformers` 4.3.1 (the app's version).
