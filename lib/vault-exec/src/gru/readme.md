# gru

Intent-sequence modeling and inference utilities.

## Responsibilities

- GRU cell math + weight initialization.
- Path inference (greedy + beam).
- Training loop and weight serialization.

## Boundaries

- No CLI prompts or output formatting.
- No direct filesystem or DB concerns.
- Runtime orchestration belongs to workflows.

## Notes

- Vector and tensor dimensions must match `GRUConfig`.
- Inference enforces acyclic paths with no revisits.
- `gruStep` is deterministic for fixed inputs and weights.
- Training with empty examples is a defined no-op.
