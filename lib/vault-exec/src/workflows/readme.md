# workflows

Application orchestration for CLI-facing flows.

## Responsibilities

- Compose parser/graph/executor/routing/store modules.
- Drive init/retrain/run workflows.
- Keep machine-first errors/events explicit.

## Boundaries

- `run.ts`: target resolution, validation, execution, trace learning, optional
  live-training request.
- `init.ts`: configured trace import, derived DB-first table rebuild, and
  projection bootstrap plus background-training request.
- `retrain.ts`: legacy/manual entrypoint kept separate from the service-owned
  async training loop.
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
- `init` and `sync` request background live training after import/rebuild when
  the active DB-first build changed.
- notebooks are for stats/eval and debugging, not the primary runtime trigger.
