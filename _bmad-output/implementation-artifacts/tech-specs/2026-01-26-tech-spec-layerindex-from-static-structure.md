---
title: 'LayerIndex Tracking via DAG Execution'
slug: 'layerindex-dag-execution'
created: '2026-01-26'
updated: '2026-01-26'
status: 'done'
tech_stack: ['deno', 'typescript']
---

# Tech-Spec: LayerIndex Tracking via DAG Execution

**Created:** 2026-01-26
**Status:** ✅ Done (with known limitations)
**Superseded by:** `2026-01-26-tech-spec-code-task-dependency-detection.md` for dependency detection issues
**Related:** Story 11.4 (Task 0), Story 10.5, ADR-065

## Problem Statement

When executing code via `pml_execute`, the `taskResults` saved in `execution_trace` are missing `layerIndex`. This causes the TraceTimeline component to display all tasks in Layer 0 instead of showing the correct DAG structure with parallel layers.

### Root Cause Analysis

There are **TWO** broken paths:

**Path 1: Server-side DAG Execution (workflow-execution-handler.ts)**
- DAG executor DOES compute `layerIndex` in `layer-results.ts:101` ✅
- But it's NOT propagated to `TraceTaskResult` in `workflow-execution-handler.ts:689-698` ❌

**Path 2: Client-side Local Execution (PML package)**
- Server builds DAG and computes layers via `topologicalSort` ✅
- Server sends `execute_locally` with tasks but WITHOUT `layerIndex` ❌
- Client executes without layer tracking ❌
- Trace synced back has no `layerIndex` ❌

## Solution Implemented

### Fix 1: Server-side DAG Execution Path (1 line)

Add missing `layerIndex` propagation in `workflow-execution-handler.ts`.

### Fix 2: Include layerIndex in execute_locally Response (Server)

Extract `topologicalSortTasks` to standalone function, create `computeLayerIndexForTasks` wrapper, use in `code-execution-handler.ts`.

### Fix 3: Client Uses layerIndex from Server (PML Package) - SCOPE EXPANSION

**This was NOT in the original plan but was necessary to actually USE the layerIndex.**

Changes required:
- Parse `dag` field from execute_locally response
- Add `layerIndex` to `TraceTaskResult` type
- Pass `dagTasks` through `executeLocalCode` → `enqueueDirectExecutionTrace`
- Store `dagTasks` in `PendingWorkflow` for HIL continuation flows
- Update `formatApprovalRequired` to pass dagTasks

## Files Modified

### Server (src/)

| File | Changes |
|------|---------|
| `src/dag/topological-sort.ts` | **NEW** - Standalone `topologicalSortTasks`, `computeLayerIndexForTasks`, `CircularDependencyError` |
| `src/dag/executor.ts` | Delegate to `topologicalSortTasks` (no duplication) |
| `src/dag/mod.ts` | Export new functions |
| `src/mcp/handlers/code-execution-handler.ts` | Use `computeLayerIndexForTasks` in execute_locally response |
| `src/mcp/handlers/workflow-execution-handler.ts` | Add `layerIndex: r.layerIndex` (Fix 1) |

### PML Package (packages/pml/)

| File | Changes |
|------|---------|
| `src/cli/shared/types.ts` | Add `DAGTask`, `ExecuteLocallyDAG`, `dag` field |
| `src/cli/shared/workflow-utils.ts` | Parse `dag` from response |
| `src/tracing/types.ts` | Add `layerIndex` to `TraceTaskResult` |
| `src/loader/capability-loader.ts` | `enqueueDirectExecutionTrace` accepts `dagTasks`, maps layerIndex |
| `src/cli/shared/local-executor.ts` | Pass `dagTasks` parameter |
| `src/workflow/pending-store.ts` | Add `PendingDAGTask`, `dagTasks` field |
| `src/cli/shared/approval-formatter.ts` | Pass `dagTasks` to store |
| `src/cli/stdio-command.ts` | Pass `dagTasks` everywhere |
| `src/cli/serve-command.ts` | Pass `dagTasks` everywhere |

## Known Limitations & Potential Issues

### 1. CRITICAL: DAG vs Runtime Execution Mismatch

**Problem:** The DAG is computed **statically** from code analysis. But the **runtime** execution might differ:

```typescript
// DAG predicts: [task_0: fs:read], [task_1: code:map], [task_2: fs:write]
// layerIndex:    0                  1                   2

// But runtime could be different due to:
// - Conditional branches skipping tools
// - Dynamic loops calling tools extra times
// - Retries on failure
// - Different execution order than DAG order
```

**Current mitigation:** Match tool calls to DAG tasks by tool name in sequential order. If same tool appears multiple times, consume layerIndex values in order.

**Risk:** If execution order differs from DAG task order for the same tool, the layerIndex mapping will be WRONG.

### 2. Same Tool Called Multiple Times

```typescript
// DAG tasks: [{ tool: "fs:read", layerIndex: 0 }, { tool: "code:map", layerIndex: 1 }, { tool: "fs:read", layerIndex: 2 }]
// Execution: fs:read → code:map → fs:read

// Current algorithm assumes execution matches DAG order
// First fs:read → layerIndex 0 ✅
// code:map → layerIndex 1 ✅
// Second fs:read → layerIndex 2 ✅

// But if execution is: fs:read → fs:read → code:map (different order)
// First fs:read → layerIndex 0 ✅
// Second fs:read → layerIndex 2 ❌ (should be layerIndex 0 or undefined)
// code:map → layerIndex 1 ✅
```

### 3. Tool Calls Beyond DAG Prediction

**Problem:** If code calls a tool more times than the DAG predicted:
- Extra calls get the last known layerIndex for that tool
- This might be misleading

### 4. Type Duplication Risk

We have two aligned but separate types:
- `DAGTask` in `packages/pml/src/cli/shared/types.ts`
- `PendingDAGTask` in `packages/pml/src/workflow/pending-store.ts`

These could drift apart over time.

### 5. Memory Overhead for HIL Continuations

Storing `dagTasks` in `PendingWorkflow` increases memory usage. For typical DAGs this is small (~500 bytes for 5 tasks), but could grow for complex workflows.

### 6. Fundamental Architecture Question

**Are we solving the right problem?**

The real issue is that local sandbox execution is **sequential** (code runs line by line), but we're trying to represent it as **parallel layers** (DAG structure).

The layerIndex represents "what COULD run in parallel" not "what DID run in parallel".

For TraceTimeline visualization, this might be acceptable (showing potential parallelism).
For accurate execution tracing, this is misleading.

## Alternative Approaches (Not Implemented)

### Alternative A: Task ID Matching

Instead of matching by tool name, use task IDs:

1. Server generates unique task IDs in DAG
2. Client executes code with task ID annotations
3. Each tool call includes its task ID
4. Trace uses task ID to look up layerIndex

**Pros:** Accurate matching
**Cons:** Requires code instrumentation, complex

### Alternative B: Server-side Execution Only

Don't support layerIndex for client-local execution. Only show layers for server-executed DAGs.

**Pros:** Simple, accurate
**Cons:** Inconsistent UX between execution modes

### Alternative C: Client Computes Layers

Client receives full DAG structure, computes layers itself.

**Pros:** No server change needed
**Cons:** Duplicates logic, client already has the code

## Testing

1. **Server DAG path:** Execute workflow via API → verify layerIndex in trace ✅
2. **Client local path:** Execute via `pml execute` → verify layerIndex synced
3. **Mixed tools:** Some client, some server tools → verify layers correct
4. **TraceTimeline UI:** Verify visual layer grouping works
5. **Edge case:** Same tool multiple times → verify correct layerIndex assignment
6. **Edge case:** HIL continuation → verify dagTasks preserved

## Issue 7: FQDN vs Short Format Mismatch (2026-01-26)

**Status:** ✅ Fixed (Option B)

### Problem

`layerIndex` is still `null` in the database despite server-side fix. Root cause: **tool name format mismatch**.

| Component | Format | Example |
|-----------|--------|---------|
| Server DAG `dag.tasks[].tool` | FQDN (after fix) | `pml.mcp.filesystem.read_file.4ff0` |
| Client sandbox `r.tool` | Short | `filesystem:read_file` |
| `toolLayerMap` key | FQDN | `pml.mcp.filesystem.read_file.4ff0` |
| `toolLayerMap.get(r.tool)` | Short | Returns `undefined` ❌ |

### Data Flow Traced

```
sandbox-script.ts:87
  └─ method: `${namespace}:${action}`  → "filesystem:read_file"
       │
sandbox-executor.ts:108
  └─ toolCallRecords.push({ tool: method }) → { tool: "filesystem:read_file" }
       │
capability-loader.ts:1488
  └─ toolLayerMap.get(r.tool)  → toolLayerMap keyed by FQDN, r.tool is short → MISMATCH
```

### Fixes Applied (Server-Side)

1. **execute-direct.use-case.ts**: `dag.tasks[].tool` now uses FQDN via `toolsWithFqdn.find()`
2. **execution-capture.service.ts**: `mapClientResultsToPhysical` uses `getToolDisplayName()` to convert client FQDN to short format

### Client-Side Fix Required

The `toolLayerMap` lookup fails because:
- Keys are FQDN (from `dagTasks[].tool`)
- `r.tool` is short format (from sandbox execution)

#### Option A: Normalize dagTasks tool to short format (SIMPLE)

```typescript
// In enqueueDirectExecutionTrace
const toolLayerMap = new Map<string, number[]>();
for (const task of dagTasks) {
  const shortTool = getToolDisplayName(task.tool);  // FQDN → short
  const layers = toolLayerMap.get(shortTool) ?? [];
  layers.push(task.layerIndex);
  toolLayerMap.set(shortTool, layers);
}
```

**Pros:** Minimal change, uses existing utility
**Cons:** Loses FQDN granularity (hash suffix ignored)

#### Option B: Convert r.tool to FQDN (CLEANER)

Use the `fqdnMap` already available in capability-loader to convert `r.tool` to FQDN before lookup.

```typescript
// In enqueueDirectExecutionTrace
const fqdn = this.fqdnMap.get(r.tool);  // "filesystem:read_file" → "pml.mcp.filesystem.read_file.4ff0"
const layers = toolLayerMap.get(fqdn ?? r.tool);
```

**Pros:** Everything stays in FQDN format, consistent
**Cons:** Depends on `fqdnMap` being populated (it should be via `setFqdnMap`)

#### Option C: Emit FQDN from sandbox (INVASIVE)

Modify `sandbox-script.ts` to emit FQDN instead of short format.

```typescript
// sandbox-script.ts:87
method: fqdn  // Instead of `${namespace}:${action}`
```

**Pros:** Source of truth is consistent from the start
**Cons:** Requires passing `fqdnMap` into sandbox, more invasive changes

### Decision: Option B Implemented

Option B was chosen and implemented. The fix converts short format to FQDN using `this.fqdnMap` before lookup:

```typescript
// capability-loader.ts:1497
const fqdn = this.fqdnMap.get(r.tool);
const layers = toolLayerMap.get(fqdn ?? r.tool);
```

**Verified:** MCP→MCP dependencies now correctly show different layers in client traces.

## Conclusion

The implementation works for the **common case** where:
- Code executes in the order predicted by static analysis
- Same tools are called the expected number of times
- No dynamic branching changes execution flow

For edge cases, the layerIndex mapping may be inaccurate. This is acceptable for visualization purposes but should be documented.

**Future improvement:** Consider Alternative A (task ID matching) for accurate tracing when needed.

**Current blocker (Issue 7):** FQDN vs short format mismatch prevents layerIndex from being stored. See options above.
