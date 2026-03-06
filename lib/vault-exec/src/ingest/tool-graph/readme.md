# ingest/tool-graph

Stable tool-graph derivation and Markdown projection for imported OpenClaw
traces.

## Responsibilities

- map typed imported tool-call rows to stable dotted node keys
- aggregate node-level counts, sequential transitions, and occurrence metadata
- render deterministic Markdown notes under `tools/` using hierarchical paths
  such as `tools/exec/exec.md` and `tools/exec/git_vcs/git_vcs.md`

## Boundaries

- no JSONL parsing
- no source scanning/state tracking
- no raw KV persistence logic
- no GRU trace insertion or model training behavior

## Notes

- one note per stable tool node
- no note per agent
- no note per session
- projection is a readable graph view, not the source of truth
- folder hierarchy carries taxonomy; note links should emphasize execution
  transitions
