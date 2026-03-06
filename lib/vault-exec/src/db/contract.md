# db contract

## Inputs

- Store operations through `IVaultStore` methods.
- Vault-local KV path.

## Outputs

- Durable rows for notes, traces, weights, and virtual edges.
- Deterministic ordered reads where required by callers.

## Canonical Entities

- `IVaultStore`
- `NoteRow`
- `TraceRow`
- `VirtualEdgeRow`

## Invariants

- API surface follows `IVaultStore` exactly.
- Storage failures throw explicit errors.
- No fallback policy hidden inside storage adapters.
- `getAllNotes()` returns notes sorted by note name ascending.
- `setEdges(source, targets)` persists canonical targets: deduplicated and
  code-point sorted.
- `getAllTraces()` returns KV-key order: timestamp bucket, then process-local
  sequence, then uuid.
- `listVirtualEdges()` sorts by score descending, then source ascending, then
  target ascending.
- `upsertNote()` with unchanged payload is idempotent at state level.
- `setEdges()` converges for logically equivalent target sets.
- `saveGruWeights()` and `saveGnnParams()` are singleton writes.
- `insertTrace()` preserves caller-provided `executedAt`, otherwise storage
  assigns current UTC ISO timestamp.
