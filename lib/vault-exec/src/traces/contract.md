# traces contract

## Inputs

- Runtime execution traces and vault note graph snapshots.

## Outputs

- Persisted trace rows.
- Synthetic structural traces for cold-start learning.

## Canonical Entities

- `ExecutionTrace`
- `TraceRow`

## Invariants

- Structural trace generation order is deterministic.
- Only non-leaf notes produce synthetic traces.
- Synthetic traces set `synthetic=true`, `success=true`, and use the target note
  as `targetNote`.
- Synthetic paths follow topological order of the extracted dependency subgraph.
- Cyclic subgraphs are skipped explicitly.
- Missing and dangling wikilinks are ignored.
- Input notes are normalized to name order before synthetic generation.
- `recordTrace()` forwards execution fields as-is to
  `IVaultStore.insertTrace()`.
- Trace recording does not mutate routing policy directly.
