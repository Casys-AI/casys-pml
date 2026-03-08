# infrastructure/llm contract

## Inputs

- Prompt payloads and provider auth/model settings.

## Outputs

- Text completion payloads that satisfy `core/ports` expectations.
- Explicit provider/runtime errors.

## Invariants

- Adapter behavior is deterministic for identical provider responses.
- Provider-specific schema stays contained in infrastructure.
- No hidden fallback to alternate providers.
