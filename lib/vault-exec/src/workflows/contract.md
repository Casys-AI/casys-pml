# workflows contract

## Inputs

- CLI options, vault path, store/model dependencies.

## Outputs

- Machine-readable events/errors for orchestration flows.
- Deterministic fallback decisions (`run`, `init`, `retrain`).
- Structured init/retrain results with counts + training state.

## Invariants

- `runVaultCommand(opts, vaultPath)` is the runtime entrypoint.
- Runtime input parsing uses explicit source + error code contract.
- Validation failures exit with `EXIT_CODE_VALIDATION`.
- Execution failures exit with `EXIT_CODE_RUNTIME`.
- Missing intent router state is surfaced as validation error.
- Runtime fallback to full DAG is explicit and evented.
- `refreshGnnEmbeddings()` returns explicit source/fallback metadata.
- `buildTrainingExamples()` returns deterministic arrays for identical traces/notes/vocab.
- Missing DB/weights use explicit fallbacks rather than implicit failure.
- Trace recording and virtual-edge updates are best-effort and non-fatal.
