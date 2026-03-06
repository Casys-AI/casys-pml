# training-data

Purpose: rebuild DB-first training tables from canonical imported OpenClaw rows.

## Responsibilities

- derive leaf-only node rows from imported tool calls
- derive `next` transition edges between leaf nodes
- derive one leaf sequence per imported session
- publish rebuilt tables under a versioned KV build namespace
- expose read helpers that always follow the active build

## Non-responsibilities

- no Markdown projection logic
- no ingest parsing or classification
- no notebook orchestration
- no runtime GNN/GRU training in V1

## Inputs / outputs

Inputs:
- imported canonical session rows from `vault.openclaw.sessions`
- imported canonical tool-call rows from `vault.openclaw.tool_calls`

Outputs:
- active leaf node rows
- active leaf transition rows
- active session sequence rows
- active build pointer for DB-first notebook consumers

## Invariants for this slice

- only the deepest available tool key participates in sequences and `next`
  edges
- rebuild is full, not delta-based
- rebuild must publish a new active build only after the new tables are fully
  written
- previous active derived tables must remain readable if rebuild fails
