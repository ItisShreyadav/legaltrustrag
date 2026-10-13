# Pair NLI on ContractConflict (dry run)

_2026-10-13T15:11:16.928Z, model stub, git 111a95b5b6_

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
