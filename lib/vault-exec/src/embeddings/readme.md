# embeddings

Text embedding model integration and vault indexing pipeline.

## Responsibilities

- Load/embed note text through an `Embedder` contract.
- Compute deterministic content hashes and hierarchy levels.
- Re-index notes while skipping unchanged bodies.

## Boundaries

- No routing-policy decisions.
- No trace/projection logic.
- Store I/O only through `IVaultStore`.
