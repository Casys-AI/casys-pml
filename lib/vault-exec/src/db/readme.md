# db

Operational persistence adapters and store factory.

## Responsibilities

- Open vault store instances.
- Persist notes, edges, traces, model artifacts, and virtual edges.
- Preserve deterministic read ordering where required by workflow/training
  flows.

## Boundaries

- No business-policy decisions.
- No CLI formatting.
- Keep storage details isolated behind `IVaultStore`.

## Notes

- Notes are returned sorted by `name`.
- Edge targets are canonicalized on write.
- Traces preserve caller-provided `executedAt`, otherwise timestamp is assigned
  at insert.
- Virtual-edge listing is deterministic: score desc, then source asc, then
  target asc.
- Repeated writes with the same canonical payload are idempotent at the state
  level.
