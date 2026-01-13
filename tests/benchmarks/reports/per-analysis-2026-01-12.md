# PER Analysis Report

Generated: 2026-01-12T15:47:31.071Z

## Data
- Training examples: 373
- Test examples: 94
- Capabilities: 122

## Priority Distribution (after warmup)
- Min: 17.7186
- Max: 17.8761
- Mean: 17.7910
- Std: 0.0360
- Range ratio: 1.0x
- CV: 0.002

## Sampling Analysis
| Metric | PER (α=0.4) | Uniform |
|--------|-------------|---------|
| Coverage | 100.0% | 100.0% |
| Gini | 0.6924 | 0.6783 |

## Results
- per_α=0.6: 76.6% ± 2.3%
- uniform: 73.0% ± 2.7%
- per_α=0.3: 72.7% ± 0.5%
- per_α=0.4: 72.0% ± 3.1%
- per_α=0.8: 70.9% ± 2.8%

## Winner: per_α=0.6
