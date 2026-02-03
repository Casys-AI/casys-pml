# SHGAT-TF Benchmarks

Tests et benchmarks pour la librairie `lib/shgat-tf` (SHGAT avec TensorFlow.js).

## Fichiers

| Fichier | Description |
|---------|-------------|
| `test-shgat-tf-only.ts` | Test principal: entraînement + MRR sur production-traces |
| `quick-tf-mp-test.ts` | Test message passing sparse |
| `quick-sparse-test.ts` | Test sparse forward/backward |
| `quick-scoring-test.ts` | Test scoring K-head |
| `quick-layers-trainer-test.ts` | Test initialisation LayersTrainer |
| `quick-ffi-backend-test.ts` | Test backend FFI TensorFlow |
| `quick-tf-ffi-test.ts` | Test complet FFI ops |
| `check-levels.ts` | Vérification niveaux hiérarchiques |
| `quick-bench.ts` | Benchmark rapide basique |

## Usage

```bash
# Test principal (recommandé)
deno run --allow-all tests/benchmarks/shgat-tf/test-shgat-tf-only.ts

# Tests rapides individuels
deno run --allow-all tests/benchmarks/shgat-tf/quick-tf-mp-test.ts
```

## Métriques Actuelles (2026-02-03)

| Métrique | Valeur |
|----------|--------|
| MRR | 0.778 |
| Hit@1 | 68.6% |
| Hit@3 | 82.9% |
| Accuracy (epoch 3) | 90.7% |

**Cible Production:** MRR 0.933

Voir `lib/shgat-tf/TECH-SPEC-BACKWARD-FIXES.md` pour les bugs à corriger.
