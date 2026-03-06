# ingest/tool-graph

Stable tool-graph derivation and Markdown projection for imported OpenClaw
traces.

## Responsibilities

- map typed imported tool-call rows to stable dotted node keys
- aggregate node-level counts, parent/child relations, and occurrence metadata
- render deterministic Markdown notes under `tool-graph/l1/` and
  `tool-graph/l2/`

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
