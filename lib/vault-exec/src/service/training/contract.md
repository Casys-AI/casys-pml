# training contract

## Inputs

- vault path
- `vault.kv` path
- active `training_data` build
- imported OpenClaw tool-call rows
- optional persisted warm-start blobs

## Outputs

- deterministic service-owned training paths under `.vault-exec/live-training`
- `requested-build.json`
- `lock.json` (lease + heartbeat fields for stale-lock recovery)
- `status.json` (orchestrator lifecycle/progress)
- `worker-status.json` (node worker phase/epoch observability)
- GRU snapshot directories containing:
  - `manifest.json`
  - leaf embeddings produced by the existing GNN path
  - raw warm-start blob sidecars when present
- result directories containing:
  - `manifest.json`
  - `metrics.json`
  - raw model blob sidecars

## Invariants

- orchestration code must not reimplement GNN or GRU math
- state paths must be derived deterministically from the vault path
- lock acquisition must be exclusive until explicit release
- stale lock reclamation must use lease expiration + heartbeat, not PID-only
- GRU snapshot preparation must fail if there is no active DB-first build
- service-owned file artifacts must not add an extra gzip/base64 layer around
  raw model blobs
