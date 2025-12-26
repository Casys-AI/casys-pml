# SWC Static Structure Detection

> Technical specification for code analysis via SWC in `StaticStructureBuilder`

## Overview

The `StaticStructureBuilder` uses SWC (Rust-based TypeScript parser) to analyze code statically and extract control flow, MCP tool calls, and parallel execution patterns.

**File:** `src/capabilities/static-structure-builder.ts`

## Detected Patterns

### MCP Tool Calls

| Pattern | Status | Notes |
|---------|--------|-------|
| `await mcp.server.tool({ args })` | ✅ Detected | Creates `task` node |
| `mcp.server.tool({ args })` (no await) | ✅ Detected | Same handling |
| `await capabilities.name()` | ✅ Detected | Creates `capability` node |

### Control Flow - Branches

| Pattern | Status | Node Type | Notes |
|---------|--------|-----------|-------|
| `if (cond) { } else { }` | ✅ Detected | `decision` | Both branches tracked with `outcome: "true"/"false"` |
| `if (cond) { }` (no else) | ✅ Detected | `decision` | Only true branch |
| `switch (x) { case: }` | ✅ Detected | `decision` | Each case tracked with `outcome: "case:value"` |
| `cond ? a : b` (ternary) | ✅ Detected | `decision` | Both branches tracked |

### Parallel Execution

| Pattern | Status | Notes |
|---------|--------|-------|
| `Promise.all([mcp.a(), mcp.b()])` | ✅ Detected | Creates `fork` → N tasks → `join` |
| `Promise.allSettled([...])` | ✅ Detected | Same as Promise.all |
| `[...].map(x => mcp.tool())` inline | ✅ Detected | Unrolls to N parallel tasks |
| `arr.map(x => mcp.tool())` (variable) | ✅ Detected | Creates 1 task as template |

### Array Operations (Phase 1 - Planned)

> **Tech-Spec:** See [index.md](./index.md) for full implementation details.

| Pattern | Status | Tool ID | Notes |
|---------|--------|---------|-------|
| `arr.filter(x => ...)` | 🔜 Planned | `code:filter` | Pure operation, HIL bypass |
| `arr.map(x => ...)` | 🔜 Planned | `code:map` | Pure operation, HIL bypass |
| `arr.reduce((a,b) => ...)` | 🔜 Planned | `code:reduce` | Pure operation, HIL bypass |
| `arr.flatMap(x => ...)` | 🔜 Planned | `code:flatMap` | Pure operation |
| `arr.find(x => ...)` | 🔜 Planned | `code:find` | Pure operation |
| `arr.some(x => ...)` | 🔜 Planned | `code:some` | Pure operation |
| `arr.every(x => ...)` | 🔜 Planned | `code:every` | Pure operation |
| `arr.sort(...)` | 🔜 Planned | `code:sort` | Pure operation |
| `arr.slice(...)` | 🔜 Planned | `code:slice` | Pure operation |

**Implementation approach:**
1. Detect array method via `MemberExpression` in `handleCallExpression()`
2. Extract original code via SWC span: `originalCode.substring(span.start, span.end)`
3. Create task with `tool: "code:<method>"`, `type: "code_execution"`
4. Mark as pure operation → `isSafeToFail()` returns `true`, HIL bypassed

**SHGAT Learning:**
- Traces operation names only: `executedPath = ["code:filter", "code:map"]`
- Does NOT trace callback content or variable values

### Arguments Extraction

| Pattern | Status | Notes |
|---------|--------|-------|
| Literal values: `{ path: "file.txt" }` | ✅ Extracted | `type: "literal"` |
| Nested objects: `{ config: { a: 1 } }` | ✅ Extracted | Recursive extraction |
| Arrays: `{ items: [1, 2, 3] }` | ✅ Extracted | `type: "literal"` |
| Variable reference: `{ path: filePath }` | ✅ Extracted | `type: "reference"` |
| Parameter: `{ path: args.path }` | ✅ Extracted | `type: "parameter"` |
| Previous output: `{ content: file.content }` | ✅ Extracted | `type: "reference"` with node ID substitution |
| Template literal: `` `${x}` `` | ✅ Extracted | `type: "reference"` |

## Not Detected (TODO)

### Loops

| Pattern | Status | Workaround |
|---------|--------|------------|
| `for (const x of arr) { mcp.tool() }` | ❌ Not detected | Use `Promise.all(arr.map(...))` |
| `for (let i = 0; i < n; i++) { }` | ❌ Not detected | Use `Promise.all(arr.map(...))` |
| `while (cond) { }` | ❌ Not detected | N/A - dynamic iteration count |
| `arr.forEach(x => mcp.tool())` | ❌ Not detected | Use `Promise.all(arr.map(...))` |

**Why:** Loops have dynamic iteration counts that can't be determined statically. The number of iterations depends on runtime values.

### Map Parameter Resolution

| Pattern | Status | Notes |
|---------|--------|-------|
| `["a","b"].map(p => mcp.tool({path: p}))` | ⚠️ Partial | Detects 2 tasks, but `p` is undefined at runtime |

**Why:** SWC detects the structure correctly, but the DAG executor doesn't substitute arrow function parameters with array element values.

**Future improvement:** Track arrow function parameter name and substitute with corresponding array element for each unrolled task.

### Dynamic Patterns

| Pattern | Status | Notes |
|---------|--------|-------|
| `await obj[methodName]()` | ❌ Not detected | Dynamic method call |
| `await fn()` where fn is variable | ❌ Not detected | Can't resolve function reference |
| `eval()` / `new Function()` | ❌ Never | Security risk |

## Node Types

```typescript
type StaticStructureNode =
  | { type: "task"; tool: string; arguments?: ArgumentsStructure }
  | { type: "decision"; condition: string }
  | { type: "capability"; capabilityId: string }
  | { type: "fork" }
  | { type: "join" };
```

## Edge Types

```typescript
type StaticStructureEdge = {
  from: string;
  to: string;
  type: "sequence" | "conditional" | "provides";
  outcome?: string;      // For conditional: "true", "false", "case:value"
  coverage?: "strict" | "partial" | "optional"; // For provides
};
```

## Example Output

```typescript
// Input code:
const file = await mcp.filesystem.read_file({ path: "config.json" });
if (file.exists) {
  await mcp.memory.create_entities({ entities: [] });
}

// Output structure:
{
  nodes: [
    { id: "n1", type: "task", tool: "filesystem:read_file", arguments: { path: { type: "literal", value: "config.json" } } },
    { id: "d1", type: "decision", condition: "file.exists" },
    { id: "n2", type: "task", tool: "memory:create_entities", arguments: { entities: { type: "literal", value: [] } } }
  ],
  edges: [
    { from: "n1", to: "d1", type: "sequence" },
    { from: "d1", to: "n2", type: "conditional", outcome: "true" }
  ]
}
```

## Dashboard Modes

| Mode | Description | Source |
|------|-------------|--------|
| **Definition** | Static structure from SWC | `static_structure` column |
| **Invocation** | Actual calls at runtime | `execution_trace` table |

- **Definition:** Shows what SWC detected (1 tool for a loop body)
- **Invocation:** Shows what actually ran (N calls if loop executed N times)

## Related Files

- `src/capabilities/static-structure-builder.ts` - Main parser
- `src/capabilities/types.ts` - Type definitions
- `src/capabilities/schema-inferrer.ts` - Schema inference (related SWC usage)
- `src/capabilities/permission-inferrer.ts` - Permission inference

## Changelog

- **2025-12-26:** Added Array Operations (Phase 1 - Planned) section with `code:*` pseudo-tools
- **2025-12-22:** Added `Promise.all(arr.map(fn))` detection with literal array unrolling
