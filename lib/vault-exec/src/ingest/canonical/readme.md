# canonical

Strict allowlist canonicalization for shareable AX trace rows.

## Responsibilities

- Convert parsed OpenClaw sessions into bounded canonical rows
- Drop all raw text, args, tool results, and nested payloads
- Produce deterministic fingerprints for deduplication

## Boundaries

- No replay/private storage
- No Markdown projection
- No heuristic PII redaction passes in V1
