# LegalTrustRAG evaluation report

- Generated: 2026-10-13T15:11:16.928Z (0.4 min)
- Git: 111a95b5b618b8a81664ead1d68395aa62dcdd5c (uncommitted changes)
- Mode: quick (small limits); Claude-backed steps: **dry run (stub judge)**
- Node v22.22.0; ANTHROPIC_API_KEY absent; env: (no LTR_* overrides)

| step | status | seconds |
| --- | --- | --- |
| 1. ContractConflict test set (gap 8) | ran | 0 |
| 2. Retrieval: LegalBench-RAG-mini | skipped |  |
| 3. Clause-pair NLI on ContractConflict | dry run | 0 |
| 4. End-to-end: full pipeline vs plain-RAG baseline (Legal RAG Bench grading) | dry run | 24 |
| 5. Coverage vs accuracy (gap 6) | ran | 0 |
| 6. Ablations (factorial: embeddings x rerank x verify [x model]) | dry run | 1 |
| 7. Not run / caveats | ran |  |

Metric definitions and baselines: `eval/README.md`. Quick mode: small limits, numbers are smoke-test only.

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

_Skipped._

## 3. Clause-pair NLI on ContractConflict

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

40/40 pairs judged. Accuracy **77.5%**, macro-F1 0.763, **contradiction F1 0.759** (ContractNLI published contradiction F1: 0.36-0.41). Binary conflict detection (contradict|exception vs agree|not_mentioned): P 100.0%, R 80.0%, F1 0.889.

| label | support | predicted | precision | recall | F1 |
| --- | --- | --- | --- | --- | --- |
| contradict | 17 | 12 | 91.7% | 64.7% | 0.759 |
| exception | 8 | 8 | 62.5% | 62.5% | 0.625 |
| agree | 10 | 11 | 90.9% | 100.0% | 0.952 |
| not_mentioned | 5 | 9 | 55.6% | 100.0% | 0.714 |

Confusion matrix (rows = gold, columns = predicted):

| gold \ pred | contradict | exception | agree | not_mentioned |
| --- | --- | --- | --- | --- |
| contradict | 11 | 3 | 1 | 2 |
| exception | 1 | 5 | 0 | 2 |
| agree | 0 | 0 | 10 | 0 |
| not_mentioned | 0 | 0 | 0 | 5 |

Accuracy by source: carveout 62.5% (n=8), paraphrase 100.0% (n=10), twin 64.7% (n=17), unrelated 100.0% (n=5). The `carveout` row is the distant-exception subset.

**Distant-exception subset (`carveout`):** accuracy 53.3% on 15 pairs.

## 4. End-to-end: full pipeline vs plain-RAG baseline (Legal RAG Bench grading)

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

5 synthetic agreement + amendment cases from CUAD contracts, 13 gold conflicts (twins = contradict, carve-outs = exception) plus paraphrase, unrelated and boilerplate hard negatives.

| run | precision | recall | F1 | retrieval recall | grounded | citation precision | abstain rate | answered accuracy | search / reasoning / invented | findings (surfaced / withheld) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| full (verification on) | 16.7% | 7.7% | 0.105 | 61.5% | 100.0% | 16.7% | 57.1% | 88.2% | 5 / 12 / 0 | 6 / 8 |
| baseline (verification off) | 21.4% | 23.1% | 0.222 | 61.5% | 92.9% | 21.4% | 0.0% | 82.8% | 5 / 15 / 1 | 14 / 0 |

precision = correct surfaced findings / surfaced findings; recall = gold conflicts with a correct surfaced finding / gold conflicts; retrieval recall = gold pairs among the candidate pairs; grounded = surfaced findings whose quotes are all exact substrings; citation precision = quotes of surfaced findings that are exact and cite the clause pair of a real conflict; abstain rate = withheld / all conflict findings; answered accuracy = correct decisions / non-abstained decisions over every candidate pair (conflict labels and no-conflict). Errors are counted once each: misses as search_failure (pair never retrieved) or reasoning_failure (retrieved but judged wrong or withheld); false findings as reasoning_failure (grounded) or invented (inexact quote or failed support check).

## 5. Coverage vs accuracy (gap 6)

![Coverage vs accuracy](coverage-accuracy.svg)

Data: `coverage-accuracy.csv`.

| threshold | pairs NLI (dry run) coverage | pairs NLI (dry run) accuracy | e2e full (dry run) coverage | e2e full (dry run) accuracy | e2e baseline (dry run) coverage | e2e baseline (dry run) accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.05 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.10 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.15 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.20 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.25 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.30 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.35 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.40 | 95.0% | 81.6% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.45 | 87.5% | 88.6% | 42.9% | 16.7% | 92.9% | 23.1% |
| 0.50 | 82.5% | 93.9% | 42.9% | 16.7% | 64.3% | 22.2% |
| 0.55 | 75.0% | 96.7% | 42.9% | 16.7% | 64.3% | 22.2% |
| 0.60 | 67.5% | 100.0% | 35.7% | 20.0% | 42.9% | 33.3% |
| 0.65 | 67.5% | 100.0% | 28.6% | 25.0% | 42.9% | 33.3% |
| 0.70 | 67.5% | 100.0% | 28.6% | 25.0% | 42.9% | 33.3% |
| 0.75 | 65.0% | 100.0% | 28.6% | 25.0% | 42.9% | 33.3% |
| 0.80 | 55.0% | 100.0% | 7.1% | 100.0% | 35.7% | 40.0% |
| 0.85 | 27.5% | 100.0% | 7.1% | 100.0% | 21.4% | 66.7% |
| 0.90 | 20.0% | 100.0% | 0.0% | n/a | 14.3% | 50.0% |
| 0.95 | 0.0% | n/a | 0.0% | n/a | 0.0% | n/a |
| 1.00 | 0.0% | n/a | 0.0% | n/a | 0.0% | n/a |

Items: pairs NLI (dry run) n=40, e2e full (dry run) n=14, e2e baseline (dry run) n=14. Mean accuracy over the swept coverage range (area under the curve / span): pairs NLI (dry run) 96.2%, e2e full (dry run) 45.7%, e2e baseline (dry run) 33.2%.

## 6. Ablations (factorial: embeddings x rerank x verify [x model])

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

| model | embeddings | rerank | verify | precision | recall | F1 | retrieval recall | grounded | citation precision | abstain rate | answered accuracy | search / reasoning / invented | s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stub | off | off | off | 33.3% | 40.0% | 0.364 | 70.0% | 91.7% | 33.3% | 0.0% | 84.3% | 3 / 10 / 1 | 0 |
| stub | off | off | on | 50.0% | 20.0% | 0.286 | 70.0% | 100.0% | 50.0% | 66.7% | 91.9% | 3 / 7 / 0 | 0 |
| stub | off | on | off | 33.3% | 40.0% | 0.364 | 70.0% | 91.7% | 33.3% | 0.0% | 84.3% | 3 / 10 / 1 | 0 |
| stub | off | on | on | 50.0% | 20.0% | 0.286 | 70.0% | 100.0% | 50.0% | 66.7% | 91.9% | 3 / 7 / 0 | 0 |
| stub | on | off | off | 27.3% | 30.0% | 0.286 | 60.0% | 90.9% | 27.3% | 0.0% | 84.9% | 4 / 10 / 1 | 0 |
| stub | on | off | on | 20.0% | 10.0% | 0.133 | 60.0% | 100.0% | 20.0% | 54.5% | 89.6% | 4 / 9 / 0 | 0 |
| stub | on | on | off | 27.3% | 30.0% | 0.286 | 60.0% | 90.9% | 27.3% | 0.0% | 84.9% | 4 / 10 / 1 | 0 |
| stub | on | on | on | 20.0% | 10.0% | 0.133 | 60.0% | 100.0% | 20.0% | 54.5% | 89.6% | 4 / 9 / 0 | 0 |

The reranker only reorders `ClauseIndex.search` results (compliance-rule evidence); conflict candidate pairs come from `candidatePairs`, which does not use it, so on these conflict-only cases rerank on/off is expected to change nothing. Its effect is measured by the retrieval eval.

**Main effects** (mean over the other factors, on minus off):

| factor | Δ precision | Δ recall | Δ F1 | Δ retrieval recall | Δ abstain rate | Δ invented |
| --- | --- | --- | --- | --- | --- | --- |
| embeddings | -0.180 | -0.100 | -0.115 | -0.100 | -0.061 | 0.000 |
| rerank | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| verify | 0.047 | -0.200 | -0.115 | 0.000 | 0.606 | -1.000 |

## 7. Not run / caveats

- Live Claude runs of the pair NLI, end-to-end and ablation evals: `ANTHROPIC_API_KEY` is not set. Those sections ran with the deterministic stub judge, so their accuracy numbers describe the stub; retrieval, candidate pairs, quote checks, grading and curves are real.
- Cohen's kappa for the hand-verified sample (needs a human annotator).
- Full-size runs: `--quick` limits every step (retrieval on 12 documents / 60 queries is not comparable to the published baseline).
- The model factor of the factorial ablation (set `LTR_MODELS=a,b`).
- 2. Retrieval: LegalBench-RAG-mini: skipped.
