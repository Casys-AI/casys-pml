# Spike: SHGAT All Tools vs Capability-Referenced Tools

**Date:** 2026-01-14
**Status:** Investigation

## Context

Discovered a discrepancy between the full knowledge graph and SHGAT initialization:

| Graph | Nodes | Source |
|-------|-------|--------|
| Full graph (db-sync) | 762 | `tool_embedding` table (all tools) |
| SHGAT/DR-DSP | 187 | Only tools referenced by capabilities |

### Current Behavior

SHGAT only registers tools that are explicitly referenced in `capability.toolsUsed`:

```typescript
// createSHGATFromCapabilities extracts tools from capabilities
const allTools = new Set<string>();
for (const cap of capabilities) {
  for (const toolId of cap.toolsUsed) {
    allTools.add(toolId);
  }
}
```

This means:
- 65 tools registered in SHGAT (from 122 capabilities)
- ~700 tools in `tool_embedding` NOT in SHGAT

### Questions

1. **Is this intentional?** Or an oversight during SHGAT implementation?
2. **Cold-start impact:** New capabilities using tools not in SHGAT have no learned embeddings
3. **Performance tradeoff:** 65 vs 700+ nodes affects training time significantly

## Hypothesis

Adding all tools to SHGAT could:
- **Improve** cold-start for new capabilities using existing tools
- **Enable** message passing to propagate features to unused tools
- **Hurt** training time (10x more nodes)
- **Add noise** if most tools have no training signal

## Benchmark Plan

Compare two configurations:
1. **Current:** Only capability-referenced tools (65 tools)
2. **All tools:** All tools from `tool_embedding` (700+ tools)

Metrics:
- Training time per epoch
- Test accuracy after N epochs
- Memory usage

## Files to Investigate

- `src/graphrag/algorithms/shgat.ts` - `createSHGATFromCapabilities()`
- `lib/shgat/src/core/factory.ts` - Same function in lib
- `src/graphrag/sync/db-sync.ts` - Full graph loading
- `src/infrastructure/patterns/factory/algorithm-factory.ts` - SHGAT initialization

## Decision (TBD)

After benchmark results, decide:
- [ ] Keep current behavior (document as intentional)
- [ ] Add all tools to SHGAT
- [ ] Add option to configure behavior
- [ ] Lazy-load tools on first use

## Related

- ADR-026: Cold-start confidence formula
- ADR-055: SHGAT preserveDim 1024 dimension
