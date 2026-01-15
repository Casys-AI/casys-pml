╔════════════════════════════════════════════════════════════════════════════════╗
║                    SHGAT TRAINING ABLATION STUDY                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

Generated: 2026-01-14T11:15:58.618Z

## Summary (sorted by Test Accuracy)

| Config | Train Acc | Test Acc | Loss | Converge | Time |
|--------|-----------|----------|------|----------|------|
| lr_010               | 74.7±3.4% | 75.3±3.3% | 0.569 | 5 ep     | 655.1s |
| grid_a04_c50_70      | 74.7±1.8% | 75.3±2.4% | 0.625 | 4 ep     | 593.6s |
| per_high_alpha       | 75.8±3.6% | 75.0±2.2% | 0.533 | 6 ep     | 672.6s |
| grid_a03_c50_70      | 71.7±2.0% | 74.7±0.5% | 0.643 | 3 ep     | 593.5s |
| grid_a04_c55_75      | 71.0±1.8% | 74.0±2.4% | 0.630 | 3 ep     | 594.3s |
| temp_fixed_010       | 71.6±3.0% | 73.7±3.3% | 0.915 | 5 ep     | 618.2s |
| no_per               | 73.8±0.7% | 73.3±1.9% | 0.620 | 4 ep     | 611.6s |
| lr_001               | 74.8±1.1% | 72.3±1.2% | 0.588 | 5 ep     | 691.5s |
| grid_a05_c50_70      | 73.6±1.1% | 72.0±2.2% | 0.623 | 3 ep     | 615.0s |
| temp_fixed_007       | 71.5±2.6% | 71.7±6.2% | 0.631 | 3 ep     | 682.0s |
| grid_a04_c40_60      | 72.2±2.8% | 71.3±5.9% | 0.614 | 3 ep     | 594.0s |
| lr_003               | 72.6±2.2% | 71.0±3.6% | 0.577 | 4 ep     | 714.1s |
| grid_a05_c55_75      | 74.3±3.1% | 71.0±1.4% | 0.589 | 3 ep     | 686.5s |
| grid_a03_c40_60      | 75.3±1.4% | 70.7±4.5% | 0.607 | 3 ep     | 597.7s |
| per_low_alpha        | 71.3±3.5% | 70.0±0.8% | 0.609 | 4 ep     | 673.6s |
| minimal              | 74.9±0.7% | 70.0±5.1% | 0.958 | 4 ep     | 617.2s |
| no_curriculum        | 71.2±0.2% | 68.7±1.7% | 0.604 | 5 ep     | 618.1s |
| baseline_production  | 73.6±3.6% | 68.7±3.4% | 0.569 | 5 ep     | 665.8s |
| temp_fixed_020       | 59.1±2.7% | 46.3±8.7% | 1.507 | 8 ep     | 605.5s |

## Statistical Comparison vs Baseline

| Config | Δ Test Acc | p-value | Significant |
|--------|------------|---------|-------------|
| lr_010               | +6.7%      | 0.015   | YES |
| grid_a04_c50_70      | +6.7%      | 0.005   | YES |
| per_high_alpha       | +6.3%      | 0.006   | YES |
| grid_a03_c50_70      | +6.0%      | 0.002   | YES |
| grid_a04_c55_75      | +5.3%      | 0.027   | YES |
| temp_fixed_010       | +5.0%      | 0.068   | no |
| no_per               | +4.7%      | 0.038   | YES |
| lr_001               | +3.7%      | 0.079   | no |
| grid_a05_c50_70      | +3.3%      | 0.152   | no |
| temp_fixed_007       | +3.0%      | 0.461   | no |
| grid_a04_c40_60      | +2.7%      | 0.498   | no |
| lr_003               | +2.3%      | 0.412   | no |
| grid_a05_c55_75      | +2.3%      | 0.272   | no |
| grid_a03_c40_60      | +2.0%      | 0.539   | no |
| per_low_alpha        | +1.3%      | 0.509   | no |
| minimal              | +1.3%      | 0.706   | no |
| no_curriculum        | +0.0%      | 1.000   | no |
| temp_fixed_020       | -22.3%     | 0.000   | YES |

## Recommendation

Best config: **lr_010**
  - High learning rate (0.10)
  - Test accuracy: 75.3%

## Ablation Insights

- **PER Impact**: -1.0% difference (PER hurts)
- **Temperature Annealing Impact**: 1.7% difference (annealing helps)
- **Curriculum Impact**: 1.6% difference (curriculum helps)
