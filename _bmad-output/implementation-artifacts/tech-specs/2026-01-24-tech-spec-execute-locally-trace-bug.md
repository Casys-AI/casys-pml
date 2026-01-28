---
title: 'Execute Locally Trace Bug Investigation'
slug: 'execute-locally-trace-bug'
created: '2026-01-24'
updated: '2026-01-24'
status: 'fixed'
tech_stack: ['deno', 'typescript', 'pml-package']
---

# Tech-Spec: Execute Locally Trace Bug Investigation

**Created:** 2026-01-24
**Status:** FIXED
**Symptom:** `WARN [pml:tracing] Partial sync: 0/1 - errors: Invalid trace: missing capabilityId (required when no workflowId)`

## Problem Statement

When executing code via `pml_execute` with client-routed tools (execute_locally flow), the trace sync fails because the trace has neither `capabilityId` nor `workflowId`.

### Error Log

```
[02:19:45.110] [DEBUG] [loader] Capability loaded (FQDN): pml.mcp.std.crypto_hash.3cd9
[02:19:45.115] [DEBUG] [loader] Direct execution trace added: 9cbd717b-edc3-400f-8301-cd1214aec9a1 (workflowId: none)
WARN [pml:tracing] Partial sync: 0/1 - errors: Invalid trace: missing capabilityId (required when no workflowId)
```

## Root Cause (CONFIRMED)

Per ADR-065, `workflowId` and `traceId` are **unified** - the same ID should be used for both:
- **Server:** Generates `workflowId`, stores `LearningContext`, returns `workflowId` in `execute_locally` response
- **Client:** Should use this `workflowId` as `traceId` in SandboxExecutor

**The Bug:** The `workflowId` from server response (`execLocally.workflowId`) was never passed to `executeLocalCode()`, so the sandbox generated a NEW random `traceId` that didn't match the server's `workflowId`.

```
Server generates: workflowId = "abc-123", stores LearningContext
Server returns: { workflowId: "abc-123", ... }
Client receives: execLocally.workflowId = "abc-123"
Client DOES NOT pass it to executeLocalCode() ❌
Sandbox generates: traceId = crypto.randomUUID() → "xyz-789" (NEW!)
Trace sent with: traceId = "xyz-789", workflowId = undefined
Server looks for LearningContext with "xyz-789" → NOT FOUND
Trace rejected: "missing capabilityId (required when no workflowId)"
```

## Fix Implemented

### 1. `packages/pml/src/cli/shared/local-executor.ts`

Added `serverWorkflowId` parameter and unified ID handling:

```typescript
export async function executeLocalCode(
  code: string,
  loader: CapabilityLoader | null,
  cloudUrl: string,
  fqdnMap: Map<string, string>,
  continueWorkflow?: ContinueWorkflowParams,
  logger?: Logger,
  serverWorkflowId?: string,  // NEW: Server workflowId for ADR-065
): Promise<LocalExecutionResult> {

  // ADR-065: Unified workflowId/traceId
  // Priority: HIL continuation > server-provided > generate new
  const workflowId = continueWorkflow?.workflowId ?? serverWorkflowId;

  const result = await executor.execute(
    code,
    {},
    clientHandler,
    workflowId,  // Passed to sandbox → becomes traceId
  );

  // Pass workflowId to trace for LearningContext lookup
  loader.enqueueDirectExecutionTrace(
    result.traceId,
    success,
    durationMs,
    error,
    toolCallRecords,
    workflowId,  // NEW: 6th argument
  );
}
```

### 2. `packages/pml/src/cli/stdio-command.ts`

Pass server workflowId to executeLocalCode:

```typescript
const localResult = await executeLocalCode(
  execLocally.code,
  loader,
  cloudUrl,
  fqdnMap,
  continueWorkflow,
  stdioLogger,
  execLocally.workflowId,  // NEW: Server workflowId
);
```

Also removed duplicate trace creation (was creating trace twice - once in local-executor.ts, once here).

### 3. Fixed obsolete `flushIntervalMs` option

Removed deprecated option from TraceSyncer initialization (ADR-065: explicit flush only, no auto-flush timer).

## Files Modified

| File | Changes |
|------|---------|
| `packages/pml/src/cli/shared/local-executor.ts` | Added `serverWorkflowId` param, unified ID handling, pass to `enqueueDirectExecutionTrace()` |
| `packages/pml/src/cli/stdio-command.ts` | Pass `execLocally.workflowId`, remove duplicate trace, fix `flushIntervalMs` |

## Verification

After fix, the flow is:

```
Server generates: workflowId = "abc-123", stores LearningContext ✅
Server returns: { workflowId: "abc-123", ... } ✅
Client receives: execLocally.workflowId = "abc-123" ✅
Client passes to executeLocalCode(serverWorkflowId = "abc-123") ✅
Sandbox uses: traceId = workflowId = "abc-123" ✅
Trace sent with: traceId = "abc-123", workflowId = "abc-123" ✅
Server finds LearningContext with "abc-123" ✅
Capability created! ✅
```

## Related

- **ADR-065:** Deferred Trace Flush with Unified workflowId/traceId
- **ADR-041:** Hierarchical Trace Tracking with parent_trace_id
- **Commit e474769d:** feat: client-routed capability creation via ExecutionCaptureService
