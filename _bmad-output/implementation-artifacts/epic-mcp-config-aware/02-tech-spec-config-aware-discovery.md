---
title: 'Config-Aware Discovery & Path Filtering'
slug: 'config-aware-discovery'
created: '2026-01-27'
status: 'draft'
stepsCompleted: [1, 2, 3]
epic: 'epic-mcp-config-aware'
sequence: 2
depends_on: ['01-tech-spec-mcp-config-sync']
tech_stack:
  - Deno/TypeScript
  - SHGAT (multi-level-scorer)
  - DRDSP (hyperpath pathfinding)
  - DAGSuggesterAdapter (DI adapter)
files_to_modify:
  - src/graphrag/algorithms/shgat/types.ts
  - src/graphrag/algorithms/dr-dsp.ts
  - src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts
  - src/domain/interfaces/dag-suggester.ts
  - src/graphrag/search/hybrid-search.ts
code_patterns:
  - DAGSuggesterAdapter (SHGAT+DRDSP integration)
  - SHGATScorerInfra interface
  - DRDSPPathfinder interface
  - Clean Architecture (use-cases, adapters, interfaces)
test_patterns:
  - Unit tests in tests/unit/graphrag/
  - Use case tests with mocked dependencies
---

# Tech-Spec 02: Config-Aware Discovery & Path Filtering

**Epic:** MCP Config-Aware System
**Sequence:** 2 of 3
**Depends on:** [01-tech-spec-mcp-config-sync](./01-tech-spec-mcp-config-sync.md)

**Created:** 2026-01-27

## Overview

### Problem Statement

**Contexte:** L'architecture SHGAT + DRDSP existe déjà dans `DAGSuggesterAdapter`, mais le filtrage config-aware est absent.

**Problèmes:**

1. **Pas de filtrage config-aware:** DAGSuggesterAdapter ignore les contraintes de config MCP lors de la suggestion de chemins.

2. **Legacy hybrid-search encore utilisé:** 33 fichiers utilisent encore `hybrid-search.ts`.

### Solution

**Prérequis:** Spec 01 doit être implémentée pour que `observedConfigs` soit peuplé sur les nodes.

**Étendre DAGSuggesterAdapter avec filtrage config-aware:**

```
Intent → SHGAT.scoreAll() → DRDSP.findPaths() → filterByObservedConfigs() → SuggestionResult
                                                        ↓
                                            if (bestPath uses unobserved tool):
                                                return { secondBest, configIncompatibility }
```

**Modèle d'observations (pas de logique négative):**
- On ne peut pas savoir ce qui n'est PAS disponible
- On sait seulement ce qu'on a OBSERVÉ avec quelles configs
- Si un tool n'a jamais été observé avec la config actuelle → incertain, on propose d'essayer

**Changements clés:**

1. **Extension types avec `observedConfigs`:** Sur ToolNode et HypergraphNode (lecture seule, peuplé par Spec 01)

2. **Filtrage hyperpath-level:** Après DRDSP pathfinding, identifier les chemins avec tools non-observés pour la config actuelle.

3. **Extension SuggestionResult:** Ajouter `configIncompatibility` pour communiquer quand un tool n'a pas été observé avec la config actuelle.

4. **Deprecation hybrid-search:** Marquer `@deprecated`, **pas de fallback silencieux**.

### Scope

**In Scope:**
- Extension `ToolNode` et `HypergraphNode` avec `observedConfigs` (type only, peuplement = Spec 01)
- Filtrage hyperpath-level dans `DAGSuggesterAdapter.composeWithDRDSP()`
- Extension `SuggestionResult` avec `configIncompatibility`
- Deprecation formelle de `hybrid-search.ts`

**Out of Scope:**
- Peuplement de `observedConfigs` (Spec 01 via `tool_observations` table)
- HIL `config_permission` (Spec 03)
- Migration des 33 usages de hybrid-search (tracking issue)

## Context for Development

### Codebase Patterns

**1. DAGSuggesterAdapter Pattern**
```typescript
// src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts
async suggest(intent: string): Promise<SuggestionResult> {
  const capResults = this.deps.shgat.scoreAllCapabilities(intentEmbedding);
  const toolResults = this.deps.shgat.scoreAllTools?.(intentEmbedding);
  // → Ajouter filtrage après DRDSP
  return this.composeWithDRDSP(intentEmbedding);
}
```

**2. No Silent Fallback Rule**
```typescript
// Per .claude/rules/no-silent-fallbacks.md
if (!this.deps.shgat) {
  throw new Error("[DAGSuggesterAdapter] SHGAT required");
}
```

### Files to Reference

| File | Purpose | Lines |
| ---- | ------- | ----- |
| `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts` | Point d'intégration | 269-360 |
| `src/graphrag/algorithms/shgat/types.ts` | `ToolNode` interface | 445-451 |
| `src/graphrag/algorithms/dr-dsp.ts` | `HypergraphNode` interface | 46-55 |
| `src/domain/interfaces/dag-suggester.ts` | `SuggestionResult` | - |
| `src/graphrag/search/hybrid-search.ts` | À deprecate | 87-281 |

### Technical Decisions

**TD-001: Filtrage hyperpath-level (pas tool-level)**
- Filtrer les chemins complets après DRDSP pour préserver l'info du meilleur chemin

**TD-002: Pas de fallback silencieux vers hybrid-search**
- Fail-fast per project rules

**TD-003: observedConfigs en lecture seule**
- Cette spec lit `observedConfigs`, Spec 01 le peuple via `tool_observations` table
- Format: `string[][]` — liste des configs (args) avec lesquelles le tool a été observé
- Ex: `[[], ["--api-key"], ["--read-only"]]`

## Implementation Plan

### Tasks

#### Phase 1: Type Extensions

- [ ] **Task 1: Extend ToolNode with observedConfigs**
  - File: `src/graphrag/algorithms/shgat/types.ts`
  - Code:
    ```typescript
    export interface ToolNode {
      id: string;
      embedding: number[];
      toolFeatures?: ToolGraphFeatures;
      /**
       * Configs (args) avec lesquelles ce tool a été observé (discovery).
       * Peuplé par Spec 01 via tool_observations table.
       * Ex: [[], ["--api-key"]] = observé sans args ET avec --api-key
       */
      observedConfigs?: string[][];
    }
    ```

- [ ] **Task 2: Extend HypergraphNode with observedConfigs**
  - File: `src/graphrag/algorithms/dr-dsp.ts`
  - Code:
    ```typescript
    export interface HypergraphNode {
      id: string;
      // ... existing fields
      observedConfigs?: string[][];
    }
    ```

- [ ] **Task 3: Update DRDSP registration methods**
  - File: `src/graphrag/algorithms/dr-dsp.ts`
  - Action: Propager `observedConfigs` lors de la registration des nodes

#### Phase 2: Filtering Logic

- [ ] **Task 4: Add ConfigIncompatibility type**
  - File: `src/domain/interfaces/dag-suggester.ts`
  - Code:
    ```typescript
    export interface ConfigIncompatibility {
      filteredPath: string[];
      incompatibleTools: string[];
      suggestedConfig: {
        namespace: string;
        currentArgs: string[];
        suggestedArgs: string[];
      };
    }
    ```

- [ ] **Task 5: Add checkPathObserved() method**
  - File: `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts`
  - Code:
    ```typescript
    /**
     * Vérifie si tous les tools d'un path ont été observés avec la config actuelle
     * @returns { observed: boolean, unobservedTools: string[] }
     */
    private checkPathObserved(
      path: string[],
      currentArgs: Map<string, string[]>,  // namespace → args
    ): { observed: boolean; unobservedTools: string[] } {
      const unobserved: string[] = [];

      for (const toolId of path) {
        const node = this.graph.getNode(toolId);
        if (!node?.observedConfigs) continue;  // Pas d'info = on assume OK

        const namespace = toolId.split(":")[0];
        const args = currentArgs.get(namespace) || [];

        // Tool observé avec ces args ?
        const wasObserved = node.observedConfigs.some(
          observed => arraysEqual(observed, args)
        );

        if (!wasObserved) {
          unobserved.push(toolId);
        }
      }

      return { observed: unobserved.length === 0, unobservedTools: unobserved };
    }
    ```

- [ ] **Task 6: Integrate filtering in composeWithDRDSP()**
  - File: `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts`
  - Action: Après DRDSP paths, vérifier chaque path avec `checkPathObserved()`

- [ ] **Task 7: Add currentConfig to deps**
  - File: `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts`
  - Code:
    ```typescript
    interface DAGSuggesterAdapterDeps {
      // ... existing
      /** Config actuelle des MCPs du user: namespace → args */
      currentMcpConfig?: Map<string, string[]>;
    }
    ```

#### Phase 3: Deprecation

- [ ] **Task 8: Deprecate hybrid-search.ts**
  - File: `src/graphrag/search/hybrid-search.ts`
  - Add `@deprecated` JSDoc + warning log

#### Phase 4: Tests

- [ ] **Task 9: Unit tests for path filtering**
  - Test `checkPathObserved()` avec différentes combinaisons
- [ ] **Task 10: Unit tests for observedConfigs on nodes**
  - Test registration de nodes avec `observedConfigs`

### Acceptance Criteria

- [ ] **AC-1:** Given tool with `observedConfigs: [["--api-key"]]` and current config `[]` (no args), when suggest() called, then path marked as unobserved and `configIncompatibility` populated.

- [ ] **AC-2:** Given unobserved best path + observed second-best, then return second-best WITH incompatibility info (best path preserved for HIL).

- [ ] **AC-3:** Given unobserved best path + no observed alternative, then `confidence: 0` + incompatibility info.

- [ ] **AC-4:** Given tool without `observedConfigs` (no observations), then treated as available (optimistic default).

- [ ] **AC-5:** Given `searchToolsHybrid()` called, then deprecation warning logged.

## Additional Context

### Dependencies

**Requires:**
- **Spec 01: MCP Config Sync** — pour que `observedConfigs` soit peuplé via `tool_observations` table

**Enables:**
- **Spec 03: Config Permission HIL** — pour réagir au `configIncompatibility`

### Testing Strategy

**Unit Tests:**
- `checkPathObserved()` avec différentes combinaisons de config
- Registration de nodes avec `observedConfigs`

**Integration Tests:**
- Flow complet avec mock data

### Notes

**Modèle d'observations:**
- On ne connaît que ce qu'on a observé (pas de logique négative)
- Si un tool n'a jamais été observé avec une config, on ne sait pas s'il marche → on propose d'essayer (HIL Spec 03)
- Au fil du temps, les observations s'accumulent et améliorent la précision
