# infrastructure

External adapter implementations.

## Responsibilities

- Vault filesystem adapters.
- LLM provider clients.

## Boundaries

- Adapters implement contracts from `core`.
- Keep business logic and policies in feature slices.
