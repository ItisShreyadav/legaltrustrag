# Pair NLI on ContractConflict (dry run)

_2026-10-13T19:23:20.570Z, model stub, git 111a95b5b6_

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
