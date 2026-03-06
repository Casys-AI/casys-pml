# routing contract

## Inputs

- Candidate targets + confidence + runtime payload.
- Graph substructure and target identifier index.

## Outputs

- Candidate compatibility verdicts with explicit missing/extra/invalid keys.
- Deterministic candidate ids and aliases.

## Invariants

- Ambiguity falls back conservatively.
- Payload compatibility is computed before selection.
- No hidden LLM-only resolver path.
