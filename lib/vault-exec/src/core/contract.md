# core contract

## Inputs

- Parsed note content and frontmatter.
- Runtime inputs map for execution.

## Outputs

- Deterministic graph/validation/compile/execution primitives.
- Shared typed contracts for upper layers.

## Invariants

- `core` stays feature-agnostic.
- Validation errors are explicit and machine-readable.
- No ingest-specific branching in `core`.
