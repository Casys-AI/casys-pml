# service contract

## Inputs

- Vault path + watch/sync lifecycle commands.

## Outputs

- Service state transitions and sync execution lifecycle.
- Stable daemon metadata keyed by vault identity.

## Invariants

- Lifecycle cleanup is deterministic.
- Stale artifacts are removed safely.
- Service module owns IPC protocol boundaries.
