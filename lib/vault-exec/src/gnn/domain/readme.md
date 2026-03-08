# gnn/domain slice

Core GNN math/domain primitives independent of runtime adapters.

## Responsibilities

- Message passing, residual blending, attention scoring, and param types.
- Deterministic vector math primitives shared by application phases.

## Boundaries

- Must not import `gnn/application` or `gnn/infrastructure`.
- Keep functions pure and deterministic.
