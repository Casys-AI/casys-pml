# Considerations

## DAG Optimizer Fusion

With correct `dependsOn`, the DAG Optimizer's `findSequentialChain()` will find:
- `code:filter → code:map → code:reduce` chains
- Enable fusion into single `code:computation` task

## Two-Level DAG Architecture

This fix is **prerequisite** for proper two-level DAG:
- Logical DAG needs correct edges for SHGAT learning
- Physical DAG needs correct dependencies for fusion
- See: `_bmad-output/implementation-artifacts/tech-specs/modular-dag-execution/two-level-dag-architecture.md`

## DR-DSP Path Finding

DR-DSP uses provides edges for `findShortestHyperpath()` and `composeItemsViaProvides()`.
Without provides edges for code:* tasks, paths like `read_file → JSON.parse → db_insert` break.

Solution: Semantic provides edges for meaningful transformations, skip arithmetic operators.

## Semantic Types vs Primitive Types

Using semantic types (`json_object`, `filtered_array`) instead of primitives (`any`, `object`):
- Avoids connecting everything to everything
- Preserves meaningful transformation semantics
- Allows DR-DSP to find correct paths

## Backward Compatibility

- Chained operations continue to work (via `chainedFrom` metadata)
- MCP tools unchanged (already have `arguments`)
- `nodeReferencesNode()` unchanged (unified mechanism)
