# Tech-Spec: DAG Execution & MCP Client Fixes

**Created:** 2025-12-11
**Status:** Completed
**Completed:** 2025-12-11
**Related ADRs:** ADR-016 (Code Execution), ADR-032 (Worker Bridge)
**Priority:** Critical (P0 for Problem #3)

## Overview

### Problem Statement

The DAG executor and MCP client have three critical issues preventing proper parallel execution:

1. **Gateway uses wrong executor**: `GatewayServer.handleWorkflowExecution()` uses `ParallelExecutor` which doesn't support task type routing. Only `ControlledExecutor` has the logic to handle `code_execution` and `capability` tasks.

2. **WorkerBridge missing dependencies**: `DenoSandboxExecutor` creates `WorkerBridge` without passing `capabilityStore` and `graphRAG`, breaking eager learning and trace collection.

3. **🔴 CRITICAL - MCPClient race condition**: `MCPClient.sendRequest()` has a concurrency bug that causes parallel MCP requests to timeout. The single shared reader blocks concurrent requests, and responses are not matched by request ID.

### Solution

1. **Replace executor in gateway**: Use `ControlledExecutor` instead of `ParallelExecutor` for explicit workflow execution, OR extract task-type routing logic to base executor.

2. **Wire dependencies through sandbox**: Pass `capabilityStore` and `graphRAG` through the execution chain to `WorkerBridge`.

3. **Implement JSON-RPC multiplexer**: Refactor `MCPClient` to use a single reader loop that dispatches responses by matching `response.id` to pending requests.

### Scope

**In Scope:**
- Fix task type routing in DAG execution path
- Wire `capabilityStore` and `graphRAG` to `WorkerBridge`
- **Fix MCPClient concurrent request handling (CRITICAL)**
- Ensure backward compatibility with existing MCP tool execution
- Add tests for `code_execution` tasks in DAG
- Add tests for parallel MCP requests

**Out of Scope:**
- New sandbox features
- Changes to capability learning logic
- Performance optimizations beyond fixing the race condition

## Context for Development

### Codebase Patterns

1. **Executor inheritance**: `ControlledExecutor extends ParallelExecutor`
   - Override pattern: `protected override async executeTask()`
   - Parent delegation: `super.executeTask()` for MCP tools

2. **Dependency injection**: Components receive dependencies via constructor
   - `WorkerBridge(mcpClients, config)` - config includes optional deps
   - `DenoSandboxExecutor(config)` - no external deps currently

3. **Task type routing** (existing in ControlledExecutor:1704-1723):
```typescript
if (taskType === "code_execution") {
  return await this.executeCodeTask(task, previousResults);
} else if (taskType === "capability") {
  return await this.executeCapabilityTask(task, previousResults);
} else {
  return await super.executeTask(task, previousResults);
}
```

4. **JSON-RPC over stdio** (MCPClient pattern):
   - Single process per MCP server
   - Shared stdin/stdout streams
   - Request ID for correlation (currently broken)

### Files to Reference

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `src/mcp/gateway-server.ts` | MCP gateway, workflow execution | 141, 680-734 |
| `src/mcp/client.ts` | **MCP client with race condition** | 241-301 (sendRequest), 328-370 (callTool) |
| `src/dag/executor.ts` | Base parallel executor | 303-368 (executeTask) |
| `src/dag/controlled-executor.ts` | Extended executor with task routing | 1704-1960 |
| `src/sandbox/executor.ts` | Sandbox executor | 909-918 (WorkerBridge creation) |
| `src/sandbox/worker-bridge.ts` | Worker RPC bridge | 47-56 (config interface) |
| `src/graphrag/types.ts` | Task interface definition | 15-64 |

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Option A: Migrate to ControlledExecutor | Already has working code, less risk |
| Backward compat | Maintain ParallelExecutor interface | Zero breaking changes to existing callers |
| Dependency passing | Extend config objects | Follows existing patterns |

## Implementation Plan

### Tasks

- [x] **Task 1**: Update `GatewayServer` to use `ControlledExecutor` for explicit workflows
  - Modify `handleWorkflowExecution()` to create/use ControlledExecutor
  - Ensure `setCodeExecutionSupport()` is called with vectorSearch and contextBuilder
  - File: `src/mcp/gateway-server.ts`

- [x] **Task 2**: Extend `DenoSandboxExecutor` config to accept optional dependencies
  - Add `capabilityStore?: CapabilityStore` to config
  - Add `graphRAG?: GraphRAGEngine` to config
  - Pass to WorkerBridge on creation (line 909)
  - File: `src/sandbox/executor.ts`

- [x] **Task 3**: Wire dependencies through `ControlledExecutor` to sandbox
  - Add setters or constructor params for capabilityStore/graphRAG
  - Pass to DenoSandboxExecutor when creating for code_execution tasks
  - File: `src/dag/controlled-executor.ts`

- [x] **Task 4**: Add integration tests for code_execution in DAG
  - Test: DAG with code_execution task executes in sandbox
  - Test: DAG with mixed MCP + code_execution tasks
  - Test: code_execution task receives context from dependencies
  - File: `tests/dag/code-execution-integration.test.ts`

- [x] **Task 5**: Verify capability task execution works end-to-end
  - Test: capability task retrieves code from store
  - Test: capability task executes with injected context
  - File: `tests/dag/capability-execution.test.ts`

- [x] **Task 6 (CRITICAL)**: Implement JSON-RPC multiplexer in MCPClient
  - Add `pendingRequests: Map<number, { resolve, reject, timeout }>`
  - Create `startReaderLoop()` that runs continuously and dispatches by ID
  - Modify `sendRequest()` to register pending request and return promise
  - Handle connection errors and cleanup pending requests
  - File: `src/mcp/client.ts`

- [x] **Task 7**: Add mutex fallback for safety
  - Implement optional request serialization via mutex
  - Add config flag `allowConcurrentRequests: boolean`
  - Default to multiplexer, fallback to mutex if issues
  - File: `src/mcp/client.ts`

- [x] **Task 8**: Add tests for parallel MCP requests
  - Test: 4 concurrent requests to same server complete successfully
  - Test: Requests to different servers are independent
  - Test: Request timeout doesn't affect other pending requests
  - Test: Connection close cleans up all pending requests
  - File: `tests/mcp/client-concurrency.test.ts`

### Acceptance Criteria

- [x] **AC1**: Given a DAG with `type: "code_execution"` task, when executed via `pml_execute_dag`, then the code runs in sandbox and returns result
- [x] **AC2**: Given a DAG with mixed task types, when executed, then each task routes to correct executor (MCP vs sandbox)
- [x] **AC3**: Given a capability task with `capabilityId`, when executed, then CapabilityStore is queried and code is executed
- [x] **AC4**: Given sandbox execution with graphRAG configured, when code executes, then traces are collected for learning
- [x] **AC5**: Given existing MCP-only workflows, when executed, then behavior is unchanged (backward compatibility)
- [x] **AC6 (CRITICAL)**: Given 4 parallel MCP requests to same server, when executed, then all 4 complete successfully without timeout
- [x] **AC7**: Given parallel requests, when one times out, then other pending requests are not affected
- [x] **AC8**: Given MCPClient with multiplexer, when response arrives, then it is matched to correct pending request by ID

## Additional Context

### Dependencies

- `CapabilityStore` from `src/capabilities/capability-store.ts`
- `GraphRAGEngine` from `src/graphrag/graph-engine.ts`
- `VectorSearch` from `src/vector/search.ts`
- `ContextBuilder` from `src/sandbox/context-builder.ts`

### Testing Strategy

1. **Unit tests**: Mock dependencies, verify routing logic
2. **Integration tests**: Real sandbox execution with test code
3. **E2E tests**: Full MCP call → DAG execution → result

### Error Handling

- If `code_execution` task fails, error should include sandbox error message
- If capability not found in store, throw descriptive error with capabilityId
- Timeout errors should be distinguishable from code errors

### Notes

- The `ControlledExecutor` already has working code for both task types (lines 1711-1723)
- Main issue is that `GatewayServer` uses base `ParallelExecutor` for explicit workflows
- Per-layer validation mode (line 694-699) already creates `ControlledExecutor`
- Consider: Should `ParallelExecutor` be updated to support task types? (More invasive change)

---

## Appendix: MCP Client Race Condition Analysis

### Current Broken Flow (client.ts:241-301)

```
┌─────────────────────────────────────────────────────────────────┐
│ Thread A (Request 1)              Thread B (Request 2)          │
│ ──────────────────────            ──────────────────────        │
│ 1. writer.write(req1)             1. writer.write(req2)         │
│ 2. while(true) {                  2. while(true) {              │
│      reader.read() ← BLOCKS!           reader.read() ← WAITING  │
│    }                                 }                          │
│ 3. parse(response) ← May get      3. ... 10 seconds pass ...   │
│    req2's response!               4. TIMEOUT ERROR              │
│ 4. resolve(wrong response)                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Root Cause

1. **Shared reader**: `this.reader` is shared across all concurrent `sendRequest()` calls
2. **Blocking loop**: Each request does `while(true) { reader.read() }` blocking the stream
3. **No ID matching**: First response received is returned, regardless of `response.id`

### Proposed Fix: Adopt WorkerBridge Pattern

**IMPORTANT**: We already have this exact pattern in `src/sandbox/worker-bridge.ts:88-92`!

```typescript
// FROM worker-bridge.ts - COPY THIS PATTERN
private pendingRPCs: Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}> = new Map();
```

### Implementation Reference (worker-bridge.ts)

| Component | Location | Apply to MCPClient |
|-----------|----------|-------------------|
| Pending map | Line 88-92 | `pendingRequests: Map<number, ...>` |
| Message dispatch | Line 337-342 | `handleResponse()` by ID |
| Cleanup on terminate | Line 527-531 | `close()` cleanup |
| BroadcastChannel | Line 102, 119 | Optional: emit MCP events |
| Sentry spans | `sentry.ts:136` | `startSpan("mcp.call", ...)` |

### Adapted Pattern for MCPClient

```typescript
class MCPClient {
  // Pattern from worker-bridge.ts:88-92
  private pendingRequests = new Map<number, {
    resolve: (response: JSONRPCResponse) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>();
  private readerLoopRunning = false;

  // Start on first request, runs continuously
  private async startReaderLoop(): Promise<void> {
    if (this.readerLoopRunning) return;
    this.readerLoopRunning = true;

    while (this.readerLoopRunning && this.reader) {
      try {
        const response = await this.readNextResponse();
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pending.resolve(response);
          this.pendingRequests.delete(response.id);
        }
      } catch (error) {
        // Connection closed - reject all pending
        this.rejectAllPending(error);
        break;
      }
    }
  }

  private async sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // Ensure reader loop is running
    this.startReaderLoop(); // fire and forget

    await this.writer.write(encode(request));

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new TimeoutError(this.serverId, this.timeout));
      }, this.timeout);

      this.pendingRequests.set(request.id, { resolve, reject, timeoutId });
    });
  }

  // Pattern from worker-bridge.ts:527-531
  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
}
```

### Optional: Add Observability (ADR-036 Pattern)

```typescript
// Emit MCP events like we do for DAG/capability events
import { eventBus } from "../events/mod.ts";

// In sendRequest:
eventBus.emit({
  type: "mcp.call.started",
  source: "mcp-client",
  payload: { serverId, tool, requestId }
});

// In handleResponse:
eventBus.emit({
  type: "mcp.call.completed",
  source: "mcp-client",
  payload: { serverId, tool, requestId, durationMs }
});
```

### Benefits

- ✅ Parallel requests work correctly
- ✅ Each response matched to correct request by ID
- ✅ Timeouts only affect the specific request
- ✅ Connection errors can clean up all pending requests
- ✅ **Proven pattern** - already working in WorkerBridge
- ✅ **Observability ready** - can plug into EventBus (ADR-036)

---

## Appendix: Post-Implementation Bugs Found (Code Review 2025-12-11)

### Bug #1: Missing `intent` Propagation to WorkerBridge

**Severity:** HIGH
**Status:** ✅ Fixed
**File:** `src/dag/controlled-executor.ts`

**Problem:**
Capabilities are never created via eager learning because `task.intent` is not passed to `WorkerBridge`. The eager learning condition in `worker-bridge.ts:263` requires `this.lastIntent` to be set:

```typescript
// worker-bridge.ts:263 - Eager learning only triggers if lastIntent is set
if (result.success && this.capabilityStore && this.lastIntent) {
```

But `executeCodeTask()` builds `executionContext` without including `intent`:
```typescript
// controlled-executor.ts:1949-1952 - MISSING intent!
const executionContext: Record<string, unknown> = {
  ...task.arguments,
};
```

**Fix Applied:**
```typescript
// Pass intent to WorkerBridge for eager learning (Story 7.2a)
if (task.intent) {
  executionContext.intent = task.intent;
}
```

### Bug #2: Obsolete Tool Injection Code (Security Conflict)

**Severity:** HIGH
**Status:** ✅ Fixed
**File:** `src/dag/controlled-executor.ts:1986-1999`

**Problem:**
`executeCodeTask()` had code to inject MCP tools via `contextBuilder.buildContextFromSearchResults()` when `task.intent` is set. This adds **callable functions** to the context, which the sandbox security validator rejects:

```
SecurityError: Security violation detected: FUNCTION_IN_CONTEXT -
Context key 'createRelations' contains function value
```

**Root Cause:**
The tool injection pattern was designed for non-sandboxed execution. The sandbox has its own tool injection mechanism via `DenoSandboxExecutor.executeWithTools()` and `WorkerBridge`.

**Fix Applied:**
Removed the obsolete tool injection block. The `intent` is now passed ONLY for eager learning, not for tool injection.

### Bug #3: Dead Code Cleanup

**Severity:** LOW
**Status:** ✅ Fixed
**Files:**
- `src/dag/controlled-executor.ts`
- `src/mcp/gateway-server.ts`

**Problem:**
After removing the tool injection code, the following were dead code:
- `vectorSearch` and `contextBuilder` private fields
- `setCodeExecutionSupport()` method
- 3 calls to `setCodeExecutionSupport()` in gateway-server.ts
- Imports: `ContextBuilder`, `VectorSearch`, `MCPClient`

**Fix Applied:**
Removed all dead code entirely:
- Deleted `_vectorSearch`, `_contextBuilder` fields
- Deleted `setCodeExecutionSupport()` method
- Removed 3 calls in gateway-server.ts (lines 720, 885, 1495)
- Removed unused imports

**Note:** `setLearningDependencies()` is still required and used for eager learning.

### Bug #4: `executeWithPerLayerValidation` and `handleContinue` Missing Dependencies

**Severity:** HIGH
**Status:** ✅ Fixed
**File:** `src/mcp/gateway-server.ts`

**Problem:**
Both `executeWithPerLayerValidation()` (line 884) and `handleContinue()` (line 1494) were creating `ControlledExecutor` but not calling:
- `setCodeExecutionSupport()`
- `setLearningDependencies()`

This meant `code_execution` and `capability` tasks would fail or not trigger learning.

**Fix Applied:**
```typescript
// Enable code execution support (required for code_execution tasks)
controlledExecutor.setCodeExecutionSupport(this.vectorSearch, this.mcpClients);
// Wire learning dependencies (for eager learning and trace collection)
controlledExecutor.setLearningDependencies(this.capabilityStore, this.graphEngine);
```

### Bug #5: `executeCapabilityTask` Not Fetching Code from Store

**Severity:** MEDIUM
**Status:** ✅ Fixed
**File:** `src/dag/controlled-executor.ts:1783-1803`

**Problem:**
When a capability task had no inline `code` field, it would fail because the code to fetch from `CapabilityStore` was missing.

**Fix Applied:**
```typescript
// Resolve code: use task.code if provided, otherwise fetch from CapabilityStore (AC3)
let capabilityCode = task.code;
if (!capabilityCode) {
  if (!this.capabilityStore) {
    throw new Error(
      `Capability task ${task.id} has no code and CapabilityStore is not configured.`
    );
  }
  const capability = await this.capabilityStore.findById(task.capabilityId);
  if (!capability) {
    throw new Error(`Capability ${task.capabilityId} not found in CapabilityStore`);
  }
  capabilityCode = capability.codeSnippet;
}
```

### Bug #7: `execute()` Missing Eager Learning

**Severity:** HIGH
**Status:** ✅ Fixed
**File:** `src/sandbox/executor.ts:293-314`

**Problem:**
`DenoSandboxExecutor.execute()` (subprocess mode) didn't have eager learning logic. Only `executeWithTools()` (WorkerBridge mode) saved capabilities. Since `executeCodeTask()` uses `execute()`, capabilities were never created.

**Fix Applied:**
Added eager learning to `execute()` mirroring WorkerBridge logic:
```typescript
// 5. Eager Learning: Save capability after successful execution (Story 7.2a)
const intent = context?.intent as string | undefined;
if (this.capabilityStore && intent) {
  await this.capabilityStore.saveCapability({
    code,
    intent,
    durationMs: Math.round(executionTimeMs),
    success: true,
    toolsUsed: [],
  });
}
```

### Bug #8: `durationMs` Float vs Integer

**Severity:** MEDIUM
**Status:** ✅ Fixed
**Files:**
- `src/sandbox/executor.ts:301`
- `src/sandbox/worker-bridge.ts:268`

**Problem:**
`executionTimeMs` is a float (e.g., `43.67673300000024`) but the DB column `avg_duration_ms` is INTEGER. SQL error:
```
invalid input syntax for type integer: "43.67673300000024"
```

**Fix Applied:**
```typescript
durationMs: Math.round(executionTimeMs),
```

### Bug #6: Hypergraph Missing Tool-to-Tool Edges

**Severity:** MEDIUM
**Status:** ✅ Fixed
**File:** `src/capabilities/data-service.ts:318-342`

**Problem:**
The D3 hypergraph visualization wasn't showing edges between tools because `/api/graph/hypergraph` wasn't including tool-to-tool edges from the graph snapshot.

**Fix Applied:**
Added step 5b to copy edges from `graphSnapshot.edges` to the hypergraph response:
```typescript
// 5b. Include tool-to-tool edges from graph snapshot
if (graphSnapshot && graphSnapshot.edges) {
  for (const edge of graphSnapshot.edges) {
    // Only add edges between tools that exist in our nodes
    if (sourceExists && targetExists) {
      hypergraphResult.edges.push({ ... });
    }
  }
}
```
