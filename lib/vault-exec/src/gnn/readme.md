# gnn

Structure-aware embedding enrichment via feature-sliced GNN layers.

## Responsibilities

- Domain math primitives (attention, residuals, message passing).
- Application orchestration (forward/training phases).
- Infrastructure adapters (runtime store, BLAS bridge, math backend).

## Boundaries

- Domain must not import application/infrastructure.
- Infrastructure must not import application.
- Keep CLI/runtime orchestration outside `gnn`.
