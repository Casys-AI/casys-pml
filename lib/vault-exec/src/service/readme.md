# service

Long-running daemon/watch lifecycle around vault sync operations.

## Responsibilities

- Manage daemon lifecycle and health metadata.
- Run sync workers and IPC protocol.
- Keep state transitions deterministic for the same vault hash.

## Boundaries

- No core DAG execution logic.
- No model internals.
- Keep transport/protocol concerns local to this module.
