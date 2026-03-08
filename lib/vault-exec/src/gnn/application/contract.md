# gnn/application contract

## Inputs

- Graph embeddings, topology metadata, and GNN parameter sets.
- Training traces/examples from upstream slices.

## Outputs

- Forward-pass embeddings and training update metrics.
- Deterministic serialized parameter artifacts.

## Invariants

- Forward/training entrypoints remain deterministic for fixed inputs.
- Application layer does not encode low-level math kernels directly.
- Domain failures surface as explicit errors, not silent fallbacks.
