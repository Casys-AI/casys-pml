# Spike: Nested Execution Use Case Refactoring

**Date:** 2026-01-22
**Status:** Investigation Required
**Priority:** Medium (clean architecture alignment)

## Problem Statement

When a capability calls another capability (nested execution), the flow bypasses the use case layer and goes directly through `RpcRouter` → `WorkerBridge`. This creates two separate paths for saving traces:

1. **Root execution**: `ExecuteDirectUseCase` → `capabilityRepo.saveCapability()`
2. **Nested execution**: `RpcRouter.executeCapability()` → `WorkerBridge` "eager learning"

This violates clean architecture principles where use cases should be the single point of truth for business logic and persistence.

```
Current Architecture (Two Paths):

┌─────────────────────────────────────────────────────────────────┐
│  pml_execute request                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ExecuteHandlerFacade                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ExecuteDirectUseCase                                           │
│  - Builds DAG                                                   │
│  - Creates ControlledExecutor                                   │
│  - Saves trace via capabilityRepo  ◄── PATH 1 (root)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ControlledExecutor → WorkerBridge → Sandbox                    │
│                                                                 │
│  Code calls: await mcp.namespace.action()                       │
│              (resolves to capability)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (RPC)
┌─────────────────────────────────────────────────────────────────┐
│  RpcRouter.route()                                              │
│  - Detects it's a capability                                    │
│  - Creates NEW WorkerBridge directly (bypasses use case!)       │
│  - WorkerBridge "eager learning" saves trace  ◄── PATH 2       │
└─────────────────────────────────────────────────────────────────┘
```

## Issues with Current Architecture

### 1. Duplicate Save Logic
- `execute-direct.use-case.ts:616-632` saves via `capabilityRepo`
- `worker-bridge.ts:425-442` saves via `capabilityStore` (eager learning)

### 2. Inconsistent Context
- Root: Has full request context (intent, userId, etc.)
- Nested: Only has `{ ...args, __capability_id }` - missing intent!

### 3. Conditional Save in WorkerBridge
```typescript
// worker-bridge.ts:382
if (result.success && this.capabilityStore && this.lastIntent && !hasToolFailures) {
```
Nested execution may not save because `lastIntent` is undefined.

### 4. Testing Difficulty
- Can't easily mock/test nested execution saving
- Two code paths to maintain

## Proposed Solution: NestedExecutionUseCase

Create a dedicated use case for nested capability execution.

```
Proposed Architecture (Single Path):

┌─────────────────────────────────────────────────────────────────┐
│  RpcRouter.route() detects capability                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  NestedExecutionUseCase                                         │
│  - Receives: code, args, capabilityId, parentTraceId            │
│  - Generates childTraceId                                       │
│  - Executes via WorkerBridge (no eager learning)                │
│  - Saves trace via traceRepo with parentTraceId                 │
│  - Returns result                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Interface Design

```typescript
// src/application/use-cases/execute/nested-execution.use-case.ts

export interface NestedExecutionRequest {
  code: string;
  args: Record<string, unknown>;
  capabilityId: string;
  parentTraceId: string;  // Required - always has a parent
  /** Original intent from the capability's workflow_pattern.description */
  intent?: string;
}

export interface NestedExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  traceId: string;  // The child trace ID
  executionTimeMs: number;
}

export class NestedExecutionUseCase {
  constructor(private deps: {
    workerBridgeFactory: IWorkerBridgeFactory;
    traceRepo: IExecutionTraceRepository;
    capabilityStore: ICapabilityStore;  // To get intent from workflow_pattern
  }) {}

  async execute(request: NestedExecutionRequest): Promise<UseCaseResult<NestedExecutionResult>> {
    const childTraceId = crypto.randomUUID();

    // Get intent from capability's workflow_pattern if not provided
    const intent = request.intent ??
      await this.deps.capabilityStore.getIntent(request.capabilityId);

    // Create bridge WITHOUT eager learning
    const [bridge] = this.deps.workerBridgeFactory.create({
      traceId: childTraceId,
      disableEagerLearning: true,  // New flag
    });

    // Execute
    const result = await bridge.execute(
      request.code,
      [],
      request.args,
      undefined,
      request.parentTraceId,
      { traceId: childTraceId },
    );

    // Save trace via repository (single path!)
    await this.deps.traceRepo.saveTrace({
      id: childTraceId,
      capabilityId: request.capabilityId,
      parentTraceId: request.parentTraceId,
      success: result.success,
      durationMs: result.executionTimeMs,
      // ... other fields
    });

    return {
      success: true,
      data: {
        success: result.success,
        result: result.result,
        traceId: childTraceId,
        executionTimeMs: result.executionTimeMs,
      },
    };
  }
}
```

### RpcRouter Changes

```typescript
// src/sandbox/rpc-router.ts

export class RpcRouter {
  constructor(
    private config: RpcRouterConfig,
    private bridgeFactory: WorkerBridgeFactory,
    private nestedExecutionUC?: NestedExecutionUseCase,  // NEW
  ) {}

  private async executeCapability(
    code: string,
    args: Record<string, unknown>,
    capabilityId: string,
    routeType: "cap_uuid" | "capability",
    parentTraceId?: string,
  ): Promise<RpcRouteResult> {
    // NEW: Use the use case if available
    if (this.nestedExecutionUC && parentTraceId) {
      const result = await this.nestedExecutionUC.execute({
        code,
        args,
        capabilityId,
        parentTraceId,
      });

      return {
        success: result.success,
        result: result.data?.result as JsonValue,
        routeType,
      };
    }

    // Fallback to legacy path (backward compat)
    // ... existing code
  }
}
```

### WorkerBridge Changes

**Supprimer complètement le eager learning** (lignes 379-465):

```typescript
// src/sandbox/worker-bridge.ts

// AVANT: WorkerBridge.execute() faisait:
// 1. Exécution du code
// 2. Eager learning (sauvegarde capability + trace)  ← SUPPRIMER
// 3. GraphRAG update

// APRÈS: WorkerBridge.execute() fait seulement:
// 1. Exécution du code
// 2. Retourne le résultat (traces disponibles via getTraces())
// La sauvegarde est la responsabilité du USE CASE appelant
```

Le WorkerBridge devient un **exécuteur pur** - il exécute et collecte les traces, mais ne persiste rien.

## Implementation Plan

1. **Créer `NestedExecutionUseCase`** avec interface propre
2. **Injecter dans `RpcRouter`** via DI
3. **Supprimer eager learning de `WorkerBridge`** (lignes 379-465)
4. **Vérifier que `ExecuteDirectUseCase`** gère bien tous les cas root
5. **Tests** pour valider les deux chemins

## Benefits

1. **Single save path** - All traces saved via use cases (no dual paths)
2. **WorkerBridge = pure executor** - Execute only, no persistence logic
3. **Testable** - Can mock use cases in tests
4. **Consistent context** - Use case fetches intent from capability
5. **Clean architecture** - Use cases handle all business logic
6. **Parent trace ID always populated** - Use case enforces it
7. **No flags/hacks** - Clean refactor, pas de `disableEagerLearning`

## Investigation Tasks

- [ ] Verify `capabilityStore.getIntent(capabilityId)` can retrieve original intent
- [ ] Check if RpcRouter can receive use case via DI
- [ ] Measure performance impact of additional use case layer
- [ ] Identify all callers of `RpcRouter.executeCapability()`
- [ ] Check if `disableEagerLearning` flag breaks any existing behavior

## Related Files

| File | Relevance |
|------|-----------|
| `src/sandbox/rpc-router.ts` | Entry point for nested execution |
| `src/sandbox/worker-bridge.ts` | Eager learning code to remove |
| `src/application/use-cases/execute/` | Use case directory |
| `src/infrastructure/di/` | Dependency injection wiring |
| `src/capabilities/execution-trace-store.ts` | Trace repository |

## Dependencies

- Tech-spec: `2026-01-22-tech-spec-parent-trace-id-hierarchy.md` (UUID mismatch fix)
- ADR-041: Hierarchical Trace Tracking
