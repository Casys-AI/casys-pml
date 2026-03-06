# cli-runtime

Machine-first CLI output primitives.

## Responsibilities

- Emit deterministic JSONL events (`output.ts`).
- Emit deterministic JSONL errors (`output.ts`).
- Keep CLI exit code meanings explicit (`exit-codes.ts`).

## Boundaries

- Pure serialization + constants only.
- No vault parsing, graph execution, DB, or model logic.
