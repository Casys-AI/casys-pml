# workflows

Application orchestration for CLI-facing flows.

## Responsibilities

- Compose parser/graph/executor/routing/store modules.
- Drive init/retrain/run workflows.
- Keep machine-first errors/events explicit.

## Boundaries

- `run.ts`: target resolution, validation, execution, trace learning, optional retrain.
- `init.ts`: initial indexing, synthetic traces, first GRU training.
- `retrain.ts`: incremental retraining from persisted traces.
- `pipeline.ts`: reusable graph/GNN/GRU data preparation helpers.
- No low-level storage implementation.
- No model primitive math.

## AX Notes

- Keep orchestration deterministic with explicit fallbacks.
- Orchestration composes lower-level modules rather than duplicating domain logic.
- Runtime fallbacks must emit explicit machine-readable events/errors.
