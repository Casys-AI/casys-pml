# embeddings

Text embedding model integration and vault indexing pipeline.

## Responsibilities

- Load and embed note text through an `Embedder` contract.
- Compute deterministic content hashes and hierarchy levels.
- Re-index notes while skipping unchanged bodies.

## Boundaries

- No routing-policy decisions.
- No trace/projection logic.
- Store I/O only through `IVaultStore`.

## Notes

- Embedding vectors are expected to be 1024-D.
- Note and edge metadata are always upserted even when embedding is skipped.
- Cycle handling in level computation is explicit and non-throwing.
