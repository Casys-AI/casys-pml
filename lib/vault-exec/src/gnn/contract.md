# gnn contract

## Inputs

- Node embeddings + DAG neighborhood structure.
- GNN params/config from runtime store.

## Outputs

- Deterministic enriched embeddings for identical inputs/params.
- Serializable params for persistence.

## Invariants

- Layer boundaries enforced by architecture tests.
- BLAS acceleration is optional; JS fallback remains valid.
- No direct dependency on CLI/service modules.
