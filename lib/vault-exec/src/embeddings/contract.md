# embeddings contract

## Inputs

- Vault notes (`name`, `body`, links).
- Embedder implementation + vault store.

## Outputs

- 1024-d embeddings for indexable notes.
- Deterministic note-level content hash + topological level.

## Invariants

- Unchanged body hash skips re-embedding.
- Graph cycles in level computation fall back safely.
- Runtime consumers receive embeddings through store only.
