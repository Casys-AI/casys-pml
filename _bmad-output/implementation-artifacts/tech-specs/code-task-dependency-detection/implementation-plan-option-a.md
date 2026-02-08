# Implementation Plan: Option A

## Scope: Sequence Edges + Selective Provides Edges

**Problem:** DR-DSP uses provides edges for path finding (`findShortestHyperpath`, `composeItemsViaProvides`). Without provides edges for `code:*` tasks, paths like `read_file → JSON.parse → db_insert` are broken.

**Solution:** Hybrid approach with semantic types (not primitive types):

| Operation Type | Sequence Edge | Provides Edge | Rationale |
|----------------|---------------|---------------|-----------|
| MCP tools | ✅ | ✅ (schema DB) | Full support |
| code:JSON.*, Object.* | ✅ | ✅ (semantic) | Meaningful transformations |
| code:filter/map/reduce | ✅ | ✅ (semantic) | Collection transforms |
| code:split/join | ✅ | ✅ (semantic) | String↔Array transforms |
| code:+/-/*/÷/&&/|| | ✅ | ❌ | Too generic (number→number connects everything) |

**Semantic Types** (not primitive types to avoid noise):

```typescript
const CODE_SEMANTIC_TYPES: Record<string, { input: string; output: string }> = {
  // Parsing: structured transformations
  "code:JSON.parse": { input: "json_string", output: "json_object" },
  "code:JSON.stringify": { input: "json_object", output: "json_string" },

  // Object operations
  "code:Object.keys": { input: "object", output: "string_array" },
  "code:Object.values": { input: "object", output: "value_array" },
  "code:Object.entries": { input: "object", output: "entries_array" },
  "code:Object.fromEntries": { input: "entries_array", output: "object" },

  // Array transforms (preserve array semantics)
  "code:filter": { input: "array", output: "filtered_array" },
  "code:map": { input: "array", output: "mapped_array" },
  "code:flatMap": { input: "array", output: "flattened_array" },
  "code:slice": { input: "array", output: "sliced_array" },
  "code:concat": { input: "array", output: "concatenated_array" },
  "code:sort": { input: "array", output: "sorted_array" },
  "code:reverse": { input: "array", output: "reversed_array" },

  // Array aggregation
  "code:reduce": { input: "array", output: "aggregated_value" },
  "code:find": { input: "array", output: "found_item" },
  "code:join": { input: "string_array", output: "joined_string" },

  // String ↔ Array
  "code:split": { input: "string", output: "string_array" },

  // Boolean predicates (skip - too generic)
  // "code:some", "code:every", "code:includes" → no provides edge

  // Arithmetic (skip - connects everything)
  // "code:add", "code:subtract", etc. → no provides edge
};
```

This allows DR-DSP to find paths like:
```
read_file ──provides──> JSON.parse ──provides──> filter ──sequence──> add ──sequence──> db_insert
```

The `add` has no provides edge, but sequence edges maintain continuity.

## Approach: Unified `arguments` Structure

Add `arguments` to `code:*` tasks using the same structure as MCP tools:

```typescript
// MCP tool (already works):
{
  tool: "filesystem:read_file",
  arguments: {
    path: { type: "literal", value: "config.json" }
  }
}

// code:* task (TO ADD):
{
  tool: "code:JSON.parse",
  arguments: {
    input: { type: "reference", expression: "n1" }  // references config variable
  }
}
```

## Implementation by Task Type

### 1. JSON Operations (`code:JSON.parse`, `code:JSON.stringify`)

**Location:** `static-structure-builder.ts:752-778`

```typescript
// Before:
nodes.push({
  id: nodeId,
  type: "task",
  tool: `code:JSON.${operation}`,
  code,
  // NO arguments
});

// After:
const callArgs = n.arguments as Array<Record<string, unknown>> | undefined;
const extractedArgs: ArgumentsStructure = {};
if (callArgs?.[0]) {
  extractedArgs.input = this.extractArgumentValue(callArgs[0]);
}

nodes.push({
  id: nodeId,
  type: "task",
  tool: `code:JSON.${operation}`,
  arguments: extractedArgs,  // ADD
  code,
});
```

### 2. Object Operations (`code:Object.keys`, etc.)

**Location:** `static-structure-builder.ts:694-706`

```typescript
// Extract the object argument
const callArgs = n.arguments as Array<Record<string, unknown>> | undefined;
const extractedArgs: ArgumentsStructure = {};
if (callArgs?.[0]) {
  extractedArgs.input = this.extractArgumentValue(callArgs[0]);
}
```

### 3. Array Methods (`code:filter`, `code:map`, etc.)

**Location:** `static-structure-builder.ts:539-551, 637-650`

```typescript
// Extract the callee (array being operated on)
// For: users.filter(u => u.active)
// The callee is "users" which maps to node via variableToNodeId
const extractedArgs: ArgumentsStructure = {};
const callee = n.callee as { object?: Record<string, unknown> };
if (callee?.object) {
  extractedArgs.input = this.extractArgumentValue(callee.object);
}
```

### 4. Binary Operators (`code:add`, `code:or`, etc.)

**Location:** `ast-handlers.ts:544-579`

```typescript
// Extract left and right operands
const extractedArgs: ArgumentsStructure = {};
extractedArgs.left = ctx.extractArgumentValue(n.left);
extractedArgs.right = ctx.extractArgumentValue(n.right);

ctx.nodes.push({
  tool: `code:${operation}`,
  arguments: extractedArgs,  // ADD
  code,
});
```

### 5. String Methods (`code:split`, `code:trim`, etc.)

Similar to Array Methods - extract the callee.

## HandlerContext Extension

`ast-handlers.ts` needs access to `extractArgumentValue`. Add to `HandlerContext`:

```typescript
interface HandlerContext {
  // ... existing
  extractArgumentValue(node: Record<string, unknown>): ArgumentValue;
}
```

Implement in `builder-context-adapter.ts`:

```typescript
extractArgumentValue(node: Record<string, unknown>): ArgumentValue {
  return this.builder.extractArgumentValue(node);
}
```

## Phase 2: Semantic Provides Edges

Extend `generateProvidesEdges()` to handle `code:*` tasks without DB lookup:

```typescript
// In edge-generators.ts

import { CODE_SEMANTIC_TYPES } from "./code-semantic-types.ts";

export async function generateProvidesEdges(
  nodes: InternalNode[],
  edges: StaticStructureEdge[],
  db: DbClient,
): Promise<void> {
  const taskNodes = nodes.filter((n) => n.type === "task");

  for (let i = 0; i < taskNodes.length; i++) {
    for (let j = i + 1; j < taskNodes.length; j++) {
      const provider = taskNodes[i];
      const consumer = taskNodes[j];

      // Check for code:* semantic provides
      const codeCoverage = inferCodeProvidesEdge(provider, consumer);
      if (codeCoverage) {
        edges.push({
          from: provider.id,
          to: consumer.id,
          type: "provides",
          coverage: codeCoverage,
        });
        continue;
      }

      // Existing: DB schema lookup for MCP tools
      const providerSchema = await loadToolSchema(provider.tool, db);
      const consumerSchema = await loadToolSchema(consumer.tool, db);
      // ... existing logic
    }
  }
}

function inferCodeProvidesEdge(
  provider: InternalNode,
  consumer: InternalNode,
): ProvidesCoverage | null {
  const providerType = CODE_SEMANTIC_TYPES[provider.tool]?.output;
  const consumerType = CODE_SEMANTIC_TYPES[consumer.tool]?.input;

  if (!providerType || !consumerType) return null;

  // Semantic type compatibility
  // "filtered_array" is compatible with "array" input
  // "json_object" is compatible with "object" input
  if (isSemanticMatch(providerType, consumerType)) {
    return "strict";
  }

  return null;
}

function isSemanticMatch(output: string, input: string): boolean {
  // Direct match
  if (output === input) return true;

  // Array subtypes match array
  if (input === "array" && output.endsWith("_array")) return true;

  // Object subtypes match object
  if (input === "object" && output.endsWith("_object")) return true;

  // String subtypes match string
  if (input === "string" && output.endsWith("_string")) return true;

  return false;
}
```
