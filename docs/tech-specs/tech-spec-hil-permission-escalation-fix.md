# Tech-Spec: HIL Permission Escalation Architecture Fix

**Created:** 2025-12-16
**Status:** ✅ Implemented
**Updated:** 2025-12-17
**Related Stories:** 2.5-3, 7.7a, 7.7b, 7.7c

## Overview

### Problem Statement

The Human-in-the-Loop (HIL) mechanism for permission escalation in DAG execution is broken due to an architectural deadlock. When a `code_execution` or `capability` task encounters a permission error in the Deno sandbox, it emits a `decision_required` event and waits for approval. However, the event can never reach the client because:

1. Tasks execute inside `Promise.allSettled()` in the main generator
2. The generator cannot `yield` events while waiting for `Promise.allSettled` to resolve
3. `waitForDecisionCommand()` blocks indefinitely waiting for a response that can never arrive
4. Result: **Deadlock**

Additionally, the legacy `sideEffects: true` HIL mechanism from Story 2.5-3 is redundant with the new permission system from Story 7.7 and should be removed.

### Solution

Implement the **Deferred Escalation Pattern**:

1. Tasks throw a special `PermissionEscalationNeeded` error instead of blocking
2. `Promise.allSettled` catches these as rejections
3. After the layer completes, process escalation requests at the layer boundary
4. Yield `decision_required` events, wait for approval, re-execute approved tasks
5. Remove legacy `sideEffects` mechanism entirely

### Scope

**In Scope:**
- Fix HIL for `code_execution` tasks
- Fix HIL for `capability` tasks
- Remove `sideEffects` flag and related code
- Remove `shouldRequireApproval()` and `generateHILSummary()`
- Remove HIL config from ExecutorConfig (`hil.enabled`, `hil.approval_required`)
- Update gateway-server.ts to remove HIL config

**Out of Scope:**
- AIL (Agent-in-the-Loop) mechanism - unchanged
- Checkpoint/resume functionality - unchanged
- Permission escalation logic itself - only the delivery mechanism changes

## Context for Development

### Codebase Patterns

**Event Emission Pattern (current - broken for mid-task):**
```typescript
// In executeStream() - this works
const event: ExecutionEvent = { type: "task_complete", ... };
await this.eventStream.emit(event);
yield event;  // ✅ Works - we're in the generator

// In executeCodeTask() - this DOESN'T work
await this.eventStream.emit(escalationEvent);  // Event goes to array
const command = await this.waitForDecisionCommand();  // ❌ BLOCKS - generator can't yield
```

**Deferred Escalation Pattern (new - solution):**
```typescript
// In executeCodeTask() - throw instead of block
throw new PermissionEscalationNeeded({
  taskId: task.id,
  currentSet: "minimal",
  requestedSet: "network-api",
  detectedOperation: "net",
  originalError: error,
});

// In executeStream() layer processing - handle after Promise.allSettled
const escalationsNeeded = layerResults
  .filter(r => r.status === "rejected" && r.reason instanceof PermissionEscalationNeeded);

for (const escalation of escalationsNeeded) {
  // Now we CAN yield because we're back in the generator
  yield { type: "decision_required", ... };
  const command = await this.waitForDecisionCommand();
  if (command.approved) {
    // Re-execute task with escalated permissions
  }
}
```

### Files to Reference

#### Already Modified (Pre-Spec Implementation)

| File | Changes Made | Status |
|------|--------------|--------|
| `src/dag/controlled-executor.ts` | HIL logic in executeCodeTask, ~120 lines | 🔄 Needs refactor (throw instead of block) |
| `src/dag/types.ts` | checkpointId + context on decision_required event | ✅ Keep |
| `src/mcp/gateway-server.ts` | decision_required handler + hil config | 🔄 Keep handler, remove hil config |
| `src/events/types.ts` | capability.permission.updated event | ✅ Keep |
| `docs/epics.md` | Stories 7.7a/b/c documentation | ✅ Keep |
| `docs/sprint-artifacts/sprint-status.yaml` | Story 7.7c status | 🔄 Update |
| `docs/sprint-artifacts/story-2.5-3.md` | Bug documentation | ✅ Keep |

#### To Modify (Implementation Phase)

| File | Purpose |
|------|---------|
| `src/dag/controlled-executor.ts` | Refactor to Option A/B pattern |
| `src/dag/types.ts` | Add PermissionEscalationNeeded error, remove sideEffects from ExecutorConfig |
| `src/mcp/gateway-server.ts` | Remove hil config from ControlledExecutor instantiation |
| `src/graphrag/types.ts` | Remove Task.sideEffects field |
| `src/capabilities/permission-escalation-handler.ts` | Update HIL callback interface (if Option B) |

#### Reference Only (No Changes)

| File | Purpose |
|------|---------|
| `src/dag/event-stream.ts` | Event streaming architecture reference |
| `src/sandbox/executor.ts` | DenoSandboxExecutor reference |
| `src/capabilities/permission-escalation.ts` | suggestEscalation() reference |

### Technical Decisions

**Decision pending** - 4 architectural options documented below. Final choice TBD.

---

## ADR: HIL Permission Escalation Delivery Mechanism

### Context

The HIL mechanism for permission escalation in DAG execution has a deadlock bug. When a task needs permission escalation, it emits a `decision_required` event and waits for approval. However, the event never reaches the client because the generator cannot yield while `Promise.allSettled()` is waiting.

### Options

#### Option A: Deferred Escalation Pattern (Error-Based)

**Approach:** Tasks throw `PermissionEscalationNeeded` error, handled at layer boundary after `Promise.allSettled`.

```typescript
// In executeCodeTask() - throw instead of block
throw new PermissionEscalationNeeded({
  taskId: task.id,
  currentSet: "minimal",
  requestedSet: "network-api",
});

// After Promise.allSettled - handle escalations
for (const escalation of escalationsNeeded) {
  yield { type: "decision_required", ... };
  const command = await waitForDecisionCommand();
  if (approved) re-execute task;
}
```

| Aspect | Assessment |
|--------|------------|
| **Complexity** | Low - ~200 lines |
| **Risk** | Low - uses existing error handling |
| **UX** | Prompt after layer tasks attempt execution |
| **Concurrency** | Preserved via Promise.allSettled |
| **Multiple Escalations** | ✅ Handles multiple in same layer |

**Pros:** Simple, low risk, fits existing architecture
**Cons:** Slight delay before user sees approval request

---

#### Option B: Async Event Buffer with Custom Executor

**Approach:** Replace `Promise.allSettled` with a custom concurrent executor that can yield events mid-execution.

```typescript
// Custom executor that yields events as they happen
for await (const event of concurrentTaskExecutor(layer)) {
  if (event.type === "decision_required") {
    yield event;  // ✅ Immediate yield!
    const command = await waitForDecisionCommand();
    executor.signal(event.taskId, command);  // Resume/abort task
  } else {
    yield event;
  }
}
```

| Aspect | Assessment |
|--------|------------|
| **Complexity** | High - ~400-500 lines, new abstraction |
| **Risk** | Medium - new execution model |
| **UX** | Prompt immediately when needed |
| **Concurrency** | Preserved with fine-grained control |
| **Multiple Escalations** | ✅ Handles with proper ordering |

**Pros:** Clean event-driven design, immediate UX, extensible for future mid-task events
**Cons:** More code, new patterns to learn, potential race conditions

---

#### Option C: Sequential Task Execution (Rejected)

**Approach:** Execute tasks one-by-one instead of in parallel.

```typescript
for (const task of layer) {
  const result = await executeTask(task);  // One at a time
  yield events...
}
```

| Aspect | Assessment |
|--------|------------|
| **Complexity** | Low |
| **Risk** | Low |
| **Performance** | ❌ **Terrible** - loses 5x parallelization speedup |

**Verdict:** ❌ Rejected - defeats the purpose of DAG parallelization

---

#### Option D: Hybrid - Isolate Permission-Sensitive Tasks

**Approach:** Tasks with `sandboxConfig.permissionSet !== "trusted"` execute sequentially, others in parallel.

```typescript
const [trustedTasks, riskyTasks] = partition(layer, t => t.sandboxConfig?.permissionSet === "trusted");

// Run trusted tasks in parallel
await Promise.allSettled(trustedTasks.map(executeTask));

// Run risky tasks sequentially (can yield mid-execution)
for (const task of riskyTasks) {
  try {
    await executeTask(task);
  } catch (e) {
    if (e instanceof PermissionEscalationNeeded) {
      yield decision_required;
      // handle...
    }
  }
}
```

| Aspect | Assessment |
|--------|------------|
| **Complexity** | Medium - ~300 lines |
| **Risk** | Medium |
| **UX** | Immediate for risky tasks only |
| **Concurrency** | Partial - trusted tasks parallel, risky sequential |

**Pros:** Compromise between A and B, targets the problem specifically
**Cons:** Two execution paths to maintain, "risky" classification may be wrong

---

### Decision Matrix

| Criteria (Weight) | Option A | Option B | Option C | Option D |
|-------------------|----------|----------|----------|----------|
| Implementation Effort (20%) | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Risk (25%) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Performance (25%) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| Maintainability (15%) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| UX Quality (15%) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Weighted Score** | **4.1** | **3.4** | **3.2** | **3.4** |

### Decision

**TBD** - Options A and B are both viable:
- **Option A** if prioritizing low risk and quick delivery
- **Option B** if prioritizing clean architecture and UX

---

## Implementation Plan

### Tasks

- [ ] **Task 1**: Create `PermissionEscalationNeeded` error class
  - File: `src/dag/types.ts` or new `src/dag/errors.ts`
  - Properties: taskId, taskType, currentSet, requestedSet, detectedOperation, originalError, context

- [ ] **Task 2**: Modify `executeCodeTask()` to throw instead of block
  - Remove `waitForDecisionCommand()` call
  - Remove direct event emission for escalation
  - Throw `PermissionEscalationNeeded` with full context

- [ ] **Task 3**: Modify `executeCapabilityTask()` to throw instead of block
  - Update `PermissionEscalationHandler.hilCallback` to throw
  - Or refactor to not use callback pattern

- [ ] **Task 4**: Add escalation handling in `executeStream()` layer loop
  - After `Promise.allSettled`, filter for `PermissionEscalationNeeded` rejections
  - For each: yield `decision_required`, wait for command, re-execute if approved
  - Track re-executed tasks to update layer results

- [ ] **Task 5**: Same escalation handling in `resumeFromCheckpoint()` layer loop
  - Mirror the logic from Task 4

- [ ] **Task 6**: Remove legacy `sideEffects` HIL mechanism
  - Delete `shouldRequireApproval()` method
  - Delete `generateHILSummary()` method
  - Remove HIL config block (lines 1374-1450 approximately)
  - Remove `sideEffects` from Task type in `src/graphrag/types.ts`

- [ ] **Task 7**: Clean up ExecutorConfig
  - Remove `hil` field from `ExecutorConfig` in `src/dag/types.ts`
  - Update gateway-server.ts to remove HIL config from ControlledExecutor instantiation

- [ ] **Task 8**: Update tests
  - Add unit tests for `PermissionEscalationNeeded` error handling
  - Add integration test for full HIL flow via DAG
  - Remove/update tests for `sideEffects` mechanism

- [ ] **Task 9**: Documentation
  - Update Story 2.5-3 to mark sideEffects as removed
  - Update Story 7.7c with the new architecture

### Acceptance Criteria

- [ ] **AC1**: `code_execution` task with permission error returns `approval_required` to PML client
  ```
  Given: DAG with code_execution task that requires network access
  When: Task executes with "minimal" permission set
  Then: Client receives { status: "approval_required", decision_type: "HIL", ... }
  ```

- [ ] **AC2**: Approved escalation re-executes task successfully
  ```
  Given: approval_required returned for permission escalation
  When: Client sends approval_response with approved: true
  Then: Task re-executes with escalated permissions and completes
  ```

- [ ] **AC3**: Rejected escalation fails task gracefully
  ```
  Given: approval_required returned for permission escalation
  When: Client sends approval_response with approved: false
  Then: Task marked as failed, workflow continues (if other tasks independent)
  ```

- [ ] **AC4**: `capability` task escalation works identically
  ```
  Given: DAG with capability task that hits permission error
  When: PermissionEscalationHandler suggests escalation
  Then: Same approval_required flow as code_execution
  ```

- [ ] **AC5**: Legacy sideEffects mechanism fully removed
  ```
  Given: Task with sideEffects: true
  When: Executed in DAG
  Then: No HIL triggered (field ignored/removed)
  ```

- [ ] **AC6**: No deadlock under any permission error scenario
  ```
  Given: Any combination of permission errors in a layer
  When: Errors occur during execution
  Then: All events reach client, no infinite waits
  ```

## Changes Already Made (Pre-Spec)

These changes were made during initial debugging before this spec was created. They are **partial fixes** that need to be completed or revised:

### 1. `src/dag/controlled-executor.ts` (~120 lines added)
- Extended `executeCodeTask()` to accept `permissionSet` parameter
- Added permission error detection (PermissionError, PermissionDenied, NotCapable)
- Integration with `suggestEscalation()` to determine needed permissions
- HIL checkpoint creation with `decision_required` event emission
- **PROBLEM**: Still uses blocking `waitForDecisionCommand()` pattern - causes deadlock
- **ACTION**: Refactor to throw `PermissionEscalationNeeded` instead

### 2. `src/dag/types.ts` (~4 lines added)
- Added `checkpointId?: string` to ExecutionEvent `decision_required` type
- Added `context?: Record<string, unknown>` for escalation details
- **STATUS**: Keep - these additions are needed for the fix

### 3. `src/mcp/gateway-server.ts` (~80 lines added)
- Added `decision_required` event handler in both event loops (lines ~940 and ~1730)
- Returns `approval_required` status to client with checkpoint_id and context
- Added `"awaiting_approval"` to `ActiveWorkflow.status` union type
- Added `hil: { enabled: true, approval_required: "critical_only" }` to ControlledExecutor configs
- **STATUS**: Keep decision_required handlers, **REMOVE** hil config (sideEffects mechanism)

### 4. `src/events/types.ts` (~1 line added)
- New event type: `capability.permission.updated`
- **STATUS**: Keep - useful for observability

### 5. `docs/epics.md` (~189 lines added)
- Full documentation for Stories 7.7a, 7.7b, 7.7c
- **STATUS**: Keep - update after fix complete

### 6. `docs/sprint-artifacts/sprint-status.yaml` (~1 line changed)
- Story 7.7c status: backlog → review
- **STATUS**: Update to reflect this spec

### 7. `docs/sprint-artifacts/story-2.5-3.md` (~144 lines added)
- Critical bug documentation discovered during debugging
- Documents that `decision_required` events were never wired up
- **STATUS**: Keep as historical record, update with resolution

### Summary of Pre-Spec State

| Change | Keep/Remove/Modify |
|--------|-------------------|
| decision_required handler in gateway-server | ✅ Keep |
| checkpointId/context in types | ✅ Keep |
| executeCodeTask HIL logic | 🔄 Modify (throw instead of block) |
| hil config in gateway-server | ❌ Remove |
| capability.permission.updated event | ✅ Keep |

## Additional Context

### Dependencies

- Story 7.7a/b/c: Permission system foundation (complete)
- Story 2.5-3: Original HIL/AIL architecture (to be modified)
- PML gateway-server: Client communication (already has decision_required handler)

### Testing Strategy

1. **Unit Tests**:
   - `PermissionEscalationNeeded` error serialization
   - Layer-level escalation detection logic
   - Re-execution with updated permissions

2. **Integration Tests**:
   - Full DAG with code_execution needing network → approval → success
   - Full DAG with capability needing filesystem → rejection → failure
   - Multi-task layer with mixed escalation needs

3. **Security Regression Tests** (already exist):
   - `tests/dag/checkpoint-resume-security.test.ts` - 6 tests validating H4 fix
   - Currently failing due to deadlock bug - will pass once this spec is implemented
   - Tests verify: HIL required on resume, rejection aborts workflow, AIL triggers, timeout handling
   - **Bugs exposed:**
     - `BUG-HIL-DEADLOCK`: HIL tests timeout (generator can't yield before blocking)
     - `BUG-AIL-ABORT`: AIL abort command not processed (same deadlock pattern)

4. **Manual Testing**:
   - Via PML `execute_dag` with explicit workflow containing permission-requiring tasks
   - Verify `approval_required` status returned
   - Verify `approval_response` tool works

### Rollback Plan

If issues arise:
1. Revert to blocking pattern (current broken state)
2. Add `--allow-all` flag to sandbox as temporary workaround
3. Use `approvalMode: "auto"` in PermissionConfig for trusted capabilities

### Notes

**Why not use EventStream.subscribe()?**
The EventStream's `subscribe()` method returns an async iterator, but the problem is that `executeStream()` IS the generator - we can't have a generator yield from events that happen inside its own synchronous execution. The deferred pattern solves this by moving HIL handling to a point where the generator has control.

**Performance Impact:**
Minimal. The extra error handling and re-execution only happens on permission errors, which should be rare in production after initial capability learning.

**Migration:**
No migration needed. The `sideEffects` field was never widely used. Capabilities continue to work with their stored `permissionSet`.
