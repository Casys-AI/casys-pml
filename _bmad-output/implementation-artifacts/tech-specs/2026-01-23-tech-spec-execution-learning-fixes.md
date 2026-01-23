---
title: 'Execution Learning & PER Training Fixes'
slug: 'execution-learning-fixes'
created: '2026-01-23'
updated: '2026-01-23'
status: 'draft'
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
| **High** | per-training.ts | N+1 queries in `flattenExecutedPath()` |
| **High** | per-training.ts | IS weight/example index mismatch |
| **Low** | execution-learning.ts | Silent skip when parent trace missing |
| **Low** | per-training.ts | Global mutable `executionCounter` |
| ~~Low~~ | ~~per-training.ts~~ | ~~Code duplication~~ → **RESOLVED** (dead code removed) |

> **Notes:**
> - Sibling order was initially flagged but verified as FALSE POSITIVE - `getTraces()` sorts by timestamp (worker-bridge.ts:960).
> - Code duplication RESOLVED - `trainSHGATOnPathTraces` (in-process) deleted, only subprocess version remains.

## Issue 1: N+1 Queries in flattenExecutedPath (HIGH)

### Current Behavior

```typescript
// per-training.ts:404-447
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

**Impact:** With 100 traces, each having 2-3 levels of nesting, this causes 200-300+ sequential DB queries.

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

## Issue 2: IS Weight/Example Index Mismatch (HIGH)

### Current Behavior

```typescript
// per-training.ts:319-324
for (let t = 0; t < traces.length; t++) {
  const numExamplesFromTrace = traces[t].executedPath?.length ?? 0;  // Uses executedPath
  for (let e = 0; e < numExamplesFromTrace; e++) {
    exampleWeights.push(traceWeights[t]);
  }
}
```

But examples are generated from `flatPath`:

```typescript
// per-training.ts:272
const flatPath = await flattenExecutedPath(trace, traceStore);  // Uses flatPath (expanded)

// per-training.ts:578
for (let i = 0; i < flatPath.length; i++) {  // Iterates flatPath
  examples.push({ ... });
}
```

**Problem:** If `flatPath.length > executedPath.length` (after recursive expansion), `exampleWeights` will have fewer entries than `allExamples`. The IS weights will be misaligned or cause index out of bounds.

### Proposed Fix

Count examples AFTER generation, not before:

```typescript
// per-training.ts - Option A: Count after generation
const exampleCountBefore = allExamples.length;
const examples = traceToTrainingExamples(trace, flatPath, ...);
const exampleCountAfter = allExamples.length + examples.length;

// Push weight for each example actually generated
for (let e = 0; e < examples.length; e++) {
  exampleWeights.push(traceWeights[t]);
}
allExamples.push(...examples);
```

Or alternatively, build weights inline:

```typescript
// per-training.ts - Option B: Build weights during example generation
for (let t = 0; t < traces.length; t++) {
  const trace = traces[t];
  const flatPath = await flattenExecutedPath(trace, traceStore);
  const examples = traceToTrainingExamples(trace, flatPath, ...);

  for (const ex of examples) {
    allExamples.push(ex);
    exampleWeights.push(traceWeights[t]);  // Weight per actual example
  }
}
```

### Files to Modify

- `src/graphrag/learning/per-training.ts` - Fix weight calculation in both `trainSHGATOnPathTraces()` and `trainSHGATOnPathTracesSubprocess()`

### Tests

- [ ] `tests/unit/graphrag/per_training_test.ts` - Test with traces that expand (flatPath > executedPath)
- [ ] Assert `exampleWeights.length === allExamples.length`

---

## Issue 3: Silent Skip When Parent Trace Missing (LOW)

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

### Tests

- [ ] Manual verification via log output

---

## Issue 4: Global Mutable executionCounter (LOW)

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

### Proposed Fix

Option A: Make counter instance-based (pass to function):

```typescript
export function shouldRunBatchTraining(
  counter: { value: number },
  interval = 10,
  force = false,
): boolean {
  counter.value++;
  return force || counter.value % interval === 0;
}
```

Option B: Use atomic counter or move to a service class.

### Files to Modify

- `src/graphrag/learning/per-training.ts` - Refactor counter

### Tests

- [ ] Test parallel calls don't interfere

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

## Implementation Plan

### Phase 1: Critical Fixes (Issues 1 & 2)

| Step | Task | Effort |
|------|------|--------|
| 1.1 | Add `getChildTracesForMultipleParents()` to ExecutionTraceStore | 1h |
| 1.2 | Add `preloadAllChildTraces()` helper | 1h |
| 1.3 | Update `flattenExecutedPath()` to use preloaded map | 1h |
| 1.4 | Fix IS weight calculation alignment | 30m |
| 1.5 | Add unit tests for both fixes | 2h |

### Phase 2: Low Priority (Issues 3 & 4)

| Step | Task | Effort |
|------|------|--------|
| 2.1 | Add debug logging for missing parent | 15m |
| 2.2 | Refactor executionCounter (optional) | 30m |

> **Note:** Issue 5 (code duplication) already resolved - dead code removed in commit `ed3c19a`.

---

## Acceptance Criteria

- [ ] **AC1:** `flattenExecutedPath()` makes O(depth) queries instead of O(traces * depth)
- [ ] **AC2:** `exampleWeights.length === allExamples.length` always true (in subprocess version)
- [ ] **AC3:** Missing parent traces logged at debug level
- [ ] **AC4:** All existing tests pass
- [ ] **AC5:** New tests added for critical fixes (Issues 1 & 2)

---

## References

- `src/graphrag/dag/execution-learning.ts` - Execution learning module
- `src/graphrag/learning/per-training.ts` - PER training module
- `src/capabilities/execution-trace-store.ts` - Trace storage
- ADR-041: Hierarchical Trace Tracking
- ADR-065: Deferred Trace Flush with Unified IDs
- `.claude/rules/no-silent-fallbacks.md` - No silent fallbacks policy
