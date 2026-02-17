# Tech Spec: Client-Routed Capability Creation

**Date:** 2026-01-13
**Status:** Ready for Implementation
**Author:** PML Team

---

## Problem Statement

When all tools in a `pml_execute` request are client-routed, the server returns `execute_locally` and the client executes the code locally. However, **no capability is created** because:

1. `saveCapability()` is never called (early return at line 324-342 of `execute-direct.use-case.ts`)
2. `capabilityRegistry.create()` is never called
3. The client has no mechanism to signal successful execution back to the server

### Current Flow (Broken)

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. Client → Server: pml_execute({ code, intent })                 │
│                                                                     │
│  2. Server: Analyzes code, detects client-routed tools             │
│     → Returns { status: "execute_locally", code, toolsUsed }       │
│     ⚠️ NO saveCapability() called                                  │
│     ⚠️ NO capabilityRegistry.create() called                       │
│                                                                     │
│  3. Client: Executes code locally                                  │
│     → Success/failure result                                       │
│     ⚠️ NO trace sent to server                                     │
│                                                                     │
│  4. Result returned to Claude → END                                │
│     ⚠️ Capability never created                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Solution Overview

Use the **existing `WorkflowStateCache`** (Deno KV with TTL) to store analysis data before returning `execute_locally`. The existing `LearningContext` interface already contains most of what we need. Client sends execution results via existing `TraceSyncer`.

### Key Discovery: Existing Infrastructure

We already have:

1. **`WorkflowStateCache`** (`src/cache/workflow-state-cache.ts`)
   - Deno KV with automatic 1-hour TTL
   - `saveWorkflowState(workflowId, dag, intent, learningContext)`
   - `getWorkflowStateRecord(workflowId)` → returns `learningContext`

2. **`LearningContext`** interface (already defined):
   ```typescript
   interface LearningContext {
     code: string;
     intent: string;
     staticStructure: StaticStructure;
     intentEmbedding?: number[];
   }
   ```

3. **`TraceSyncer`** (`packages/pml/src/tracing/syncer.ts`)
   - Already sends `LocalExecutionTrace` to `/api/traces`
   - Batch sync with retry logic

### Target Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SERVER                              │  CLIENT                     │
├──────────────────────────────────────┼─────────────────────────────┤
│                                      │                             │
│  1. Analyze code                     │                             │
│     → staticStructure                │                             │
│     → toolsUsed                      │                             │
│                                      │                             │
│  2. Generate workflowId (UUID)       │                             │
│                                      │                             │
│  3. saveWorkflowState() with:        │                             │
│     learningContext: {               │                             │
│       code, intent,                  │                             │
│       staticStructure,               │                             │
│       toolsUsed  ← NEW               │                             │
│     }                                │                             │
│                                      │                             │
│  4. Return execute_locally ──────────┼──► 5. Parse workflowId      │
│     + workflowId                     │                             │
│                                      │  6. Execute code locally    │
│                                      │     → taskResults           │
│                                      │     → durationMs            │
│                                      │     → success               │
│                                      │                             │
│  8. /api/traces receives  ◄──────────┼─── 7. TraceSyncer.enqueue() │
│     trace with workflowId            │       { workflowId,         │
│                                      │         success,            │
│                                      │         durationMs,         │
│                                      │         taskResults }       │
│                                      │                             │
│  9. If success && workflowId:        │                             │
│     - getWorkflowStateRecord()       │                             │
│     - saveCapability()               │                             │
│     - capabilityRegistry.create()    │                             │
│     - deleteWorkflowState()          │                             │
│                                      │                             │
└──────────────────────────────────────┴─────────────────────────────┘
```

---

## Data Flow Analysis

### What the Server Has (at analysis time)

| Data | Source | Stored in LearningContext |
|------|--------|---------------------------|
| `code` | Original request | ✅ Already supported |
| `intent` | Original request | ✅ Already supported |
| `staticStructure` | `staticStructureBuilder.buildStaticStructure()` | ✅ Already supported |
| `intentEmbedding` | `embeddingModel.encode()` | ✅ Already supported |
| `toolsUsed` | Extracted from optimized DAG | ❌ **Must be added** |

### What the Client Has (after execution)

| Data | Source | Sent via Trace |
|------|--------|----------------|
| `success` | Execution result | ✅ Already in `LocalExecutionTrace` |
| `durationMs` | Measured | ✅ Already in `LocalExecutionTrace` |
| `taskResults` | Collected during execution | ✅ Already in `LocalExecutionTrace` |
| `workflowId` | Received from server | ❌ **Must be added** |

### What's Needed for Capability Creation

**1. `saveCapability()` (workflow_pattern table):**

```typescript
await capabilityRepo.saveCapability({
  code,              // ← learningContext
  intent,            // ← learningContext
  durationMs,        // ← trace
  success: true,     // ← trace
  toolsUsed,         // ← learningContext (NEW field)
  traceData: {
    taskResults,     // ← trace
    executedPath,    // ← derived from taskResults
    decisions,       // ← inferred via staticStructureBuilder.inferDecisions()
    initialContext: { intent },
    intentEmbedding, // ← learningContext
    userId,          // ← from request context
  },
  staticStructure,   // ← learningContext
});
```

**2. `capabilityRegistry.create()` (pml_registry table):**

```typescript
await capabilityRegistry.create({
  org: scope.org,           // ← derived from userId
  project: scope.project,   // ← derived from userId
  namespace,                // ← computed from toolsUsed[0]
  action,                   // ← computed: exec_${hash.substring(0,8)}
  workflowPatternId,        // ← result of saveCapability()
  hash,                     // ← computed from code
  userId,                   // ← from request context
  toolsUsed,                // ← learningContext
});
```

---

## Implementation Details

### 1. Add `toolsUsed` to `LearningContext`

**File:** `src/cache/workflow-state-cache.ts`

```typescript
export interface LearningContext {
  /** Original TypeScript code */
  code: string;
  /** Original intent text */
  intent: string;
  /** Static structure from SWC analysis */
  staticStructure: import("../capabilities/types.ts").StaticStructure;
  /** Pre-computed intent embedding for similarity search */
  intentEmbedding?: number[];
  /** Tools used in the code (for capability registration) */
  toolsUsed?: string[];  // ← NEW
  /** User ID for multi-tenant isolation */
  userId?: string;  // ← NEW
}
```

### 2. Add `workflowId` to `LocalExecutionTrace`

**File:** `packages/pml/src/tracing/types.ts`

```typescript
export interface LocalExecutionTrace {
  /** Workflow ID for pending capability finalization (client-routed execution) */
  workflowId?: string;  // ← NEW

  capabilityId: string;
  success: boolean;
  error?: string;
  durationMs: number;
  taskResults: TraceTaskResult[];
  decisions: BranchDecision[];
  timestamp: string;
  userId?: string;
}
```

### 3. Modify `execute-direct.use-case.ts`

**File:** `src/application/use-cases/execute/execute-direct.use-case.ts`

```typescript
import { saveWorkflowState } from "../../cache/workflow-state-cache.ts";

// In execute(), around line 324-342:
if (isPackageClient) {
  // Generate workflowId for correlation
  const workflowId = crypto.randomUUID();

  // Store learning context in Deno KV (1 hour TTL)
  await saveWorkflowState(
    workflowId,
    optimizedDAG,  // DAG structure
    intent,
    {
      code,
      intent,
      staticStructure,
      toolsUsed,
      userId: this.userId ?? undefined,
    }
  );

  log.info("[ExecuteDirectUseCase] Stored learning context for client execution", {
    workflowId,
    toolsUsed,
  });

  return {
    success: true,
    data: {
      success: true,
      mode: "execute_locally",
      workflowId,  // ← NEW: include for correlation
      code,
      toolsUsed,
      clientTools,
      executionTimeMs: performance.now() - startTime,
      dag: {
        mode: "dag",
        tasksCount: logicalDAG.tasks.length,
        layersCount: 0,
        toolsDiscovered: toolsUsed,
      },
    },
  };
}
```

### 4. Create `ExecutionCaptureService` (NOUVEAU)

**File:** `src/application/services/execution-capture.service.ts`

Extrait et factorise le code de `workflow-execution-handler.ts:685-779`.

```typescript
/**
 * ExecutionCaptureService
 *
 * Captures successful executions as capabilities.
 * Used by:
 * - HIL flow (workflow-execution-handler.ts)
 * - Client-routed flow (api/traces.ts)
 */

import type { LearningContext } from "../../cache/workflow-state-cache.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../capabilities/capability-registry.ts";
import type { TraceTaskResult } from "../../capabilities/types/mod.ts";
import { getUserScope } from "../../lib/user.ts";

export interface ExecutionCaptureInput {
  learningContext: LearningContext;
  durationMs: number;
  taskResults: TraceTaskResult[];
  userId?: string;
}

export interface ExecutionCaptureDeps {
  capabilityStore: CapabilityStore;
  capabilityRegistry?: CapabilityRegistry;
}

export interface ExecutionCaptureResult {
  capability: { id: string; codeHash: string };
  fqdn?: string;
  created: boolean;  // false si déjà existant (via hash)
}

export class ExecutionCaptureService {
  constructor(private readonly deps: ExecutionCaptureDeps) {}

  async capture(input: ExecutionCaptureInput): Promise<ExecutionCaptureResult | null> {
    const { learningContext: ctx, durationMs, taskResults, userId } = input;

    // Extract tools from task results
    const executedPath = taskResults
      .filter(t => t.success)
      .map(t => t.tool);

    const toolsUsed = ctx.toolsUsed ?? executedPath;

    // 1. Save to workflow_pattern (UPSERT via hash)
    const { capability } = await this.deps.capabilityStore.saveCapability({
      code: ctx.code,
      intent: ctx.intent,
      durationMs: Math.round(durationMs),
      success: true,
      toolsUsed,
      traceData: {
        executedPath,
        taskResults,
        decisions: [],
        initialContext: { intent: ctx.intent },
        intentEmbedding: ctx.intentEmbedding,
        userId: ctx.userId ?? userId,
      },
      staticStructure: ctx.staticStructure,
    });

    let fqdn: string | undefined;
    let created = true;

    // 2. Register in pml_registry (if not exists)
    if (this.deps.capabilityRegistry) {
      const scope = await getUserScope(userId ?? null);
      const codeHash = capability.codeHash;

      // Check if already registered
      const existingRecord = await this.deps.capabilityRegistry.getByCodeHash(codeHash, scope);

      if (!existingRecord) {
        const firstTool = toolsUsed[0] ?? "misc";
        const namespace = firstTool.includes(":") ? firstTool.split(":")[0] : "code";
        const action = `exec_${codeHash.substring(0, 8)}`;
        const hash = codeHash.substring(0, 4);

        const record = await this.deps.capabilityRegistry.create({
          org: scope.org,
          project: scope.project,
          namespace,
          action,
          workflowPatternId: capability.id,
          hash,
          userId: userId ?? ctx.userId,
          toolsUsed,
        });

        fqdn = record.id;
      } else {
        fqdn = existingRecord.id;
        created = false;
      }
    }

    return { capability, fqdn, created };
  }
}
```

### 5. Modify `/api/traces.ts`

**File:** `src/api/traces.ts`

Appeler `ExecutionCaptureService` quand `workflowId` est présent.

```typescript
import { getWorkflowStateRecord, deleteWorkflowState } from "../cache/workflow-state-cache.ts";
import { ExecutionCaptureService } from "../application/services/execution-capture.service.ts";

// Add to IncomingTrace interface:
interface IncomingTrace {
  workflowId?: string;  // ← NEW
  capabilityId: string;
  // ... existing fields
}

// In handleTracesPost, after processing each trace:
if (incoming.workflowId && incoming.success) {
  const workflowRecord = await getWorkflowStateRecord(incoming.workflowId);

  if (workflowRecord?.learningContext) {
    const captureService = new ExecutionCaptureService({
      capabilityStore,
      capabilityRegistry,
    });

    const result = await captureService.capture({
      learningContext: workflowRecord.learningContext,
      durationMs: incoming.durationMs,
      taskResults: incoming.taskResults,
      userId: workflowRecord.learningContext.userId,
    });

    // Cleanup from KV
    await deleteWorkflowState(incoming.workflowId);

    if (result) {
      logger.info("Capability captured from client execution", {
        workflowId: incoming.workflowId,
        capabilityId: result.capability.id,
        fqdn: result.fqdn,
        created: result.created,
      });
    }
  } else {
    logger.warn("Learning context not found for workflowId", {
      workflowId: incoming.workflowId,
    });
  }
}
```

### 6. Refactor `workflow-execution-handler.ts`

**File:** `src/mcp/handlers/workflow-execution-handler.ts`

Remplacer le code inline (lignes 685-779) par un appel au service.

```typescript
import { ExecutionCaptureService } from "../../application/services/execution-capture.service.ts";

// Remplacer lignes 685-779 par:
if (learningContext && deps.capabilityStore && (event.failedTasks ?? 0) === 0) {
  try {
    const captureService = new ExecutionCaptureService({
      capabilityStore: deps.capabilityStore,
      capabilityRegistry: deps.capabilityRegistry,
    });

    const result = await captureService.capture({
      learningContext,
      durationMs: event.totalTimeMs ?? 0,
      taskResults: layerResults.map(r => ({
        taskId: r.taskId,
        tool: dag.tasks.find(t => t.id === r.taskId)?.tool ?? r.taskId,
        args: dag.tasks.find(t => t.id === r.taskId)?.arguments ?? {},
        result: r.output ?? null,
        success: r.status === "success",
        durationMs: r.executionTimeMs ?? 0,
      })),
      userId,
    });

    if (result) {
      log.info("[HIL] Capability captured", {
        workflowId,
        capabilityId: result.capability.id,
        fqdn: result.fqdn,
        created: result.created,
      });
    }
  } catch (error) {
    log.warn("[HIL] Failed to capture capability", { error: String(error) });
  }
}
```

### 5. Modify Client to Send Trace with `workflowId`

**File:** `packages/pml/src/cli/stdio-command.ts`

```typescript
// Update parseExecuteLocallyResponse to extract workflowId:
function parseExecuteLocallyResponse(
  content: string,
): {
  status: string;
  code: string;
  client_tools: string[];
  workflowId?: string;  // ← NEW
} | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.status === "execute_locally" && parsed.code) {
      return {
        status: parsed.status,
        code: parsed.code,
        client_tools: parsed.client_tools ?? parsed.clientTools ?? [],
        workflowId: parsed.workflowId,  // ← NEW
      };
    }
    return null;
  } catch {
    return null;
  }
}

// After successful local execution (around line 750):
if (localResult.status === "success" && executeLocally.workflowId) {
  // Send trace to finalize capability creation
  const trace: LocalExecutionTrace = {
    workflowId: executeLocally.workflowId,
    capabilityId: "",  // Not yet known - will be created server-side
    success: true,
    durationMs: executionDurationMs,
    taskResults: collectedTaskResults,
    decisions: [],
    timestamp: new Date().toISOString(),
  };

  // Enqueue trace for async sync to server
  traceSyncer.enqueue(trace);

  logDebug(`Trace queued for capability finalization: ${executeLocally.workflowId}`);
}
```

---

## Files to Modify

### Server (src/) - 6 fichiers

| # | File | Action | Lignes |
|---|------|--------|--------|
| 1 | `src/cache/workflow-state-cache.ts` | EDIT | Ajouter `toolsUsed`, `userId` à `LearningContext` (~5 lignes) |
| 2 | `src/application/services/execution-capture.service.ts` | **NEW** | Créer service (~80 lignes) |
| 3 | `src/application/use-cases/execute/execute-direct.use-case.ts` | EDIT | Stocker `LearningContext`, retourner `workflowId` (~15 lignes) |
| 4 | `src/api/traces.ts` | EDIT | Appeler `ExecutionCaptureService` si `workflowId` (~20 lignes) |
| 5 | `src/mcp/handlers/workflow-execution-handler.ts` | REFACTOR | Remplacer code inline par appel service (~-80/+20 lignes) |
| 6 | `src/mcp/server/types.ts` | EDIT | Sync `LearningContext` avec celui de cache (~2 lignes) |

### Client (packages/pml/) - 2 fichiers

| # | File | Action | Lignes |
|---|------|--------|--------|
| 7 | `packages/pml/src/tracing/types.ts` | EDIT | Ajouter `workflowId?` à `LocalExecutionTrace` (~1 ligne) |
| 8 | `packages/pml/src/cli/stdio-command.ts` | EDIT | Parser `workflowId`, envoyer trace après exécution (~15 lignes) |

**Total: 8 fichiers (1 nouveau, 7 modifiés)**

---

## Ordre d'Implémentation

### Phase 1: Service (serveur)
1. `src/cache/workflow-state-cache.ts` - Étendre `LearningContext`
2. `src/mcp/server/types.ts` - Sync l'interface
3. `src/application/services/execution-capture.service.ts` - Créer le service

### Phase 2: Refactor HIL (serveur)
4. `src/mcp/handlers/workflow-execution-handler.ts` - Utiliser le service
5. **TEST**: Vérifier que le flow HIL fonctionne toujours

### Phase 3: Client-routed flow (serveur + client)
6. `src/application/use-cases/execute/execute-direct.use-case.ts` - Stocker + retourner `workflowId`
7. `packages/pml/src/tracing/types.ts` - Ajouter `workflowId`
8. `packages/pml/src/cli/stdio-command.ts` - Parser + envoyer trace
9. `src/api/traces.ts` - Appeler `ExecutionCaptureService`
10. **TEST**: Flow complet client-routed

---

## Advantages of Using Existing Infrastructure

1. **No new store to create** - `WorkflowStateCache` already exists with Deno KV
2. **Automatic TTL** - 1 hour expiration handled by Deno KV natively
3. **No cleanup code needed** - KV handles expiration automatically
4. **Persistence across restarts** - Deno KV is persisted (unlike in-memory Map)
5. **`LearningContext` already defined** - Just need to add `toolsUsed`
6. **`TraceSyncer` already works** - Just add `workflowId` field

---

## Edge Cases

### 1. Learning Context Expires Before Trace Arrives
- TTL: 1 hour (Deno KV automatic)
- If expired: log warning, trace stored as standalone (no capability created)
- User can re-execute if needed

### 2. Execution Fails on Client
- Client sends trace with `success: false`
- Server receives trace but does NOT create capability (only successful executions)
- Learning context still deleted to prevent stale data

### 3. Duplicate Traces
- Same `workflowId` sent twice
- First trace creates capability, deletes learning context
- Second trace: learning context not found, logged as warning
- No duplicate capability due to hash-based UPSERT in `saveCapability()`

---

## Testing Strategy

### Unit Tests

1. `LearningContext` with `toolsUsed` - serialization/deserialization
2. `execute-direct.use-case.ts` - returns `workflowId` when client-routed
3. `traces.ts` - creates capability when `workflowId` present

### Integration Tests

1. Full flow: `pml_execute` → client execution → trace → capability created
2. Verify capability appears in registry with correct FQDN
3. Verify `workflow_pattern` entry has correct data

### Manual Testing

```bash
# Execute code with client-routed tool
pml execute "await mcp.filesystem.read_file({ path: '/tmp/test.txt' })"

# Verify capability was created
pml capabilities list --recent
```

---

## References

- `src/cache/workflow-state-cache.ts` - Existing WorkflowStateCache with LearningContext
- `src/application/use-cases/execute/execute-direct.use-case.ts` - Current execute flow
- `packages/pml/src/tracing/syncer.ts` - TraceSyncer implementation
- `packages/pml/src/workflow/pending-store.ts` - Similar pattern for HIL approvals
