# gru contract

## Inputs

- Intent embedding vectors.
- Vocabulary and GRU weights/config.

## Outputs

- Path predictions (greedy/beam).
- Trainable weight updates + serialized weights.

## Invariants

- Inference is deterministic given identical weights and inputs.
- Training behavior is bounded by config and explicit epochs.
- Unknown routing state must be handled in workflows (not silently here).
