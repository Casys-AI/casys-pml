# service contract

## Inputs

- Vault path + watch/sync lifecycle commands.
- Unix socket JSONL requests with `{ id, method }` and non-empty `id`.

## Outputs

- Service state transitions and sync execution lifecycle.
- Stable daemon metadata keyed by vault identity.
- `status` => `ServiceStatus`
- `sync` => `SyncResponse` including trace import counts/warnings plus explicit
  zeroed legacy-training fields in the DB-first phase
- `stop` => `{ stopped: true }`
- Error envelopes shaped as `{ id, ok: false, error }`

## Invariants

- Lifecycle cleanup is deterministic.
- Stale artifacts are removed safely.
- Service module owns IPC protocol boundaries.
- Unknown or invalid request frames return `id: "unknown"`.
- `watchStatus()` returns a deterministic offline status when the socket is
  unavailable.
- `syncInProgress` is always reset even if sync worker throws.
- Malformed daemon responses are treated as runtime errors by the client.
