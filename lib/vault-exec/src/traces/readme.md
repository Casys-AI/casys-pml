# traces

Execution trace recording and synthetic trace generation.

## Responsibilities

- Persist runtime traces through store contracts.
- Generate deterministic structural traces from DAG topology.

## Boundaries

- No markdown projection responsibilities.
- No routing-policy selection logic.
- No DB backend implementation details.

## Notes

- Synthetic traces are generated in deterministic target order by note name.
- Synthetic paths come from topological order with dependencies before target.
- Recorder writes only explicit trace fields, without hidden heuristics.
- Trace persistence is append-only from the caller perspective.
