# Ablations (factorial) (dry run)

_2026-10-13T19:23:20.570Z, 20 cases, git 111a95b5b6_

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
