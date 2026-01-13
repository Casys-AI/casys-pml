╔════════════════════════════════════════════════════════════════════════════════╗
║                    SHGAT TRAINING ABLATION STUDY                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

Generated: 2026-01-12T09:18:36.886Z

## Summary (sorted by Test Accuracy)

| Config | Train Acc | Test Acc | Loss | Converge | Time |
|--------|-----------|----------|------|----------|------|
| no_per               | 72.9±2.8% | 79.7±0.9% | 0.630 | 5 ep     | 517.8s |
| lr_001               | 72.7±1.5% | 78.3±1.7% | 0.596 | 4 ep     | 587.5s |
| temp_fixed_007       | 72.7±2.2% | 77.3±4.2% | 0.611 | 3 ep     | 535.7s |
| baseline_production  | 74.3±0.5% | 76.7±2.1% | 0.560 | 5 ep     | 520.1s |
| grid_a04_c55_75      | 72.6±2.1% | 76.7±0.5% | 0.624 | 4 ep     | 527.9s |
| lr_003               | 72.7±1.7% | 76.3±0.9% | 0.582 | 4 ep     | 573.7s |
| grid_a03_c50_70      | 73.4±2.1% | 75.7±2.5% | 0.632 | 3 ep     | 528.0s |
| grid_a04_c50_70      | 72.3±1.7% | 75.7±1.7% | 0.625 | 3 ep     | 528.2s |
| per_low_alpha        | 73.9±2.1% | 75.3±2.5% | 0.590 | 5 ep     | 516.0s |
| grid_a05_c55_75      | 74.2±2.4% | 75.3±2.9% | 0.626 | 4 ep     | 523.0s |
| grid_a05_c50_70      | 73.8±2.8% | 74.7±1.7% | 0.609 | 4 ep     | 523.5s |
| per_high_alpha       | 74.6±0.8% | 74.3±3.8% | 0.553 | 5 ep     | 586.7s |
| temp_fixed_010       | 71.9±1.3% | 74.3±2.5% | 0.942 | 5 ep     | 551.1s |
| lr_010               | 74.3±3.1% | 74.3±3.9% | 0.574 | 6 ep     | 568.8s |
| minimal              | 73.1±1.5% | 74.3±0.9% | 0.961 | 5 ep     | 562.7s |
| no_curriculum        | 67.9±2.0% | 73.7±2.6% | 0.591 | 5 ep     | 602.1s |
| grid_a03_c40_60      | 73.3±0.9% | 73.0±4.3% | 0.625 | 4 ep     | 545.5s |
| grid_a04_c40_60      | 72.3±1.2% | 72.7±3.7% | 0.621 | 4 ep     | 532.1s |
| temp_fixed_020       | 49.6±5.2% | 40.0±7.9% | 1.482 | 8 ep     | 586.0s |

## Statistical Comparison vs Baseline

| Config | Δ Test Acc | p-value | Significant |
|--------|------------|---------|-------------|
| no_per               | +3.0%      | 0.022   | YES |
| lr_001               | +1.7%      | 0.279   | no |
| temp_fixed_007       | +0.7%      | 0.805   | no |
| grid_a04_c55_75      | +0.0%      | 1.000   | no |
| lr_003               | -0.3%      | 0.798   | no |
| grid_a03_c50_70      | -1.0%      | 0.592   | no |
| grid_a04_c50_70      | -1.0%      | 0.516   | no |
| per_low_alpha        | -1.3%      | 0.475   | no |
| grid_a05_c55_75      | -1.3%      | 0.513   | no |
| grid_a05_c50_70      | -2.0%      | 0.194   | no |
| per_high_alpha       | -2.3%      | 0.347   | no |
| temp_fixed_010       | -2.3%      | 0.211   | no |
| lr_010               | -2.3%      | 0.355   | no |
| minimal              | -2.3%      | 0.074   | no |
| no_curriculum        | -3.0%      | 0.119   | no |
| grid_a03_c40_60      | -3.7%      | 0.184   | no |
| grid_a04_c40_60      | -4.0%      | 0.100   | no |
| temp_fixed_020       | -36.7%     | 0.000   | YES |

## Recommendation

Best config: **no_per**
  - Uniform sampling (no PER)
  - Test accuracy: 79.7%

## Ablation Insights

- **PER Impact**: -3.8% difference (PER hurts)
- **Temperature Annealing Impact**: 4.3% difference (annealing helps)
- **Curriculum Impact**: -0.5% difference (curriculum hurts)
