# gnn/infrastructure contract

## Inputs

- Serialized params, backend config, and storage handles.

## Outputs

- Loaded/persisted param blobs and backend runtime status signals.

## Invariants

- Backend initialization is explicit (no implicit global mutation).
- Serialization codecs are deterministic and version-aware.
- Infrastructure layer does not import application orchestrators.
