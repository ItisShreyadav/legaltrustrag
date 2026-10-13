# End-to-end (Legal RAG Bench grading) (dry run)

_2026-10-13T19:23:20.570Z, model stub, git 111a95b5b6_

> **DRY RUN.** A deterministic stub replaced every Claude call (typing, NLI, verification). These numbers check the evaluation plumbing only; they say nothing about the system's accuracy.

20 synthetic agreement + amendment cases from CUAD contracts, 50 gold conflicts (twins = contradict, carve-outs = exception) plus paraphrase, unrelated and boilerplate hard negatives.

| run | precision | recall | F1 | retrieval recall | grounded | citation precision | abstain rate | answered accuracy | search / reasoning / invented | findings (surfaced / withheld) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| full (verification on) | 43.2% | 32.0% | 0.368 | 68.0% | 100.0% | 43.2% | 50.7% | 90.0% | 16 / 36 / 3 | 37 / 38 |
| baseline (verification off) | 26.7% | 40.0% | 0.320 | 68.0% | 94.7% | 26.7% | 0.0% | 82.2% | 16 / 65 / 4 | 75 / 0 |

precision = correct surfaced findings / surfaced findings; recall = gold conflicts with a correct surfaced finding / gold conflicts; retrieval recall = gold pairs among the candidate pairs; grounded = surfaced findings whose quotes are all exact substrings; citation precision = quotes of surfaced findings that are exact and cite the clause pair of a real conflict; abstain rate = withheld / all conflict findings; answered accuracy = correct decisions / non-abstained decisions over every candidate pair (conflict labels and no-conflict). Errors are counted once each: misses as search_failure (pair never retrieved) or reasoning_failure (retrieved but judged wrong or withheld); false findings as reasoning_failure (grounded) or invented (inexact quote or failed support check).
