# gnn/application/phases contract

## Inputs

- Node/edge embedding tensors and adjacency metadata.
- Phase parameters supplied by application orchestration.

## Outputs

- Phase-specific transformed embeddings with stable ordering.

## Invariants

- For identical inputs/params, output vectors are identical.
- Phase transforms are pure and side-effect free.
- No cross-layer imports from infrastructure/CLI/service.
