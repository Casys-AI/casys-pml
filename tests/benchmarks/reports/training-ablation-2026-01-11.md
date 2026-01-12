╔════════════════════════════════════════════════════════════════════════════════╗
║                    SHGAT TRAINING ABLATION STUDY                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

Generated: 2026-01-11T18:31:12.954Z

## Summary (sorted by Test Accuracy)

| Config | Train Acc | Test Acc | Loss | Converge | Time |
|--------|-----------|----------|------|----------|------|
| no_per               | 73.8±2.1% | 69.7±0.5% | 0.950 | 8 ep     | 764.4s |
| grid_a03_c40_60      | 71.7±1.8% | 69.0±3.6% | 0.644 | 3 ep     | 556.1s |
| per_low_alpha        | 75.7±1.0% | 68.3±5.4% | 0.883 | 8 ep     | 555.3s |
| grid_a05_c55_75      | 71.5±2.2% | 68.0±2.4% | 0.628 | 3 ep     | 545.8s |
| per_high_alpha       | 73.2±2.3% | 67.7±1.7% | 0.828 | 9 ep     | 556.4s |
| grid_a04_c55_75      | 75.7±1.3% | 67.7±4.0% | 0.637 | 3 ep     | 554.2s |
| grid_a04_c40_60      | 76.9±1.4% | 67.7±3.1% | 0.602 | 5 ep     | 554.5s |
| minimal              | 73.8±0.8% | 67.3±2.4% | 0.941 | 4 ep     | 556.5s |
| grid_a05_c50_70      | 72.6±0.8% | 66.7±0.5% | 0.605 | 4 ep     | 552.5s |
| temp_fixed_010       | 72.8±1.9% | 65.3±1.7% | 0.891 | 5 ep     | 555.4s |
| lr_001               | 71.8±1.8% | 65.3±4.8% | 0.858 | 8 ep     | 554.3s |
| lr_010               | 72.8±2.1% | 65.3±2.1% | 0.859 | 8 ep     | 556.1s |
| temp_fixed_007       | 72.6±2.1% | 65.0±2.2% | 0.585 | 3 ep     | 558.0s |
| lr_003               | 73.5±1.7% | 65.0±2.9% | 0.872 | 9 ep     | 554.6s |
| grid_a03_c50_70      | 74.4±2.5% | 64.3±2.1% | 0.623 | 3 ep     | 557.0s |
| baseline_production  | 72.6±1.0% | 64.3±4.5% | 0.809 | 9 ep     | 905.9s |
| no_curriculum        | 69.6±1.4% | 63.3±2.1% | 0.776 | 8 ep     | 555.1s |
| grid_a04_c50_70      | 72.2±0.2% | 63.3±3.7% | 0.636 | 3 ep     | 554.5s |
| temp_fixed_020       | 51.3±3.9% | 41.3±13.4% | 1.429 | 5 ep     | 554.3s |

## Statistical Comparison vs Baseline

| Config | Δ Test Acc | p-value | Significant |
|--------|------------|---------|-------------|
| no_per               | +5.3%      | 0.041   | YES |
| grid_a03_c40_60      | +4.7%      | 0.159   | no |
| per_low_alpha        | +4.0%      | 0.326   | no |
| grid_a05_c55_75      | +3.7%      | 0.215   | no |
| per_high_alpha       | +3.3%      | 0.230   | no |
| grid_a04_c55_75      | +3.3%      | 0.339   | no |
| grid_a04_c40_60      | +3.3%      | 0.290   | no |
| minimal              | +3.0%      | 0.306   | no |
| grid_a05_c50_70      | +2.3%      | 0.371   | no |
| temp_fixed_010       | +1.0%      | 0.719   | no |
| lr_001               | +1.0%      | 0.792   | no |
| lr_010               | +1.0%      | 0.726   | no |
| temp_fixed_007       | +0.7%      | 0.817   | no |
| lr_003               | +0.7%      | 0.830   | no |
| grid_a03_c50_70      | +0.0%      | 1.000   | no |
| no_curriculum        | -1.0%      | 0.726   | no |
| grid_a04_c50_70      | -1.0%      | 0.766   | no |
| temp_fixed_020       | -23.0%     | 0.005   | YES |

## Recommendation

Best config: **no_per**
  - Uniform sampling (no PER)
  - Test accuracy: 69.7%

## Ablation Insights

- **PER Impact**: -3.9% difference (PER hurts)
- **Temperature Annealing Impact**: 2.0% difference (annealing helps)
- **Curriculum Impact**: -0.4% difference (curriculum hurts)
