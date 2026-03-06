# workflows

Application orchestration for CLI-facing flows.

## Responsibilities

- Compose parser/graph/executor/routing/store modules.
- Drive init/retrain/run workflows.
- Keep machine-first errors/events explicit.

## Boundaries

- `run.ts`: target resolution, validation, execution, trace learning, optional
  retrain.
- `init.ts`: configured trace import, derived DB-first table rebuild, and
  projection bootstrap.
- `retrain.ts`: legacy incremental retraining from persisted notes/traces.
- `pipeline.ts`: reusable graph/GNN/GRU data preparation helpers.
- No low-level storage implementation.
- No model primitive math.

## Notes

- Keep orchestration deterministic with explicit fallbacks.
- Orchestration composes lower-level modules rather than duplicating domain
  logic.
- Runtime fallbacks must emit explicit machine-readable events/errors.
- Runtime payload handling must be explicit (`strict` default, `project`
  opt-in).
- Projection notes under `tools/` are readable artifacts, not executable vault
  program inputs.
- Projection stays tool-only; agent/session metadata remains aggregated inside
  those notes instead of creating more graph node types in Obsidian.
- `init` and `sync` stop after import + derived-table rebuild + projection in
  the DB-first phase; notebook experimentation owns early training work.
