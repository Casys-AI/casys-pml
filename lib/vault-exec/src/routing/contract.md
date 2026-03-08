# routing contract

## Inputs

- Candidate targets + confidence + runtime payload.
- Graph substructure and target identifier index.
- Runtime payload mode (`strict` | `project`).

## Outputs

- Candidate compatibility verdicts with explicit missing/extra/invalid keys.
- Deterministic candidate ids and aliases.
- Candidate projection metadata (`payloadProjected`, `payloadDroppedKeys`) when
  payload policy mutates inputs.
- Deterministic payload preparation result:
  - `strict`: payload unchanged, validation errors preserved.
  - `project`: unknown top-level keys dropped and reported explicitly.

## Invariants

- Ambiguity falls back conservatively.
- Payload compatibility is computed before selection.
- Payload projection never hides missing/invalid field errors.
- No hidden LLM-only resolver path.
