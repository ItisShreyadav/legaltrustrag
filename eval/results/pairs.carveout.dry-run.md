# Pair NLI on ContractConflict (dry run)

_2026-10-13T19:23:20.570Z, model stub, git 111a95b5b6_

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

52/52 pairs judged, subset `carveout`. Accuracy **59.6%**, macro-F1 0.747, **contradiction F1 n/a** (ContractNLI published contradiction F1: 0.36-0.41). Binary conflict detection (contradict|exception vs agree|not_mentioned): P 100.0%, R 71.2%, F1 0.831.

| label | support | predicted | precision | recall | F1 |
| --- | --- | --- | --- | --- | --- |
| contradict | 0 | 6 | 0.0% | n/a | n/a |
| exception | 52 | 31 | 100.0% | 59.6% | 0.747 |
| agree | 0 | 3 | 0.0% | n/a | n/a |
| not_mentioned | 0 | 12 | 0.0% | n/a | n/a |

Confusion matrix (rows = gold, columns = predicted):

| gold \ pred | contradict | exception | agree | not_mentioned |
| --- | --- | --- | --- | --- |
| contradict | 0 | 0 | 0 | 0 |
| exception | 6 | 31 | 3 | 12 |
| agree | 0 | 0 | 0 | 0 |
| not_mentioned | 0 | 0 | 0 | 0 |

Accuracy by source: carveout 59.6% (n=52). The `carveout` row is the distant-exception subset.
