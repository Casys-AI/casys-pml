# ingest contract

## Canonical entities

- `ParsedOpenClawSession`
- `ParsedTurn`
- `ParsedToolCall`
- `ToolPolicyDecision`
- `L2CoverageReport`

(see `types.ts` and `policy.ts`)

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

## Safety

- Unknown tools must fallback cleanly (`unsupported_tool`) instead of forced classification.
