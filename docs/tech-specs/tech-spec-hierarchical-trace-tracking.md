# Tech-Spec: Hierarchical Trace Tracking with parent_trace_id

**Created:** 2025-12-09
**Status:** implemented
**ADR:** ADR-041

## Overview

### Problem Statement

Le GraphRAG crée actuellement des edges basés sur **l'ordre temporel des `*_end` events** au lieu de la vraie hiérarchie d'appels. Cela fausse les algorithmes de shortest path et Adamic-Adar utilisés pour les suggestions de tools.

**Exemple du problème :**
```
Timeline actuelle :
read_file_end → write_file_end → cap1_end

Edges créés (FAUX) :
read_file → write_file → cap1

Structure réelle (CORRECTE) :
cap1
├── read_file
└── write_file
```

### Solution

Implémenter la propagation de `parent_trace_id` à travers toute la stack d'exécution (tools ET capabilities) pour créer des edges typés (`contains`, `sequence`, `dependency`, `template`) avec des poids différents pour les algorithmes.

### Scope

**In Scope:**
- Migration DB pour `edge_type` column
- Propagation `parent_trace_id` dans sandbox-worker (capabilities)
- Propagation `parent_trace_id` dans worker-bridge (tools)
- Types mis à jour (`RPCCallMessage`)
- `updateFromCodeExecution()` utilisant la hiérarchie
- Algorithmes pondérés (`findShortestPath`, `computeAdamicAdar`)
- Visualisation Cytoscape avec styles par type d'edge

**Out of Scope:**
- A/B testing des poids (Story 7.6)

## Context for Development

### Codebase Patterns

- **Event tracing:** Via `BroadcastChannel("cai-traces")` pour les capabilities
- **RPC protocol:** `postMessage` entre sandbox-worker et worker-bridge
- **Graph storage:** Graphology in-memory + PGlite persistence
- **Edge attributes:** `{ weight, count, source }` - ajouter `type`

### Files to Reference

| File | Role |
|------|------|
| `src/sandbox/types.ts` | Types `TraceEvent`, `RPCCallMessage` |
| `src/sandbox/sandbox-worker.ts` | Exécution isolée, `__trace()`, `__rpcCall()` |
| `src/sandbox/worker-bridge.ts` | Bridge RPC, `handleRPCCall()` |
| `src/graphrag/graph-engine.ts` | `updateFromCodeExecution()`, algos |
| `src/db/migrations/003_graphrag_tables.sql` | Schéma `tool_dependency` |
| `docs/adrs/ADR-041-hierarchical-trace-tracking.md` | Décisions d'architecture |

### Technical Decisions

1. **Stack-based context tracking** dans le worker pour gérer la profondeur d'appels
2. **Deux dimensions pour les edges** :
   - `edge_type` : nature de la relation (`contains`, `sequence`, `dependency`)
   - `edge_source` : origine/fiabilité (`template`, `inferred`, `observed`)
3. **Edge types avec poids fixes** (pas adaptatifs pour l'instant) :
   - `dependency`: 1.0 (DAG explicite)
   - `contains`: 0.8 (parent-enfant)
   - `sequence`: 0.5 (temporel entre siblings)
4. **Edge sources avec modificateurs de poids** :
   - `observed`: ×1.0 (confirmé par exécution)
   - `inferred`: ×0.7 (déduit d'une seule observation)
   - `template`: ×0.5 (bootstrap, pas encore confirmé)
5. **Backward compatibility** : `parent_trace_id`, `edge_type`, `edge_source` optionnels

## Implementation Plan

### Tasks

- [x] **Task 1: Migration DB** - Ajouter `edge_type` et `edge_source` à `tool_dependency`
  - Créé `src/db/migrations/012_edge_types_migration.ts` (numérotation séquentielle)
  - Colonnes :
    - `edge_type TEXT DEFAULT 'sequence'` — (`contains`, `sequence`, `dependency`)
    - `edge_source TEXT DEFAULT 'inferred'` — (`template`, `inferred`, `observed`)
  - Index créés pour performance (edge_type, edge_source, composite)

- [x] **Task 2: Types** - Étendre `RPCCallMessage` avec `parent_trace_id`
  - `src/sandbox/types.ts` : ajouté `parent_trace_id?: string` à `RPCCallMessage` et `BaseTraceEvent`

- [x] **Task 3: Sandbox Worker** - Implémenter context stack et propagation
  - `src/sandbox/sandbox-worker.ts` :
    - `__traceContextStack: TraceContext[]` pour gérer la profondeur
    - `__getCurrentTraceId()` : retourne le trace_id du contexte actuel
    - `__trace()` : push/pop sur la stack, utilise `parent_trace_id`
    - `__rpcCall()` : envoie `parent_trace_id: __getCurrentTraceId()` dans le message

- [x] **Task 4: Worker Bridge** - Lire et utiliser `parent_trace_id`
  - `src/sandbox/worker-bridge.ts` :
    - `handleRPCCall()` : extrait `parent_trace_id` du message RPC
    - Inclut dans les traces `tool_start` et `tool_end`
    - Émet vers EventBus avec `parent_trace_id` (capability + tool events)

- [x] **Task 5: Graph Engine - Edge Creation** - Utiliser hiérarchie pour créer edges typés
  - `src/graphrag/graph-engine.ts` - `updateFromCodeExecution()` :
    - Construit maps `traceToNode` et `parentToChildren` depuis `parent_trace_id`
    - Crée edges `contains` (parent → enfant) via `createOrUpdateEdge()`
    - Crée edges `sequence` seulement entre siblings (même parent)
    - Logique `edge_source` : `inferred` → `observed` après 3 observations

- [x] **Task 6: Graph Engine - Persistence** - Sauvegarder/charger `edge_type` et `edge_source`
  - `syncFromDatabase()` : charge `edge_type` et `edge_source` depuis PGlite
  - `persistEdgesToDB()` : sauvegarde `edge_type` et `edge_source` vers PGlite
  - `bootstrapFromTemplates()` : marque edges avec `edge_source: 'template'`

- [x] **Task 7: Algorithmes pondérés** - Adapter shortest path et Adamic-Adar
  - `getEdgeWeight(type, source)` : poids_type × modificateur_source
  - `findShortestPath()` : Dijkstra avec `cost = 1 / weight` (poids inversé)
  - `computeAdamicAdar()` : pondère contributions par qualité d'edge
  - `buildDAG()` : utilise poids moyens pour breaking cycles

- [x] **Task 8: Cytoscape Visualization** - Différencier visuellement les edges (2 dimensions)
  - `getGraphSnapshot()` : inclut `edge_type` et `edge_source`
  - `GraphVisualization.tsx` :
    - Couleur = Type : contains=#22c55e, sequence=#FFB86F, dependency=#f5f0ea
    - Style ligne = Source : observed=solid, inferred=dashed, template=dotted
    - Légende complète ajoutée au panel

- [x] **Task 9: Tests** - Couvrir les nouveaux comportements
  - 6 tests unitaires dans `tests/unit/graphrag/hierarchical_trace_test.ts`
  - Tests: hiérarchie parent-child, nested capabilities, siblings, backward compat, poids, threshold

### Acceptance Criteria

- [x] AC1: Un tool appelé depuis une capability a `parent_trace_id` = trace_id de la capability
- [x] AC2: Une capability nested a `parent_trace_id` = trace_id de la capability parente
- [x] AC3: `updateFromCodeExecution()` crée des edges `contains` pour les relations parent-enfant
- [x] AC4: `updateFromCodeExecution()` crée des edges `sequence` seulement entre siblings
- [x] AC5: `edge_type` et `edge_source` sont persistés dans PGlite et rechargés au sync
- [x] AC6: `findShortestPath()` utilise les poids combinés (type × source)
- [x] AC7: Edges avec `observed_count >= 3` passent de `inferred` à `observed`
- [x] AC8: Backward compat : traces sans `parent_trace_id` créent des edges `sequence` (comportement actuel)
- [x] AC9: Dashboard Cytoscape : couleur = type, style ligne = source

## Additional Context

### Dependencies

- Story 6.5 (EventBus) doit être mergée avant (types `parent_trace_id` dans payloads)
- Graphology supporte les attributs custom sur edges (OK)

### Testing Strategy

```typescript
// Test hierarchical trace propagation
Deno.test("tool called from capability has parent_trace_id", async () => {
  const bridge = new WorkerBridge(mcpClients);
  const capCode = `
    await capabilities.myCapability();  // calls read_file internally
  `;
  await bridge.execute(capCode, toolDefs, {}, capabilityContext);

  const traces = bridge.getTraces();
  const toolTrace = traces.find(t => t.type === "tool_start");
  const capTrace = traces.find(t => t.type === "capability_start");

  assertEquals(toolTrace.parent_trace_id, capTrace.trace_id);
});

// Test edge type creation
Deno.test("updateFromCodeExecution creates contains edges", async () => {
  const traces = [
    { type: "capability_start", trace_id: "cap1", parent_trace_id: null },
    { type: "tool_start", trace_id: "t1", parent_trace_id: "cap1" },
    { type: "tool_end", trace_id: "t1", parent_trace_id: "cap1" },
    { type: "capability_end", trace_id: "cap1" },
  ];

  await graphEngine.updateFromCodeExecution(traces);

  const edge = graphEngine.getEdgeData("capability:cap1", "filesystem:read_file");
  assertEquals(edge.type, "contains");
});
```

### Notes

- Les poids d'edges (1.0, 0.8, 0.5, 0.3) sont des valeurs initiales à tuner via Story 7.6
- Si Graphology ne supporte pas Dijkstra pondéré nativement, utiliser `graphology-shortest-path` avec weight function
- La stack de contexte dans le worker doit être robuste aux erreurs (try/finally pour pop)

### Sequence Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  User Code      │     │  Sandbox Worker  │     │  Worker Bridge  │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                        │
         │ call capability       │                        │
         │──────────────────────>│                        │
         │                       │                        │
         │                       │ __trace(cap_start)     │
         │                       │ currentCtx = {cap1}    │
         │                       │───────BroadcastChannel─────────>│
         │                       │                        │
         │                       │ __rpcCall(tool, args,  │
         │                       │   parent: cap1)        │
         │                       │───────postMessage──────>│
         │                       │                        │
         │                       │                        │ trace tool_start
         │                       │                        │ (parent: cap1)
         │                       │                        │
         │                       │                        │ MCP call
         │                       │                        │
         │                       │                        │ trace tool_end
         │                       │<──────rpc_result───────│
         │                       │                        │
         │                       │ __trace(cap_end)       │
         │                       │ currentCtx = null      │
         │<──────────────────────│                        │
         │                       │                        │
```
