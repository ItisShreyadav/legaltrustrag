# Coverage vs accuracy

Sources: pairs: pairs.dry-run.json; e2e: e2e.dry-run.json. Threshold swept 0.00-1.00 in 0.05 steps; a finding is kept when its confidence >= t and it did not fail a hard check (quote, conflict).

| threshold | pairs NLI (dry run) coverage | pairs NLI (dry run) accuracy | e2e full (dry run) coverage | e2e full (dry run) accuracy | e2e baseline (dry run) coverage | e2e baseline (dry run) accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.05 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.10 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.15 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.20 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.25 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.30 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.35 | 100.0% | 77.5% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.40 | 95.0% | 81.6% | 42.9% | 16.7% | 100.0% | 21.4% |
| 0.45 | 87.5% | 88.6% | 42.9% | 16.7% | 92.9% | 23.1% |
| 0.50 | 82.5% | 93.9% | 42.9% | 16.7% | 64.3% | 22.2% |
| 0.55 | 75.0% | 96.7% | 42.9% | 16.7% | 64.3% | 22.2% |
| 0.60 | 67.5% | 100.0% | 35.7% | 20.0% | 42.9% | 33.3% |
| 0.65 | 67.5% | 100.0% | 28.6% | 25.0% | 42.9% | 33.3% |
| 0.70 | 67.5% | 100.0% | 28.6% | 25.0% | 42.9% | 33.3% |
| 0.75 | 65.0% | 100.0% | 28.6% | 25.0% | 42.9% | 33.3% |
| 0.80 | 55.0% | 100.0% | 7.1% | 100.0% | 35.7% | 40.0% |
| 0.85 | 27.5% | 100.0% | 7.1% | 100.0% | 21.4% | 66.7% |
| 0.90 | 20.0% | 100.0% | 0.0% | n/a | 14.3% | 50.0% |
| 0.95 | 0.0% | n/a | 0.0% | n/a | 0.0% | n/a |
| 1.00 | 0.0% | n/a | 0.0% | n/a | 0.0% | n/a |

Items: pairs NLI (dry run) n=40, e2e full (dry run) n=14, e2e baseline (dry run) n=14. Mean accuracy over the swept coverage range (area under the curve / span): pairs NLI (dry run) 96.2%, e2e full (dry run) 45.7%, e2e baseline (dry run) 33.2%.
