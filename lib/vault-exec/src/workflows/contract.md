# workflows contract

## Inputs

- CLI options, vault path, store/model dependencies.

## Outputs

- Machine-readable events/errors for orchestration flows.
- Deterministic fallback decisions (`run`, `init`, `retrain`).

## Invariants

- Runtime input parsing uses explicit source + error code contract.
- Missing intent router state is surfaced as validation error.
- Runtime fallback to full DAG is explicit and evented.
