# infrastructure contract

## Inputs

- Contract-level requests from `core`/feature slices.

## Outputs

- Concrete adapter behavior (filesystem, LLM providers).

## Invariants

- Keep side effects isolated to adapter layer.
- Adapter errors are surfaced explicitly to callers.
