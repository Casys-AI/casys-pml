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
| **CRITICAL** | per-training.ts | childTraceMap key mismatch - uses UUID but executedPath contains names (Issue 6) |
| ~~**High**~~ **Medium** | per-training.ts | N+1 queries in `flattenExecutedPath()` (see investigation) |
| ~~High~~ | ~~per-training.ts~~ | ~~IS weight/example index mismatch~~ → **RESOLVED** (was in deleted code) |
| ~~Low~~ | ~~execution-learning.ts~~ | ~~Silent skip when parent trace missing~~ → **RESOLVED** |
| ~~Low~~ | ~~per-training.ts~~ | ~~Global mutable `executionCounter`~~ → **DOCUMENTED** |
| ~~Low~~ | ~~per-training.ts~~ | ~~Code duplication~~ → **RESOLVED** (dead code removed) |

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
// per-training.ts:166-182
// Build a map of capability ID → child trace for efficient lookup
const childTraceMap = new Map<string, ExecutionTrace>();
for (const child of childTraces) {
  if (child.capabilityId) {
    childTraceMap.set(child.capabilityId, child);  // Key = UUID (e.g., "abc-123-...")
  }
}

// ...
for (const nodeId of executedPath) {
  // nodeId comes from executedPath which contains NAMES (e.g., "fake:person")
  const childTrace = childTraceMap.get(nodeId);  // NEVER MATCHES!
  if (childTrace) {
    // This code is never reached
  }
}
```

### Root Cause

1. **executedPath** contains capability **names** (e.g., `"fake:person"`):
   - Built in `worker-bridge.ts:432-433` using `t.capability` (the name)

2. **childTraceMap** is keyed by **UUIDs** (`child.capabilityId`):
   - `capabilityId` is the FK to `workflow_pattern.pattern_id`

3. **Lookup fails** because `"fake:person" !== "abc-123-def-456"`

### Impact

**Hierarchical trace flattening does NOT work in production.**

- `flattenExecutedPath()` never actually flattens nested capabilities
- SHGAT training only sees top-level tools, missing nested structure
- Tests pass because they mock with matching IDs (e.g., `capabilityId: "B"` matches `nodeId: "B"`)

### Proposed Fix

**Option A:** Use capability name as key (simpler)
```typescript
for (const child of childTraces) {
  // Use intentText or lookup capability name from workflow_pattern
  const capName = child.intentText ?? child.capabilityId;  // Needs proper name lookup
  childTraceMap.set(capName, child);
}
```

**Option B:** Store capability name in child trace
- Add `calledAsName` field to ExecutionTrace
- Populated when nested capability starts with the name used to call it

**Option C:** Enrich executedPath with capabilityId
- Store `{name, capabilityId}` objects instead of strings
- Breaking change to executedPath format

### Files to Modify

- `src/graphrag/learning/per-training.ts` - Fix key lookup logic
- `src/sandbox/worker-bridge.ts` - Potentially add capabilityId to executedPath
- `src/capabilities/types/execution.ts` - Potentially add field to ExecutionTrace

### Tests

- [ ] Fix existing `flattenExecutedPath` tests to use realistic data (UUID vs name)
- [ ] Integration test: verify nested capability actually flattens in real execution

---

## Implementation Plan

### Phase 0: Critical Bug Fix (Issue 6 - CRITICAL)

| Step | Task | Effort |
|------|------|--------|
| 0.1 | Investigate best fix approach (Option A/B/C) | 1h |
| 0.2 | Implement fix | 2h |
| 0.3 | Fix tests to use realistic data | 1h |

### Phase 1: Performance Optimization (Issue 1 - MEDIUM)

| Step | Task | Effort | Status |
|------|------|--------|--------|
| 1.1 | Add `getChildTracesForMultipleParents()` to ExecutionTraceStore | 1h | ✅ `d3c9bb7` |
| 1.2 | Add `preloadAllChildTraces()` helper | 1h | ⏸️ Blocked by Issue 6 |
| 1.3 | Update `flattenExecutedPath()` to use preloaded map | 1h | ⏸️ Blocked by Issue 6 |
| 1.4 | Add unit tests for batch loading | 1h | |

> **Status:**
> - Issue 1 (N+1 queries) → Step 1.1 done, rest blocked by Issue 6
> - Issue 2 (IS weight mismatch) → **RESOLVED** (was in deleted code)
> - Issue 3 (silent skip) → commit `f37c3ac`
> - Issue 4 (global counter) → commit `38494dc` (documented)
> - Issue 5 (code duplication) → commit `ed3c19a`
> - **Issue 6 (key mismatch) → CRITICAL - flattenExecutedPath is broken**

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

- [ ] **AC1:** `flattenExecutedPath()` makes O(depth) queries instead of O(traces × depth)
- [x] **AC2:** IS weights calculated correctly ✅ (verified - handled by PERBuffer)
- [x] **AC3:** Missing parent traces logged at debug level ✅
- [ ] **AC4:** All existing tests pass
- [ ] **AC5:** New tests added for batch loading (Issue 1)

---

## References

- `src/graphrag/dag/execution-learning.ts` - Execution learning module
- `src/graphrag/learning/per-training.ts` - PER training module
- `src/capabilities/execution-trace-store.ts` - Trace storage
- ADR-041: Hierarchical Trace Tracking
- ADR-065: Deferred Trace Flush with Unified IDs
- `.claude/rules/no-silent-fallbacks.md` - No silent fallbacks policy
