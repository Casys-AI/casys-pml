# embeddings contract

## Inputs

- Vault notes (`name`, `body`, links).
- Embedder implementation + vault store.

## Outputs

- 1024-d embeddings for indexable notes.
- Deterministic note-level content hash + topological level.

## Canonical Entities

- `Embedder`
- `EmbeddingModel`
- `IndexStats`

## Invariants

- `EmbeddingModel.encodeNote(name, body)` encodes canonical payload
  `# ${name}\n\n${body.trim()}`.
- `indexVault(notes, db, model)` always upserts note metadata + edges.
- Unchanged body hash skips re-embedding.
- `computeLevels(notes)` ignores unknown links and handles cycles defensively.
- Graph cycles in level computation fall back safely.
- Hashing uses stable FNV-1a over trimmed body text.
- Runtime consumers receive embeddings through store only.
