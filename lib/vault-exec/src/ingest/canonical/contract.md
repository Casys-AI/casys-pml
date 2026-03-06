# canonical contract

Inputs:

- Parsed OpenClaw sessions from `src/ingest/parser.ts`

Outputs:

- Strict allowlisted canonical trace rows safe for later sharing/export

Invariants:

- Canonical rows never contain raw args/results/user text
- Session identity is pseudonymous and deterministic
- Invalid canonicalization input is fail-fast
