# routing

Intent candidate evaluation and runtime input compatibility checks.

## Responsibilities

- Build deterministic target identifiers.
- Evaluate candidate compatibility against runtime input schema.
- Format candidate lines for human presentation.

## Boundaries

- Keep fallback semantics explicit and conservative.
- No direct model training logic.
- Legacy LLM-only resolver path is removed.
