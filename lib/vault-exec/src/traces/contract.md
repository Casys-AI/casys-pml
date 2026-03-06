# traces contract

## Inputs

- Runtime execution traces and vault note graph snapshots.

## Outputs

- Persisted trace rows.
- Synthetic structural traces for cold-start learning.

## Invariants

- Structural trace generation order is deterministic.
- Cyclic subgraphs are skipped explicitly.
- Trace recording does not mutate routing policy directly.
