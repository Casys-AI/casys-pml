# ingest contract

## Canonical entities

- `ParsedOpenClawSession`
- `ParsedTurn`
- `ParsedToolCall`
- `ImportedOpenClawToolCallRow`
- `ToolPolicyDecision`
- `L2CoverageReport`
- `ToolGraphEntity`

(see `types.ts`, `policy.ts`, `tool-graph/entities.ts`)

## Policy contract

For each tool call:

- `family` may be null when uncertain
- `hit` indicates whether L2 classification succeeded
- `fallbackReason` is required when `hit=false`

## Coverage contract

`buildL2CoverageReport()` computes:

- totalCalls
- totalHits
- totalFallbacks
- hitRate
- per-tool stats (including unsupported flag)

## Determinism

- Parser output must not depend on wall-clock time.
- Coverage/order must derive from parsed sequence and stable sorting.
- Tool-graph keys must be stable dotted paths derived from explicit tool/family
  naming rules.
- Tool-graph projection content must be deterministic for the same imported row
  set.

## Safety

- Unknown tools must fallback cleanly (`unsupported_tool`) instead of forced
  classification.
- Imported OpenClaw rows must live in a KV namespace separate from GRU training
  traces.
- Incremental re-import must remove stale local rows when a source file is
  deleted, removed from config, or no longer yields importable turns.
