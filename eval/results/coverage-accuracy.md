# Coverage vs accuracy

Sources: pairs: pairs.dry-run.json; e2e: e2e.dry-run.json. Threshold swept 0.00-1.00 in 0.05 steps; a finding is kept when its confidence >= t and it did not fail a hard check (quote, conflict).

| threshold | pairs NLI (dry run) coverage | pairs NLI (dry run) accuracy | e2e full (dry run) coverage | e2e full (dry run) accuracy | e2e baseline (dry run) coverage | e2e baseline (dry run) accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.05 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.10 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.15 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.20 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.25 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.30 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.35 | 100.0% | 76.9% | 49.3% | 43.2% | 100.0% | 26.7% |
| 0.40 | 94.6% | 81.3% | 49.3% | 43.2% | 94.7% | 28.2% |
| 0.45 | 90.0% | 85.5% | 49.3% | 43.2% | 90.7% | 29.4% |
| 0.50 | 85.8% | 89.2% | 49.3% | 43.2% | 74.7% | 33.9% |
| 0.55 | 78.8% | 92.7% | 49.3% | 43.2% | 60.0% | 40.0% |
| 0.60 | 70.0% | 99.5% | 45.3% | 47.1% | 53.3% | 45.0% |
| 0.65 | 70.0% | 99.5% | 44.0% | 48.5% | 53.3% | 45.0% |
| 0.70 | 70.0% | 99.5% | 41.3% | 51.6% | 53.3% | 45.0% |
| 0.75 | 65.4% | 99.4% | 38.7% | 51.7% | 50.7% | 44.7% |
| 0.80 | 55.0% | 99.3% | 26.7% | 55.0% | 42.7% | 46.9% |
| 0.85 | 34.2% | 100.0% | 20.0% | 53.3% | 30.7% | 56.5% |
| 0.90 | 17.7% | 100.0% | 0.0% | n/a | 20.0% | 53.3% |
| 0.95 | 0.0% | n/a | 0.0% | n/a | 2.7% | 50.0% |
| 1.00 | 0.0% | n/a | 0.0% | n/a | 0.0% | n/a |

Items: pairs NLI (dry run) n=260, e2e full (dry run) n=75, e2e baseline (dry run) n=75. Mean accuracy over the swept coverage range (area under the curve / span): pairs NLI (dry run) 95.7%, e2e full (dry run) 51.7%, e2e baseline (dry run) 43.0%.
