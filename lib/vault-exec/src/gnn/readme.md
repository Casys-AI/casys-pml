# gnn

Structure-aware embedding enrichment via feature-sliced GNN layers.

## Responsibilities

- Domain math primitives (`domain/*.ts`).
- Application orchestration (`application/*.ts`).
- Infrastructure adapters for BLAS selection and param persistence (`infrastructure/*.ts`).

## Boundaries

- Domain must not import application/infrastructure.
- Infrastructure must not import application.
- Keep CLI/runtime orchestration outside `gnn`.

## Notes

- Phase order is fixed: V->E upward, E->E downward, E->V downward.
- Forward pass is deterministic for fixed nodes, params, and config.
- Original node embeddings are not mutated in place.
- BLAS acceleration is optional; JS fallback remains valid behavior.
