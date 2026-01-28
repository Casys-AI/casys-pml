---
title: 'Execution Learning & PER Training Fixes'
slug: 'execution-learning-fixes'
created: '2026-01-23'
updated: '2026-01-26'
status: 'complete'
stepsCompleted: []
tech_stack: ['deno', 'typescript', 'postgresql']
files_to_modify:
  - 'src/graphrag/dag/execution-learning.ts'
  - 'src/graphrag/learning/per-training.ts'
  - 'src/capabilities/execution-trace-store.ts'
code_patterns:
  - 'Timestamp-based ordering for sibling traces'
  - 'Batch query for child traces (N+1 fix)'
  - 'Consistent weight calculation for multi-example training'
test_patterns:
  - 'Unit tests for sibling ordering by timestamp'
  - 'Performance tests for batch child trace loading'
  - 'Unit tests for IS weight alignment with examples'
---

# Tech-Spec: Execution Learning & PER Training Fixes

**Created:** 2026-01-23
**Status:** Draft
**Related ADR:** ADR-041 (Hierarchical Trace Tracking), ADR-065 (Deferred Trace Flush)

## Overview

### Problem Statement

Code review of `execution-learning.ts` and `per-training.ts` revealed several issues affecting the correctness and performance of graph learning from execution traces.

| Severity | File | Issue |
|----------|------|-------|
| ~~**CRITICAL**~~ | ~~per-training.ts~~ | ~~childTraceMap key mismatch~~ → **FIXED** (Issue 6) |
| ~~**High**~~ **Medium** | per-training.ts | N+1 queries in `flattenExecutedPath()` (see investigation) |
| ~~High~~ | ~~per-training.ts~~ | ~~IS weight/example index mismatch~~ → **RESOLVED** (was in deleted code) |
| ~~Low~~ | ~~execution-learning.ts~~ | ~~Silent skip when parent trace missing~~ → **RESOLVED** |
| ~~Low~~ | ~~per-training.ts~~ | ~~Global mutable `executionCounter`~~ → **DOCUMENTED** |
| ~~Low~~ | ~~per-training.ts~~ | ~~Code duplication~~ → **RESOLVED** (dead code removed) |
| ~~**High**~~ | ~~src/api/traces.ts~~ | ~~PML CLI traces have empty executedPath~~ → **FIXED** (Issue 7) |

> **Notes:**
> - Sibling order was initially flagged but verified as FALSE POSITIVE - `getTraces()` sorts by timestamp (worker-bridge.ts:960).
> - Code duplication RESOLVED - `trainSHGATOnPathTraces` (in-process) deleted, only subprocess version remains.
> - IS weight mismatch RESOLVED - The bug was in the deleted `trainSHGATOnPathTraces` function. The subprocess version correctly uses `flatPath` and delegates IS weights to `PERBuffer`.

## Issue 1: N+1 Queries in flattenExecutedPath (HIGH → MEDIUM)

### Current Behavior

```typescript
// per-training.ts:118-161
export async function flattenExecutedPath(
  trace: ExecutionTrace,
  traceStore: ExecutionTraceStore,
): Promise<string[]> {
  // ...
  const childTraces = await traceStore.getChildTraces(trace.id);  // 1 query per trace
  // ...
  for (const nodeId of executedPath) {
    const childTrace = childTraceMap.get(nodeId);
    if (childTrace) {
      const childFlat = await flattenExecutedPath(childTrace, traceStore);  // recursive!
      flatPath.push(...childFlat);
    }
  }
  return flatPath;
}
```

### Investigation Findings (2026-01-23)

**Query Flow:**
```
post-execution.service.ts:122 → runPERBatchTraining()
  ↓ non-blocking (fire-and-forget)
  ↓ protected by trainingLock
trainSHGATOnPathTracesSubprocess (line 485-504)
  ↓ for each trace (maxTraces=50)
flattenExecutedPath (line 118-161)
  ↓ await traceStore.getChildTraces(trace.id) ← 1 query per trace
  ↓ recurse if children exist
```

**Query Count Analysis:**

| Scenario | Traces | Depth | Queries |
|----------|--------|-------|---------|
| Best (all leaf traces) | 50 | 0 | **50** |
| Typical (95% leaves, 5% nested) | 50 | 1 | ~55 |
| Worst (all 2-level nested) | 50 | 2 | ~350 |

**Production Config (post-execution.service.ts:435-443):**
- `maxTraces: 50` - Caps query count
- `epochs: 1` - Fast training
- `usePER: false` - Simpler sampling
- Training runs after EVERY successful execution

**Mitigating Factors:**
1. ✅ **Background execution** - Training doesn't block user requests
2. ✅ **trainingLock** - Prevents query pile-up from concurrent runs
3. ✅ **Most traces are leaves** - ~95% of traces are tool executions with no children
4. ✅ **maxTraces=50** - Bounded worst case

**Real Impact:**
1. ⚠️ **Cold start queries** - 50 queries even if all traces are childless
2. ⚠️ **Database contention** - Sequential queries hold connection
3. ⚠️ **Scales with depth** - If meta-capabilities become common, queries multiply

**Severity Re-assessment:** HIGH → **MEDIUM**
- Not urgent because training is non-blocking and bounded
- Still worth fixing for performance and future scalability

### Proposed Fix

Add batch loading method to `ExecutionTraceStore`:

```typescript
// execution-trace-store.ts
async getChildTracesForMultipleParents(parentIds: string[]): Promise<Map<string, ExecutionTrace[]>> {
  if (parentIds.length === 0) return new Map();

  const rows = await this.db.query<ExecutionTraceRow>(
    `SELECT * FROM execution_trace
     WHERE parent_trace_id = ANY($1)
     ORDER BY parent_trace_id, created_at ASC`,
    [parentIds]
  );

  const result = new Map<string, ExecutionTrace[]>();
  for (const row of rows) {
    const parentId = row.parent_trace_id!;
    if (!result.has(parentId)) result.set(parentId, []);
    result.get(parentId)!.push(this.rowToTrace(row));
  }
  return result;
}
```

Update `per-training.ts` to pre-load all child traces:

```typescript
// per-training.ts - new helper
async function preloadAllChildTraces(
  traces: ExecutionTrace[],
  traceStore: ExecutionTraceStore,
): Promise<Map<string, ExecutionTrace[]>> {
  const allTraceIds = new Set<string>();
  const queue = [...traces];

  // BFS to collect all trace IDs
  while (queue.length > 0) {
    const batch = queue.splice(0, 100);
    const batchIds = batch.map(t => t.id);
    batchIds.forEach(id => allTraceIds.add(id));

    const childMap = await traceStore.getChildTracesForMultipleParents(batchIds);
    for (const children of childMap.values()) {
      queue.push(...children);
    }
  }

  // Single query to get all children
  return traceStore.getChildTracesForMultipleParents([...allTraceIds]);
}

// Update flattenExecutedPath to use pre-loaded map
export function flattenExecutedPathSync(
  trace: ExecutionTrace,
  childTraceMap: Map<string, ExecutionTrace[]>,
): string[] {
  // Same logic but synchronous, using pre-loaded map
}
```

**Result:** O(depth) queries instead of O(traces * depth).

### Files to Modify

- `src/capabilities/execution-trace-store.ts` - Add `getChildTracesForMultipleParents()`
- `src/graphrag/learning/per-training.ts` - Add `preloadAllChildTraces()`, update `flattenExecutedPath()`

### Tests

- [ ] `tests/unit/capabilities/execution_trace_store_test.ts` - Test batch child loading
- [ ] `tests/unit/graphrag/per_training_test.ts` - Test preloading with nested traces
- [ ] Performance benchmark: 100 traces with 3 levels nesting

---

## Issue 2: IS Weight/Example Index Mismatch (RESOLVED)

### Initial Analysis

The original concern was that `exampleWeights` was calculated using `executedPath.length` while examples were generated from `flatPath.length`, causing misalignment.

### Investigation Findings (2026-01-23)

**This bug was in the deleted `trainSHGATOnPathTraces` (in-process) function.**

The current `trainSHGATOnPathTracesSubprocess` does NOT have this issue:

```typescript
// per-training.ts:496-503 - Current code (correct)
for (const trace of traces) {
  const flatPath = await flattenExecutedPath(trace, traceStore);  // Uses flatPath
  const examples = traceToTrainingExamples(trace, flatPath, ...);  // Generates from flatPath

  for (const _ex of examples) {
    exampleToTraceId.push(trace.id);  // Tracks per example (correct)
  }
  allExamples.push(...examples);
}
```

**IS weights** are calculated automatically by `PERBuffer.sample()` in the subprocess (lib/shgat/src/training/per-buffer.ts:94-98), based on sampling probabilities - NOT on trace/example counts.

### Resolution

**RESOLVED** - The buggy code was removed when we deleted `trainSHGATOnPathTraces` (dead code removal). No fix needed.

---

## Issue 3: Silent Skip When Parent Trace Missing (RESOLVED)

### Current Behavior

```typescript
// execution-learning.ts:142-143
const parentNodeId = traceToNode.get(parentTraceId);
if (!parentNodeId) continue;  // Silent skip
```

If a parent trace doesn't have a `tool_end`/`capability_end` event, we silently skip creating edges.

### Proposed Fix

Add debug logging per no-silent-fallbacks policy:

```typescript
// execution-learning.ts
import * as log from "@std/log";

// Phase 2
const parentNodeId = traceToNode.get(parentTraceId);
if (!parentNodeId) {
  log.debug("[execution-learning] Parent trace not found in traceToNode map", {
    parentTraceId,
    childCount: children.length,
    hint: "Parent may not have tool_end/capability_end event",
  });
  continue;
}
```

### Files to Modify

- `src/graphrag/dag/execution-learning.ts` - Add debug logging

### Resolution

**Commit:** `f37c3ac` - Added `log.debug()` with parentTraceId, childCount, and hint.

---

## Issue 4: Global Mutable executionCounter (DOCUMENTED)

### Current Behavior

```typescript
// per-training.ts:603
let executionCounter = 0;

export function shouldRunBatchTraining(interval = 10, force = false): boolean {
  executionCounter++;
  return force || executionCounter % interval === 0;
}
```

Global mutable state can cause issues in:
- Parallel tests
- Multiple server instances
- Worker threads

### Resolution

**Decision:** Document rather than refactor. The limitation is acceptable because:
- Training is idempotent (running more/less often is fine)
- `trainingLock` prevents concurrent training runs
- The interval is approximate, not strict

**Commit:** `38494dc` - Added NOTE comment explaining shared state limitations.

---

## Issue 5: Code Duplication Between Training Functions (RESOLVED)

### Resolution

**Deleted `trainSHGATOnPathTraces()`** - the in-process version was not used in production. Only `trainSHGATOnPathTracesSubprocess` is imported by `post-execution.service.ts`.

**Commit:** `ed3c19a` - Removed ~289 lines of dead code.

**Changes:**
- `src/graphrag/learning/per-training.ts` - Removed function
- `src/graphrag/learning/mod.ts` - Removed export
- `src/graphrag/learning/path-level-features.ts` - Updated comment

---

## Issue 6: childTraceMap Key Mismatch (CRITICAL)

### Discovery (2026-01-23)

Found during investigation of Issue 1 optimization.

### Current Behavior

```typescript
// per-training.ts:136-152
// Build a map of capability ID → child trace for efficient lookup
const childTraceMap = new Map<string, ExecutionTrace>();
for (const child of childTraces) {
  if (child.capabilityId) {
    childTraceMap.set(child.capabilityId, child);  // Key = UUID (e.g., "0a01917e-79d0-4580-...")
  }
}

// ...
for (const nodeId of executedPath) {
  // nodeId comes from executedPath which contains TOOL NAMES (e.g., "std:psql_query")
  const childTrace = childTraceMap.get(nodeId);  // NEVER MATCHES!
  if (childTrace) {
    // This code is never reached
  }
}
```

### Root Cause (CORRECTED 2026-01-24)

> **Previous analysis was INCORRECT.** The issue is NOT underscores vs dashes in UUIDs.
> The real issue is **TOOL NAMES vs UUIDs** - completely different formats.

**Verified with production data:**

```sql
SELECT executed_path[1], capability_id FROM execution_trace LIMIT 3;
--    node_in_path    |               cap_uuid
-- -------------------+--------------------------------------
--  std:psql_query    | 0a01917e-79d0-4580-8619-65f5de42ca11
--  std:exec_35eb9188 | f540ce5e-07e0-476f-86cd-8a30ef8019db
--  code:log_test     | cc48a02a-bdd8-4af7-b1f1-b43d5207d39b
```

1. **executedPath** contains **TOOL/CAPABILITY NAMES** (e.g., `std:psql_query`):
   - Built in `worker-bridge.ts:431-434`:
     ```typescript
     .map((t) => {
       if (t.type === "tool_end") return t.tool;      // "std:psql_query"
       return (t as CapabilityTraceEvent).capability; // capability name
     });
     ```
   - `t.tool` is the MCP tool name, NOT a UUID

2. **childTraceMap** is keyed by **UUIDs** (e.g., `0a01917e-79d0-4580-...`):
   - `child.capabilityId` comes from `execution_trace.capability_id` column
   - This is a UUID pointing to `workflow_pattern.pattern_id`

3. **Lookup fails** because `"std:psql_query" !== "0a01917e-79d0-4580-..."` (names vs UUIDs)

**Why the original analysis was wrong:**

The tech-spec incorrectly cited `normalizeCapabilityName()` from `code-generator.ts:217`.
This function is only used to generate **JavaScript variable names** in generated code,
NOT to build `executedPath`. The original analyst confused code generation with trace building.

### Impact

**Hierarchical trace flattening does NOT work in production.**

- `flattenExecutedPath()` never actually flattens nested capabilities
- SHGAT training only sees top-level tools, missing nested structure
- Tests pass because they mock with matching IDs (e.g., `capabilityId: "B"` matches `nodeId: "B"`)

### Proposed Fix

**Option A: Store capability name in child trace (RECOMMENDED)**

Add a `capabilityName` field to trace events so we can match by name:

```typescript
// worker-bridge.ts - when emitting capability_end
{
  type: "capability_end",
  capability: capabilityName,      // Already exists: "my_capability"
  capabilityId: capabilityUuid,    // Add this: "0a01917e-79d0-..."
}
```

Then in `per-training.ts`:
```typescript
// Use capability name (from trace event) instead of capabilityId
for (const child of childTraces) {
  const capName = child.capabilityName; // Need to add this field
  if (capName) {
    childTraceMap.set(capName, child);
  }
}
```

**Option B: Lookup capability name from workflow_pattern**

Query `workflow_pattern` to get the capability name for each child trace:

```typescript
// Requires JOIN or separate query to get name from pattern_id
const pattern = await patternStore.getPattern(child.capabilityId);
childTraceMap.set(pattern.name, child); // Assuming pattern has name
```

**Option C: Store capabilityId in executedPath**

Change `worker-bridge.ts` to store UUIDs instead of names in executedPath.
- Breaking change to executedPath format
- Would require updating all code that reads executedPath

### Files to Modify

- `src/sandbox/worker-bridge.ts` - Add `capabilityId` to capability trace events
- `src/capabilities/types/execution.ts` - Add `capabilityName` field to ExecutionTrace
- `src/graphrag/learning/per-training.ts` - Use name-based lookup

### Tests

- [ ] Fix existing `flattenExecutedPath` tests to use realistic data (names in path, UUIDs in capabilityId)
- [ ] Integration test: verify nested capability actually flattens in real execution
- [ ] Add test case with production-like data: `executed_path=["std:psql_query"]`, `capability_id=UUID`

### Resolution (2026-01-26)

**Implemented Option C with frontend resolution:**

1. **`src/sandbox/worker-bridge.ts:433`** - Use `capabilityId` (UUID) instead of `capability` (name)
   ```typescript
   // Before:
   return (t as CapabilityTraceEvent).capability;  // NAME

   // After:
   return (t as CapabilityTraceEvent).capabilityId;  // UUID
   ```

2. **`src/api/graph-mappers.ts`** - Add `resolveExecutedPathForDisplay()` helper
   - Detects UUIDs in `executedPath` via regex
   - Resolves to `namespace:action` via `capabilityNameMap`
   - Fallback to `cap:${uuid.slice(0,8)}` for unresolved

3. **`src/api/graph.ts`** - Build `capabilityNameMap` from `capability_records`
   - Query `workflow_pattern_id, namespace, action` from DB
   - Pass to `mapNodeData()` for resolution

**Result:**
- `flattenExecutedPath()` now matches child traces correctly (UUID → UUID)
- Frontend displays human-readable names (UUID → `namespace:action`)
- SHGAT training can learn from hierarchical traces

---

## Issue 7: PML CLI Traces Have Empty executedPath (FIXED)

### Discovery (2026-01-26)

Found during investigation of Issue 6 - all traces from PML CLI had `executed_path = []`.

### Current Behavior (Before Fix)

```typescript
// src/api/traces.ts - mapIncomingToSaveInput
return {
  taskResults,
  decisions,
  // executedPath: NOT SET → defaults to [] in DB
};
```

PML CLI sends `taskResults` with tool names but doesn't send `executedPath`.
Server API didn't derive `executedPath` from `taskResults`.

**Evidence from production:**
```sql
SELECT executed_path, task_results FROM execution_trace
WHERE parent_trace_id IS NOT NULL LIMIT 1;
-- executed_path: []
-- task_results: [{"tool": "filesystem:read_file", ...}]
```

### Root Cause

1. `LocalExecutionTrace` (packages/pml) doesn't have `executedPath` field
2. Server's `mapIncomingToSaveInput()` didn't derive it from `taskResults`
3. `execution-trace-store.saveTrace()` uses `trace.executedPath ?? []` → always empty

### Fix Applied (2026-01-26)

```typescript
// src/api/traces.ts - mapIncomingToSaveInput
// Derive executedPath from taskResults (tool names in execution order)
// PML CLI sends taskResults but not executedPath - we reconstruct it here
const executedPath = taskResults.map((tr) => tr.tool);

return {
  taskResults,
  decisions,
  executedPath,  // NOW SET
  // ...
};
```

### Impact

- All new PML CLI traces will have `executed_path` populated
- `flattenExecutedPath()` can now iterate over child trace paths
- SHGAT training will see actual tool sequences, not empty arrays

### Files Modified

- `src/api/traces.ts` - Derive `executedPath` from `taskResults` in `mapIncomingToSaveInput()`

### Tests Added

- `tests/unit/api/traces_test.ts` - 6 tests for `executedPath` derivation
  - Extracts tool names in order
  - Empty taskResults returns empty array
  - Preserves order of multiple same tools
  - Handles various tool namespaces (std, filesystem, code, playwright)
  - Includes failed tool calls
  - **REGRESSION test**: executedPath must not be empty when taskResults exist

---

## Implementation Plan

### Phase 0: Critical Bug Fix (Issue 6 - CRITICAL)

| Step | Task | Effort | Status |
|------|------|--------|--------|
| 0.1 | Investigate root cause | 1h | ✅ Done (2026-01-24) |
| 0.2 | Choose fix approach (Option A recommended) | - | ⏳ Pending |
| 0.3 | Implement fix | 2h | |
| 0.4 | Fix tests to use realistic data | 1h | |

> **Investigation complete (2026-01-24):** Root cause is NAMES vs UUIDs, not underscores vs dashes.
> See updated "Root Cause (CORRECTED)" section above.

### Phase 1: Performance Optimization (Issue 1 - MEDIUM)

| Step | Task | Effort | Status |
|------|------|--------|--------|
| 1.1 | Add `getChildTracesForMultipleParents()` to ExecutionTraceStore | 1h | ✅ `d3c9bb7` |
| 1.2 | Add `preloadAllChildTraces()` helper | 1h | ⏸️ Blocked by Issue 6 |
| 1.3 | Update `flattenExecutedPath()` to use preloaded map | 1h | ⏸️ Blocked by Issue 6 |
| 1.4 | Add unit tests for batch loading | 1h | |

> **Status:**
> - Issue 1 (N+1 queries) → Step 1.1 done, rest now unblocked
> - Issue 2 (IS weight mismatch) → **RESOLVED** (was in deleted code)
> - Issue 3 (silent skip) → commit `f37c3ac`
> - Issue 4 (global counter) → commit `38494dc` (documented)
> - Issue 5 (code duplication) → commit `ed3c19a`
> - **Issue 6 (key mismatch) → FIXED (2026-01-26): Use capabilityId in executedPath + UUID→name resolution**
> - **Issue 7 (empty executedPath) → FIXED (2026-01-26): Derive from taskResults in API**

### Priority Assessment

Issue 1 is **MEDIUM priority** (not urgent) because:
- Training is background/non-blocking
- `trainingLock` prevents query pile-up
- Most traces are leaf traces (~95%)
- `maxTraces=50` bounds worst case

However, it's **worth implementing** because:
- 10-100x fewer queries is significant
- Clean, maintainable implementation
- Future-proofs for deeper hierarchies

---

## Acceptance Criteria

- [ ] **AC1:** `flattenExecutedPath()` makes O(depth) queries instead of O(traces × depth) (deferred - Issue 1 is MEDIUM priority)
- [x] **AC2:** IS weights calculated correctly ✅ (verified - handled by PERBuffer)
- [x] **AC3:** Missing parent traces logged at debug level ✅
- [x] **AC4:** All existing tests pass ✅
- [ ] **AC5:** New tests added for batch loading (Issue 1) (deferred - MEDIUM priority)
- [x] **AC6:** Issue 6 fixed - childTraceMap key mismatch ✅ (2026-01-26)
- [x] **AC7:** Issue 7 fixed - PML CLI traces have executedPath ✅ (2026-01-26)
- [x] **AC8:** Issue 8 fixed - Frontend FQDN parsing ✅ (2026-01-26)

---

## Issue 8: Frontend FQDN Parsing (FIXED)

### Discovery (2026-01-26)

Related to Issue 6 - after `tools_used` started storing FQDNs (e.g., `pml.mcp.std.psql_query.3cd9`),
frontend components broke because they parsed tool IDs with `split(":")`.

### Root Cause

All UI components used colon-based parsing:
```typescript
// BROKEN for FQDNs
const [server, ...nameParts] = toolId.split(":");
const name = nameParts.join(":") || toolId;
// "pml.mcp.std.psql_query.3cd9".split(":") → ["pml.mcp.std.psql_query.3cd9"]
// Result: server = "pml.mcp.std.psql_query.3cd9", name = "" ❌
```

Primary source: `hypergraph-builder.ts:createToolNode()` created graph nodes with FQDN as label.

### Fix Applied (2026-01-26)

**Commit:** `bf2c6819`

1. **New utility:** `src/capabilities/tool-id-utils.ts`
   ```typescript
   export function parseToolId(toolId: string): { namespace: string; action: string } {
     // FQDN: pml.mcp.std.psql_query.3cd9 → { namespace: "std", action: "psql_query" }
     // Colon: std:psql_query → { namespace: "std", action: "psql_query" }
     // MCP dot: mcp.std.psql_query → { namespace: "std", action: "psql_query" }
   }
   ```

2. **Root cause fix:** `src/capabilities/hypergraph-builder.ts:createToolNode()`
   - Changed from `split(":")` to `parseToolId()`

3. **UI components updated:**
   - Atoms: ToolBadge, FusedTaskCard, LoopTaskCard, CapabilityTaskCard
   - Molecules: TraceTimeline
   - Islands: CodePanel, CytoscapeGraph, CapabilityTimeline, NamespaceDetailIsland

### Files Modified

- `src/capabilities/tool-id-utils.ts` (NEW)
- `src/capabilities/hypergraph-builder.ts`
- `src/web/components/ui/atoms/*.tsx` (4 files)
- `src/web/components/ui/molecules/TraceTimeline.tsx`
- `src/web/islands/*.tsx` (5 files)

---

## References

- `src/graphrag/dag/execution-learning.ts` - Execution learning module
- `src/graphrag/learning/per-training.ts` - PER training module
- `src/capabilities/execution-trace-store.ts` - Trace storage
- ADR-041: Hierarchical Trace Tracking
- ADR-065: Deferred Trace Flush with Unified IDs
- `.claude/rules/no-silent-fallbacks.md` - No silent fallbacks policy
