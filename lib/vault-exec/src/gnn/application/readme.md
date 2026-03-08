# gnn/application slice

Application-layer orchestration for forward/training flows.

## Responsibilities

- Compose domain primitives into end-to-end GNN passes.
- Expose stable entrypoints for training and inference orchestration.

## Boundaries

- May depend on `gnn/domain` and shared contracts.
- Must not depend on CLI/service slices.
