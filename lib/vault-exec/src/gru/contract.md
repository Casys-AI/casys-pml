# gru contract

## Inputs

- Intent embedding vectors.
- Vocabulary and GRU weights/config.

## Outputs

- Path predictions (greedy/beam).
- Trainable weight updates + serialized weights.
- Evaluation metrics over prepared examples.

## Canonical Entities

- `GRUConfig`
- `GRUWeights`
- `GRUVocabulary`
- `TrainingExample`

## Invariants

- `gruStep(input, hPrev, intent, weights, config)` is deterministic for fixed
  arguments.
- `hNew.length === config.hiddenDim` and `logits.length === config.outputDim`.
- Inference is deterministic given identical weights and inputs.
- Unknown context nodes are ignored instead of throwing.
- Empty or fully visited candidate sets return explicit empty prediction.
- Training with empty examples is a defined no-op.
- Training behavior is bounded by config and explicit epochs.
- Warm-start reuse is allowed only for compatible config + vocab state.
- Unknown routing state must be handled in workflows, not silently here.
