# gnn/infrastructure/math slice

Math backend adapters used by GNN infrastructure.

## Responsibilities

- Define backend interface and concrete JS/BLAS implementations.
- Keep backend dispatch explicit and deterministic.

## Boundaries

- Operates on numeric tensors only.
- No imports from `gnn/application`.
