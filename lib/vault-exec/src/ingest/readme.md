# ingest

Purpose: transform OpenClaw session traces into typed ingest data, local vault
state, and human-readable tool-graph projections.

## Responsibilities

- Parse raw session events into typed turns/tool calls (`parser.ts`)
- Apply L2 policy classification with conservative fallback (`policy.ts`)
- Track incremental source scan state (`source-state.ts`)
- Persist imported tool-call rows into the local vault KV namespace
  (`local-store.ts`)
- Run the unified local import pipeline (`pipeline.ts`)
- Derive stable tool-graph entities from imported traces
  (`tool-graph/naming.ts`, `tool-graph/entities.ts`)
- Project tool-graph entities into Markdown notes for Obsidian
  (`tool-graph/projection.ts`)
- Keep the standalone Markdown ingest helper for sessions/tools/coverage
  (`ingest.ts`, `markdown.ts`, `coverage.ts`, `aggregate.ts`)

## Non-responsibilities

- No external runtime execution logic
- No global routing logic outside ingest policy scope
- No remote export/federation logic in V1
- No hidden heuristics outside `policy.ts` and explicit tool-graph naming rules

## Inputs / outputs

Inputs:
- OpenClaw JSONL session files
- `<vault>/.vault-exec/config.json`
- `<vault>/.vault-exec/trace-source-state.json`

Outputs:
- Local KV rows under the OpenClaw namespace inside `vault.kv`
- Tool-graph projection notes under `tool-graph/l1/` and `tool-graph/l2/`
- Standalone helper output: `sessions/`, `tools/`, `reports/l2-coverage.md`

## Invariants for this slice

- deterministic parsing and ordering
- explicit fallback reason when classification is uncertain
- policy decisions must be test-covered
- imported OpenClaw rows must not pollute GRU training traces
- removing a configured source or invalidating a previously imported file must
  prune stale OpenClaw rows from local KV state
- tool-graph keys must be stable dotted paths derived by explicit naming rules
- tool-graph projections are derived from typed/local ingest data only
- tool-graph projections must converge to the current imported row set, not
  accumulate stale notes
