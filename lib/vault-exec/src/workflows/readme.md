# workflows

Application orchestration for CLI-facing flows.

## Responsibilities

- Compose parser/graph/executor/routing/store modules.
- Drive init/retrain/run workflows.
- Keep machine-first errors/events explicit.

## Boundaries

- No low-level storage implementation.
- No model primitive math.
- Keep orchestration deterministic with explicit fallbacks.
