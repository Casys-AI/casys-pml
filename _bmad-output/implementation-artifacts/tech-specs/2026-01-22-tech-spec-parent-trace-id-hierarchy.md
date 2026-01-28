---
title: 'Parent Trace ID Hierarchy with Deferred Flush'
slug: 'parent-trace-id-hierarchy'
created: '2026-01-22'
updated: '2026-01-23'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
tech_stack: ['deno', 'typescript', 'postgresql']
files_to_modify:
  - 'src/sandbox/types.ts'
  - 'src/sandbox/sandbox-worker.ts'
  - 'src/sandbox/worker-bridge.ts'
  - 'src/sandbox/rpc-router.ts'
  - 'src/capabilities/execution-trace-store.ts'
  - 'src/mcp/handlers/execute-handler-facade.ts'
  - 'src/application/use-cases/execute/execute-direct.use-case.ts'
  - 'packages/pml/src/tracing/syncer.ts'
  - 'packages/pml/src/tracing/types.ts'
  - 'packages/pml/src/loader/capability-loader.ts'
  - 'packages/pml/src/execution/sandbox-executor.ts'
  - 'packages/pml/src/cli/shared/local-executor.ts'
  - 'src/db/migrations/041_parent_trace_id_fk.ts'
code_patterns:
  - 'UUID pre-generation at entry point (same as workflowId pattern)'
  - 'Unified traceId/workflowId - same ID for traces AND HIL continuation'
  - 'Deferred trace flush - collect during execution, flush at end'
  - 'DEFERRABLE FK constraint for batch insert safety'
test_patterns:
  - 'Unit tests for trace ID propagation'
  - 'Integration tests for parent-child trace linking'
  - 'Deferred flush tests (10 tests in trace_deferred_flush_test.ts)'
---

# Tech-Spec: Parent Trace ID Hierarchy with Deferred Flush

**Created:** 2026-01-22
**Updated:** 2026-01-23
**Status:** ✅ Completed
**Related Spike:** `_bmad-output/implementation-artifacts/spikes/2026-01-22-parent-trace-id-hierarchy.md`
**Related ADR:** ADR-041 (Hierarchical Trace Tracking)

## Overview

### Problem Statement

Two issues with nested capability trace tracking:

**Problem 1: UUID Mismatch** (discovered 2026-01-22)

Nested capability executions don't create linked traces. The `parent_trace_id` column exists but was never populated.

- Sandbox generates `traceId = crypto.randomUUID()` → `UUID_A`
- Database generates `id = gen_random_uuid()` on INSERT → `UUID_B`
- Child trace sets `parent_trace_id = UUID_A` which doesn't match any `id` (`UUID_B`)

**Problem 2: FK Violation During HIL** (discovered 2026-01-23)

When `approval_required` (Human-in-the-Loop pause) happens during nested execution:
- Child traces were saved with `parent_trace_id` pointing to parent
- Parent trace was only created at END of complete execution
- FK violation: `violates foreign key constraint "execution_trace_parent_trace_id_fkey"`

### What Already Exists (ADR-041)

> ⚠️ **Important:** ADR-041 already implemented `parentTraceId` propagation throughout the codebase. This tech-spec only addresses the **UUID mismatch** - NOT the propagation (already done).

| Component | Already Exists |
|-----------|---------------|
| `InitMessage.parentTraceId` | ✅ `types.ts:250` |
| `RPCCallMessage.parentTraceId` | ✅ `types.ts:216` |
| `WorkerBridge.execute(parentTraceId)` | ✅ `worker-bridge.ts:279` |
| `handleRPCCall` extracts `parentTraceId` | ✅ `worker-bridge.ts:764` |
| `traceData.parentTraceId` in save | ✅ `worker-bridge.ts:436` |
| `__traceContextStack` in sandbox | ✅ `sandbox-worker.ts:44-49` |
| INSERT with `parent_trace_id` | ✅ `execution-trace-store.ts:138` |

### What's Missing (This Tech-Spec)

1. **`InitMessage.traceId`** - Field to pass pre-generated trace UUID to sandbox
2. **Sandbox uses pre-generated traceId** - Instead of always `crypto.randomUUID()`
3. **`execution-trace-store` accepts optional `id`** - INSERT with COALESCE
4. **Entry point generates traceId** - And propagates through chain
5. **RpcRouter passes parentTraceId to nested capabilities** - Bridge already has it, router doesn't

### Solution

**Solution 1: Pre-generate Trace UUID** (server-side)

Pre-generate the trace UUID at the entry point and use it as the database `id`:

```
Entry Point
   │
   ├─ const traceId = crypto.randomUUID()  // Generate once
   │
   ▼
WorkerBridge.execute(..., { traceId })
   │
   ├─► sandbox-worker: use msg.traceId (not crypto.randomUUID())
   │
   ├─► RPC to nested cap: pass traceId as parentTraceId
   │       │
   │       └─► child: own traceId, parent_trace_id = caller's traceId
   │
   ▼
execution-trace-store.saveTrace({ id: traceId })  // Use as DB id
```

**Solution 2: Deferred Trace Flush + Unified IDs** (package-side)

```
Execution Start
   │
   ├─ traceId = workflowId ?? crypto.randomUUID()  // Unified ID
   │
   ├─► Nested capability calls
   │       │
   │       └─► Traces collected in pendingTraces[] (NOT flushed yet)
   │
   ├─► If approval_required: return workflowId = traceIdStack[0]
   │       │
   │       └─► User approves → continue with SAME workflowId
   │
   ▼
Execution End
   │
   ├─ Sort pendingTraces by dependency (parents first)
   │
   └─► Flush all traces to cloud (parent exists before children)
```

## Implementation Plan

### Task 1: Add `traceId` to InitMessage and Sandbox Worker

**Files:** `src/sandbox/types.ts`, `src/sandbox/sandbox-worker.ts`

**types.ts** - Add `traceId` field (NOT parentTraceId, already exists):
```typescript
export interface InitMessage {
  type: "init";
  code: string;
  toolDefinitions: ToolDefinition[];
  context?: Record<string, unknown>;
  capabilityContext?: string;
  parentTraceId?: string;  // ✅ Already exists
  traceId?: string;        // NEW: Pre-generated trace UUID for this execution
}
```

**sandbox-worker.ts** - Use pre-generated traceId:
```typescript
// Add after line 53 (__rootParentTraceId)
let __preGeneratedTraceId: string | undefined;

// In handleInit (after line 309)
__preGeneratedTraceId = msg.traceId;

// In __trace function (line 79) - replace crypto.randomUUID()
const traceId = __preGeneratedTraceId ?? crypto.randomUUID();
// Clear after first capability_start (one trace per execution)
if (event.type === "capability_start" && __preGeneratedTraceId) {
  __preGeneratedTraceId = undefined;
}
```

**AC:** Sandbox uses provided traceId instead of generating new one

---

### Task 2: WorkerBridge Propagates traceId

**File:** `src/sandbox/worker-bridge.ts`

```typescript
// Line 280: Add traceId to options
options?: { preserveTraces?: boolean; traceId?: string }

// Line ~290: Store traceId
this.lastTraceId = options?.traceId;

// Line 352-359: Include in InitMessage
const initMessage: InitMessage = {
  type: "init",
  code,
  toolDefinitions,
  context,
  capabilityContext,
  parentTraceId,
  traceId: options?.traceId,  // NEW
};

// Line ~430 (traceData): Include id
traceData: {
  id: this.lastTraceId,  // NEW
  initialContext: ...,
  parentTraceId: this.lastParentTraceId,
  ...
}
```

**AC:** traceId flows from execute() → InitMessage → traceData

---

### Task 3: RpcRouter Passes parentTraceId to Nested Capabilities

**File:** `src/sandbox/rpc-router.ts`

> Note: `handleRPCCall` already extracts `parentTraceId` from RPCCallMessage but doesn't pass it to `route()`.

```typescript
// Line 100: Add parentTraceId param
async route(
  server: string,
  tool: string,
  args: Record<string, unknown>,
  parentTraceId?: string,  // NEW
): Promise<RpcRouteResult>

// Line 116: Pass to routeToCapability
const capabilityResult = await this.routeToCapability(server, tool, args, parentTraceId);

// Line 191, 230: Pass to executeCapability
return this.executeCapability(..., parentTraceId);

// Line 270: Add to executeCapability signature
private async executeCapability(
  code: string,
  args: Record<string, unknown>,
  capabilityId: string,
  routeType: "cap_uuid" | "capability",
  parentTraceId?: string,  // NEW
): Promise<RpcRouteResult>

// Line 284: Pass to bridge.execute with new child traceId
const childTraceId = crypto.randomUUID();
const capResult = await bridge.execute(
  code,
  [],
  { ...args, __capability_id: capabilityId },
  undefined,
  parentTraceId,
  { traceId: childTraceId },
);
```

**worker-bridge.ts line 788:** Pass parentTraceId to route()
```typescript
const routeResult = await this.rpcRouter.route(server, tool, args || {}, parentTraceId);
```

**AC:** Nested capabilities receive parentTraceId and generate their own traceId

---

### Task 4: ExecutionTraceStore Accepts Optional ID

**File:** `src/capabilities/execution-trace-store.ts`

```typescript
// Update SaveTraceInput type (around line 52)
export type SaveTraceInput = Omit<ExecutionTrace, "id"> & { id?: string };

// Line 134-154: Add id column with COALESCE
const result = await this.db.query(
  `INSERT INTO execution_trace (
    id,  -- NEW
    capability_id, initial_context, success, duration_ms,
    error_message, user_id, executed_path, decisions,
    task_results, priority, parent_trace_id
  ) VALUES (
    COALESCE($1, gen_random_uuid()),  -- Use provided or generate
    $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12
  )
  RETURNING *`,
  [
    trace.id ?? null,  // NEW
    trace.capabilityId ?? null,
    // ... rest unchanged (shift indices +1)
  ],
);
```

**AC:**
- Given trace with id="ABC" → DB row has id="ABC"
- Given trace without id → DB generates via gen_random_uuid()

---

### Task 5: Entry Point Generates TraceId

**Files:** `src/mcp/handlers/execute-handler-facade.ts`, `src/application/use-cases/execute/execute-direct.use-case.ts`

**execute-handler-facade.ts:**
```typescript
// In handleDirect (around line 134)
const executionTraceId = crypto.randomUUID();

const result = await this.executeDirectUseCase.execute({
  ...request,
  executionTraceId,
});
```

**execute-direct.use-case.ts:**
```typescript
// Update ExecuteDirectRequest type
export interface ExecuteDirectRequest {
  // ... existing fields
  executionTraceId?: string;
}

// In execute(): Pass to WorkerBridge
const result = await bridge.execute(
  code,
  toolDefinitions,
  context,
  capabilityContext,
  undefined,  // parentTraceId (null for root)
  { traceId: request.executionTraceId },
);
```

**AC:** Root trace.id in DB matches pre-generated executionTraceId

---

## Acceptance Criteria

### AC1: Root Trace ID Matches Database ID
```gherkin
Given a pml_execute request
When the execution completes and trace is saved
Then trace.id in database equals the pre-generated executionTraceId
```

### AC2: Nested Capability Has Valid Parent Reference
```gherkin
Given capability A that calls capability B
When both traces are saved
Then trace_B.parent_trace_id = trace_A.id
And SELECT * FROM execution_trace WHERE id = trace_B.parent_trace_id returns trace_A
```

### AC3: Backward Compatibility
```gherkin
Given code calling bridge.execute() without traceId option
When execution completes
Then trace is saved with database-generated id
And no errors occur
```

## Testing Strategy

**Unit Tests:**
1. `sandbox-worker.ts` - traceId from InitMessage is used
2. `rpc-router.ts` - parentTraceId propagates to executeCapability
3. `execution-trace-store.ts` - COALESCE uses provided id or generates

**Integration Tests:**
1. pml_execute → trace.id matches pre-generated UUID
2. Nested capability → parent_trace_id FK is valid
3. getChildTraces() returns actual children

## Notes

- Pattern identical to `workflowId` in `workflow-execution-handler.ts:488`
- Existing 625 traces remain with `parent_trace_id = NULL` (no migration)
- No database migration required (schema supports DEFAULT)

---

## Implementation Progress

### Phase 1: Server-side (2026-01-22) ✅

| Task | Status | Verification |
|------|--------|--------------|
| Task 1: `traceId` in InitMessage | ✅ Done | `types.ts:250`, `sandbox-worker.ts:81-88` |
| Task 2: WorkerBridge propagates traceId | ✅ Done | `worker-bridge.ts:279` options param |
| Task 3: RpcRouter parentTraceId signature | ✅ Done | `rpc-router.ts:104-108` |
| Task 4: ExecutionTraceStore optional ID | ✅ Done | COALESCE in INSERT |
| Task 5: Entry point generates traceId | ✅ Done | `execute-handler-facade.ts` |

### Phase 2: Package-side Deferred Flush (2026-01-23) ✅

**Problem Discovered:** FK constraint violation during HIL (Human-in-the-Loop) pause.

When `approval_required` happens during nested capability execution:
- Child traces were saved with `parent_trace_id` pointing to parent
- Parent trace was only created at END of complete execution
- FK violation: `insert or update on table "execution_trace" violates foreign key constraint`

**Solution: Deferred Trace Flush + Unified workflowId/traceId**

| Task | Status | File |
|------|--------|------|
| Task 6: TraceSyncer explicit flush only | ✅ Done | `packages/pml/src/tracing/syncer.ts` |
| Task 6b: Remove autoFlush config | ✅ Done | `packages/pml/src/tracing/types.ts` |
| Task 6c: CapabilityLoader pendingTraces | ✅ Done | `packages/pml/src/loader/capability-loader.ts` |
| Task 6d: SandboxExecutor accepts workflowId | ✅ Done | `packages/pml/src/execution/sandbox-executor.ts` |
| Task 6e: local-executor passes workflowId | ✅ Done | `packages/pml/src/cli/shared/local-executor.ts` |
| Task 7: Migration 041 DEFERRABLE FK | ✅ Done | `src/db/migrations/041_parent_trace_id_fk.ts` |

---

## Key Architecture Changes

### Unified workflowId / traceId

Same UUID used for both concepts - different names by context:

| Context | Name Used | Why |
|---------|-----------|-----|
| Traces DB, parent-child linking | `traceId` | It's a trace identifier |
| HIL approval/continuation | `workflowId` | It's a workflow identifier |
| SandboxExecutor | `traceId` (param: `workflowId`) | Accepts existing workflowId, uses as traceId |

**SandboxExecutor:**
```typescript
async execute(
  code: string,
  context: Record<string, unknown>,
  clientToolHandler?: ToolCallHandler,
  workflowId?: string,  // Optional: reuse for HIL continuation
): Promise<SandboxExecutionResult> {
  // Use provided workflowId or generate new one
  const traceId = workflowId ?? crypto.randomUUID();
  // ...
}
```

**CapabilityLoader approval_required:**
```typescript
return {
  approvalRequired: true,
  workflowId: this.getRootWorkflowId(), // Returns traceIdStack[0]
  // ...
};
```

### Deferred Trace Flush

Traces are collected during execution, sorted by dependency (parents first), and flushed only at the end.

**TraceSyncer:** No auto-flush timer, explicit `flush()` only.

```typescript
export class TraceSyncer {
  private queue: LocalExecutionTrace[] = [];

  enqueue(trace: LocalExecutionTrace): void { /* add to queue */ }

  sortQueueByDependency(): void {
    // Topological sort: parents before children
  }

  async flush(): Promise<void> {
    // Flush all traces in batches to cloud
  }
}
```

**CapabilityLoader:** Collects traces in `pendingTraces`, flushes at end.

```typescript
class CapabilityLoader {
  private pendingTraces: LocalExecutionTrace[] = [];

  enqueuePendingTrace(trace: LocalExecutionTrace): void {
    this.pendingTraces.push(trace);
  }

  async flushTraces(): Promise<void> {
    for (const trace of this.pendingTraces) {
      this.traceSyncer.enqueue(trace);
    }
    this.pendingTraces = [];
    this.traceSyncer.sortQueueByDependency();
    await this.traceSyncer.flush();
  }
}
```

### Migration 041: DEFERRABLE FK Constraint

```sql
ALTER TABLE execution_trace
ADD CONSTRAINT execution_trace_parent_trace_id_fkey
FOREIGN KEY (parent_trace_id)
REFERENCES execution_trace(id)
ON DELETE SET NULL
DEFERRABLE INITIALLY DEFERRED
```

This allows batch inserts where children might be inserted before parents within the same transaction.

---

## Acceptance Criteria

### ✅ AC1: Root Trace ID Matches Database ID

```sql
SELECT id, parent_trace_id, initial_context->>'intent'
FROM execution_trace
ORDER BY created_at DESC LIMIT 5;
-- All root executions have parent_trace_id = NULL ✅
```

### ✅ AC2: Nested Capability Has Valid Parent Reference

**Verified:** Nested capabilities create traces with valid `parent_trace_id`.

```sql
SELECT id, parent_trace_id, capability_id
FROM execution_trace
WHERE parent_trace_id IS NOT NULL
ORDER BY created_at DESC LIMIT 5;
-- Child traces point to existing parent traces ✅
```

### ✅ AC3: HIL Continuation Preserves Trace Hierarchy

When HIL pause/continue happens:
1. First execution starts with `traceId = UUID_A`
2. Nested capability pauses for approval, returns `workflowId = UUID_A`
3. User approves, continuation uses same `workflowId = UUID_A`
4. All traces (parent + children) share the same root trace lineage

### ✅ AC4: No FK Violations During Nested Execution

Deferred flush ensures parent traces exist before children are saved.

---

## Testing

**Unit Tests:** `packages/pml/tests/trace_deferred_flush_test.ts` (10 tests)

- TraceSyncer: no auto-flush, explicit flush only
- TraceSyncer: sortQueueByDependency (parents before children)
- TraceSyncer: handles deep nesting, multiple roots, orphans
- CapabilityLoader: pendingTraces collection and clearing
- CapabilityLoader: flushTraces sorts and syncs

**Migration Tests:** `tests/unit/db/migrations_test.ts` (6 tests)

---

## Future: SHGAT Learning from Traces

With hierarchical traces now properly linked, SHGAT can learn:

| Trace Field | SHGAT Use |
|-------------|-----------|
| `parent_trace_id` | Composition relationships (A calls B) |
| `success` | Positive/negative reinforcement signal |
| `duration_ms` | Performance-based ranking |
| `task_results` | Tool co-occurrence patterns |

**TODO:** Pipeline to ingest traces → SHGAT features.

---

## Appendix: "Contains" Edges - Two Sources

### Discovery (2026-01-23)

The "contains" edges in SHGAT graph have **two distinct sources**:

### 1. Structural (Static) - Always Worked ✅

**Source:** Capability definition at creation time

| File | Mechanism |
|------|-----------|
| `db-sync.ts:215` | `workflow_pattern.dag_structure.tools_used` |
| `graph-engine.ts:171` | `addCapabilityIncremental()` |

```typescript
// Creates edges from capability → tools it DECLARES using
edge_type: "contains"
edge_source: "structural"
```

### 2. Learned (Dynamic) - Was Broken, Now Fixed ✅

**Source:** Execution traces with `parent_trace_id`

| File | Mechanism |
|------|-----------|
| `execution-learning.ts:140` | `parentToChildren` map from traces |

```typescript
// Creates edges from capability → capabilities it ACTUALLY CALLS
edge_type: "contains"
edge_source: "observed"
```

**Before fix:** `parent_trace_id` always NULL → `parentToChildren` always empty → no learned edges.

**After fix:** Traces with valid `parent_trace_id` → learned composition patterns.

### Why Both Matter

| Source | What It Captures | Example |
|--------|-----------------|---------|
| **Structural** | Declared dependencies | "CapA uses tool1, tool2" |
| **Learned** | Actual usage patterns | "CapA calls CapB 15× successfully" |

The learned edges enable SHGAT to discover:
- **Implicit compositions** not declared in definitions
- **Usage frequency** (edge weight from observation count)
- **Success patterns** (only successful executions strengthen edges)

---

## Post-Review Action Items (2026-01-23)

**Code Review Date:** 2026-01-23
**Reviewer:** Adversarial Senior Developer Code Review

### ✅ All Issues Fixed

| Priority | Issue | File | Resolution |
|----------|-------|------|------------|
| 🔴 HIGH | Debug code in production | `src/sandbox/rpc-router.ts` | ✅ Removed `/tmp/rpc-debug.log` writes |
| 🟠 MEDIUM | Missing parentTraceId validation | `src/api/traces.ts` | ✅ Added UUID validation for `parentTraceId` and `traceId` |
| 🟠 MEDIUM | Magic string `"direct:code_execution"` | Multiple files | ✅ Made `capabilityId` optional when `workflowId` present |
| 🟢 LOW | AC3 integration test | `packages/pml/tests/trace_deferred_flush_test.ts` | ✅ Added 2 tests for HIL trace hierarchy |
| 🟢 LOW | `sortQueueByDependency` perf | `packages/pml/src/tracing/syncer.ts` | ✅ Verified already O(n) - false positive |
| 🟢 LOW | JSDoc `callWithFqdn` | `packages/pml/src/loader/capability-loader.ts` | ✅ Already documented at line 564 |

### Changes Made

1. **`packages/pml/src/tracing/types.ts`**: `capabilityId` now optional (required only when no `workflowId`)
2. **`src/api/traces.ts`**: Conditional validation - `capabilityId` required only when no `workflowId`
3. **`src/api/traces.ts`**: UUID validation for `traceId` and `parentTraceId`
4. **`packages/pml/src/loader/capability-loader.ts`**: Removed magic string, added `workflowId` parameter
5. **`packages/pml/tests/trace_deferred_flush_test.ts`**: Added 2 AC3 tests for HIL trace hierarchy

### ✅ Verified as Non-Issues

| Issue | Why Not an Issue |
|-------|------------------|
| HIL traceId propagation | Executor is stateful - resumes with same context including traceId |
| `sortQueueByDependency` O(n²) | Already uses DFS with visited set - O(n) complexity |
| JSDoc missing | Already documented at line 564 |

### ✅ Verified After Analysis

| Issue | Analysis |
|-------|----------|
| Error handling style | Reviewed files in scope - patterns are consistent per layer (API: errorResponse, Domain: LoaderError, Background: catch/log/retry). No changes needed. |
