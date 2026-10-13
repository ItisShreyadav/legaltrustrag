# LegalTrustRAG evaluation report

- Generated: 2026-10-13T19:23:20.570Z (0.1 min)
- Git: 111a95b5b618b8a81664ead1d68395aa62dcdd5c (uncommitted changes)
- Mode: full; Claude-backed steps: **dry run (stub judge)**
- Node v22.22.0; ANTHROPIC_API_KEY absent; env: (no LTR_* overrides)

| step | status | seconds |
| --- | --- | --- |
| 1. ContractConflict test set (gap 8) | ran | 0 |
| 2. Retrieval: LegalBench-RAG-mini | reused |  |
| 3. Clause-pair NLI on ContractConflict | dry run | 0 |
| 4. End-to-end: full pipeline vs plain-RAG baseline (Legal RAG Bench grading) | dry run | 8 |
| 5. Coverage vs accuracy (gap 6) | ran | 0 |
| 6. Ablations (factorial: embeddings x rerank x verify [x model]) | dry run | 0 |
| 7. Not run / caveats | ran |  |

Metric definitions and baselines: `eval/README.md`.

## 1. ContractConflict test set (gap 8)

File: `eval/data/contract-conflict.jsonl`.

260 clause pairs (seed `contract-conflict-v1`) from 221 CUAD contracts and 37 categories, drawn from a pool of 7378 usable CUAD clause spans.

| label | pairs | share |
| --- | --- | --- |
| agree | 65 | 25.0% |
| contradict | 91 | 35.0% |
| exception | 52 | 20.0% |
| not_mentioned | 52 | 20.0% |

Edit types: paraphrase:synonym 64, twin:negation 19, twin:modal 35, carveout:specific 52, paraphrase:synonym+reorder 1, twin:number 37.

Hand verification: **pending**. 40 sampled pairs in `eval/data/review-sample.csv` await a `human_label`; then run `npm run eval:agreement`.

## 2. Retrieval: LegalBench-RAG-mini

_Saved results from 2026-10-13T18:23:21.137Z._

LegalBench-RAG-mini: 776 queries over 72 documents (8.68M chars) split into 12327 clauses by `structureDocument`.
Queries per benchmark: privacy_qa 194, contractnli 194, maud 194, cuad 194. Gold spans checked against the corpus text: 1307/1307 exact.

**Character-level metrics (the paper's definition; comparable to the published baseline).** Overall = mean of the four per-benchmark means.

| config | P@1 | P@5 | P@10 | R@1 | R@5 | R@10 | R@64 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| published baseline | 6.4% |  |  |  |  |  | 62.0% |
| bm25 | 3.5% | 2.5% | 2.0% | 6.4% | 19.7% | 28.1% | 50.9% |
| hybrid | 5.4% | 3.5% | 2.5% | 8.8% | 26.0% | 35.2% | 61.6% |
| hybrid+rerank | 4.0% | 3.4% | 2.6% | 6.6% | 24.4% | 36.7% | 61.6% |

**Hit-based metrics** (a retrieved clause is a hit when it overlaps a gold span; P@k = hits / k, R@k = share of gold spans touched).

| config | P@1 | P@5 | P@10 | R@1 | R@5 | R@10 | R@64 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bm25 | 8.9% | 6.0% | 4.4% | 6.6% | 21.3% | 29.8% | 52.7% |
| hybrid | 12.5% | 8.0% | 5.6% | 9.4% | 28.1% | 37.0% | 62.9% |
| hybrid+rerank | 9.5% | 7.6% | 5.9% | 7.1% | 26.2% | 38.3% | 62.9% |

**Per benchmark** (char P@1 / char R@64 / hit P@1 / hit R@64):

| config | privacy_qa | contractnli | maud | cuad |
| --- | --- | --- | --- | --- |
| bm25 | 8.3% / 72.1% / 21.1% / 76.4% | 5.0% / 69.1% / 13.9% / 70.2% | 0.0% / 17.6% / 0.0% / 18.8% | 0.5% / 44.8% / 0.5% / 45.5% |
| hybrid | 12.5% / 84.4% / 29.4% / 86.8% | 7.3% / 77.3% / 18.6% / 77.5% | 2.0% / 31.2% / 2.1% / 33.4% | 0.0% / 53.7% / 0.0% / 54.1% |
| hybrid+rerank | 10.4% / 84.4% / 26.8% / 86.8% | 4.0% / 77.3% / 9.3% / 77.5% | 1.0% / 31.2% / 1.0% / 33.4% | 0.7% / 53.7% / 1.0% / 54.1% |

| config | queries | dense | rerank | index build (s) | query time (s) |
| --- | --- | --- | --- | --- | --- |
| bm25 | 776 | off | off | 0.4 | 5.8 |
| hybrid | 776 | on | off | 844.7 | 29.6 |
| hybrid+rerank | 776 | on | on | 0.5 | 2701.2 |

Models: embeddings `Xenova/bge-small-en-v1.5`, reranker `Xenova/bge-reranker-base`. The rerank config reorders the top 30 fused hits (the app's rerank depth); ranks below keep the hybrid order, so R@64 matches `hybrid` by construction.

Baseline: LegalBench-RAG (Pipitone & Houir Alami, 2024): 500-char recursive chunks, OpenAI text-embedding-3-large, no reranker. Our chunks are whole clauses (up to 1,500 chars), so char-level precision is structurally lower than with 500-char chunks; hit-based precision is the fairer view of ranking quality.

## 3. Clause-pair NLI on ContractConflict

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

260/260 pairs judged. Accuracy **76.9%**, macro-F1 0.761, **contradiction F1 0.789** (ContractNLI published contradiction F1: 0.36-0.41). Binary conflict detection (contradict|exception vs agree|not_mentioned): P 91.2%, R 79.7%, F1 0.851.

| label | support | predicted | precision | recall | F1 |
| --- | --- | --- | --- | --- | --- |
| contradict | 91 | 84 | 82.1% | 75.8% | 0.789 |
| exception | 52 | 41 | 75.6% | 59.6% | 0.667 |
| agree | 65 | 61 | 86.9% | 81.5% | 0.841 |
| not_mentioned | 52 | 74 | 63.5% | 90.4% | 0.746 |

Confusion matrix (rows = gold, columns = predicted):

| gold \ pred | contradict | exception | agree | not_mentioned |
| --- | --- | --- | --- | --- |
| contradict | 69 | 8 | 4 | 10 |
| exception | 6 | 31 | 3 | 12 |
| agree | 6 | 1 | 53 | 5 |
| not_mentioned | 3 | 1 | 1 | 47 |

Accuracy by source: carveout 59.6% (n=52), paraphrase 81.5% (n=65), twin 75.8% (n=91), unrelated 90.4% (n=52). The `carveout` row is the distant-exception subset.

**Distant-exception subset (`carveout`):** accuracy 59.6% on 52 pairs.

## 4. End-to-end: full pipeline vs plain-RAG baseline (Legal RAG Bench grading)

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

20 synthetic agreement + amendment cases from CUAD contracts, 50 gold conflicts (twins = contradict, carve-outs = exception) plus paraphrase, unrelated and boilerplate hard negatives.

| run | precision | recall | F1 | retrieval recall | grounded | citation precision | abstain rate | answered accuracy | search / reasoning / invented | findings (surfaced / withheld) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| full (verification on) | 43.2% | 32.0% | 0.368 | 68.0% | 100.0% | 43.2% | 50.7% | 90.0% | 16 / 36 / 3 | 37 / 38 |
| baseline (verification off) | 26.7% | 40.0% | 0.320 | 68.0% | 94.7% | 26.7% | 0.0% | 82.2% | 16 / 65 / 4 | 75 / 0 |

precision = correct surfaced findings / surfaced findings; recall = gold conflicts with a correct surfaced finding / gold conflicts; retrieval recall = gold pairs among the candidate pairs; grounded = surfaced findings whose quotes are all exact substrings; citation precision = quotes of surfaced findings that are exact and cite the clause pair of a real conflict; abstain rate = withheld / all conflict findings; answered accuracy = correct decisions / non-abstained decisions over every candidate pair (conflict labels and no-conflict). Errors are counted once each: misses as search_failure (pair never retrieved) or reasoning_failure (retrieved but judged wrong or withheld); false findings as reasoning_failure (grounded) or invented (inexact quote or failed support check).

## 5. Coverage vs accuracy (gap 6)

![Coverage vs accuracy](coverage-accuracy.svg)

Data: `coverage-accuracy.csv`.

| threshold | pairs NLI (dry run) coverage | pairs NLI (dry run) accuracy | e2e full (dry run) coverage | e2e full (dry run) accuracy | e2e baseline (dry run) coverage | e2e baseline (dry run) accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.05 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.10 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.15 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.20 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.25 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.30 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.35 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.40 | 94.6% | 81.3% | 49.3% | 43.2% | 94.7% | 28.2% |
| 0.45 | 90.0% | 85.5% | 49.3% | 43.2% | 90.7% | 29.4% |
| 0.50 | 85.8% | 89.2% | 49.3% | 43.2% | 74.7% | 33.9% |
| 0.55 | 78.8% | 92.7% | 49.3% | 43.2% | 60.0% | 40.0% |
| 0.60 | 70.0% | 99.5% | 45.3% | 47.1% | 53.3% | 45.0% |
| 0.65 | 70.0% | 99.5% | 44.0% | 48.5% | 53.3% | 45.0% |
| 0.70 | 70.0% | 99.5% | 41.3% | 51.6% | 53.3% | 45.0% |
| 0.75 | 65.4% | 99.4% | 38.7% | 51.7% | 50.7% | 44.7% |
| 0.80 | 55.0% | 99.3% | 26.7% | 55.0% | 42.7% | 46.9% |
| 0.85 | 34.2% | 100.0% | 20.0% | 53.3% | 30.7% | 56.5% |
| 0.90 | 17.7% | 100.0% | 0.0% | n/a | 20.0% | 53.3% |
| 0.95 | 0.0% | n/a | 0.0% | n/a | 2.7% | 50.0% |
| 1.00 | 0.0% | n/a | 0.0% | n/a | 0.0% | n/a |

Items: pairs NLI (dry run) n=260, e2e full (dry run) n=75, e2e baseline (dry run) n=75. Mean accuracy over the swept coverage range (area under the curve / span): pairs NLI (dry run) 95.7%, e2e full (dry run) 51.7%, e2e baseline (dry run) 43.0%.

## 6. Ablations (factorial: embeddings x rerank x verify [x model])

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

| model | embeddings | rerank | verify | precision | recall | F1 | retrieval recall | grounded | citation precision | abstain rate | answered accuracy | search / reasoning / invented | s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stub | off | off | off | 30.8% | 48.0% | 0.375 | 78.0% | 93.6% | 29.5% | 0.0% | 81.7% | 11 / 65 / 4 | 0 |
| stub | off | off | on | 51.4% | 36.0% | 0.424 | 78.0% | 100.0% | 51.4% | 55.1% | 90.4% | 11 / 36 / 2 | 0 |
| stub | off | on | off | 30.8% | 48.0% | 0.375 | 78.0% | 93.6% | 29.5% | 0.0% | 81.7% | 11 / 65 / 4 | 0 |
| stub | off | on | on | 51.4% | 36.0% | 0.424 | 78.0% | 100.0% | 51.4% | 55.1% | 90.4% | 11 / 36 / 2 | 0 |
| stub | on | off | off | 26.7% | 40.0% | 0.320 | 68.0% | 94.7% | 26.7% | 0.0% | 82.2% | 16 / 65 / 4 | 0 |
| stub | on | off | on | 43.2% | 32.0% | 0.368 | 68.0% | 100.0% | 43.2% | 50.7% | 90.0% | 16 / 36 / 3 | 0 |
| stub | on | on | off | 26.7% | 40.0% | 0.320 | 68.0% | 94.7% | 26.7% | 0.0% | 82.2% | 16 / 65 / 4 | 0 |
| stub | on | on | on | 43.2% | 32.0% | 0.368 | 68.0% | 100.0% | 43.2% | 50.7% | 90.0% | 16 / 36 / 3 | 0 |

The reranker only reorders `ClauseIndex.search` results (compliance-rule evidence); conflict candidate pairs come from `candidatePairs`, which does not use it, so on these conflict-only cases rerank on/off is expected to change nothing. Its effect is measured by the retrieval eval.

**Main effects** (mean over the other factors, on minus off):

| factor | Δ precision | Δ recall | Δ F1 | Δ retrieval recall | Δ abstain rate | Δ invented |
| --- | --- | --- | --- | --- | --- | --- |
| embeddings | -0.061 | -0.060 | -0.055 | -0.100 | -0.022 | 0.500 |
| rerank | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| verify | 0.186 | -0.100 | 0.048 | 0.000 | 0.529 | -1.500 |

## 7. Not run / caveats

- Live Claude runs of the pair NLI, end-to-end and ablation evals: `ANTHROPIC_API_KEY` is not set. Those sections ran with the deterministic stub judge, so their accuracy numbers describe the stub; retrieval, candidate pairs, quote checks, grading and curves are real.
- Cohen's kappa for the hand-verified sample (needs a human annotator).
- The model factor of the factorial ablation (set `LTR_MODELS=a,b`).
