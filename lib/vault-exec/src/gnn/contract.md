# gnn contract

## Inputs

- Node embeddings + DAG neighborhood structure.
- GNN params/config from runtime store.

## Outputs

- Deterministic enriched embeddings for identical inputs/params.
- Serializable params for persistence.

## Canonical Entities

- `GNNNode`
- `LevelParams`
- `GNNParams`
- `GNNConfig`

## Invariants

- `gnnForward(nodes, params, config)` returns one embedding per input node name.
- Each output vector length equals `config.embDim`.
- When `maxLevel=0`, output equals input embeddings.
- Layer boundaries are enforced by architecture tests.
- BLAS acceleration is optional; JS fallback remains valid.
- Persisted params are used only when deserialization succeeds and config is
  compatible.
- No direct dependency on CLI/service modules.
