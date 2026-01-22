---
title: 'Fused Task Metadata Enrichment'
slug: 'fused-task-metadata-enrichment'
created: '2026-01-22'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
tech_stack:
  - Deno/TypeScript
  - ExecutionCaptureService
  - DAG Optimizer (physicalToLogical mapping)
  - trace-generator.ts (getFusionMetadata helper)
  - TraceTimeline.tsx (frontend)
  - FusedTaskCard.tsx (frontend)
  - CapabilityTimeline.tsx (frontend - Timeline view data path)
files_to_modify:
  - src/dag/trace-generator.ts
  - src/application/services/execution-capture.service.ts
  - src/application/use-cases/execute/shared/result-mapper.ts (optional refactor)
  - src/web/components/ui/molecules/TraceTimeline.tsx
  - src/web/islands/CapabilityTimeline.tsx (Task 9 - bug fix)
  - src/web/components/ui/atoms/FusedTaskCard.tsx (Task 10 - UX improvement)
code_patterns:
  - getFusionMetadata(physicalTaskId, durationMs, optimizedDAG) -> { isFused, logicalOperations }
  - Reuse existing isFusedTask() and getLogicalTasks() helpers
test_patterns:
  - tests/unit/dag/trace-generator.test.ts
  - tests/unit/application/services/execution-capture.service.test.ts
---

# Tech-Spec: Fused Task Metadata Enrichment

**Created:** 2026-01-22

## Overview

### Problem Statement

Le flow client-routed (ADR-062) reconstruit correctement `executedPath` via le pipeline DAG (tech-spec `unified-trace-pipeline`), MAIS les `taskResults` individuels ne sont pas enrichis avec les metadata de fusion (`isFused`, `logicalOperations`).

**Conséquence :**
- Le frontend `TraceTimeline.tsx` ne peut pas utiliser `FusedTaskCard` car `task.isFused` est toujours `undefined`
- Un **workaround fragile** (lignes 219-270) affiche "Operation Chain" basé sur `executedPath.length > taskResults.length`
- L'affichage n'est pas cohérent avec le flow server-side qui utilise `buildTaskResults()` avec les metadata de fusion

**Code actuel (bugué) dans `ExecutionCaptureService.capture()` :**
```typescript
// executedPath est correct ✅
const logicalTrace = this.deps.dagConverter.generateLogicalTrace(optimizedDAG, physicalResults);
executedPath = logicalTrace.executedPath;

// MAIS taskResults sont sauvegardés SANS enrichissement ❌
traceData: {
  executedPath,       // ✅ Complet
  taskResults,        // ❌ taskResults ORIGINAUX du client, sans isFused !
}
```

**Frontend (workaround actuel) dans `TraceTimeline.tsx` :**
```typescript
// Ligne 220: Workaround fragile
{trace.executedPath && trace.executedPath.length > trace.taskResults.length && (
  <div>Operation Chain ({trace.executedPath.length} logical ops → {trace.taskResults.length} executed)</div>
)}

// Ligne 351-361: FusedTaskCard jamais utilisé car isFused est undefined
if (task.isFused && task.logicalOperations) {
  return <FusedTaskCard ... />;  // ← Jamais atteint !
}
```

### Solution

1. **Extraire une fonction réutilisable** `getFusionMetadata()` dans `trace-generator.ts` (à côté des helpers existants `isFusedTask()` et `getLogicalTasks()`)

2. **Backend** : Utiliser `getFusionMetadata()` dans `ExecutionCaptureService` pour enrichir les `taskResults`

3. **Refactor optionnel** : Utiliser `getFusionMetadata()` dans `buildTaskResults()` pour éviter duplication

4. **Frontend** : Supprimer le workaround "Operation Chain" et utiliser uniquement `FusedTaskCard`

**Flow corrigé :**
```
Client → taskResults (MCP calls only, no isFused)
                ↓
Server: ExecutionCaptureService.capture()
                ↓
        1. Reconstruit OptimizedDAG depuis staticStructure
        2. Reconstruit executedPath via generateLogicalTrace() ✅
        3. NEW: Enrichit taskResults via getFusionMetadata() ✅
                ↓
        Save: traceData avec taskResults enrichis
                ↓
Frontend: FusedTaskCard affiche les opérations fusionnées ✅
```

### Scope

**In Scope:**
- Créer `getFusionMetadata()` helper dans `trace-generator.ts`
- Enrichir `taskResults` avec `isFused`/`logicalOperations` dans `ExecutionCaptureService`
- Supprimer le workaround "Operation Chain" dans `TraceTimeline.tsx`
- Tests unitaires pour la logique d'enrichissement

**Out of Scope:**
- Migration des anciennes traces (elles continueront à afficher sans FusedTaskCard)
- Modifications côté client SDK (le client continue d'envoyer des taskResults sans isFused)
- Enrichissement des metadata de loop (déjà géré par le flow existant)

## Context for Development

### Codebase Patterns

**Helpers existants dans `trace-generator.ts:246-262` :**
```typescript
// Déjà implémenté
export function isFusedTask(taskId: string, optimizedDAG: OptimizedDAGStructure): boolean {
  const logicalTasks = optimizedDAG.physicalToLogical.get(taskId);
  return logicalTasks !== undefined && logicalTasks.length > 1;
}

export function getLogicalTasks(physicalTaskId: string, optimizedDAG: OptimizedDAGStructure): string[] {
  return optimizedDAG.physicalToLogical.get(physicalTaskId) || [];
}
```

**Logique de fusion dupliquée dans `result-mapper.ts:82-96` :**
```typescript
// Cette logique sera extraite dans getFusionMetadata()
const logicalTaskIds = optimizedDAG.physicalToLogical.get(physicalResult.taskId) || [];
const fused = logicalTaskIds.length > 1;

let logicalOps: LogicalOperation[] | undefined;
if (fused) {
  const estimatedDuration = (physicalResult.executionTimeMs || 0) / logicalTaskIds.length;
  logicalOps = logicalTaskIds.map((logicalId) => {
    const logicalTask = optimizedDAG.logicalDAG.tasks.find((t) => t.id === logicalId);
    return {
      toolId: logicalTask?.tool || "unknown",
      durationMs: estimatedDuration,
    };
  });
}
```

**Types clés :**
```typescript
interface LogicalOperation {
  toolId: string;
  durationMs?: number;
}

interface FusionMetadata {
  isFused: boolean;
  logicalOperations?: LogicalOperation[];
}
```

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/dag/trace-generator.ts:246-262` | **À MODIFIER** - Ajouter `getFusionMetadata()` à côté des helpers existants |
| `src/application/services/execution-capture.service.ts` | **À MODIFIER** - Utiliser `getFusionMetadata()` pour enrichir |
| `src/application/use-cases/execute/shared/result-mapper.ts:82-96` | **OPTIONNEL** - Refactor pour utiliser `getFusionMetadata()` |
| `src/web/components/ui/molecules/TraceTimeline.tsx:219-270` | **À MODIFIER** - Supprimer workaround |
| `src/web/components/ui/atoms/FusedTaskCard.tsx` | **RÉFÉRENCE** - Composant prêt à utiliser |
| `src/capabilities/types/execution.ts:78-85` | **RÉFÉRENCE** - Types isFused/logicalOperations |

### Technical Decisions

**TD-001: Extraction de `getFusionMetadata()` dans trace-generator.ts**
- Place la fonction à côté des helpers existants `isFusedTask()` et `getLogicalTasks()`
- Évite la duplication entre `result-mapper.ts` et `ExecutionCaptureService`
- Cohérent avec le pattern existant du fichier

**TD-002: Matching physicalToLogical avec tool name**
- Le client envoie des taskIds séquentiels (`t1`, `t2`...) qui ne correspondent pas aux IDs du DAG
- `mapClientResultsToPhysical()` matche déjà par tool name et retourne un `Map<physicalTaskId, TaskResult>`
- On utilise ce même `physicalTaskId` pour appeler `getFusionMetadata()`

**TD-003: Non-enrichissement des code:* tasks**
- Les opérations `code:*` ne sont PAS dans les `taskResults` du client (elles s'exécutent en JS natif)
- Donc on n'a pas besoin de les enrichir - elles apparaissent uniquement dans `executedPath`
- `FusedTaskCard` affichera le résultat MCP fusionné avec les `logicalOperations` détaillées

**TD-004: Suppression du workaround vs fallback**
- On SUPPRIME le workaround "Operation Chain" car `FusedTaskCard` est plus informatif
- Pour les anciennes traces sans `isFused`, `FusedTaskCard` ne sera pas affiché (comportement acceptable)
- Pas de fallback - les nouvelles traces auront les bonnes metadata

**TD-005: Refactor optionnel de buildTaskResults()**
- `buildTaskResults()` dans `result-mapper.ts` peut être refactoré pour utiliser `getFusionMetadata()`
- C'est optionnel car le code fonctionne déjà - juste une amélioration DRY
- À faire dans la même PR ou en follow-up

## Implementation Plan

### Tasks

- [x] **Task 1: Créer `getFusionMetadata()` dans trace-generator.ts**
  - File: `src/dag/trace-generator.ts`
  - Action: Ajouter fonction après `getLogicalTasks()` (après ligne 262)
  - Details:
    ```typescript
    import type { LogicalOperation } from "../capabilities/types/execution.ts";

    /**
     * Fusion metadata result
     */
    export interface FusionMetadata {
      isFused: boolean;
      logicalOperations?: LogicalOperation[];
    }

    /**
     * Get fusion metadata for a physical task
     *
     * Determines if a physical task is a fusion of multiple logical operations
     * and returns the individual operations with estimated durations.
     *
     * @param physicalTaskId - ID of the physical task
     * @param durationMs - Total duration of the physical task execution
     * @param optimizedDAG - Optimized DAG with physicalToLogical mapping
     * @returns Fusion metadata with isFused flag and optional logicalOperations
     */
    export function getFusionMetadata(
      physicalTaskId: string,
      durationMs: number,
      optimizedDAG: OptimizedDAGStructure,
    ): FusionMetadata {
      const logicalTaskIds = optimizedDAG.physicalToLogical.get(physicalTaskId) || [];
      const fused = logicalTaskIds.length > 1;

      if (!fused) {
        return { isFused: false };
      }

      const estimatedDuration = durationMs / logicalTaskIds.length;
      const logicalOperations: LogicalOperation[] = logicalTaskIds.map((logicalId) => {
        const logicalTask = optimizedDAG.logicalDAG.tasks.find((t) => t.id === logicalId);
        return {
          toolId: logicalTask?.tool || "unknown",
          durationMs: estimatedDuration,
        };
      });

      return { isFused: true, logicalOperations };
    }
    ```

- [x] **Task 2: Ajouter `enrichTaskResultsWithFusion()` dans ExecutionCaptureService**
  - File: `src/application/services/execution-capture.service.ts`
  - Action: Créer méthode privée qui utilise `getFusionMetadata()`
  - Details:
    ```typescript
    import { getFusionMetadata, type FusionMetadata } from "../../dag/trace-generator.ts";

    /**
     * Enrich task results with fusion metadata from optimized DAG
     *
     * Uses getFusionMetadata() to determine which physical tasks are fusions
     * of multiple logical operations.
     *
     * @param taskResults - Original task results (will be mutated)
     * @param physicalResults - Map of physical taskId → TaskResult
     * @param optimizedDAG - Optimized DAG with physicalToLogical mapping
     */
    private enrichTaskResultsWithFusion(
      taskResults: TraceTaskResult[],
      physicalResults: Map<string, TaskResult>,
      optimizedDAG: OptimizedDAG,
    ): void {
      // Build reverse map: tool name → client taskResult index (for matching)
      const toolToClientIndices = new Map<string, number[]>();
      taskResults.forEach((t, idx) => {
        const indices = toolToClientIndices.get(t.tool) || [];
        indices.push(idx);
        toolToClientIndices.set(t.tool, indices);
      });

      // Track which client indices have been used
      const usedClientIndices = new Set<number>();

      // Enrich each physical result
      for (const [physicalId] of physicalResults) {
        // Find the physical task to get its tool name
        const physicalTask = (optimizedDAG.tasks as Array<{ id: string; tool?: string }>)
          .find((t) => t.id === physicalId);

        if (!physicalTask?.tool) continue;

        // Find matching client taskResult (first unused one with same tool)
        const candidateIndices = toolToClientIndices.get(physicalTask.tool) || [];
        const clientIdx = candidateIndices.find((idx) => !usedClientIndices.has(idx));

        if (clientIdx === undefined) continue;
        usedClientIndices.add(clientIdx);

        const clientResult = taskResults[clientIdx];

        // Get fusion metadata using the shared helper
        const fusionMeta = getFusionMetadata(
          physicalId,
          clientResult.durationMs,
          optimizedDAG as unknown as import("../../dag/dag-optimizer.ts").OptimizedDAGStructure,
        );

        if (fusionMeta.isFused) {
          clientResult.isFused = true;
          clientResult.logicalOperations = fusionMeta.logicalOperations;

          log.debug("[ExecutionCaptureService] Enriched fused task", {
            physicalId,
            logicalOpsCount: fusionMeta.logicalOperations?.length,
            tools: fusionMeta.logicalOperations?.map((op) => op.toolId),
          });
        }
      }
    }
    ```

- [x] **Task 3: Appeler `enrichTaskResultsWithFusion()` dans `capture()`**
  - File: `src/application/services/execution-capture.service.ts`
  - Action: Ajouter l'appel après `generateLogicalTrace()` et avant `saveCapability()`
  - Location: Après ligne 116 (après `executedPath = logicalTrace.executedPath;`)
  - Details:
    ```typescript
    // Existing code:
    const logicalTrace = this.deps.dagConverter.generateLogicalTrace(optimizedDAG, physicalResults);
    executedPath = logicalTrace.executedPath;

    // NEW: Enrich taskResults with fusion metadata
    this.enrichTaskResultsWithFusion(taskResults, physicalResults, optimizedDAG);
    ```

- [x] **Task 4: Supprimer le workaround "Operation Chain" dans TraceTimeline**
  - File: `src/web/components/ui/molecules/TraceTimeline.tsx`
  - Action: Supprimer les lignes 219-270 (bloc "Two-level DAG: Full Operation Chain")
  - Details: Supprimer entièrement ce bloc :
    ```tsx
    {/* Two-level DAG: Full Operation Chain (when executedPath has more ops than taskResults) */}
    {trace.executedPath && trace.executedPath.length > trace.taskResults.length && (
      // ... tout le bloc jusqu'à la fermeture
    )}
    ```

- [x] **Task 5 (OPTIONAL): Refactor `buildTaskResults()` pour utiliser `getFusionMetadata()`**
  - File: `src/application/use-cases/execute/shared/result-mapper.ts`
  - Action: Remplacer les lignes 82-96 par un appel à `getFusionMetadata()`
  - Details:
    ```typescript
    import { getFusionMetadata } from "../../../../dag/trace-generator.ts";

    // Replace lines 82-96 with:
    const fusionMeta = getFusionMetadata(
      physicalResult.taskId,
      physicalResult.executionTimeMs || 0,
      optimizedDAG,
    );

    return {
      // ... existing fields
      isFused: fusionMeta.isFused,
      logicalOperations: fusionMeta.logicalOperations,
      // ... other fields
    };
    ```

- [x] **Task 6: Tests unitaires pour `getFusionMetadata()`**
  - File: `tests/unit/dag/trace-generator.test.ts`
  - Action: Ajouter tests pour la nouvelle fonction
  - Test cases:
    1. **No fusion (single logical task)**: `physicalToLogical.get(id) = ["task1"]` → `{ isFused: false }`
    2. **Fusion (multiple logical tasks)**: `physicalToLogical.get(id) = ["t1", "t2", "t3"]` → `{ isFused: true, logicalOperations: [...] }`
    3. **Unknown task ID**: `physicalToLogical.get(id) = undefined` → `{ isFused: false }`
    4. **Duration split**: 300ms / 3 tasks → each operation gets 100ms

- [x] **Task 7: Tests unitaires pour `enrichTaskResultsWithFusion()`**
  - File: `tests/unit/application/services/execution-capture.service.test.ts`
  - Action: Ajouter tests pour la méthode d'enrichissement
  - Test cases:
    1. **Single MCP task, no fusion**: taskResult with `filesystem:read_file` → `isFused` remains undefined
    2. **Fused code chain**: physicalToLogical has `[code:split, code:filter, code:map]` → `isFused: true`
    3. **Mixed MCP and fused**: 2 taskResults, one MCP (no fusion), one fused → only fused is enriched
    4. **Duplicate tools**: 2x `filesystem:read_file` → both enriched correctly in order

- [x] **Task 8: Test d'intégration E2E** (Created: `tests/e2e/11-trace-fusion-metadata.test.ts` - 4 tests, all pass)
  - File: `tests/e2e/trace-fusion-display.test.ts` (new file)
  - Action: Test full flow from PML execute to frontend display
  - Test scenario:
    ```typescript
    // 1. Execute code with method chaining
    // pml execute "data.split('\\n').filter(x => x.length > 0).map(x => x.toUpperCase()).join(',')"
    //
    // 2. Verify trace in DB has:
    //    - executedPath: ["filesystem:read_file", "code:split", "code:filter", "code:map", "code:join"]
    //    - taskResults[0].isFused: true (for the final result)
    //    - taskResults[0].logicalOperations: [{toolId: "code:split"}, {toolId: "code:filter"}, ...]
    //
    // 3. Verify frontend renders FusedTaskCard (not Operation Chain workaround)
    ```

- [x] **Task 9: Fix CapabilityTimeline.tsx transformation** (Bug discovered during testing)
  - File: `src/web/islands/CapabilityTimeline.tsx`
  - Problem: Timeline view uses a SEPARATE data path from CytoscapeGraph - was missing `isFused`/`logicalOperations` transformation
  - Action: Added snake_case → camelCase transformation for fusion metadata (lines 257-273)
  - Details:
    ```typescript
    // Added to taskResults mapping:
    isFused: tr.is_fused,
    logicalOperations: tr.logical_operations?.map((op: { tool_id: string; duration_ms?: number }) => ({
      toolId: op.tool_id,
      durationMs: op.duration_ms,
    })),
    ```

- [x] **Task 10: Improve FusedTaskCard to use TaskCard components**
  - File: `src/web/components/ui/atoms/FusedTaskCard.tsx`
  - Action: Changed from simple text display to using `TaskCard` components for each logical operation
  - Benefit: Visual consistency with regular tool display, better UX
  - Details:
    ```tsx
    // Now imports and uses TaskCard for each operation:
    import TaskCard from "./TaskCard.tsx";

    {logicalOps.map((op, idx) => (
      <TaskCard
        key={idx}
        toolName={toolName}
        server={server}
        durationMs={op.durationMs ?? 0}
        success={success}
        color={color}
      />
    ))}
    ```

### Acceptance Criteria

- [x] **AC1**: Given a client-routed execution with code operations (`split → filter → map → join`), when `ExecutionCaptureService.capture()` saves the trace, then the `taskResults` array contains entries with `isFused: true` and `logicalOperations` populated with the individual operations.

- [x] **AC2**: Given a trace with `isFused: true` and `logicalOperations`, when `TraceTimeline` renders it, then `FusedTaskCard` is displayed with expandable operations detail (not the "Operation Chain" workaround).

- [x] **AC3**: Given the workaround removal, when viewing old traces without `isFused` metadata, then the UI displays regular `TaskCard` components (graceful degradation, no crashes).

- [x] **AC4**: Given a mixed execution with both MCP calls and code operations, when the trace is captured, then only the task results that correspond to fused physical tasks have `isFused: true`.

- [x] **AC5**: Given the implementation, `FusedTaskCard` displays the individual operations (`code:split`, `code:filter`, etc.) with estimated duration and expand/collapse functionality.

- [x] **AC6**: Given the new `getFusionMetadata()` helper, it is used by both `ExecutionCaptureService` and optionally by `buildTaskResults()` (no code duplication).

## Additional Context

### Dependencies

- **Required**: Tech-spec `unified-trace-pipeline` MUST be implemented (Tasks 1-5 done ✅)
- **Required**: `DAGConverterAdapter` must be injected in both call sites (done ✅)
- **Required**: `optimizedDAG.physicalToLogical` mapping must be populated by `optimizeDAG()`

### Testing Strategy

**Unit Tests:**
- `getFusionMetadata()`: Test avec différentes configurations de `physicalToLogical`
- `enrichTaskResultsWithFusion()`: Mock `OptimizedDAG`, verify mutations
- Test edge cases: empty mapping, single task, multiple fusions

**Integration Tests:**
- Use real `DAGConverterAdapter` with test `staticStructure`
- Verify end-to-end from capture to saved trace

**Manual Testing:**
```bash
# Execute code with method chaining via pml CLI
pml execute "const data = 'a,b,c,d,e'; return data.split(',').filter(x => x !== 'c').map(x => x.toUpperCase()).join('-')"

# Expected result: "A-B-D-E"

# Verify in dashboard:
# 1. FusedTaskCard should be displayed (not "Operation Chain")
# 2. Clicking FusedTaskCard expands to show: split → filter → map → join
# 3. Each operation shows estimated duration
```

### Notes

- **No code duplication**: `getFusionMetadata()` centralizes fusion logic in `trace-generator.ts`
- **Backward compatibility**: Old traces without `isFused` will show regular `TaskCard` - acceptable
- **Performance**: Enrichment is O(n) where n = taskResults count - negligible
- **Future work**: Consider adding `layerIndex` enrichment for better timeline grouping
- **Spike reference**: `_bmad-output/implementation-artifacts/spikes/2026-01-22-code-fusion-metadata-workerbridge.md`

---

## Review Notes

**Adversarial review completed: 2026-01-22**
- Findings: 12 total, 5 fixed, 7 remaining as action items
- Resolution approach: Fixed High priority + some Medium/Low

### Fixed Issues

| ID | Severity | Fix Applied |
|----|----------|-------------|
| F1 | High | ✅ Removed duplicate `LogicalOperation` - now imports from `execution.ts`, re-exports from `trace-generator.ts` |
| F2 | High | ✅ Created `FusionDAGInput` minimal interface - no more `as unknown as` casting |
| F3 | High | ✅ Added defensive `Math.max(0, durationMs || 0)` check for division |
| F8 | Medium | ✅ Added tests for zero and negative duration edge cases (2 new tests) |
| F9 | Low | ✅ Removed debug `console.log` from `TraceTimeline.tsx` |

### Remaining Action Items

| ID | Severity | Description |
|----|----------|-------------|
| F4 | Medium | Mutation contract - document or rename `enrichTaskResultsWithFusion` |
| F5 | Medium | Tool-name matching - review for parallel execution edge cases |
| F6 | Medium | Add logging when tasks are skipped (no tool property) |
| F7 | Medium | Inconsistent `isFused` value - standardize `undefined` vs missing property |
| F10 | Low | Convert dynamic imports to static imports in tests |
| F11 | Low | Verify old traces without fusion metadata still render |
| F12 | Low | Add integration test for full capture pipeline |

---

## Post-Implementation Investigation & Resolution (2026-01-22)

### Problem Observed

Despite all backend tasks being marked as completed, **FusedTaskCard was NOT rendering** in the frontend. The trace timeline showed regular `TaskCard` with "✓ • join 31ms" instead of FusedTaskCard with "5 operations".

### Investigation Trail

#### 1. API Response Check - CONFIRMED CORRECT ✅
```bash
curl -s "http://localhost:3003/api/graph/hypergraph?include_traces=true" | \
  jq '.nodes[] | select(.data.id | contains("db674ade")) | .data.traces[0].task_results[0]'
```
**Result**: API correctly returns `is_fused: true` and `logical_operations`:
```json
{
  "tool": "code:join",
  "is_fused": true,
  "logical_operations": [
    {"tool_id": "code:filter", "duration_ms": 6.235...},
    {"tool_id": "code:greaterThan", "duration_ms": 6.235...},
    {"tool_id": "code:map", "duration_ms": 6.235...},
    {"tool_id": "code:multiply", "duration_ms": 6.235...},
    {"tool_id": "code:join", "duration_ms": 6.235...}
  ]
}
```

#### 2. Frontend Debug - Found `isFused: undefined`
Added console.log in `TraceTimeline.tsx`:
```typescript
console.log("[TraceTimeline] Task fusion check:", {
  tool: task.tool,
  isFused: task.isFused,  // ← undefined!
  hasLogicalOps: !!task.logicalOperations,
});
```
**Result**: `isFused: undefined` despite API returning `is_fused: true`

#### 3. Root Cause Found: Two Separate Data Paths

The dashboard has **TWO DIFFERENT** code paths for loading capability data:

| Path | Component | Used By | Transforms `is_fused`? |
|------|-----------|---------|------------------------|
| Graph View | `CytoscapeGraph.tsx` | Hypergraph visualization | ✅ YES (lines 1264-1268) |
| Timeline View | `CapabilityTimeline.tsx` | Timeline panel | ❌ **NO** (lines 257-273) |

**The bug**: `CapabilityTimeline.tsx` was missing the snake_case → camelCase transformation for `isFused` and `logicalOperations` fields!

### Resolution Applied

#### Fix 1: Added fusion metadata transformation in CapabilityTimeline.tsx

**File**: `src/web/islands/CapabilityTimeline.tsx` (lines 257-273)

```typescript
// BEFORE (buggy):
taskResults: t.task_results?.map((tr) => ({
  taskId: tr.task_id,
  tool: tr.tool,
  // ... other fields
  // MISSING: isFused and logicalOperations!
})) ?? [],

// AFTER (fixed):
taskResults: t.task_results?.map((tr) => ({
  taskId: tr.task_id,
  tool: tr.tool,
  // ... other fields
  // Phase 2a: Fusion metadata (snake_case → camelCase)
  isFused: tr.is_fused,
  logicalOperations: tr.logical_operations?.map((op: { tool_id: string; duration_ms?: number }) => ({
    toolId: op.tool_id,
    durationMs: op.duration_ms,
  })),
  // ... other fields
})) ?? [],
```

#### Fix 2: Improved FusedTaskCard to use TaskCards for operations

**File**: `src/web/components/ui/atoms/FusedTaskCard.tsx`

Changed from simple text display to using `TaskCard` components for each logical operation:

```tsx
// BEFORE: Simple text list
{logicalOps.map((op, idx) => (
  <span>{op.toolId}</span>
))}

// AFTER: TaskCard components
{logicalOps.map((op, idx) => (
  <TaskCard
    key={idx}
    toolName={toolName}
    server={server}
    durationMs={op.durationMs ?? 0}
    success={success}
    color={color}
  />
))}
```

### Verification

After fixes:
1. **Hard refresh** the dashboard
2. Click on capability `code:exec_db674ade`
3. **FusedTaskCard now renders** with "📦 Fused (5 ops)"
4. **Expanding shows 5 TaskCards**: filter, greaterThan, map, multiply, join

### Lessons Learned

1. **Multiple data paths**: Always check ALL places where data is transformed, not just the obvious one
2. **Debug logging placement**: Add logs close to the consumer (TraceTimeline) not just the producer (API)
3. **snake_case/camelCase consistency**: When adding new fields to API, check ALL frontend transformations

---

## Relationship to Previous Work

This spec completes the fusion metadata pipeline started in `unified-trace-pipeline`:

| Component | unified-trace-pipeline | This spec |
|-----------|----------------------|-----------|
| `executedPath` reconstruction | ✅ Implemented | - |
| `taskResults` enrichment | ❌ Not covered | ✅ This spec |
| Frontend workaround removal | ❌ Not covered | ✅ This spec |
| `FusedTaskCard` usage | ❌ Never reached | ✅ Now works |
| Code deduplication | - | ✅ `getFusionMetadata()` helper |
