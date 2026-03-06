# infrastructure/llm slice

LLM provider adapters used by compile workflows.

## Responsibilities

- Implement `core/ports` LLM contract for concrete providers.
- Keep provider-specific transport/auth concerns contained here.

## Boundaries

- No compile orchestration logic in this slice.
- Exposes deterministic request/response mapping.
