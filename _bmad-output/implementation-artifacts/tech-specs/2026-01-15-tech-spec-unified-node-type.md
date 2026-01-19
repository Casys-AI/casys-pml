---
title: 'Unified Node Type for lib/shgat'
slug: 'unified-node-type'
created: '2026-01-15'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Deno', 'OpenBLAS FFI']
files_to_modify:
  - 'lib/shgat/src/core/types.ts'
  - 'lib/shgat/src/core/shgat.ts'
  - 'lib/shgat/src/core/factory.ts'
  - 'lib/shgat/src/graph/graph-builder.ts'
  - 'lib/shgat/src/graph/hierarchy.ts'
  - 'lib/shgat/src/graph/incidence.ts'
  - 'lib/shgat/src/attention/khead-scorer.ts'
  - 'lib/shgat/src/attention/multi-level-scorer.ts'
  - 'lib/shgat/src/attention/v1-scorer.ts'
  - 'lib/shgat/src/core/forward-helpers.ts'
  - 'lib/shgat/src/core/scoring-helpers.ts'
  - 'lib/shgat/src/core/hierarchy-builder.ts'
  - 'lib/shgat/src/training/shgat-trainer.ts'
  - 'lib/shgat/src/training/v1-trainer.ts'
  - 'lib/shgat/mod.ts'
  - 'lib/shgat/tests/shgat_test.ts'
code_patterns:
  - 'Map<string, Node> for node storage'
  - 'GraphBuilder class delegates node management'
  - 'Message passing works with embedding matrices not node types'
  - 'Level computed via DFS with memoization in hierarchy.ts'
test_patterns:
  - 'Deno.test() with @std/assert'
  - 'createTestCapabilities() fixture pattern'
---

# Tech-Spec: Unified Node Type for lib/shgat

**Created:** 2026-01-15

## Overview

### Problem Statement

`lib/shgat` currently has a forced separation between `ToolNode` (leaves) and `CapabilityNode` (composites) with a complex `Member` type that distinguishes `{type: "tool", id}` vs `{type: "capability", id}`. This artificial distinction:

1. Complicates the API with two node types and typed members
2. Limits hierarchy to a conceptual "tools vs capabilities" model
3. Makes the lib domain-specific (MCP tools) instead of generic
4. Adds complexity with separate `ToolGraphFeatures` and `HypergraphFeatures`

### Solution

Replace `ToolNode`, `CapabilityNode`, and `Member` with a single unified `Node` type:

```typescript
interface Node {
  id: string;
  embedding: number[];
  children: string[];  // [] = leaf (level 0), otherwise composite
  level: number;       // stored, computed once at graph construction
}
```

The hierarchy level becomes implicit from structure:
- `children.length === 0` → leaf node (level 0)
- `children.length > 0` → composite (level = 1 + max child level)

Message passing treats all nodes uniformly by level, enabling infinite recursion depth.

### Scope

**In Scope:**
- New unified `Node` interface replacing `ToolNode`/`CapabilityNode`
- `children: string[]` replacing `Member[]` typed array
- `level: number` stored on node, computed at construction
- `buildGraph(nodes: Node[])` function to compute levels
- Unified API: `createSHGAT(nodes: Node[])`
- Update all message-passing code for level-based traversal
- Update scoring functions for unified nodes
- Update tests

**Out of Scope:**
- Changes to `src/graphrag/algorithms/shgat/` (only `lib/shgat`)
- Features (`ToolGraphFeatures`, `HypergraphFeatures`) - removed entirely
- Backward compatibility with old types (breaking change)
- `successRate` and other domain-specific fields

## Context for Development

### Codebase Patterns

**Node Storage:**
- `GraphBuilder` uses `Map<string, ToolNode>` and `Map<string, CapabilityNode>` separately
- Will become single `Map<string, Node>`

**Message Passing:**
- `MultiLevelOrchestrator` coordinates V→E→V phases
- Already works with embedding matrices `number[][]`, not node types
- Level-based iteration via `hierarchyLevels: Map<number, Set<string>>`

**Hierarchy Computation:**
- `computeHierarchyLevels()` in `hierarchy.ts` uses DFS with memoization
- Uses `getDirectCapabilities()` helper to filter by type - this becomes just reading `children`

**Registration Pattern:**
```typescript
// Current
shgat.registerTool(node: ToolNode)
shgat.registerCapability(node: CapabilityNode)

// New
shgat.registerNode(node: Node)
```

### Files to Reference

| File | Purpose | Changes Needed |
| ---- | ------- | -------------- |
| `src/core/types.ts` | Type definitions | Replace `ToolNode`, `CapabilityNode`, `Member` with `Node` |
| `src/graph/graph-builder.ts` | Node storage/management | Merge `toolNodes`/`capabilityNodes` → `nodes` |
| `src/graph/hierarchy.ts` | Level computation | Simplify - just read `children` array |
| `src/core/shgat.ts` | Main SHGAT class | `registerNode()`, remove `registerTool`/`registerCapability` |
| `src/core/factory.ts` | Factory functions | `createSHGAT(nodes[])` |
| `src/attention/khead-scorer.ts` | K-head scoring | Update to use unified `Node` |
| `tests/shgat_test.ts` | Tests | Update fixtures and assertions |

### Technical Decisions

1. **No backward compatibility** - Clean break, simpler API
2. **Level stored, not computed on access** - Compute once at `buildGraph()`
3. **No features** - K-head attention learns from embeddings directly
4. **children as `string[]`** - Simple ID references, no type distinction
5. **Level 0 = leaf** - Convention: nodes without children are leaves

## Implementation Plan

### Tasks

#### Phase 1: Core Types (Foundation)

- [ ] **Task 1: Define new Node interface**
  - File: `lib/shgat/src/core/types.ts`
  - Action: Add unified `Node` interface at top of file
  ```typescript
  export interface Node {
    id: string;
    embedding: number[];
    children: string[];
    level: number;
  }
  ```
  - Notes: Keep old types temporarily until all references updated

- [ ] **Task 2: Add buildGraph function**
  - File: `lib/shgat/src/core/types.ts`
  - Action: Add function to compute levels for all nodes
  ```typescript
  export function buildGraph(nodes: Node[]): Map<string, Node> {
    const graph = new Map(nodes.map(n => [n.id, { ...n, level: 0 }]));
    computeAllLevels(graph);
    return graph;
  }

  export function computeAllLevels(nodes: Map<string, Node>): void {
    const cache = new Map<string, number>();
    for (const id of nodes.keys()) {
      computeLevel(id, nodes, cache);
    }
  }

  function computeLevel(id: string, nodes: Map<string, Node>, cache: Map<string, number>): number {
    if (cache.has(id)) return cache.get(id)!;
    const node = nodes.get(id);
    if (!node || node.children.length === 0) {
      cache.set(id, 0);
      node && (node.level = 0);
      return 0;
    }
    const maxChildLevel = Math.max(...node.children.map(c => computeLevel(c, nodes, cache)));
    const level = 1 + maxChildLevel;
    cache.set(id, level);
    node.level = level;
    return level;
  }
  ```

- [ ] **Task 3: Remove old type definitions**
  - File: `lib/shgat/src/core/types.ts`
  - Action: Delete the following:
    - `interface ToolNode`
    - `interface CapabilityNode`
    - `type Member`
    - `type ToolMember`
    - `type CapabilityMember`
    - `interface ToolGraphFeatures`
    - `interface HypergraphFeatures`
    - `DEFAULT_TOOL_GRAPH_FEATURES`
    - `DEFAULT_HYPERGRAPH_FEATURES`
    - `getDirectTools()`
    - `getDirectCapabilities()`
    - `createMembersFromLegacy()`
    - `migrateCapabilityNode()`
    - `interface LegacyCapabilityNode`

#### Phase 2: Graph Builder

- [ ] **Task 4: Refactor GraphBuilder to use unified Node**
  - File: `lib/shgat/src/graph/graph-builder.ts`
  - Action:
    - Replace `toolNodes: Map<string, ToolNode>` and `capabilityNodes: Map<string, CapabilityNode>` with single `nodes: Map<string, Node>`
    - Replace `registerTool()` and `registerCapability()` with `registerNode(node: Node)`
    - Replace `getToolNodes()` and `getCapabilityNodes()` with `getNodes()`
    - Replace `getToolNode()` and `getCapabilityNode()` with `getNode(id: string)`
    - Add `getNodesByLevel(level: number): Node[]` helper
    - Update `rebuildIndices()` to work with unified nodes
    - Remove `collectTransitiveTools()` - replace with `getDescendants(id: string): string[]`
  - Notes: Incidence matrix now built from `node.children` relationships

- [ ] **Task 5: Simplify hierarchy computation**
  - File: `lib/shgat/src/graph/hierarchy.ts`
  - Action:
    - Update `computeHierarchyLevels()` to work with `Node` instead of `CapabilityNode`
    - Remove dependency on `getDirectCapabilities()` - just read `node.children`
    - Update return type `HierarchyResult` to use `Map<string, Node>`
  - Notes: Logic stays same, just simpler type access

- [ ] **Task 6: Update incidence module**
  - File: `lib/shgat/src/graph/incidence.ts`
  - Action: Update `buildMultiLevelIncidence()` to work with unified `Node`
  - Notes: Level 0 nodes = leaves (rows), Level 1+ nodes = composites (columns)

#### Phase 3: Main SHGAT Class

- [ ] **Task 7: Update SHGAT class API**
  - File: `lib/shgat/src/core/shgat.ts`
  - Action:
    - Replace `registerTool()` and `registerCapability()` with `registerNode(node: Node)`
    - Update `graphBuilder` calls to use new API
    - Remove `addCapabilityLegacy()` method
    - Update all internal references from `ToolNode`/`CapabilityNode` to `Node`
    - Update re-exports to export `Node` instead of old types
  - Notes: This is the main public API change

- [ ] **Task 8: Update factory functions**
  - File: `lib/shgat/src/core/factory.ts`
  - Action:
    - Replace `createSHGATFromCapabilities()` with `createSHGAT(nodes: Node[])`
    - Remove tool/capability separation logic
    - Use `buildGraph()` to compute levels
  - Notes: Simpler API - just pass nodes array

#### Phase 4: Message Passing & Scoring

- [ ] **Task 9: Update forward helpers**
  - File: `lib/shgat/src/core/forward-helpers.ts`
  - Action: Update type references from `CapabilityNode` to `Node`

- [ ] **Task 10: Update scoring helpers**
  - File: `lib/shgat/src/core/scoring-helpers.ts`
  - Action: Update type references, remove `successRate` usage

- [ ] **Task 11: Update hierarchy builder**
  - File: `lib/shgat/src/core/hierarchy-builder.ts`
  - Action: Update to work with unified `Node`

- [ ] **Task 12: Update K-head scorer**
  - File: `lib/shgat/src/attention/khead-scorer.ts`
  - Action:
    - Update `scoreAllCapabilities()` signature to accept `Map<string, Node>`
    - Remove `successRate` reliability multiplier
    - Update return type if needed

- [ ] **Task 13: Update multi-level scorer**
  - File: `lib/shgat/src/attention/multi-level-scorer.ts`
  - Action: Update type references

- [ ] **Task 14: Update v1 scorer**
  - File: `lib/shgat/src/attention/v1-scorer.ts`
  - Action: Update type references

#### Phase 5: Training

- [ ] **Task 15: Update SHGAT trainer**
  - File: `lib/shgat/src/training/shgat-trainer.ts`
  - Action: Update type references

- [ ] **Task 16: Update v1 trainer**
  - File: `lib/shgat/src/training/v1-trainer.ts`
  - Action: Update type references

#### Phase 6: Exports & Tests

- [ ] **Task 17: Update module exports**
  - File: `lib/shgat/mod.ts`
  - Action:
    - Export `Node` interface
    - Export `buildGraph()`, `computeAllLevels()`
    - Remove exports for deleted types
    - Update `createSHGAT` export

- [ ] **Task 18: Update tests**
  - File: `lib/shgat/tests/shgat_test.ts`
  - Action:
    - Replace `createTestCapabilities()` with `createTestNodes()`
    - Update test assertions for new API
    - Add tests for level computation
  ```typescript
  function createTestNodes(count: number = 5): Node[] {
    const leaves = Array.from({ length: count }, (_, i) => ({
      id: `leaf-${i}`,
      embedding: Array.from({ length: 1024 }, () => Math.random() * 0.1),
      children: [],
      level: 0,
    }));
    const composite = {
      id: 'composite-1',
      embedding: Array.from({ length: 1024 }, () => Math.random() * 0.1),
      children: leaves.slice(0, 2).map(n => n.id),
      level: 0, // Will be computed
    };
    return [...leaves, composite];
  }
  ```

- [ ] **Task 19: Verify compilation**
  - Action: Run `deno check lib/shgat/mod.ts`
  - Notes: Fix any remaining type errors

- [ ] **Task 20: Run tests**
  - Action: Run `deno test lib/shgat/tests/`
  - Notes: Ensure all tests pass

### Acceptance Criteria

- [ ] **AC 1:** Given a set of nodes with various children relationships, when `buildGraph()` is called, then all nodes have correct `level` values computed (leaves = 0, composites = 1 + max child level)

- [ ] **AC 2:** Given nodes are registered via `registerNode()`, when `forward()` is called, then message passing executes correctly across all hierarchy levels

- [ ] **AC 3:** Given a SHGAT instance with registered nodes, when `scoreAllCapabilities()` is called with an intent embedding, then scores are returned for all non-leaf nodes sorted by relevance

- [ ] **AC 4:** Given `deno check lib/shgat/mod.ts` is run, then no type errors are reported

- [ ] **AC 5:** Given `deno test lib/shgat/tests/` is run, then all tests pass

- [ ] **AC 6:** Given the old types `ToolNode`, `CapabilityNode`, `Member` are imported, then compilation fails (breaking change verified)

- [ ] **AC 7:** Given a deep hierarchy (level 3+), when levels are computed, then each node's level equals 1 + max(children levels) recursively

## Additional Context

### Dependencies

- None - self-contained refactor within `lib/shgat`
- No external library changes needed

### Testing Strategy

**Unit Tests:**
- Test `buildGraph()` level computation with various hierarchies
- Test `computeLevel()` with cycles (should detect via cache/visited set)
- Test `GraphBuilder.registerNode()` and `getNodes()`

**Integration Tests:**
- Full forward pass with unified nodes
- Scoring with multi-level hierarchy
- Training loop with new API

**Manual Verification:**
- `deno check lib/shgat/mod.ts` - no errors
- `deno test lib/shgat/tests/` - all pass

### Notes

**High-Risk Items:**
- Incidence matrix construction - ensure leaf/composite distinction preserved via level
- Message passing phase selection - V→E for level 0→1, E→E for 1→2, etc.

**Known Limitations:**
- No backward compatibility - breaking change
- `successRate` removed - if needed, can be added to embedding or separate metadata

**Future Considerations:**
- Could add optional `metadata?: Record<string, unknown>` field for domain-specific data
- Could add `parent` field for reverse traversal (currently computed on demand)
