# Root Cause Analysis

## Edge Generation Flow

```
StaticStructureBuilder.buildStaticStructure()
    ↓
findNodes() → creates nodes with metadata
    ↓
generateAllEdges()
    ├── generateChainedEdges()     → uses metadata.chainedFrom ✅
    ├── generateSequenceEdges()    → uses nodeReferencesNode() ❌
    ├── generateProvidesEdges()    → uses DB schema lookup ❌
    └── ... other edge generators
    ↓
staticStructureToDag()
    ↓
Phase 2: edges → dependsOn
    switch (edge.type) {
      case "sequence":
      case "provides":
        addDependency(dependencies, toTaskId, fromTaskId);
    }
    ↓
DAG Optimizer
    ↓
findSequentialChain() uses task.dependsOn
```

## Why `generateSequenceEdges()` Fails for `code:*`

```typescript
// edge-generators.ts:86-103
function nodeReferencesNode(node: InternalNode, fromNodeId: string): boolean {
  if (node.type !== "task" || !node.arguments) {
    return false;  // ← code:* tasks have no arguments, exits here
  }

  for (const argValue of Object.values(node.arguments)) {
    if (argValue.type === "reference" && argValue.expression) {
      // Check if expression references the fromNodeId
      // e.g., "n1" or "n1.content" or "n1[0]"
      const expr = argValue.expression;
      if (expr === fromNodeId || expr.startsWith(`${fromNodeId}.`)) {
        return true;
      }
    }
  }
  return false;
}
```

**Problem:** `code:*` tasks don't have `arguments` field, only `code` field.

## Why `generateProvidesEdges()` Fails for `code:*`

```typescript
// edge-generators.ts:314-363
async function generateProvidesEdges(nodes, edges, db) {
  for (const node of taskNodes) {
    const schema = await loadToolSchema(node.tool, db);  // DB lookup
    // ...
  }
}
```

**Problem:** `code:*` pseudo-tools have no entries in `tool_schema` table.

## The Missing Link: `variableToNodeId`

The `StaticStructureBuilder` already tracks variable assignments:

```typescript
// static-structure-builder.ts:99
public variableToNodeId = new Map<string, string>();

// In handleVariableDeclarator():
// const users = await mcp.db.query(...) → variableToNodeId.set("users", "n1")
```

This map is **exported** in the static structure but **not used** for edge generation.
