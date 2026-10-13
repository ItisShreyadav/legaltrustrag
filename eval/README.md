# LegalTrustRAG evaluation

This directory holds the evaluation that closes three gaps:
- **Gap 8:** a conflict test set (ContractConflict).
- **Gap 9:** rigorous evaluation (LegalBench-RAG retrieval, Legal RAG Bench grading, a factorial ablation).
- **Gap 6:** a coverage-vs-accuracy curve for abstention.

The design follows synopsis sections 9 and 10.

## Running it

```bash
npm run eval:dataset                 # build ContractConflict (downloads CUAD v1 once, ~18 MB zip)
npm run eval:review -- --n 40        # hand-verification sample -> eval/data/review-sample.csv
npm run eval:agreement               # Cohen's kappa once human_label is filled in
npm run eval:retrieval               # LegalBench-RAG-mini, 3 configs (downloads ~90 MB once)
npm run eval:pairs                   # judgePair on ContractConflict            (Claude)
npm run eval:pairs -- --subset carveout   # distant-exception subset          (Claude)
npm run eval:e2e                     # full pipeline vs no-verification baseline (Claude)
npm run eval:curve                   # coverage vs accuracy from the saved runs
npm run eval:ablate                  # embeddings x rerank x verify [x LTR_MODELS] (Claude)
npm run eval:all                     # everything -> eval/results/REPORT.md
npm run eval:all -- --quick          # small limits -> eval/results/quick/REPORT.md
```

`eval:all` re-runs every step. The full retrieval eval embeds about 12k clauses and reranks 30 hits for each of 776 queries, which takes 30 to 90 minutes on a laptop CPU. Use `eval:all -- --skip retrieval` to reuse the saved `retrieval.json`; any skipped step reuses its saved results.

Steps marked (Claude) need `ANTHROPIC_API_KEY`. Without it they refuse to run unless you pass `--dry-run` (see below). `eval:all` switches those steps to dry runs automatically and says so in the report.

Useful flags:
- `eval:retrieval --limit N`: keep N corpus documents and only their queries.
- `eval:retrieval --queries N`: cap the number of queries.
- `eval:retrieval --configs bm25,hybrid`: run a subset of the configs.
- `eval:retrieval --rerank-queries N`: run the rerank config on a benchmark-balanced subset of N queries to cap CPU time. The report then adds a "hybrid (same N queries)" row, so the rerank effect is a paired comparison.
- `eval:retrieval --rerank-depth N`: how many fused hits the cross-encoder reorders (default 30).
- `eval:retrieval --out DIR`: write results somewhere other than `eval/results`.
- `eval:pairs --limit N`: judge only the first N pairs.
- `eval:e2e --cases N --baseline|--full --embed on|off --rerank on|off`
- `LTR_MODELS=a,b npm run eval:ablate`: add a model factor to the grid.
- `ANTHROPIC_MODEL`, `LTR_CONCURRENCY`, `LTR_CONFIDENCE_THRESHOLD`, `LTR_FAST_VERIFY` and `LTR_RERANK_MODEL` are respected as in the app. Every report records them.

Requirements:
- Node 22.
- `tsx`, a dev dependency, so scripts can use the `@/` path alias.
- The system `unzip`, used for the first download only.
- Network access for the first download.

The embedder (`Xenova/bge-small-en-v1.5`) and reranker (`Xenova/bge-reranker-base`) load from the local Hugging Face cache in `node_modules/@huggingface/transformers/.cache`.

## Layout

| Path | What | Git |
|---|---|---|
| `src/lib/eval/` | Library: rng (incl. a bit-exact CPython `random` port), metrics, CUAD loader, dataset generators, retrieval / pair / e2e evals, stubs, curve + SVG, markdown, tasks | yes |
| `scripts/*.ts` | Thin CLIs over `src/lib/eval/tasks.ts` | yes |
| `eval/data/contract-conflict.jsonl` (+ `.meta.json`) | The ContractConflict test set (~280 KB) | yes |
| `eval/data/review-sample.csv` | Hand-verification sample (fill in `human_label`) | yes |
| `eval/data/e2e-cases.json` | The synthetic end-to-end cases (regenerated deterministically) | yes |
| `eval/data/raw/` | Downloaded CUAD v1 and LegalBench-RAG | **ignored** |
| `eval/results/*.json, *.md` | Summaries per step; `REPORT.md` collects them | yes |
| `eval/results/coverage-accuracy.{csv,md,svg}` | The coverage-vs-accuracy curve | yes |
| `eval/results/*.jsonl, *.log` | Per-query dumps, run logs | **ignored** |
| `eval/results/*.dry-run.*` | Outputs of stub (dry) runs | yes |
| `eval/results/quick/` | Outputs of `eval:all --quick` | yes |

## 1. ContractConflict (gap 8)

The set has 260 clause pairs built from CUAD v1 expert-annotated clause spans. It is deterministic for a seed (default `contract-conflict-v1`; `--seed`, `--total`).

| label | source | how clause B is made | share |
|---|---|---|---|
| contradict | `twin` | `makeContradictoryTwin` (engine), mixed ~40% number / 40% modal / 20% negation edits | 35% |
| exception | `carveout` | "Notwithstanding the foregoing, *the requirement that X shall Y* shall not apply *to Z*." The subject is taken from the clause's own party and verb phrase; the scope comes from a category-appropriate list | 20% |
| agree | `paraphrase` | fixed meaning-preserving swaps ("prior to" -> "before", "written notice" -> "notice in writing", ...) and conditional reordering; numbers, modals and negations are checked to be unchanged | 25% |
| not_mentioned | `unrelated` | a clause from another contract in an unrelated category family (no CONFLICT_PAIRS link, content-word Jaccard <= 0.1) | 20% |

Record:

```
{id, contractId, category, clauseA, clauseB, label, source, edit?, editType?, contractIdB?, categoryB?, spanA?}
```

`edit` describes the change, e.g. `number: "thirty (30)" -> "sixty (60)"`.

How the clauses are selected:
- **Pool:** CUAD spans of 80 to 1,100 characters that read like operative clauses. Name, party and date spans are excluded.
- **Balance:** a round-robin over the 37 usable categories, at most 2 pairs per contract.

Quality filters on top of the engine's twin generator reject edits inside:
- dates ("December 31");
- citations ("17 U.S.C.");
- section and attachment references ("Sections 7, 9 and 10", "2(b)", "Section 7-101");
- numbering ("8. 3. 1.");
- idioms ("as the case may be", "shall not be unreasonably withheld").

They also reject double negatives ("no right ... is not granted").

**Hand verification.**
1. Run `eval:review -- --n 40` to draw a label-stratified sample. It prints the sample and writes `eval/data/review-sample.csv` with an empty `human_label` column. Use `--blind` to hide the generated label, source and edit from the annotator.
2. Fill in one of `agree | contradict | exception | not_mentioned`. Common spellings such as "Contradiction" or "carve-out" are accepted.
3. Run `eval:agreement` to get Cohen's kappa (with its Landis & Koch band), raw and chance agreement, the confusion matrix and every disagreement.

A kappa of at least 0.8 is the bar for calling the generated labels reliable. Report the disagreements as dataset noise.

Known limitations:
- Clause B is synthetic. Twins are minimal edits, so they test whether the model notices a flipped term, not open-ended legal reasoning.
- Carve-out scopes are templated and sometimes semantically odd for the clause, though still structurally an exception.
- CUAD category labels are used as given.

## 2. Retrieval: LegalBench-RAG-mini (gap 9, retrieval stage)

- **Data.** The official corpus and benchmarks from the Dropbox archive linked by https://github.com/zeroentropy-ai/legalbenchrag.
- **The mini selection reproduces `benchmark.py` exactly.** Per benchmark, tests are sorted by `random.seed(file_path); random.random()` and the first 194 are kept, giving 776 queries over 72 documents. `src/lib/eval/rng.ts` ports CPython's MT19937 string seeding, checked bit-exact against Python.
- **Offsets.** Files are read like Python's `open().read()` (UTF-8, universal newlines). Code-point offsets are converted to UTF-16 where needed, and every gold span is checked against the corpus text; the report prints the count.
- **Chunking** uses our section parser (`structureDocument`): one chunk per clause, up to 1,500 characters.

Configs:
- `bm25`: lexical only.
- `hybrid`: BM25 plus `bge-small` dense, fused with RRF.
- `hybrid+rerank`: the hybrid list, with the top 30 fused hits reranked by the cross-encoder. Thirty is the app's own rerank depth, the one rule search uses at k = 8. Ranks 31 to 64 keep the hybrid order, so R@64 matches `hybrid` by construction. Use `--rerank-depth 64` to rerank the whole list; it costs about twice the CPU time.

Metrics at k in {1, 2, 4, 5, 8, 10, 16, 32, 64}. The headline columns are P@{1, 5, 10} and R@{1, 5, 10, 64}.
- **Character-level** (the paper's definition): P = overlapping characters / retrieved characters; R = overlapping characters / gold characters. **This is the view comparable to the published baseline.**
- **Hit-based:** a retrieved clause is a hit if it overlaps any gold span. P@k = hits / k; R@k = gold spans touched / gold spans.
- **Overall** is the mean of the four per-benchmark means, the paper's 0.25 weighting.

**Baseline** (as cited in synopsis section 9): **P@1 6.4%, R@64 62%**. It used 500-character recursive chunks, OpenAI `text-embedding-3-large` and no reranker.

Clause chunks are longer than 500 characters, which structurally lowers character-level precision. Hit-based precision is the fairer view of ranking quality. A `--limit` run uses a smaller corpus, which is easier, so it is not comparable to the baseline.

## 3. Clause-pair NLI (gap 9, inference stage)

`judgePair` runs on every ContractConflict pair. Each side becomes a one-clause document.

Reported:
- accuracy and macro-F1;
- per-label precision / recall / F1 and the confusion matrix;
- binary conflict detection (contradict or exception vs the rest);
- accuracy by source.

**Contradiction F1** is the headline. The published ContractNLI contradiction F1 is 0.36 to 0.41. That task is hypothesis-vs-NDA, so it is the closest published reference point, not a like-for-like comparison.

`--subset carveout` scores the exception pairs alone, the distant-exception subset: the exception sits in a separate clause, and in the end-to-end cases in a separate document.

## 4. End to end (gap 9, Legal RAG Bench grading)

**Cases.** 20 by default, deterministic (`--seed`). Each case is one CUAD contract made into two documents.

The **agreement** has 8 real clauses:
- every clause is from a distinct category;
- no CONFLICT_PAIRS combination, so there is no known internal conflict.

The **amendment** contains:
- 1 to 2 clauses "amended and restated" as contradictory twins (gold `contradict`);
- one carve-out "Notwithstanding Section n of the Agreement, ..." (gold `exception`);
- hard negatives: a restated paraphrase (agree), an unrelated clause from another contract, and the "Except as amended ..." boilerplate.

That gives about 50 gold conflicts over 20 cases. The cases are saved to `eval/data/e2e-cases.json`.

Each case runs through `runPipeline` twice:
- **full:** the default pipeline, with verification;
- **baseline:** `verify: false`, a plain RAG pipeline with no verifier and no abstention, where confidence = the engine probability.

Grading per finding:

| field | meaning |
|---|---|
| retrieved | the gold clause pair was among `candidatePairs` (per gold conflict) |
| grounded | every quote is an exact substring of its document (`checkQuote`) |
| correct | the finding's two clauses overlap a gold conflict's two clauses and the label matches |

Every error is sorted into exactly one bucket:

| error | when |
|---|---|
| `search_failure` | a gold conflict was missed because its pair never became a candidate |
| `reasoning_failure` | a gold conflict was retrieved but judged wrong, mislabelled or withheld (abstained); or a grounded finding flagged a non-conflict or had the wrong label |
| `invented` | a surfaced finding has a quote that is not an exact substring, or an explanation that failed the support check |

Reported:
- **precision** = correct surfaced / surfaced.
- **recall** = gold with a correct surfaced finding / gold.
- **F1.**
- **retrieval recall** = gold pairs among the candidates.
- **grounded rate.**
- **citation precision** = quotes of surfaced findings that are exact and cite the clause pair of a real conflict / all such quotes.
- **abstain rate** = withheld / all conflict findings.
- **answered accuracy** = correct decisions / non-abstained decisions over every candidate pair, counting "no conflict" decisions too, so the value of abstaining is visible.

The cases also expose a parser limitation on purpose. `structureDocument` resolves "Section 2 *of the Agreement*" inside the amendment to the amendment's own section 2, because references are resolved per document. That adds spurious same-document `cross_reference` candidate pairs, which the engine then has to reject.

The gold labels only know the synthetic conflicts. A genuine conflict between two real clauses would count as a false positive. Choosing distinct, non-conflict-pair categories for the agreement keeps that rare.

## 5. Coverage vs accuracy (gap 6)

The confidence threshold t is swept from 0.00 to 1.00 in 0.05 steps.
- A finding (or judged pair) is **kept** at t when its confidence >= t and it did not fail a hard check (quote or second-opinion conflict check, which withhold regardless of confidence).
- **coverage** = kept / all.
- **accuracy** = correct kept / kept.

Series:
- **pair NLI:** confidence = engine probability.
- **e2e full:** confidence = the verifier's combined score.
- **e2e baseline:** confidence = engine probability.

Outputs are the table (`.md`), `coverage-accuracy.csv` and `coverage-accuracy.svg`. The SVG is hand-written with no dependencies; it has light and dark themes, a hover title on every point and a legend with shape and colour encoding. The summary number is the mean accuracy over the swept coverage range (trapezoid area / span).

## 6. Ablations (gap 9, factorial)

The grid is embeddings {off, on} x rerank {off, on} x verify {off, on}, x model when `LTR_MODELS` is set, run on the e2e cases. Main effects are the mean over the other factors, on minus off. Results go to `ablations.{json,md}`.

The reranker only affects `ClauseIndex.search` (compliance-rule evidence). Conflict candidates come from `candidatePairs`, which does not use it, so rerank is expected to be a no-op on conflict-only cases; the retrieval eval measures it instead.

Embeddings change candidate generation: the cross-document "Other" similarity bar rises from 0.35 (BM25 cosine) to 0.75 (dense blend).

## Dry runs (`--dry-run`)

Without an API key, the Claude-backed stages are replaced by deterministic stubs (`src/lib/eval/stub.ts`) so the plumbing runs end to end:
- **typing:** keyword heuristics only;
- **NLI:** a lexical heuristic with about 15% seeded label noise at lowered probability;
- **quotes:** about 5% are deliberately corrupted, to exercise the groundedness check;
- **verification:** uses the real quote check, lexical relevance and confidence formula, with stubbed support and second-opinion checks.

Still real in a dry run:
- parsing;
- retrieval (embeddings included);
- candidate pairs;
- grading, metrics, curves and reports.

Dry-run outputs carry a `.dry-run` suffix and a banner. **Their accuracy numbers describe the stub, not the system.** The candidate-pair retrieval recall in a dry run is real, but only for heuristic typing, since live runs type clauses with Claude.

## Baselines compared

| what | baseline | our number comes from |
|---|---|---|
| Retrieval | LegalBench-RAG: P@1 6.4%, R@64 62% (char-level) | `eval:retrieval` |
| Contradiction detection | ContractNLI contradiction F1 0.36 to 0.41 | `eval:pairs` |
| Verification | plain RAG pipeline, same retrieval and engine, no verifier (`runPipeline(..., { verify: false })`) | `eval:e2e` |
| Abstention | CUAD's best model reaches only 17.8% precision at 90% recall and never abstains | the coverage-vs-accuracy curve |

## Pipeline hooks used by the evals

`runPipeline(req, onProgress, options?)` takes optional, additive `PipelineOptions`. The app passes none, so its behaviour is unchanged.

| option | effect |
|---|---|
| `verify: false` | baseline |
| `index: { embed, rerank }` | ablations |
| `typeClauses` / `judgePairs` / `verifyFindings` | stubs for dry runs |
| `onTrace({ clauses, pairs, judged })` | candidate pairs and raw NLI results, used for grading |
