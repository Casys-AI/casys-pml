╔════════════════════════════════════════════════════════════════════════════════╗
║                    SHGAT TRAINING ABLATION STUDY                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

Generated: 2026-01-10T21:42:17.489Z

## Summary (sorted by Test Accuracy)

| Config | Train Acc | Test Acc | Loss | Converge | Time |
|--------|-----------|----------|------|----------|------|
| temp_fixed_007       | 76.0±1.1% | 76.0±1.6% | 0.602 | 3 ep     | 551.3s |
| per_low_alpha        | 73.9±1.0% | 75.7±3.4% | 0.867 | 6 ep     | 555.1s |
| temp_fixed_010       | 72.3±1.8% | 75.7±1.2% | 0.972 | 4 ep     | 553.3s |
| baseline_production  | 72.6±0.5% | 74.0±3.7% | 0.844 | 5 ep     | 633.0s |
| minimal              | 74.7±0.1% | 73.7±1.2% | 0.942 | 6 ep     | 548.5s |
| lr_001               | 71.2±2.0% | 73.3±0.5% | 0.857 | 5 ep     | 552.1s |
| no_curriculum        | 72.8±2.3% | 72.7±1.2% | 0.857 | 8 ep     | 552.9s |
| per_high_alpha       | 73.6±1.6% | 72.3±3.3% | 0.887 | 6 ep     | 550.2s |
| lr_003               | 74.3±1.1% | 71.3±2.5% | 0.853 | 6 ep     | 549.7s |
| lr_010               | 72.8±0.4% | 71.0±2.8% | 0.868 | 6 ep     | 552.5s |
| no_per               | 73.1±2.3% | 70.7±5.2% | 0.890 | 6 ep     | 602.1s |
| temp_fixed_020       | 70.6±3.6% | 64.0±6.4% | 1.749 | 6 ep     | 552.5s |

## Statistical Comparison vs Baseline

| Config | Δ Test Acc | p-value | Significant |
|--------|------------|---------|-------------|
| temp_fixed_007       | +2.0%      | 0.396   | no |
| per_low_alpha        | +1.7%      | 0.568   | no |
| temp_fixed_010       | +1.7%      | 0.464   | no |
| minimal              | -0.3%      | 0.884   | no |
| lr_001               | -0.7%      | 0.759   | no |
| no_curriculum        | -1.3%      | 0.558   | no |
| per_high_alpha       | -1.7%      | 0.563   | no |
| lr_003               | -2.7%      | 0.304   | no |
| lr_010               | -3.0%      | 0.268   | no |
| no_per               | -3.3%      | 0.367   | no |
| temp_fixed_020       | -10.0%     | 0.019   | YES |

## Recommendation

Best config: **temp_fixed_007**
  - Fixed temperature τ=0.07 (CLIP)
  - Test accuracy: 76.0%

## Ablation Insights

- **PER Impact**: 0.4% difference (PER helps)
- **Temperature Annealing Impact**: 0.3% difference (annealing helps)
- **Curriculum Impact**: -0.8% difference (curriculum hurts)
