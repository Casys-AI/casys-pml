# db

Operational persistence adapters and store factory.

## Responsibilities

- Open vault store instances.
- Persist notes, edges, traces, model artifacts, and virtual edges.
- Preserve deterministic read ordering where required by AX flows.

## Boundaries

- No business-policy decisions.
- No CLI formatting.
- Keep storage details isolated behind `IVaultStore`.
