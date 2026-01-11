╔════════════════════════════════════════════════════════════════════════════════╗
║                    SHGAT TRAINING ABLATION STUDY                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

Generated: 2026-01-10T16:26:39.538Z

## Summary (sorted by Test Accuracy)

| Config | Train Acc | Test Acc | Loss | Converge | Time |
|--------|-----------|----------|------|----------|------|
| no_per               | 70.8±0.0% | 71.0±0.0% | 1.455 | 5 ep     | 427.7s |
| baseline_production  | 72.0±0.0% | 67.0±0.0% | 1.467 | 5 ep     | 444.0s |
| temp_fixed_007       | 71.8±0.0% | 66.0±0.0% | 1.066 | 3 ep     | 324.0s |
| no_curriculum        | 64.3±0.0% | 63.0±0.0% | 1.422 | 5 ep     | 302.3s |
| minimal              | 70.8±0.0% | 56.0±0.0% | 1.482 | 5 ep     | 298.8s |

## Statistical Comparison vs Baseline

| Config | Δ Test Acc | p-value | Significant |
|--------|------------|---------|-------------|
| no_per               | +4.0%      | 1.000   | no |
| temp_fixed_007       | -1.0%      | 1.000   | no |
| no_curriculum        | -4.0%      | 1.000   | no |
| minimal              | -11.0%     | 1.000   | no |

## Recommendation

Best config: **no_per**
  - Uniform sampling (no PER)
  - Test accuracy: 71.0%

## Ablation Insights

- **PER Impact**: 1.8% difference (PER helps)
- **Temperature Annealing Impact**: 6.0% difference (annealing helps)
- **Curriculum Impact**: 8.5% difference (curriculum helps)
