# src contract

## Inputs

- CLI commands, vault paths, runtime payloads, and persisted learning artifacts.
- Feature-slice contracts from `src/*/contract.md` modules.

## Outputs

- Deterministic machine-readable CLI/service behavior.
- Explicit validation/runtime fallback signals by slice boundaries.

## Invariants

- Architecture is feature-sliced: orchestration in `workflows`, primitives in
  `core`, adapters in `infrastructure`.
- Dependencies flow toward stable contracts; lower-level slices do not depend on
  higher-level orchestration.
- Runtime payload semantics are explicit (`strict` default, `project` opt-in)
  and deterministic.
- Co-located docs (`readme.md` and `contract.md`) are the local source of truth
  for each top-level slice.
