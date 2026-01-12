╔════════════════════════════════════════════════════════════════════════════════╗
║                    SHGAT TRAINING ABLATION STUDY                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

Generated: 2026-01-12T03:18:15.739Z

## Summary (sorted by Test Accuracy)

| Config | Train Acc | Test Acc | Loss | Converge | Time |
|--------|-----------|----------|------|----------|------|
| live_temp_fixed_07   | 63.2±2.3% | 63.0±2.4% | 1.172 | 2 ep     | 175.5s |
| live_no_per          | 66.3±1.0% | 61.7±4.9% | 1.400 | 3 ep     | 155.9s |
| live_minimal         | 67.0±0.5% | 57.7±3.8% | 1.579 | 3 ep     | 161.8s |
| live_lr_002          | 57.1±2.4% | 54.3±2.1% | 1.154 | 3 ep     | 157.9s |
| live_hard_only       | 68.5±3.6% | 54.3±5.4% | 1.152 | 3 ep     | 164.8s |
| live_temp_fixed_08   | 57.3±4.6% | 53.3±3.7% | 1.210 | 3 ep     | 181.3s |
| live_no_curriculum   | 62.4±3.1% | 53.3±5.4% | 1.107 | 3 ep     | 164.7s |
| live_baseline        | 57.4±2.5% | 52.0±0.8% | 1.117 | 3 ep     | 164.9s |
| live_lr_003          | 63.2±1.4% | 52.0±2.4% | 1.110 | 3 ep     | 161.5s |
| live_beta_high       | 62.1±0.5% | 51.0±6.2% | 1.114 | 3 ep     | 158.8s |

## Recommendation

Best config: **live_temp_fixed_07**
  - Live: fixed τ=0.07 (no annealing)
  - Test accuracy: 63.0%

## Ablation Insights

- **PER Impact**: -5.5% difference (PER hurts)
- **Temperature Annealing Impact**: -3.6% difference (annealing hurts)
- **Curriculum Impact**: 0.7% difference (curriculum helps)
