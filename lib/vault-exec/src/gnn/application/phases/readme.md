# gnn/application/phases slice

Deterministic phase operators used by application forward orchestration.

## Responsibilities

- Phase-specific transforms (`vertex->edge`, `edge->edge`, `edge->vertex`).
- Keep phase behavior composable and independently testable.

## Boundaries

- Depends on domain contracts only.
- No infrastructure backend logic in this slice.
