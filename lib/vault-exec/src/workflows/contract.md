# workflows contract

## Inputs

- CLI options, vault path, store/model dependencies.
- Runtime payload mode (`strict` | `project`).

## Outputs

- Machine-readable events/errors for orchestration flows.
- Deterministic fallback decisions (`run`, `init`, `retrain`).
- Structured init/retrain results with counts + explicit legacy-training state.

## Invariants

- `runVaultCommand(opts, vaultPath)` is the runtime entrypoint.
- `initVaultWithTraceImport(vaultPath, notes, dbPath, embedder)` imports
  configured traces before rebuilding DB-first training tables and projection.
- `initVault()` is no longer responsible for notes-first indexing/GNN/GRU
  training in the DB-first phase.
- Runtime input parsing uses explicit source + error code contract.
- Runtime payload mode parsing is explicit; unknown mode is a validation error.
- Validation failures exit with `EXIT_CODE_VALIDATION`.
- Execution failures exit with `EXIT_CODE_RUNTIME`.
- Missing intent router state is surfaced as validation error.
- Runtime fallback to full DAG is explicit and evented.
- Projected runtime payload emits explicit dropped-key event details.
- `refreshGnnEmbeddings()` returns explicit source/fallback metadata.
- `buildTrainingExamples()` returns deterministic arrays for identical
  traces/notes/vocab.
- Missing DB/weights use explicit fallbacks rather than implicit failure.
- Trace recording and virtual-edge updates are best-effort and non-fatal.
- Tool-graph projection notes must not be parsed back into the executable vault
  DAG.
- `sync` must keep returning machine-readable trace import counters even when
  runtime retraining is disabled.
