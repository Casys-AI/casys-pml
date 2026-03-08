# routing

Intent candidate evaluation and runtime input compatibility checks.

## Responsibilities

- Build deterministic target identifiers.
- Evaluate candidate compatibility against runtime input schema.
- Apply explicit runtime payload policy (`strict`/`project`).
- Surface candidate projection metadata when payload projection occurs.
- Format candidate lines for human presentation.

## Boundaries

- Keep fallback semantics explicit and conservative.
- Keep payload projection deterministic and machine-observable.
- No direct model training logic.
- Legacy LLM-only resolver path is removed.
