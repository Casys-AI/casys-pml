# gnn/infrastructure slice

Infrastructure adapters for math backends and parameter persistence.

## Responsibilities

- Runtime store codec and BLAS adapter lifecycle.
- Backend selection wrappers behind stable math interfaces.

## Boundaries

- May depend on `gnn/domain` contracts.
- Must not depend on `gnn/application` orchestration logic.
