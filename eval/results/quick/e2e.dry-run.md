# End-to-end (Legal RAG Bench grading) (dry run)

_2026-10-13T15:11:16.928Z, model stub, git 111a95b5b6_

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

5 synthetic agreement + amendment cases from CUAD contracts, 13 gold conflicts (twins = contradict, carve-outs = exception) plus paraphrase, unrelated and boilerplate hard negatives.

| run | precision | recall | F1 | retrieval recall | grounded | citation precision | abstain rate | answered accuracy | search / reasoning / invented | findings (surfaced / withheld) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| full (verification on) | 16.7% | 7.7% | 0.105 | 61.5% | 100.0% | 16.7% | 57.1% | 88.2% | 5 / 12 / 0 | 6 / 8 |
| baseline (verification off) | 21.4% | 23.1% | 0.222 | 61.5% | 92.9% | 21.4% | 0.0% | 82.8% | 5 / 15 / 1 | 14 / 0 |

precision = correct surfaced findings / surfaced findings; recall = gold conflicts with a correct surfaced finding / gold conflicts; retrieval recall = gold pairs among the candidate pairs; grounded = surfaced findings whose quotes are all exact substrings; citation precision = quotes of surfaced findings that are exact and cite the clause pair of a real conflict; abstain rate = withheld / all conflict findings; answered accuracy = correct decisions / non-abstained decisions over every candidate pair (conflict labels and no-conflict). Errors are counted once each: misses as search_failure (pair never retrieved) or reasoning_failure (retrieved but judged wrong or withheld); false findings as reasoning_failure (grounded) or invented (inexact quote or failed support check).
