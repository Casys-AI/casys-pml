# ingest/tool-graph contract

## Inputs

- `ImportedOpenClawToolCallRow[]` from local ingest persistence

## Outputs

- stable dotted node keys such as `tool.exec` and `tool.exec.git_vcs`
- deterministic aggregated tool-graph entities
- deterministic Markdown note content and file paths

## Invariants

- key derivation must be explicit and deterministic
- projection must be idempotent for the same entity set
- projection must remove stale Markdown notes that no longer exist in the
  current entity set
- folder hierarchy derives only from stable key hierarchy
- visible note links must prioritize sequential execution transitions
- visible transitions are attached only to the deepest key available for each
  imported tool call; category nodes must not emit category-level sequence links
- when L2 classification falls back, a dedicated leaf such as
  `tool.exec.fallback` is used so the parent category remains taxonomy-only
- tool-graph projection must not create session or agent note entities
