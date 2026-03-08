# links

Virtual-edge learning policy and update mechanics.

## Responsibilities

- Convert feedback into virtual-edge updates.
- Apply score updates and decay over virtual edges.
- Evaluate promotion policy transitions.

## Boundaries

- No graph execution.
- No CLI rendering.
- Persistence routed via `IVaultStore`.

## Notes

- Real graph edges are excluded from virtual-edge updates.
- Update aggregation is deterministic and sorted by `(source, target)`.
- Policy thresholds are explicit constants, not implicit heuristics.
- Repeated identical inputs are deterministic in next-state math, while score
  updates and decay remain cumulative.
