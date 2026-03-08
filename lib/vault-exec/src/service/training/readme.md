# training

Purpose: async training orchestration under the watch/service lifecycle.

Responsibilities:

- resolve file-backed training state under `.vault-exec/live-training`
- manage requested-build and lock state files (lease + heartbeat recovery)
- publish orchestration + worker observability status files
- prepare deterministic GRU snapshots from the active DB-first build
- run the service-owned training orchestrator loop
- read result artifacts produced by background workers

Does not own:

- GNN or GRU math
- OpenClaw import or rebuild logic
- Markdown projection

This slice exists to let `init` / `sync` / daemon-style workflows trigger
background training without adding new model implementations.

## Runtime knobs

- `VAULT_EXEC_NODE_MAX_OLD_SPACE_MB` (optional): Node heap size used for the GRU
  worker process. Defaults to `8192`.
