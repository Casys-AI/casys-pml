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
- parent/child relationships derive only from stable key hierarchy
- tool-graph projection must not create session or agent note entities
