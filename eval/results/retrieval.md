# Retrieval: LegalBench-RAG-mini

_2026-10-13T18:23:21.137Z, git 111a95b5b6_

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
