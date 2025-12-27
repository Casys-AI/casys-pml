# SWC Static Structure Detection

> Technical specification for code analysis via SWC in `StaticStructureBuilder`

## Overview

The `StaticStructureBuilder` uses SWC (Rust-based TypeScript parser) to analyze code statically and
extract control flow, MCP tool calls, and parallel execution patterns.

**File:** `src/capabilities/static-structure-builder.ts`

## Detected Patterns

### MCP Tool Calls

| Pattern                                | Status      | Notes                     |
| -------------------------------------- | ----------- | ------------------------- |
| `await mcp.server.tool({ args })`      | ✅ Detected | Creates `task` node       |
| `mcp.server.tool({ args })` (no await) | ✅ Detected | Same handling             |
| `await capabilities.name()`            | ✅ Detected | Creates `capability` node |

### Control Flow - Branches

| Pattern                   | Status      | Node Type  | Notes                                                |
| ------------------------- | ----------- | ---------- | ---------------------------------------------------- |
| `if (cond) { } else { }`  | ✅ Detected | `decision` | Both branches tracked with `outcome: "true"/"false"` |
| `if (cond) { }` (no else) | ✅ Detected | `decision` | Only true branch                                     |
| `switch (x) { case: }`    | ✅ Detected | `decision` | Each case tracked with `outcome: "case:value"`       |
| `cond ? a : b` (ternary)  | ✅ Detected | `decision` | Both branches tracked                                |

### Parallel Execution

| Pattern                               | Status      | Notes                             |
| ------------------------------------- | ----------- | --------------------------------- |
| `Promise.all([mcp.a(), mcp.b()])`     | ✅ Detected | Creates `fork` → N tasks → `join` |
| `Promise.allSettled([...])`           | ✅ Detected | Same as Promise.all               |
| `[...].map(x => mcp.tool())` inline   | ✅ Detected | Unrolls to N parallel tasks       |
| `arr.map(x => mcp.tool())` (variable) | ✅ Detected | Creates 1 task as template        |

### Array Operations (Phase 1 - Planned)

> **Tech-Spec:** See [index.md](./index.md) for full implementation details.

| Pattern                    | Status     | Tool ID        | Notes                      |
| -------------------------- | ---------- | -------------- | -------------------------- |
| `arr.filter(x => ...)`     | 🔜 Planned | `code:filter`  | Pure operation, HIL bypass |
| `arr.map(x => ...)`        | 🔜 Planned | `code:map`     | Pure operation, HIL bypass |
| `arr.reduce((a,b) => ...)` | 🔜 Planned | `code:reduce`  | Pure operation, HIL bypass |
| `arr.flatMap(x => ...)`    | 🔜 Planned | `code:flatMap` | Pure operation             |
| `arr.find(x => ...)`       | 🔜 Planned | `code:find`    | Pure operation             |
| `arr.some(x => ...)`       | 🔜 Planned | `code:some`    | Pure operation             |
| `arr.every(x => ...)`      | 🔜 Planned | `code:every`   | Pure operation             |
| `arr.sort(...)`            | 🔜 Planned | `code:sort`    | Pure operation             |
| `arr.slice(...)`           | 🔜 Planned | `code:slice`   | Pure operation             |

**Implementation approach:**

1. Detect array method via `MemberExpression` in `handleCallExpression()`
2. Extract original code via SWC span: `originalCode.substring(span.start, span.end)`
3. Create task with `tool: "code:<method>"`, `type: "code_execution"`
4. Mark as pure operation → `isSafeToFail()` returns `true`, HIL bypassed

**SHGAT Learning:**

- Traces operation names only: `executedPath = ["code:filter", "code:map"]`
- Does NOT trace callback content or variable values

### Arguments Extraction

| Pattern                                      | Status       | Notes                                         |
| -------------------------------------------- | ------------ | --------------------------------------------- |
| Literal values: `{ path: "file.txt" }`       | ✅ Extracted | `type: "literal"`                             |
| Nested objects: `{ config: { a: 1 } }`       | ✅ Extracted | Recursive extraction                          |
| Arrays: `{ items: [1, 2, 3] }`               | ✅ Extracted | `type: "literal"`                             |
| Variable reference: `{ path: filePath }`     | ✅ Extracted | `type: "reference"`                           |
| Parameter: `{ path: args.path }`             | ✅ Extracted | `type: "parameter"`                           |
| Previous output: `{ content: file.content }` | ✅ Extracted | `type: "reference"` with node ID substitution |
| Template literal: `` `${x}` ``               | ✅ Extracted | `type: "reference"`                           |

## Not Detected (TODO)

### Loops

| Pattern                               | Status          | Workaround                      |
| ------------------------------------- | --------------- | ------------------------------- |
| `for (const x of arr) { mcp.tool() }` | ❌ Not detected | Use `Promise.all(arr.map(...))` |
| `for (let i = 0; i < n; i++) { }`     | ❌ Not detected | Use `Promise.all(arr.map(...))` |
| `while (cond) { }`                    | ❌ Not detected | N/A - dynamic iteration count   |
| `arr.forEach(x => mcp.tool())`        | ❌ Not detected | Use `Promise.all(arr.map(...))` |

**Why:** Loops have dynamic iteration counts that can't be determined statically. The number of
iterations depends on runtime values.

### Map Parameter Resolution

| Pattern                                   | Status     | Notes                                            |
| ----------------------------------------- | ---------- | ------------------------------------------------ |
| `["a","b"].map(p => mcp.tool({path: p}))` | ⚠️ Partial | Detects 2 tasks, but `p` is undefined at runtime |

**Why:** SWC detects the structure correctly, but the DAG executor doesn't substitute arrow function
parameters with array element values.

**Future improvement:** Track arrow function parameter name and substitute with corresponding array
element for each unrolled task.

### Dynamic Patterns

| Pattern                           | Status          | Notes                            |
| --------------------------------- | --------------- | -------------------------------- |
| `await obj[methodName]()`         | ❌ Not detected | Dynamic method call              |
| `await fn()` where fn is variable | ❌ Not detected | Can't resolve function reference |
| `eval()` / `new Function()`       | ❌ Never        | Security risk                    |

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
  outcome?: string; // For conditional: "true", "false", "case:value"
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

| Mode           | Description               | Source                    |
| -------------- | ------------------------- | ------------------------- |
| **Definition** | Static structure from SWC | `static_structure` column |
| **Invocation** | Actual calls at runtime   | `execution_trace` table   |

- **Definition:** Shows what SWC detected (1 tool for a loop body)
- **Invocation:** Shows what actually ran (N calls if loop executed N times)

## Related Files

- `src/capabilities/static-structure-builder.ts` - Main parser
- `src/capabilities/types.ts` - Type definitions
- `src/capabilities/schema-inferrer.ts` - Schema inference (related SWC usage)
- `src/capabilities/permission-inferrer.ts` - Permission inference

## Modular Code Operations (Phase 1)

**Status:** ✅ IMPLEMENTED (2025-12-26)

### Overview

StaticStructureBuilder now detects JavaScript operations (array methods, string methods, etc.) and
converts them to **pseudo-tools** with `code:` prefix. These operations are traced via WorkerBridge
for SHGAT learning.

### Detected Operations

#### Array Operations

| Pattern                 | Pseudo-Tool      | Extracted Code | Notes                       |
| ----------------------- | ---------------- | -------------- | --------------------------- |
| `arr.filter(fn)`        | `code:filter`    | Via SWC span   | Original callback preserved |
| `arr.map(fn)`           | `code:map`       | Via SWC span   | Original callback preserved |
| `arr.reduce(fn, init)`  | `code:reduce`    | Via SWC span   | Includes accumulator        |
| `arr.flatMap(fn)`       | `code:flatMap`   | Via SWC span   | -                           |
| `arr.find(fn)`          | `code:find`      | Via SWC span   | -                           |
| `arr.findIndex(fn)`     | `code:findIndex` | Via SWC span   | -                           |
| `arr.some(fn)`          | `code:some`      | Via SWC span   | -                           |
| `arr.every(fn)`         | `code:every`     | Via SWC span   | -                           |
| `arr.sort(fn)`          | `code:sort`      | Via SWC span   | Optional comparator         |
| `arr.slice(start, end)` | `code:slice`     | Via SWC span   | -                           |

#### String Operations

| Pattern                             | Pseudo-Tool        | Notes |
| ----------------------------------- | ------------------ | ----- |
| `str.split(sep)`                    | `code:split`       | -     |
| `str.replace(pattern, replacement)` | `code:replace`     | -     |
| `str.trim()`                        | `code:trim`        | -     |
| `str.toLowerCase()`                 | `code:toLowerCase` | -     |
| `str.toUpperCase()`                 | `code:toUpperCase` | -     |
| `str.substring(start, end)`         | `code:substring`   | -     |

#### Object Operations

| Pattern                             | Pseudo-Tool           | Notes |
| ----------------------------------- | --------------------- | ----- |
| `Object.keys(obj)`                  | `code:Object.keys`    | -     |
| `Object.values(obj)`                | `code:Object.values`  | -     |
| `Object.entries(obj)`               | `code:Object.entries` | -     |
| `Object.assign(target, ...sources)` | `code:Object.assign`  | -     |

#### Math Operations

| Pattern               | Pseudo-Tool       | Notes |
| --------------------- | ----------------- | ----- |
| `Math.abs(x)`         | `code:Math.abs`   | -     |
| `Math.max(...values)` | `code:Math.max`   | -     |
| `Math.min(...values)` | `code:Math.min`   | -     |
| `Math.round(x)`       | `code:Math.round` | -     |

**Total:** 97 pure operations defined in `src/capabilities/pure-operations.ts`

### Code Extraction via SWC Spans

**Implementation:** `src/capabilities/static-structure-builder.ts`

```typescript
// Detect array operation (e.g., users.filter(...))
if (arrayOps.includes(methodName)) {
  const nodeId = this.generateNodeId("task");

  // Extract original code via SWC span (Phase 1)
  const span = n.span as { start: number; end: number } | undefined;
  const code = span ? this.originalCode.substring(span.start, span.end) : undefined;

  nodes.push({
    id: nodeId,
    type: "task",
    tool: `code:${methodName}`, // Pseudo-tool: "code:filter"
    position,
    parentScope,
    code, // Original code: "users.filter(u => u.active && u.score > 50)"
  });
}
```

**Benefits:**

- ✅ Preserves original callbacks with closures
- ✅ Preserves variable references
- ✅ No placeholder generation needed

### DAG Conversion

**Implementation:** `src/dag/static-to-dag-converter.ts`

Pseudo-tools are converted to `code_execution` tasks:

```typescript
if (node.tool.startsWith("code:")) {
  const operation = node.tool.replace("code:", "");
  const code = node.code || generateOperationCode(operation); // Fallback

  return {
    id: taskId,
    tool: node.tool, // Keep "code:filter" for tracing
    type: "code_execution",
    code, // Extracted code from SWC span
    sandboxConfig: {
      permissionSet: "minimal", // Pure operations are safe
    },
    metadata: { pure: isPureOperation(node.tool) },
    staticArguments: node.arguments,
  };
}
```

### Execution & Tracing

**Problem:** Code operations weren't traced, so SHGAT couldn't learn from them.

**Solution:** Route through WorkerBridge for tracing

**Implementation:** `src/dag/controlled-executor.ts`

```typescript
if (taskType === "code_execution") {
  // Phase 1: Use WorkerBridge for pseudo-tool tracing
  if (this.workerBridge && task.tool) {
    return await this.executeCodeTaskViaWorkerBridge(task, previousResults);
  }

  // Fallback: DenoSandboxExecutor (no tracing)
  // ...
}
```

**WorkerBridge.executeCodeTask():** `src/sandbox/worker-bridge.ts:454-543`

```typescript
async executeCodeTask(
  toolName: string,      // "code:filter", "code:map", etc.
  code: string,
  context?: Record<string, unknown>,
  toolDefinitions: ToolDefinition[] = [],
): Promise<ExecutionResult> {
  // Emit tool_start trace
  this.traces.push({
    type: "tool_start",
    tool: toolName,  // "code:filter"
    traceId,
    ts: startTime,
  });

  // Execute in Worker sandbox (permissions: "none")
  const result = await this.execute(code, toolDefinitions, context);

  // Emit tool_end trace
  this.traces.push({
    type: "tool_end",
    tool: toolName,
    traceId,
    ts: endTime,
    success: result.success,
    durationMs: endTime - startTime,
    result: result.result,
  });

  return result;
}
```

### Traces → executedPath

**How it works:** `src/sandbox/worker-bridge.ts:354-361`

```typescript
const executedPath = sortedTraces
  .filter((t): t is ToolTraceEvent | CapabilityTraceEvent =>
    t.type === "tool_end" || t.type === "capability_end"
  )
  .map((t) => {
    if (t.type === "tool_end") return t.tool; // ← "code:filter" appears here!
    return (t as CapabilityTraceEvent).capability;
  });
```

**Before Phase 1:**

```typescript
executed_path = ["db:query"]; // ❌ Missing code operations
```

**After Phase 1:**

```typescript
executed_path = ["db:query", "code:filter", "code:map", "code:reduce"]; // ✅ Complete
```

### Pure Operations

**Registry:** `src/capabilities/pure-operations.ts`

97 operations classified as **pure** (no side effects):

- ✅ Safe to execute without HIL validation
- ✅ Always produce same output for same input
- ✅ No I/O, no mutations

**Validation bypass:** `src/mcp/handlers/workflow-execution-handler.ts:67-79`

```typescript
if (taskType === "code_execution") {
  // Pure operations NEVER require validation (Phase 1)
  if (task.metadata?.pure === true || isPureOperation(task.tool)) {
    log.debug(`Skipping validation for pure operation: ${task.tool}`);
    continue;
  }
  // ...
}
```

### Example: Complete Flow

```typescript
// Input code
const users = await mcp.db.query({ table: "users" });
const active = users.filter(u => u.active && u.score > 50);
const names = active.map(u => u.name.toUpperCase());
const sorted = names.sort();

// Static structure detected
{
  nodes: [
    { id: "n1", type: "task", tool: "db:query", arguments: { table: "users" } },
    { id: "n2", type: "task", tool: "code:filter", code: "users.filter(u => u.active && u.score > 50)" },
    { id: "n3", type: "task", tool: "code:map", code: "active.map(u => u.name.toUpperCase())" },
    { id: "n4", type: "task", tool: "code:sort", code: "names.sort()" }
  ],
  edges: [
    { from: "n1", to: "n2", type: "sequence" },
    { from: "n2", to: "n3", type: "sequence" },
    { from: "n3", to: "n4", type: "sequence" }
  ]
}

// Execution traces
[
  { type: "tool_end", tool: "db:query", ts: 1000, success: true },
  { type: "tool_end", tool: "code:filter", ts: 1100, success: true },
  { type: "tool_end", tool: "code:map", ts: 1150, success: true },
  { type: "tool_end", tool: "code:sort", ts: 1200, success: true }
]

// executedPath (stored in execution_trace table)
["db:query", "code:filter", "code:map", "code:sort"]

// SHGAT learns from complete trace
graph.addNode("db:query");
graph.addNode("code:filter");
graph.addNode("code:map");
graph.addNode("code:sort");
graph.addEdge("db:query", "code:filter", { type: "sequence" });
graph.addEdge("code:filter", "code:map", { type: "sequence" });
graph.addEdge("code:map", "code:sort", { type: "sequence" });
```

### Files Modified

| File                                             | Changes                                              |
| ------------------------------------------------ | ---------------------------------------------------- |
| `src/capabilities/pure-operations.ts`            | **NEW** - Registry of 97 pure operations             |
| `src/capabilities/static-structure-builder.ts`   | Added span extraction for code operations            |
| `src/capabilities/types.ts`                      | Added `code?: string` field to `StaticStructureNode` |
| `src/dag/static-to-dag-converter.ts`             | Convert pseudo-tools to `code_execution` tasks       |
| `src/dag/execution/task-router.ts`               | Add `isSafeToFail()` for pure operations             |
| `src/mcp/handlers/workflow-execution-handler.ts` | Bypass validation for pure ops, pass WorkerBridge    |
| `src/sandbox/worker-bridge.ts`                   | Add `executeCodeTask()` method for tracing           |
| `src/dag/controlled-executor.ts`                 | Route code tasks through WorkerBridge                |

### Related Documentation

- **Tech Spec (SHGAT):** `docs/sprint-artifacts/tech-spec-shgat-multihead-traces.md` (Section 13)
- **ADR-032:** Sandbox Worker RPC Bridge
- **Commits:** c348a58, edf2d40, d878ed8, 438f01e, 0fb74b8

### Benefits for SHGAT Learning

**Before:**

- ❌ Code operations invisible to SHGAT
- ❌ Can't learn "query → filter → map → reduce" patterns
- ❌ TraceStats incomplete

**After:**

- ✅ All operations in graph (MCP + code)
- ✅ K-head attention learns modular patterns
- ✅ TraceStats computed for code operations
- ✅ Feature extraction works on complete traces

---

## Changelog

- **2025-12-26:** Added modular code operations detection with WorkerBridge tracing (Phase 1)
- **2025-12-26:** Added Array Operations (Phase 1 - Planned) section with `code:*` pseudo-tools
- **2025-12-22:** Added `Promise.all(arr.map(fn))` detection with literal array unrolling
