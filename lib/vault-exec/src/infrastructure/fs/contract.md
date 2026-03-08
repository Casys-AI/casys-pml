# infrastructure/fs contract

## Inputs

- Vault filesystem paths (`dir`, `path`) from application/core callers.
- Markdown note content strings for writes.

## Outputs

- Sorted recursive markdown note listings.
- Raw note content reads and pass-through writes.

## Invariants

- `listNotes()` returns deterministic path ordering.
- Technical/hidden folders are ignored by default, including generated
  `tool-graph/` and `tools/` projection output.
- `writeNote()` must create parent directories for projected note paths.
- Adapter depends on core I/O contracts; core does not depend on this adapter.
- No business-policy logic in this slice.
