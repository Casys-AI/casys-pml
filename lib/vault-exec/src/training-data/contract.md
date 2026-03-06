# training-data contract

## Inputs

- `ImportedOpenClawSessionRow[]`
- `ImportedOpenClawToolCallRow[]`

## Outputs

- `tool_leaf_nodes`
- `tool_leaf_edges_next`
- `session_sequences`
- `active_build`
- GNN node inputs derived from leaf rows and edges
- GRU vocabulary/examples derived from imported tool calls and GNN embeddings

## Invariants

- canonical leaf mapping must come only from the explicit ingest naming rules
- category nodes must not appear in rebuilt training sequences unless they are
  also the deepest available tool key for that call
- subagent and top-level counts must remain distinguishable in derived rows
- active readers must resolve rows only from the currently promoted build
- failed rebuilds must not replace the previous active build
- notebook-driven training must reuse `src/gnn` and `src/gru`, not shadow them
