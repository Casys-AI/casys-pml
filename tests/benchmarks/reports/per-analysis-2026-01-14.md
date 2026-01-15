# PER Analysis Report

Generated: 2026-01-14T04:57:53.596Z

## Data
- Training examples: 373
- Test examples: 94
- Capabilities: 122

## Priority Distribution (after warmup)
- Min: 17.7161
- Max: 17.8680
- Mean: 17.7864
- Std: 0.0381
- Range ratio: 1.0x
- CV: 0.002

## Sampling Analysis
| Metric | PER (α=0.4) | Uniform |
|--------|-------------|---------|
| Coverage | 100.0% | 100.0% |
| Gini | 0.7081 | 0.7094 |

## Results
- per_α=0.3: 77.7% ± 2.6%
- per_α=0.4: 73.8% ± 2.0%
- per_α=0.8: 73.8% ± 1.3%
- per_α=0.6: 72.0% ± 3.1%
- uniform: 71.6% ± 1.0%

## Winner: per_α=0.3
