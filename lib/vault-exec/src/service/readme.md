# service

Long-running daemon/watch lifecycle around vault sync operations.

## Responsibilities

- Manage daemon lifecycle and health metadata.
- Run sync workers and IPC protocol.
- Keep state transitions deterministic for the same vault hash.

## Boundaries

- `client.ts`: client-side start/status/sync/stop orchestration.
- `daemon.ts`: unix socket RPC server.
- `protocol.ts`: JSONL request/response contracts and runtime guards.
- `lifecycle.ts`: pid/socket/meta lifecycle helpers.
- `sync-worker.ts`: single sync worker invoked by the daemon; imports
  configured traces, rebuilds DB-first training tables, refreshes projection,
  and returns trace import counters.
- No core DAG execution logic.
- No model internals.

## Notes

- Keep transport/protocol concerns local to this module.
- Keep request/response contracts explicit and machine-validated.
- Keep fallback behavior deterministic when the daemon is unreachable.
- Keep lifecycle helpers pure or side-effect isolated.
- `sync` is notebook-first in V1: it must not launch legacy runtime training.
