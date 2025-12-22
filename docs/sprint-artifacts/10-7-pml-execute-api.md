# Story 10.7: pml_execute - Unified Execution API with DR-DSP + SHGAT

Status: ready-for-dev

> **Epic:** 10 - DAG Capability Learning & Unified APIs
> **Tech-Spec:** [epic-10-dag-capability-learning-unified-apis.md](../epics/epic-10-dag-capability-learning-unified-apis.md)
> **Spike:** [2025-12-21-capability-pathfinding-dijkstra.md](../spikes/2025-12-21-capability-pathfinding-dijkstra.md)
> **ADR:** [ADR-050-unified-search-simplification.md](../adrs/ADR-050-unified-search-simplification.md)
> **Prerequisites:** Story 10.6 (pml_discover - DONE)
> **Merges:** Story 10.7a (DR-DSP Integration), Story 10.7b (SHGAT Scoring)
> **Depends on:** ControlledExecutor, CapabilityStore, StaticStructureBuilder, WorkerBridge, DRDSP, SHGAT
> **Estimation:** 6-8 jours (DR-DSP + SHGAT integration)

---

## Story

As an AI agent,
I want a single `pml_execute` tool that handles code execution with automatic learning,
So that I have a simplified API and the system learns from my executions.

---

## Context & Problem

**Le gap actuel:**

| Tool actuel | Ce qu'il fait | Quand l'utiliser |
|-------------|---------------|------------------|
| `pml_execute_dag` | Exécute un workflow DAG explicite | Quand Claude a un DAG JSON |
| `pml_execute_code` | Exécute du code TypeScript dans le sandbox | Quand Claude veut écrire du code |

**Problèmes :**
1. **Fragmentation cognitive** - L'IA doit décider quel tool utiliser
2. **DAG JSON verbeux** - Format `{ tasks: [...], $OUTPUT[id] }` non naturel
3. **Pas de réutilisation** - Le code exécuté n'est pas automatiquement appris
4. **Dijkstra limité** - Ne comprend pas les hyperedges (capabilities)

**Solution : `pml_execute` avec DR-DSP**

Un seul tool avec **2 modes** + **DR-DSP** pour le pathfinding hypergraph :

| Mode | Trigger | Flow |
|------|---------|------|
| **Direct** | `intent` + `code` | Exécute → Apprend (crée capability) |
| **Suggestion** | `intent` seul | DR-DSP → Confiance haute? Exécute : Suggestions |

---

## Design Principles

- **Code-first**: Tout est du code TypeScript. Le DAG est inféré via analyse statique
- **Le code contient son context**: Les arguments sont des littéraux dans le code (pas de param `context` séparé)
- **DR-DSP pour hypergraph**: Remplace Dijkstra, comprend les capabilities comme hyperedges
- **2 modes simples**: Direct (code) vs Suggestion (intent seul)

---

## API Design

```typescript
pml_execute({
  intent: string,     // REQUIRED - natural language description

  code?: string,      // OPTIONAL - TypeScript code to execute
                      // Si présent: Mode Direct (exécute + apprend)
                      // Si absent: Mode Suggestion (DR-DSP → exécute ou suggestions)

  options?: {
    timeout?: number;                // default: 30000ms
    per_layer_validation?: boolean;  // default: false (server décide)
  }
})
```

### Les 2 Modes d'Exécution

```
┌─────────────────────────────────────────────────────────────────────┐
│  pml_execute({ intent, code? })                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   code fourni?    │
                    └─────────┬─────────┘
                    ┌─────────┴─────────┐
                   OUI                 NON
                    │                   │
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │   MODE DIRECT    │  │ MODE SUGGESTION  │
         │ (exécute+apprend)│  │    (DR-DSP)      │
         └────────┬─────────┘  └────────┬─────────┘
                  │                     │
                  ▼                     ▼
         1. Analyse statique    1. DR-DSP.findShortestHyperpath()
            (SWC)               2. Capability/DAG trouvé?
         2. Exécute code           │
         3. Crée capability    ┌───┴───┐
                  │           OUI     NON
                  │            │       │
                  │            ▼       ▼
                  │       Confiance   RETURN
                  │       haute?      suggestions
                  │        │   │
                  │       OUI NON
                  │        │   │
                  │        ▼   ▼
                  │     Exécute RETURN
                  │     capability suggestions
                  │        │
                  │        ▼
                  │     Update usage_count++
                  │     (pas de nouvelle cap)
                  │        │
                  └────────┴────────┐
                                    ▼
                              RETURN result
```

| Input | Mode | Algo | Ce qui se passe |
|-------|------|------|-----------------|
| `intent` + `code` | **Direct** | SWC | Exécute → Crée capability |
| `intent` seul | **Suggestion** | DR-DSP | Trouve → Exécute si confiance haute, sinon suggestions |

### Response Format

```typescript
interface ExecuteResponse {
  status: "success" | "approval_required" | "suggestions";

  // Mode success
  result?: JsonValue;
  capabilityId?: string;      // ID de capability créée (direct) ou utilisée (suggestion)
  mode?: "direct" | "speculation";
  executionTimeMs?: number;

  // Mode approval_required (per-layer validation)
  workflowId?: string;
  checkpointId?: string;
  pendingLayer?: number;
  layerResults?: TaskResult[];

  // Mode suggestions (DR-DSP n'a pas trouvé ou confiance basse)
  suggestions?: {
    tools: ToolWithSchema[];
    capabilities: CapabilityMatch[];
    suggestedDag?: DAGStructure;  // DAG suggéré par DR-DSP
  };

  // Errors
  tool_failures?: Array<{ tool: string; error: string }>;

  // DAG metadata
  dag?: {
    mode: "dag" | "sandbox";
    tasksCount?: number;
    layersCount?: number;
    speedup?: number;
    toolsDiscovered?: string[];
  };
}
```

---

## Acceptance Criteria

### AC1: Handler pml_execute créé
- [ ] Créer `src/mcp/handlers/execute-handler.ts`
- [ ] Handler `handleExecute(args, deps)` avec signature unifiée
- [ ] Input validation: `intent` required, `code` optional
- [ ] Export dans `src/mcp/handlers/mod.ts`

### AC2: Tool Definition créée
- [ ] Ajouter `executeTool` dans `src/mcp/tools/definitions.ts`
- [ ] Schema d'input avec intent (required), code (optional), options (optional)
- [ ] Ajouter à `getMetaTools()` array

### AC3: Mode Direct implémenté (`intent + code`)
- [ ] Analyse statique du code via `StaticStructureBuilder` (Story 10.1)
- [ ] Exécute via WorkerBridge (Story 10.5 architecture unifiée)
- [ ] Crée/update capability avec `static_structure` après succès
- [ ] Utilise `hashCode()` pour déduplication
- [ ] Retourne `capabilityId` dans la response
- [ ] **Exécute toujours** - pas de check confiance (l'IA a fourni du code explicite)

### AC4: Mode Suggestion implémenté (`intent` seul) avec DR-DSP
- [ ] Initialise `DRDSP` avec `buildDRDSPFromCapabilities()` au démarrage gateway
- [ ] Appelle `DRDSP.findShortestHyperpath()` pour trouver capability/DAG
- [ ] **Si trouvé avec confiance > seuil + canSpeculate():**
  - Exécute la capability trouvée
  - Update `usage_count++` et `success_rate` après exécution
  - **PAS de nouvelle capability créée** (réutilisation)
  - Retourne `status: "success"` avec `mode: "speculation"`
- [ ] **Si pas de match ou confiance < seuil:**
  - Retourne `status: "suggestions"` avec tools + capabilities + suggestedDag

### AC5: DR-DSP Integration (merge 10.7a)
- [ ] `DRDSP` instance créée au démarrage du gateway
- [ ] `buildDRDSPFromCapabilities()` appelé avec graph existant
- [ ] Hyperedges créés depuis les capabilities (tools groupés)
- [ ] `applyUpdate()` appelé quand une nouvelle capability est apprise (mode Direct)
- [ ] Benchmark: DR-DSP vs Dijkstra (log performance)

### AC6: SHGAT Scoring Integration (merge 10.7b)
- [ ] `SHGAT` instance créée au démarrage avec `createSHGATFromCapabilities()`
- [ ] **Mode Suggestion (backward):** SHGAT score les chemins DR-DSP **sans context** (`contextTools=[]`)
  - Features utilisées: semantic, pageRank, spectralCluster, cooccurrence, reliability
  - Le context n'est qu'un boost optionnel (×0.3)
- [ ] **Mode Prediction (forward):** SHGAT score les candidats `predictNextNode()` **avec context**
- [ ] Pipeline training connecté à `episodic_events`:
  - Au démarrage: charge traces récentes, train initial
  - Après chaque exécution: `trainBatch()` incrémental
- [ ] Params SHGAT persistés (export/import JSON via table `shgat_params`)
- [ ] Fallback: si pas assez de traces (<20), utiliser scoring DR-DSP seul
- [ ] Benchmark: latence scoring SHGAT < 10ms

### AC7: Support per_layer_validation
- [ ] Server-side validation detection (comme workflow-execution-handler)
- [ ] Retourne `approval_required` avec `workflowId` et `checkpointId`
- [ ] Compatible avec `pml:control` pour continue/abort

### AC8: Dépréciation des anciens tools
- [ ] `pml_execute_dag` : ajouter deprecation notice dans description
- [ ] `pml_execute_code` : ajouter deprecation notice dans description
- [ ] Log warning quand les anciens tools sont utilisés
- [ ] Les anciens tools continuent de fonctionner (backward compat)

### AC9: Enregistrement dans GatewayServer
- [ ] Importer `handleExecute` dans `gateway-server.ts`
- [ ] Ajouter case `"pml:execute"` dans `handleToolCall()`
- [ ] Initialiser DRDSP + SHGAT au démarrage
- [ ] Passer les dépendances nécessaires

### AC10: Tests unitaires
- [ ] Test: execute avec code → mode direct + capability créée
- [ ] Test: execute avec intent seul + DR-DSP match haute confiance → exécute
- [ ] Test: execute avec intent seul + DR-DSP match basse confiance → suggestions
- [ ] Test: execute avec intent seul + pas de match → suggestions
- [ ] Test: mode direct → capability avec `static_structure` inféré
- [ ] Test: mode suggestion → PAS de SWC parsing, juste usage_count++
- [ ] Test: DR-DSP trouve hyperpath vs Dijkstra échoue
- [ ] Test: SHGAT scoring backward (sans context, contextTools=[])
- [ ] Test: SHGAT scoring forward (avec context)
- [ ] Test: SHGAT fallback si <20 traces

### AC11: Tests d'intégration
- [ ] Test E2E: appel MCP `pml:execute` via gateway - mode direct
- [ ] Test E2E: appel MCP `pml:execute` via gateway - mode suggestion avec exécution
- [ ] Test E2E: appel MCP `pml:execute` via gateway - mode suggestion retourne suggestions
- [ ] Test: dépréciation logged quand `pml_execute_dag` utilisé
- [ ] Benchmark: latence DR-DSP < 50ms
- [ ] Benchmark: latence SHGAT scoring < 10ms

---

## Tasks / Subtasks

- [ ] **Task 1: Créer le handler execute** (AC: 1)
  - [ ] Créer `src/mcp/handlers/execute-handler.ts`
  - [ ] Implémenter `handleExecute()` function
  - [ ] Détection du mode: Direct (`code` présent) vs Suggestion (`code` absent)
  - [ ] Input validation (intent required)

- [ ] **Task 2: Implémenter Mode Direct** (AC: 3)
  - [ ] Réutiliser logique de `handleExecuteCode()` (code-execution-handler.ts)
  - [ ] Analyse statique via `StaticStructureBuilder`
  - [ ] Exécution via WorkerBridge
  - [ ] Créer capability après succès via `CapabilityStore.save()`
  - [ ] Appeler `DRDSP.applyUpdate()` pour mettre à jour le graphe

- [ ] **Task 3: Implémenter Mode Suggestion avec DR-DSP** (AC: 4, 5)
  - [ ] Initialiser DRDSP au démarrage gateway (`buildDRDSPFromCapabilities()`)
  - [ ] Appeler `DRDSP.findShortestHyperpath(intent)`
  - [ ] Si match avec confiance haute + canSpeculate():
    - Exécuter capability via WorkerBridge
    - Update `capabilityStore.updateUsage()`
  - [ ] Si pas de match:
    - Appeler `handleDiscover({ intent })` pour suggestions
    - Retourner DAG suggéré si disponible

- [ ] **Task 4: Ajouter la tool definition** (AC: 2, 9)
  - [ ] Ajouter `executeTool` dans `definitions.ts`
  - [ ] Définir inputSchema: intent (required), code (optional), options (optional)
  - [ ] Ajouter à `getMetaTools()` array
  - [ ] Enregistrer dans `gateway-server.ts` handleToolCall

- [ ] **Task 5: Intégrer SHGAT** (AC: 6)
  - [ ] Initialiser SHGAT au démarrage gateway avec `createSHGATFromCapabilities()`
  - [ ] Intégrer scoring SHGAT dans mode Suggestion (backward, sans context)
  - [ ] Intégrer scoring SHGAT dans `predictNextNode()` (forward, avec context)
  - [ ] Créer training pipeline:
    - Au démarrage: charger traces récentes, `trainBatch()` initial
    - Après chaque exécution: `trainBatch()` incrémental
  - [ ] Persister params SHGAT (table `shgat_params` ou JSON)
  - [ ] Implémenter fallback si <20 traces → scoring DR-DSP seul

- [ ] **Task 6: Déprécier les anciens tools** (AC: 8)
  - [ ] Ajouter "[DEPRECATED]" au début des descriptions
  - [ ] Ajouter note de migration vers `pml_execute`
  - [ ] Ajouter log.warn() quand les anciens handlers sont appelés

- [ ] **Task 7: Support per_layer_validation** (AC: 7)
  - [ ] Réutiliser logique de `requiresValidation()` de workflow-execution-handler
  - [ ] Retourner `approval_required` avec workflow context

- [ ] **Task 8: Tests** (AC: 10, 11)
  - [ ] Créer `tests/unit/mcp/handlers/execute_handler_test.ts`
  - [ ] Tests unitaires pour chaque mode (10+ tests incluant SHGAT)
  - [ ] Tests d'intégration avec GatewayServer
  - [ ] Benchmark DR-DSP vs Dijkstra
  - [ ] Benchmark SHGAT < 10ms

---

## Dev Notes

### ATTENTION: Analyse statique selon le mode

| Mode | Analyse statique SWC | Pourquoi | Performance |
|------|---------------------|----------|-------------|
| **Direct** | ✅ OUI - AVANT exécution | Doit créer `static_structure` pour la capability | ~50ms overhead |
| **Suggestion** | ❌ NON - SKIP | Capability existante a déjà `static_structure` | Rapide |

**C'est critique pour la performance :** Le mode Suggestion est plus rapide car il réutilise
une capability déjà parsée. Ne PAS refaire l'analyse statique en mode Suggestion.

```typescript
// Mode Direct - analyse statique REQUISE
const structure = await StaticStructureBuilder.build(code, db);
const result = await WorkerBridge.execute(code);
await CapabilityStore.save({ code, static_structure: structure });

// Mode Suggestion - PAS d'analyse statique
const capability = await DRDSP.findShortestHyperpath(intent);
// capability.static_structure existe déjà !
const result = await WorkerBridge.execute(capability.code_snippet);
await CapabilityStore.updateUsage(capability.id); // juste usage_count++
```

---

### Algorithmes déjà implémentés (POC)

**Tout est déjà codé !** Les stories sont de l'INTÉGRATION, pas du développement :

| Module | LOC | API clé |
|--------|-----|---------|
| `dr-dsp.ts` | 460 | `DRDSP.findShortestHyperpath()` |
| `shgat.ts` | 1284 | `SHGAT.scoreAllCapabilities()` |
| `thompson.ts` | 708 | `ThompsonSampler.getThreshold()` |

```typescript
// DR-DSP - déjà implémenté
class DRDSP {
  findShortestHyperpath(source: string, target: string): Hyperpath | null;
  applyUpdate(update: HyperedgeUpdate): void;
}
function buildDRDSPFromCapabilities(capabilities, tools): DRDSP;

// SHGAT - déjà implémenté (pour 10.7b)
class SHGAT {
  scoreAllCapabilities(intentEmb, contextEmbs): ScoredCapability[];
  trainBatch(episodes): void;
}

// Thompson - déjà implémenté (pour 10.7c)
class ThompsonSampler {
  getThreshold(toolId, riskCategory, mode): number;
  recordOutcome(toolId, success): void;
}
```

### Évolution future (10.7c, Epic 11, Epic 12)

> **Note:** Story 10.7b (SHGAT Scoring) a été **mergée dans cette story**.

| Story | Ajout | Description |
|-------|-------|-------------|
| **10.7c** | Thompson Sampling | Seuils adaptatifs exploration/exploitation |
| **Epic 11** | Execution Traces | Training SHGAT sur traces workflow-level |
| **Epic 12** | Speculation | Pré-exécution intra-workflow |

```
Évolution du mode Suggestion:

10.7:     intent → unifiedSearch → DR-DSP + SHGAT → exécute ou suggestions
10.7c:    + Thompson Sampling → seuils adaptatifs par tool
Epic 11:  + execution_trace → training SHGAT amélioré
Epic 12:  + speculation → pré-exécution intra-workflow
```

### SHGAT: Forward vs Backward (2025-12-22)

SHGAT fonctionne dans les deux modes (voir ADR-050):

| Mode | Context | Features SHGAT |
|------|---------|----------------|
| **Backward** (Suggestion) | ❌ `contextTools=[]` | semantic + graph (pageRank, spectral, cooccurrence) |
| **Forward** (Prediction) | ✅ `contextTools=[...]` | semantic + graph + contextBoost (×0.3) |

Le context n'est qu'un **boost optionnel**. SHGAT apprend les patterns même sans context.

### Architecture existante à réutiliser

**De Story 10.5 (Execute Code via DAG):**
```typescript
// code-execution-handler.ts
- tryDagExecution() → analyse statique + WorkerBridge execution
- executeSandboxMode() → fallback sandbox
- buildToolDefinitionsFromDAG() → tool defs pour WorkerBridge
```

**De Story 10.6 (pml_discover):**
```typescript
// discover-handler.ts
- handleDiscover() → unified search tools + capabilities
- computeDiscoverScore() → formule semantic × reliability
```

**De capabilities/matcher.ts:**
```typescript
- findMatch(intent) → semantic × reliability scoring
- canSpeculate() → vérifie si exécution safe
```

### Learning Cycle (Procedural Memory)

1. **Jour 1:** Claude écrit du code → `pml_execute({ intent, code })` → capability créée
2. **Jour 2:** Intent similaire → `pml_execute({ intent })` → DR-DSP trouve → exécute
3. **Jour 3:** Intent différent mais même pattern → DR-DSP trouve via hyperpath → exécute
4. **Amélioration continue:** success_rate, usage_count mis à jour

### Migration depuis l'ancien API

```typescript
// ❌ AVANT (deprecated) - DAG JSON explicite
pml_execute_dag({
  workflow: {
    tasks: [
      { id: "read", tool: "fs:read", args: { path: "config.json" } },
      { id: "parse", tool: "json:parse", args: { json: "$OUTPUT[read]" } }
    ]
  }
})

// ✅ APRÈS - Mode Direct (avec code)
pml_execute({
  intent: "lire et parser config.json",
  code: `
    const content = await mcp.fs.read({ path: "config.json" });
    return JSON.parse(content);
  `
})

// ✅ APRÈS - Mode Suggestion (réutilisation)
pml_execute({
  intent: "lire et parser un fichier json"
})
// → DR-DSP trouve capability "json_reader" → exécute
// → OU retourne suggestions si pas de match
```

### Files to Create

| File | Description | LOC estimé |
|------|-------------|------------|
| `src/mcp/handlers/execute-handler.ts` | Handler principal unifié | ~300 LOC |
| `tests/unit/mcp/handlers/execute_handler_test.ts` | Tests unitaires | ~400 LOC |

### Files to Modify

| File | Changement | LOC estimé |
|------|------------|------------|
| `src/mcp/tools/definitions.ts` | Ajouter `executeTool` + deprecation notices | ~60 LOC |
| `src/mcp/handlers/mod.ts` | Export handleExecute | ~2 LOC |
| `src/mcp/gateway-server.ts` | Register handler + init DRDSP | ~30 LOC |
| `src/mcp/handlers/workflow-execution-handler.ts` | Deprecation warnings | ~10 LOC |
| `src/mcp/handlers/code-execution-handler.ts` | Deprecation warnings | ~10 LOC |
| `tests/integration/mcp_gateway_e2e_test.ts` | E2E tests for pml:execute | ~150 LOC |

### Key References

**Source Files:**
- `src/graphrag/algorithms/dr-dsp.ts` - DR-DSP implementation
- `src/mcp/handlers/code-execution-handler.ts:101-144` - handleExecuteCode
- `src/mcp/handlers/discover-handler.ts:49-150` - handleDiscover
- `src/capabilities/matcher.ts:149-220` - findMatch, canSpeculate

**Spikes & ADRs:**
- [Spike 2025-12-21](../spikes/2025-12-21-capability-pathfinding-dijkstra.md) - DR-DSP decision
- [ADR-038](../adrs/ADR-038-scoring-algorithms-reference.md) - Scoring formulas

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Change Log

- 2025-12-22: Story created with scope clarification
- 2025-12-22: Merged 10.7a (DR-DSP) into 10.7
- 2025-12-22: Simplified to 2 modes (Direct vs Suggestion), removed `context` parameter
- 2025-12-22: Clarified: cache session comes in 10.7b/Epic 12

### File List

- [ ] `src/mcp/handlers/execute-handler.ts` - NEW (~300 LOC)
- [ ] `src/mcp/tools/definitions.ts` - MODIFY (~60 LOC)
- [ ] `src/mcp/handlers/mod.ts` - MODIFY (~2 LOC)
- [ ] `src/mcp/gateway-server.ts` - MODIFY (~30 LOC)
- [ ] `src/mcp/handlers/workflow-execution-handler.ts` - MODIFY (~10 LOC)
- [ ] `src/mcp/handlers/code-execution-handler.ts` - MODIFY (~10 LOC)
- [ ] `tests/unit/mcp/handlers/execute_handler_test.ts` - NEW (~400 LOC)
- [ ] `tests/integration/mcp_gateway_e2e_test.ts` - MODIFY (~150 LOC)
