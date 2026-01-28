# ADR-065: Deferred Trace Flush with Unified workflowId/traceId

**Status:** Implemented
**Date:** 2026-01-23
**Deciders:** Architecture Team
**Supersedes:** Extends ADR-041 (Hierarchical Trace Tracking)
**Related:** ADR-041, ADR-027

## Context

### ADR-041 Implementation Gap

ADR-041 established `parent_trace_id` propagation for hierarchical trace tracking. However, two critical bugs prevented it from working in practice:

**Bug 1: UUID Mismatch (Server-side)**

```
Sandbox generates: traceId = crypto.randomUUID() → "UUID_A"
Database generates: id = gen_random_uuid() on INSERT → "UUID_B"
Child trace sets: parent_trace_id = "UUID_A"
Result: FK points to non-existent ID (UUID_A ≠ UUID_B)
```

**Evidence:** 0 out of 625 traces had `parent_trace_id` populated before fix.

**Bug 2: FK Violation During HIL (Package-side)**

When `approval_required` (Human-in-the-Loop pause) occurs during nested capability execution:

```
1. Parent capability starts execution (traceId = "abc")
2. Child capability executes and saves trace (parent_trace_id = "abc")
3. HIL pause triggered - child trace SAVED to DB
4. Parent trace NOT YET SAVED (only saved at execution END)
5. FK violation: parent_trace_id "abc" doesn't exist yet
```

**Error:** `insert or update on table "execution_trace" violates foreign key constraint "execution_trace_parent_trace_id_fkey"`

### Impact

Without working `parent_trace_id`:
- **SHGAT learning disabled** for "contains" edges from traces
- Only **structural** contains edges worked (from capability definitions)
- **Learned composition patterns** (capability A calls B) never recorded
- `flattenExecutedPath()` never expanded nested capabilities
- Multi-example training saw flat paths instead of hierarchies

## Decision

### Solution 1: Pre-generate Trace UUID (Server-side)

Generate trace UUID at entry point and propagate it through the execution chain to use as database `id`.

**Files:** `src/sandbox/types.ts`, `src/sandbox/worker-bridge.ts`, `src/mcp/handlers/execute-handler-facade.ts`

```typescript
// Entry point generates ID
const executionTraceId = crypto.randomUUID();

// Passed through chain
bridge.execute(code, tools, context, capCtx, parentTraceId, { traceId: executionTraceId });

// Sandbox uses provided ID
const traceId = msg.traceId ?? crypto.randomUUID();

// Database INSERT uses provided ID
INSERT INTO execution_trace (id, ...) VALUES (COALESCE($1, gen_random_uuid()), ...)
```

### Solution 2: Deferred Trace Flush (Package-side)

Collect traces during execution, sort by dependency, flush only at the end.

**Files:** `packages/pml/src/tracing/syncer.ts`, `packages/pml/src/loader/capability-loader.ts`

```typescript
// TraceSyncer: No auto-flush, explicit only
class TraceSyncer {
  private queue: LocalExecutionTrace[] = [];

  enqueue(trace: LocalExecutionTrace): void { /* add to queue */ }

  sortQueueByDependency(): void {
    // Topological sort: parents before children
    const sorted: LocalExecutionTrace[] = [];
    const visited = new Set<string>();

    const visit = (trace: LocalExecutionTrace) => {
      if (visited.has(trace.traceId)) return;
      // Visit parent first if in queue
      if (trace.parentTraceId) {
        const parent = this.queue.find(t => t.traceId === trace.parentTraceId);
        if (parent) visit(parent);
      }
      visited.add(trace.traceId);
      sorted.push(trace);
    };

    for (const trace of this.queue) visit(trace);
    this.queue = sorted;
  }

  async flush(): Promise<void> { /* flush all in order */ }
}

// CapabilityLoader: Collect in pendingTraces, flush at end
class CapabilityLoader {
  private pendingTraces: LocalExecutionTrace[] = [];

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

### Solution 3: Unified workflowId/traceId

Use the same UUID for both trace tracking and HIL workflow continuation.

**Rationale:** When HIL pause occurs, continuation must use the SAME execution context. Using same ID for both:
- Eliminates ID mismatch between systems
- Preserves trace hierarchy across HIL pause/resume
- Simplifies mental model (one ID = one execution)

```typescript
// SandboxExecutor: Accept optional workflowId
async execute(code, context, clientHandler, workflowId?: string) {
  const traceId = workflowId ?? crypto.randomUUID();
  // ...
}

// CapabilityLoader: Return root workflowId for HIL
private getRootWorkflowId(): string {
  return this.traceIdStack[0] ?? crypto.randomUUID();
}

// approval_required returns workflowId for continuation
return {
  approvalRequired: true,
  workflowId: this.getRootWorkflowId(),
  // ...
};

// Continuation reuses same ID
const result = await executor.execute(code, {}, handler, continueWorkflow.workflowId);
```

### Solution 4: DEFERRABLE FK Constraint

Migration 041 ensures FK constraint allows batch inserts.

**File:** `src/db/migrations/041_parent_trace_id_fk.ts`

```sql
ALTER TABLE execution_trace
ADD CONSTRAINT execution_trace_parent_trace_id_fkey
FOREIGN KEY (parent_trace_id)
REFERENCES execution_trace(id)
ON DELETE SET NULL
DEFERRABLE INITIALLY DEFERRED
```

This allows children to be inserted before parents within the same transaction.

## "Contains" Edges: Two Sources

### Structural (Always Worked)

Based on capability **definition** at creation time:

| File | Source |
|------|--------|
| `db-sync.ts:215` | `workflow_pattern.dag_structure.tools_used` |
| `graph-engine.ts:171` | `addCapabilityIncremental()` |

### Learned (Was Broken, Now Fixed)

Based on **execution traces** with `parent_trace_id`:

| File | Source |
|------|--------|
| `execution-learning.ts:140` | `parentToChildren` map from traces |
| `per-training.ts:415` | `getChildTraces()` for path flattening |

**Before fix:** `parentToChildren` always empty → no learned edges.
**After fix:** Traces with valid `parent_trace_id` → learned composition patterns.

## Implementation

### Files Modified

| Component | Files |
|-----------|-------|
| **Server-side** | `src/sandbox/types.ts`, `src/sandbox/worker-bridge.ts`, `src/sandbox/rpc-router.ts`, `src/mcp/handlers/execute-handler-facade.ts`, `src/capabilities/execution-trace-store.ts` |
| **Package-side** | `packages/pml/src/tracing/syncer.ts`, `packages/pml/src/tracing/types.ts`, `packages/pml/src/loader/capability-loader.ts`, `packages/pml/src/execution/sandbox-executor.ts`, `packages/pml/src/cli/shared/local-executor.ts` |
| **Migration** | `src/db/migrations/041_parent_trace_id_fk.ts` |

### Tests

| File | Tests | Coverage |
|------|-------|----------|
| `packages/pml/tests/trace_deferred_flush_test.ts` | 10 | Deferred flush, dependency sorting, HIL trace hierarchy |
| `tests/unit/db/migrations/041_parent_trace_id_fk_test.ts` | 7 | DEFERRABLE FK batch insert, orphan cleanup, rollback, ON DELETE SET NULL |
| `tests/unit/sandbox/rpc-router-parenttraceid-test.ts` | 8 | parentTraceId propagation through RpcRouter to nested capabilities |
| `tests/unit/capabilities/execution_trace_store_test.ts` | 25+ | Parent-child FK, getChildTraces(), hierarchy building |
| `tests/unit/graphrag/hierarchical_trace_test.ts` | 8 | Contains edges from traces, sibling sequence edges |

### Verification

```sql
-- Before fix
SELECT COUNT(*) FROM execution_trace WHERE parent_trace_id IS NOT NULL;
-- Result: 0

-- After fix
SELECT COUNT(*) FROM execution_trace WHERE parent_trace_id IS NOT NULL;
-- Result: 5 (and growing)

-- No orphans (FK integrity)
SELECT COUNT(*) FROM execution_trace child
WHERE child.parent_trace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM execution_trace parent WHERE parent.id = child.parent_trace_id);
-- Result: 0
```

## Consequences

### Positive

- **SHGAT learning enabled** - "contains" edges now created from execution traces
- **Composition patterns learned** - "CapA calls CapB" recorded in graph
- **HIL-safe** - Traces survive approval pauses without FK violations
- **Unified mental model** - One ID for traces AND workflow continuation

### Negative

- **Increased complexity** - Deferred flush requires careful ordering
- **Memory usage** - Traces held in memory until execution end
- **Auto-flush removed** - Must explicitly call `flushTraces()`

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Memory bloat with many traces | Low | Medium | Execution typically completes quickly |
| Lost traces on crash | Low | Low | Traces are diagnostic, not critical path |
| Sorting bugs | Low | High | Comprehensive test coverage |

## References

- ADR-041: Hierarchical Trace Tracking (original design)
- ADR-027: Execute Code Graph Learning
- Tech-Spec: `_bmad-output/implementation-artifacts/tech-specs/2026-01-22-tech-spec-parent-trace-id-hierarchy.md`
- `src/graphrag/dag/execution-learning.ts` - Learned edge creation
- `src/graphrag/learning/per-training.ts` - Path flattening for SHGAT
