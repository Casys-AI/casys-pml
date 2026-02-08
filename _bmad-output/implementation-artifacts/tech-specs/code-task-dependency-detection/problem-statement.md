# Problem Statement

Sequential `code:*` tasks with variable assignment have no edges generated, resulting in:
- `dependsOn: []` for all code tasks
- All tasks in Layer 0
- DAG Optimizer cannot find chains to fuse
- SHGAT learning misses dependency relationships

## What Works: Chained Operations

Method chaining like `nums.filter().map().reduce()` **WORKS** because:
1. `handleCallExpression()` sets `metadata.chainedFrom` on each chained call
2. `generateChainedEdges()` creates sequence edges from this metadata

```typescript
// This works - edges are generated
const result = nums.filter(n => n > 2).map(n => n * 2).reduce((a, b) => a + b, 0);
```

**Debug output:**
```
Nodes: [n1:filter, n3:map (chainedFrom:n1), n5:reduce (chainedFrom:n3)]
Edges: [n1→n3, n3→n5] ✅
```

## What's Broken: Sequential with Variables

Operations assigned to intermediate variables have **NO edges**:

```typescript
// This is broken - no edges generated
const users = await mcp.db.query({ sql: "SELECT * FROM users" });
const active = users.filter(u => u.active);
const sum = active.reduce((s, u) => s + u.age, 0);
```

**Debug output:**
```
Nodes: [n1:db:query, n2:filter, n3:reduce, n4:add]
Edges: [] ❌
variableToNodeId: { users: "n1", active: "n2", sum: "n4" }
```

The `variableToNodeId` map correctly tracks that `users` comes from `n1`, but this info is **not used** for edge generation.

## Impact

1. **layerIndex wrong**: All tasks appear in Layer 0
2. **Fusion broken**: `findSequentialChain()` in DAG Optimizer uses `dependsOn` to find fusible chains
3. **SHGAT learning degraded**: Missing dependency edges means incomplete learning
4. **Provides edges missing**: Data flow relationships not captured
