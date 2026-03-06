# core/ports slice

Stable interfaces that isolate `core` from external providers.

## Responsibilities

- Define narrow provider contracts consumed by core workflows.
- Keep external dependencies behind explicit machine-readable interfaces.

## Boundaries

- No provider-specific implementation details.
- No imports from `workflows`, `service`, or infrastructure adapters.
