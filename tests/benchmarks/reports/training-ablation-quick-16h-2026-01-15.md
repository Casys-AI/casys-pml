╔════════════════════════════════════════════════════════════════════════════════╗
║                    SHGAT TRAINING ABLATION STUDY (16 HEADS)                   ║
╚════════════════════════════════════════════════════════════════════════════════╝

Generated: 2026-01-15T06:31:55.106Z
Configuration: 16 heads × 64 dims = 1024 hidden dims

## Summary (sorted by Test Accuracy)

| Config | Train Acc | Test Acc | Loss | Converge | Time |
|--------|-----------|----------|------|----------|------|
| baseline_production  | 70.8±0.0% | 27.7±0.0% | 0.405 | 1 ep     | 536.2s |
| lr_010               | 78.4±0.0% | 26.6±0.0% | 0.373 | 2 ep     | 569.0s |
| temp_fixed_007       | 73.4±0.0% | 22.3±0.0% | 0.430 | 2 ep     | 488.4s |
| batch_64             | 70.8±0.0% | 13.8±0.0% | 0.613 | 2 ep     | 309.2s |
| lr_003               | 78.9±0.0% | 7.4±0.0% | 0.316 | 2 ep     | 665.9s |
| batch_16             | 41.1±0.0% | 7.4±0.0% | 3.923 | 1 ep     | 1374.4s |

## Statistical Comparison vs Baseline

| Config | Δ Test Acc | p-value | Significant |
|--------|------------|---------|-------------|
| lr_010               | -1.1%      | 1.000   | no |
| temp_fixed_007       | -5.3%      | 1.000   | no |
| batch_64             | -13.8%     | 1.000   | no |
| lr_003               | -20.2%     | 1.000   | no |
| batch_16             | -20.2%     | 1.000   | no |

## Recommendation

Best config: **baseline_production**
  - Current production config: PER α=0.6 + curriculum + τ cosine 0.10→0.06
  - Test accuracy: 27.7%

## Ablation Insights

- **Temperature Annealing Impact**: 6.0% difference (annealing helps)
