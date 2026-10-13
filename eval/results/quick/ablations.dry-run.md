# Ablations (factorial) (dry run)

_2026-10-13T15:11:16.928Z, 4 cases, git 111a95b5b6_

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
