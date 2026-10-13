# Pair NLI on ContractConflict (dry run)

_2026-10-13T15:11:16.928Z, model stub, git 111a95b5b6_

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

15/15 pairs judged, subset `carveout`. Accuracy **53.3%**, macro-F1 0.696, **contradiction F1 n/a** (ContractNLI published contradiction F1: 0.36-0.41). Binary conflict detection (contradict|exception vs agree|not_mentioned): P 100.0%, R 66.7%, F1 0.800.

| label | support | predicted | precision | recall | F1 |
| --- | --- | --- | --- | --- | --- |
| contradict | 0 | 2 | 0.0% | n/a | n/a |
| exception | 15 | 8 | 100.0% | 53.3% | 0.696 |
| agree | 0 | 0 | n/a | n/a | n/a |
| not_mentioned | 0 | 5 | 0.0% | n/a | n/a |

Confusion matrix (rows = gold, columns = predicted):

| gold \ pred | contradict | exception | agree | not_mentioned |
| --- | --- | --- | --- | --- |
| contradict | 0 | 0 | 0 | 0 |
| exception | 2 | 8 | 0 | 5 |
| agree | 0 | 0 | 0 | 0 |
| not_mentioned | 0 | 0 | 0 | 0 |

Accuracy by source: carveout 53.3% (n=15). The `carveout` row is the distant-exception subset.
