## Epic 10: DAG Capability Learning & Unified APIs

> **Tech-Spec:** [tech-spec-dag-capability-learning.md](./tech-specs/tech-spec-dag-capability-learning.md)
> **Status:** Proposed (2025-12-17)
> **Author:** Erwan + Claude
> **Depends on:** Epic 7 (Emergent Capabilities), HIL Phase 2 (Permission Escalation)

**Expanded Goal (2-3 sentences):**

Unifier les deux modèles d'exécution (DAG explicite et Code libre) en un système d'apprentissage cohérent où **tout passe par les mêmes mécanismes**. Implémenter la reconstruction de DAG depuis les traces de code, permettant au système d'apprendre des workflows qu'il soit exprimé en DAG ou en code TypeScript. Simplifier les APIs en deux points d'entrée : `pml_discover` (exploration intelligente) et `pml_execute` (exécution unifiée).

**Problèmes Résolus:**

| Problème | Solution |
|----------|----------|
| Parallel tracking - pas d'edges créés | Détection via timestamps `ts` + `durationMs` |
| DAG → Capability - pas de génération | Capability unifiée `source: code \| dag` |
| Edge types confus (sequence vs dependency) | Clarification: Definition view vs Invocation view |
| Manque de `provides` edge | Nouveau type pour data flow (strict/partial/optional) |
| APIs fragmentées (5 tools) | Unification: `pml_discover` + `pml_execute` |

**Value Delivery:**

- ✅ **Apprentissage unifié** - Code ET DAG créent des capabilities
- ✅ **Reconstruction DAG** - Le code peut être "rejoué" comme DAG
- ✅ **APIs simplifiées** - 2 tools au lieu de 5 pour l'IA
- ✅ **Preview intelligent** - `resultPreview` + `pml_get_task_result` pour AIL
- ✅ **Provides edges** - Chaînage data explicite entre tools

---

### Unified Learning Model (Philosophy) — REVISED

> **Principe fondamental révisé:** La **Capability** est créée à l'**analyse statique** (structure complète).
> Les **Traces** sont des instances d'exécution stockées séparément. L'apprentissage agrège les traces.

**Distinction clé : Capability vs Trace**

| Concept | Quand créé | Ce qu'il contient | Stockage |
|---------|------------|-------------------|----------|
| **Capability** | Analyse statique (PRE-exec) | Structure complète avec branches/conditions | `workflow_pattern.dag_structure.static_structure` |
| **Trace** | Après exécution (POST-exec) | Chemin emprunté + résultats concrets | `capability_trace` (nouvelle table) |
| **Learning** | Agrégation des traces | Stats par chemin, dominant path | `workflow_pattern.dag_structure.learning` |

**Pourquoi ce changement ?**

1. **Les conditions sont visibles** dans la capability, pas perdues dans les traces
2. **Mémoire épisodique** (traces) vs **mémoire sémantique** (capability) bien séparées
3. **L'analyse statique EST suffisante** grâce aux schémas MCP et à l'inférence `provides`
4. **On peut afficher** les branches divergentes dans l'UI

**Le flow d'apprentissage révisé:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. CODE SOUMIS                                                          │
│     TypeScript avec appels mcp.* et capabilities.*                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. ANALYSE STATIQUE (Story 10.1) → CRÉE LA CAPABILITY                   │
│     - Parse AST avec SWC (réutilise SchemaInferrer/PermissionInferrer)  │
│     - Détecte: tools, capabilities imbriquées, if/else, loops           │
│     - Génère static_structure { nodes, edges }                          │
│     - Calcule provides edges via schémas input/output                   │
│     - Crée CapabilityDependency si appel à d'autres capabilities        │
│     → INSERT workflow_pattern avec dag_structure.static_structure       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. VALIDATION HIL (si nécessaire)                                       │
│     - Basée sur static_structure (on sait quels tools seront appelés)  │
│     - Approbation AVANT exécution, pas après échec                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. EXÉCUTION (Sandbox)                                                  │
│     - Capture traces via parentTraceId (ADR-041)                        │
│     - Enregistre décisions aux DecisionNodes (branches prises)          │
│     - Résultats par tâche avec timestamps                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  5. STOCKAGE TRACE (Story 10.4 révisée)                                  │
│     → INSERT INTO capability_trace                                       │
│     - executed_path: ["n1", "d1", "n2"] (nodeIds de static_structure)   │
│     - decisions: [{ nodeId: "d1", outcome: "true" }]                    │
│     - task_results: résultats détaillés par tâche                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  6. MISE À JOUR LEARNING (Agrégation)                                    │
│     → UPDATE workflow_pattern.dag_structure.learning                    │
│     - Incrémente path.count pour le chemin emprunté                     │
│     - Recalcule dominantPath                                            │
│     - Update success_rate, usage_count (existant)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  7. NEXT TIME: REPLAY avec contexte enrichi                              │
│     - Capability matchée par intent                                     │
│     - On connaît le dominantPath ET les variantes                       │
│     - L'IA peut choisir d'exécuter ou de modifier                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Exemple concret avec conditions:**

```typescript
// Code source
const file = await mcp.fs.stat({ path });
if (file.exists) {
  const content = await mcp.fs.read({ path });
  return content;
} else {
  await mcp.fs.create({ path });
  await mcp.fs.write({ path, content: "" });
}
```

**Structure statique générée (dans la Capability):**

```typescript
static_structure: {
  nodes: [
    { id: "n1", type: "task", tool: "fs:stat" },
    { id: "d1", type: "decision", condition: "file.exists" },
    { id: "n2", type: "task", tool: "fs:read" },
    { id: "n3", type: "task", tool: "fs:create" },
    { id: "n4", type: "task", tool: "fs:write" },
  ],
  edges: [
    { from: "n1", to: "d1", type: "sequence" },
    { from: "d1", to: "n2", type: "conditional", outcome: "true" },
    { from: "d1", to: "n3", type: "conditional", outcome: "false" },
    { from: "n3", to: "n4", type: "sequence" },
    { from: "n1", to: "n2", type: "provides" }  // Data flow inféré
  ]
}
```

**Traces stockées séparément (après 3 exécutions):**

```sql
-- Trace 1: file.exists = true
INSERT INTO capability_trace (capability_id, executed_path, decisions, success)
VALUES ('cap-xxx', ARRAY['n1', 'd1', 'n2'],
        '[{"nodeId": "d1", "outcome": "true"}]', true);

-- Trace 2: file.exists = false
INSERT INTO capability_trace (capability_id, executed_path, decisions, success)
VALUES ('cap-xxx', ARRAY['n1', 'd1', 'n3', 'n4'],
        '[{"nodeId": "d1", "outcome": "false"}]', true);

-- Trace 3: file.exists = true
INSERT INTO capability_trace (capability_id, executed_path, decisions, success)
VALUES ('cap-xxx', ARRAY['n1', 'd1', 'n2'],
        '[{"nodeId": "d1", "outcome": "true"}]', true);
```

**Learning agrégé (dans la Capability):**

```typescript
learning: {
  paths: [
    { path: ["n1", "d1", "n2"], count: 2, successRate: 1.0 },
    { path: ["n1", "d1", "n3", "n4"], count: 1, successRate: 1.0 }
  ],
  dominantPath: ["n1", "d1", "n2"],  // 66% des exécutions
  decisionStats: [{
    nodeId: "d1",
    condition: "file.exists",
    outcomes: { "true": { count: 2 }, "false": { count: 1 } }
  }]
}
```

**Capabilities = Tools abstraits:**

Une Capability n'est pas forcément un DAG interne. Elle peut être:

| Type | Exemple | Exécution |
|------|---------|-----------|
| **DAG interne** | `fs:read → json:parse → github:createIssue` | PML exécute les tasks |
| **Code snippet** | TypeScript avec logique complexe | Sandbox PML |
| **Tool externe** | Temporal workflow, Airflow DAG | Délégation à l'orchestrateur |

**Implications pour l'implémentation:**

1. **Story 10.1** devient la **vraie fondation** - crée la Capability avec static_structure
2. **Story 10.4** stocke les **Traces** dans `capability_trace`, pas la structure
3. **Capability.source** reste mais s'enrichit de `static_structure` et `learning`
4. **Les CapabilityDependency** (capability → capability) sont créées à l'analyse statique

---

**Architecture Unifiée (révisée):**

```
┌─────────────────────────────────────────────────────────────────┐
│  pml_execute({ intent: "..." })                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐     ┌─────────────────────┐            │
│  │ Implementation      │     │ Recherche GraphRAG   │            │
│  │ fournie par l'IA?   │ NO  │ - Tools matching     │            │
│  │                     │────▶│ - Capabilities       │            │
│  └─────────┬───────────┘     └──────────┬──────────┘            │
│            │ YES                        │                        │
│            ▼                            ▼                        │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  STATIC ANALYSIS (Story 10.1)                        │        │
│  │  - Parse code → static_structure                     │        │
│  │  - CREATE/UPDATE Capability                          │        │
│  │  - HIL validation si tools sensibles                 │        │
│  └─────────────────────────────────────────────────────┘        │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  EXECUTION (Sandbox)                                 │        │
│  │  - Traces: tool_start/end + result + parentTraceId  │        │
│  │  - Branch decisions captured                         │        │
│  └─────────────────────────────────────────────────────┘        │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  TRACE STORAGE (Story 10.4)                          │        │
│  │  - INSERT capability_trace (executed_path, results)  │        │
│  │  - UPDATE Capability.learning (aggregate stats)      │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Estimation:** 10 stories (9 MVP + 1 optional), ~3-4 semaines MVP

---

### Story Breakdown - Epic 10

**Story 10.1: Static Code Analysis → Capability Creation** ⭐ VRAIE FONDATION

As an execution system, I want to parse code statically to generate a complete `static_structure`,
So that I can **create the Capability immediately** with full branch/condition visibility for HIL.

**Position dans l'Epic (RÉVISÉE):**
- **VRAIE FONDATION** - crée la Capability avec `static_structure` avant exécution
- Débloque 10.4 (traces) car les traces référencent les nodeIds de static_structure
- Débloque HIL car on connaît tous les tools potentiels avant exécution

**Context (RÉVISÉ):**

Changement de philosophie :
- **AVANT :** La Capability était créée après exécution (validée par l'usage)
- **MAINTENANT :** La Capability est créée à l'analyse statique (structure complète)

Pourquoi ? L'analyse statique EST suffisante grâce à :
- SchemaInferrer → infère les dépendances via schémas input/output
- PermissionInferrer → détecte les patterns de permissions
- Les schémas MCP → provides edges calculables statiquement
- La détection des conditions → branches visibles dans la structure

**Différence avec Story 10.4 (CLARIFIÉE):**

| Aspect | 10.1 Static (PRE) | 10.4 Traces (POST) |
|--------|--------------------|--------------------|
| **Quand** | Avant exécution | Après exécution |
| **Output** | **Capability** avec `static_structure` | **Trace** avec `executed_path` |
| **Contenu** | Structure COMPLÈTE (toutes branches) | Chemin EMPRUNTÉ (une branche) |
| **Stockage** | `workflow_pattern.dag_structure` | `capability_trace` table |

**Réutilisation de l'existant:**

On a DÉJÀ tout le pipeline SWC :
- `SchemaInferrer` (726 LOC, 19 tests) → parse AST, trouve `args.xxx`, infère types
- `PermissionInferrer` (510 LOC) → parse AST, détecte patterns dangereux
- `tool_schema` table → schemas input/output des MCP tools
- `workflow_pattern` table → schemas des capabilities

**Story 10.1 = Extension de ~200-250 LOC** pour générer `static_structure`.

**Architecture (RÉVISÉE):**
```
Code TypeScript
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  SWC AST Parser (RÉUTILISE SchemaInferrer/PermissionInferrer)│
│  - Même parse(), même traversée AST                          │
│  - Extension: chercher `mcp.*.*()` ET `capabilities.*()`    │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Structure Builder (NOUVEAU)                                 │
│  - Génère des StaticStructureNodes pour chaque élément      │
│  - type: "task" pour tools/capabilities                     │
│  - type: "decision" pour if/switch/ternary                  │
│  - type: "fork"/"join" pour Promise.all                     │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Edge Generator                                              │
│  - "sequence" : await séquentiel                            │
│  - "conditional" : branches de if/switch avec outcome       │
│  - "provides" : data flow via schémas (coverage calculé)    │
│  - "contains" : capability imbriquée                        │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Capability Creation / Update                                │
│  - INSERT/UPDATE workflow_pattern                           │
│  - dag_structure.static_structure = { nodes, edges }        │
│  - Crée CapabilityDependency si appels à capabilities       │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
Validation HIL → Exécution → Trace (Story 10.4)
```

**Patterns à détecter et STRUCTURE générée:**

```typescript
// Code source
const file = await mcp.fs.stat({ path });
if (file.exists) {
  const content = await mcp.fs.read({ path });
  return content;
} else {
  await mcp.fs.create({ path });
  await mcp.fs.write({ path, content: "" });
}

// static_structure générée:
{
  nodes: [
    { id: "n1", type: "task", tool: "fs:stat" },
    { id: "d1", type: "decision", condition: "file.exists" },
    { id: "n2", type: "task", tool: "fs:read" },
    { id: "n3", type: "task", tool: "fs:create" },
    { id: "n4", type: "task", tool: "fs:write" },
  ],
  edges: [
    { from: "n1", to: "d1", type: "sequence" },
    { from: "d1", to: "n2", type: "conditional", outcome: "true" },
    { from: "d1", to: "n3", type: "conditional", outcome: "false" },
    { from: "n3", to: "n4", type: "sequence" },
    { from: "n1", to: "n2", type: "provides" }  // Data flow inféré via schémas
  ]
}
```

**Patterns détaillés:**

```typescript
// Pattern 1: Appel MCP tool simple
const result = await mcp.fs.read({ path: "config.json" });
// → Node { id: "n1", type: "task", tool: "fs:read" }

// Pattern 2: Appel capability (crée aussi CapabilityDependency)
const summary = await capabilities.summarize({ text: content });
// → Node { id: "n2", type: "capability", capabilityId: "cap-xxx" }
// → CapabilityDependency { from: currentCap, to: "cap-xxx", edgeType: "contains" }

// Pattern 3: Parallélisme
const [a, b] = await Promise.all([
  mcp.api.fetch({ url: urlA }),
  mcp.api.fetch({ url: urlB }),
]);
// → Node { id: "f1", type: "fork" }
// → Node { id: "n3", type: "task", tool: "api:fetch" }
// → Node { id: "n4", type: "task", tool: "api:fetch" }
// → Node { id: "j1", type: "join" }
// → Edges: f1→n3, f1→n4, n3→j1, n4→j1

// Pattern 4: Conditionnel
if (condition) {
  await mcp.db.write({ data });
}
// → Node { id: "d1", type: "decision", condition: "condition" }
// → Node { id: "n5", type: "task", tool: "db:write" }
// → Edge { from: "d1", to: "n5", type: "conditional", outcome: "true" }
```

**Acceptance Criteria (RÉVISÉS):**

1. `StaticStructureBuilder` class créée, **étend les patterns de SchemaInferrer**
2. Réutilise le même `parse()` SWC que SchemaInferrer/PermissionInferrer
3. Types `StaticStructure` définis :
   ```typescript
   // Nœuds de la structure statique
   type StaticStructureNode =
     | { id: string; type: "task"; tool: string }
     | { id: string; type: "decision"; condition: string }
     | { id: string; type: "capability"; capabilityId: string }
     | { id: string; type: "fork" }
     | { id: string; type: "join" };

   // Edges de la structure
   interface StaticStructureEdge {
     from: string;
     to: string;
     type: "sequence" | "provides" | "conditional" | "contains";
     outcome?: string;  // Pour conditional: "true", "false", "case1"
     coverage?: "strict" | "partial" | "optional";  // Pour provides
   }

   interface StaticStructure {
     nodes: StaticStructureNode[];
     edges: StaticStructureEdge[];
   }
   ```
4. Method `buildStaticStructure(code: string, db: PGliteClient)` → `StaticStructure`
5. **Détection des nœuds:**
   - `mcp.*.*()` → Node type "task"
   - `capabilities.*()` → Node type "capability"
   - `if/switch/ternary` → Node type "decision"
   - `Promise.all/allSettled` → Nodes "fork" + "join"
6. **Génération des edges:**
   - `await` séquentiel → edge "sequence"
   - Branches de if → edges "conditional" avec outcome
   - Data flow via schémas → edges "provides" avec coverage
7. **Création de Capability:**
   - INSERT/UPDATE `workflow_pattern` avec `dag_structure.static_structure`
   - Crée `CapabilityDependency` pour chaque capability imbriquée
8. **Intégration avec HIL:**
   - Extraire tous les tools de `static_structure.nodes`
   - Vérifier permissions via `getToolPermissionConfig()`
   - Si tool avec `approvalMode: "hil"` → demander approbation
9. Tests: code avec tools → nodes "task" générés
10. Tests: code avec if/else → node "decision" + edges "conditional"
11. Tests: code avec Promise.all → nodes "fork"/"join"
12. Tests: code avec capability → node "capability" + CapabilityDependency créée
13. Tests: chaînage tool→tool → edge "provides" calculé

**Files to Create:**
- `src/capabilities/static-structure-builder.ts` (~200-250 LOC)

**Files to Modify:**
- `src/capabilities/types.ts` - Ajouter `StaticStructure` types (~40 LOC)
- `src/capabilities/capability-store.ts` - Intégrer static_structure dans saveCapability (~30 LOC)
- `src/mcp/handlers/code-execution-handler.ts` - Build structure avant exécution (~20 LOC)

**Prerequisites:** Story 7.2b (SWC parsing - DONE)

**Estimation:** 3-4 jours (augmenté car scope élargi)

**Changement clé:**
Cette story **crée la Capability** avec sa structure complète. Les traces (Story 10.4)
viennent ensuite enrichir le `learning` avec les chemins réellement empruntés.

---

**Story 10.2: Result Tracing - Capture des Résultats d'Exécution**

As a learning system, I want to capture the `result` of each tool and capability execution,
So that I can reconstruct data dependencies and create `provides` edges.

**Position dans l'Epic:**
- **VRAIE FONDATION** du Track A (Learning)
- Doit être faite EN PREMIER (quick win : ~5-10 LOC)
- Débloque 10.3 (provides edges) et 10.4 (DAG reconstruction)

**Context:**
Actuellement on trace `args` mais pas `result`. Sans le result,
impossible de détecter si "le résultat de A est utilisé dans les args de B".

**Acceptance Criteria:**

1. `tool_end` event inclut `result` dans `worker-bridge.ts` (~ligne 426):
   ```typescript
   this.traces.push({
     type: "tool_end",
     tool: toolId,
     traceId: id,
     ts: endTime,
     success: !isToolError,
     durationMs: durationMs,
     parentTraceId: parentTraceId,
     result: result,  // ← NOUVEAU
   });
   ```
2. `capability_end` event inclut `result` dans `code-generator.ts` (~ligne 104):
   ```typescript
   __trace({
     type: "capability_end",
     capability: "${name}",
     capabilityId: "${capability.id}",
     success: __capSuccess,
     error: __capError?.message,
     result: __capResult,  // ← NOUVEAU
   });
   ```
3. Types mis à jour dans `src/dag/types.ts`:
   - `TraceEvent.tool_end.result?: unknown`
   - `TraceEvent.capability_end.result?: unknown`
4. `resultPreview` déjà implémenté (task_complete) - vérifier cohérence
5. Tests: exécuter code avec 2 tools → vérifier result présent dans les deux traces
6. Tests: result tronqué si > 10KB (éviter explosion mémoire)

**Files to Modify:**
- `src/sandbox/worker-bridge.ts` (~5 LOC)
- `src/capabilities/code-generator.ts` (~3 LOC)
- `src/dag/types.ts` (~4 LOC)

**Prerequisites:** Story 7.1b (Worker RPC Bridge)

**Estimation:** 0.5-1 jour

---

**Story 10.3: Provides Edge Type - Data Flow Relationships**

As a graph learning system, I want a `provides` edge type that captures data flow between tools,
So that I can understand which tools can feed data to which other tools.

**Context:**
Le `provides` edge est pour la vue **Definition** (structure abstraite). Il indique que
les outputs de A peuvent alimenter les inputs de B, basé sur les schemas.

**Edge Coverage Types:**
```typescript
type ProvidesCoverage =
  | "strict"     // R ⊆ O (tous les required inputs couverts)
  | "partial"    // R ∩ O ≠ ∅ (intersection non-vide)
  | "optional";  // Que des inputs optionnels couverts
```

**Acceptance Criteria:**

1. **Cleanup EdgeType** dans `edge-weights.ts`:
   - Ajouter `provides`
   - Retirer `alternative` (non utilisé, pas dans ADR-050)
   - `EdgeType` final : `"dependency" | "contains" | "sequence" | "provides"`
2. Weight configuré: `provides: 0.7` dans `EDGE_TYPE_WEIGHTS`
3. Interface `ProvidesEdge` définie avec **schemas exposés**:
   ```typescript
   interface ProvidesEdge {
     from: string;              // Tool/capability provider
     to: string;                // Tool/capability consumer
     type: "provides";
     coverage: ProvidesCoverage;

     // Schemas exposés pour que l'IA sache remplir les args
     providerOutputSchema: JSONSchema;   // Ce que A produit
     consumerInputSchema: JSONSchema;    // Ce que B attend (required + optional)
     fieldMapping: Array<{               // Correspondances champ par champ
       fromField: string;       // e.g., "content"
       toField: string;         // e.g., "json"
       typeCompatible: boolean; // Types compatibles ?
     }>;
   }
   ```
4. `computeCoverage()` function implémentée:
   - Input: `providerOutputs: Set<string>`, `consumerInputs: { required, optional }`
   - Output: `ProvidesCoverage | null`
   - Retourne `null` si aucune intersection
5. `createProvidesEdges()` calculé depuis les MCP tool schemas:
   - Pour chaque paire de tools, calculer coverage
   - Créer edge si coverage !== null
6. Stockage en DB: column `edge_type` déjà TEXT, pas de migration
7. Tests: fs:read (output: content) → json:parse (input: json) → coverage = "strict"
8. Tests: json:parse → http:post (need url, body) → coverage = "partial"

**Files to Create:**
- `src/graphrag/provides-edge-calculator.ts` (~100 LOC)

**Files to Modify:**
- `src/graphrag/edge-weights.ts` (~5 LOC)
- `src/graphrag/types.ts` (~15 LOC)

**Prerequisites:** Story 10.2 (result tracing)

**Estimation:** 1-2 jours

---

**Story 10.4: Trace Storage & Learning Aggregation (POST-EXECUTION)** — RÉVISÉE

As a learning system, I want to store execution traces in `capability_trace` and update learning stats,
So that I can track execution patterns and identify the dominant path over time.

**Context (RÉVISÉ):**

Changement de rôle :
- **AVANT :** Reconstruire un DAG depuis les traces (créer la structure)
- **MAINTENANT :** Stocker les traces et mettre à jour le `learning` (agrégation)

La **Capability** existe déjà (créée par Story 10.1 à l'analyse statique).
Cette story stocke les **Traces** qui sont des instances d'exécution de cette Capability.

**Relation avec static_structure:**

```
static_structure (Story 10.1)        capability_trace (Story 10.4)
────────────────────────────         ────────────────────────────
nodes: [n1, d1, n2, n3, n4]          executed_path: [n1, d1, n2]  ← Chemin pris
edges: [sequence, conditional...]    decisions: [{nodeId: d1, outcome: "true"}]
                                     task_results: [...]
```

Les `executed_path` référencent les `nodeIds` de `static_structure`.

**Nouvelle table `capability_trace`:**

> **Pourquoi une nouvelle table et pas une extension ?**
> - `workflow_execution` : pas de FK vers capability, stocke dag_structure complet (trop générique)
> - `algorithm_traces` : pour scoring/threshold decisions (ADR-039), autre périmètre
> - `workflow_pattern` : c'est la capability elle-même, pas ses traces
> - Besoin de champs spécifiques : `executed_path`, `decisions`, `priority` (PER)

```sql
CREATE TABLE capability_trace (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  capability_id TEXT NOT NULL REFERENCES workflow_pattern(pattern_id),

  -- Chemin emprunté (nodeIds de static_structure)
  executed_path TEXT[] NOT NULL,

  -- Décisions prises aux DecisionNodes
  decisions JSONB NOT NULL DEFAULT '[]',
  -- Format: [{ "nodeId": "d1", "condition": "file.exists", "value": true, "outcome": "true" }]

  -- Résultats détaillés par tâche
  task_results JSONB NOT NULL DEFAULT '[]',
  -- Format: [{ "nodeId": "n1", "tool": "fs:stat", "result": {...}, "durationMs": 50 }]

  success BOOLEAN NOT NULL,
  duration_ms INTEGER NOT NULL,

  -- ADR-041: Lien avec le contexte parent
  parent_trace_id TEXT,

  -- PER (Prioritized Experience Replay): traces surprenantes = haute priorité
  priority FLOAT NOT NULL DEFAULT 0.5,
  -- 0.0 = attendu, 1.0 = très surprenant (échec sur chemin dominant, succès sur chemin rare)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trace_capability ON capability_trace(capability_id);
CREATE INDEX idx_trace_path ON capability_trace USING GIN(executed_path);
CREATE INDEX idx_trace_success ON capability_trace(capability_id, success);
CREATE INDEX idx_trace_priority ON capability_trace(capability_id, priority DESC);
```

**PER (Prioritized Experience Replay) — Inspiré du spike 2025-12-17:**

L'idée : prioriser les traces **surprenantes** pour l'apprentissage. Une trace est surprenante si
son résultat (success/failure) diverge de ce qu'on attendait basé sur le learning actuel.

```typescript
/**
 * Calcule la priorité PER d'une trace
 * @returns 0.0 (attendu) à 1.0 (très surprenant)
 */
function calculateTracePriority(
  trace: { executedPath: string[]; success: boolean; durationMs: number },
  learning: CapabilityLearning
): number {
  // Trouver les stats pour ce chemin
  const pathStats = learning.paths.find(
    p => JSON.stringify(p.path) === JSON.stringify(trace.executedPath)
  );

  if (!pathStats) {
    // Nouveau chemin jamais vu = priorité maximale
    return 1.0;
  }

  // TD Error: |predicted - actual|
  const predicted = pathStats.successRate;
  const actual = trace.success ? 1.0 : 0.0;
  const tdError = Math.abs(predicted - actual);

  // Facteurs additionnels
  let priority = tdError;

  // Bonus: anomalie de durée (> 2 écarts-types)
  if (pathStats.count > 5) {
    const durationRatio = trace.durationMs / pathStats.avgDurationMs;
    if (durationRatio > 2.0 || durationRatio < 0.5) {
      priority = Math.min(1.0, priority + 0.2);
    }
  }

  // Bonus: chemin rare (< 10% des exécutions)
  const totalCount = learning.paths.reduce((sum, p) => sum + p.count, 0);
  if (pathStats.count / totalCount < 0.1) {
    priority = Math.min(1.0, priority + 0.1);
  }

  return priority;
}
```

**Exemples de priorités:**

| Situation | predicted | actual | Priority | Explication |
|-----------|-----------|--------|----------|-------------|
| Chemin dominant réussit | 0.95 | 1.0 | **0.05** | Attendu |
| Chemin dominant échoue | 0.95 | 0.0 | **0.95** | Très surprenant ! |
| Chemin rare réussit | 0.50 | 1.0 | **0.60** | Intéressant (0.5 + 0.1 rare) |
| Nouveau chemin | - | - | **1.00** | Découverte |

**TD Learning — Mise à jour incrémentale:**

Au lieu d'une EMA globale en fin de workflow, on met à jour le learning **par étape**.
Inspiré du spike sur les systèmes adaptatifs complexes.

```typescript
/**
 * TD Learning: mise à jour incrémentale après chaque trace
 * α = learning rate (0.1 typique)
 *
 * Note: pas de γ (discount factor) car on a des résultats terminaux,
 * pas de "prochain état" à discounter. C'est du TD(0) simplifié.
 */
function updateLearningTD(
  learning: CapabilityLearning,
  trace: CapabilityTrace,
  alpha: number = 0.1
): CapabilityLearning {
  const pathKey = JSON.stringify(trace.executedPath);
  let pathStats = learning.paths.find(p => JSON.stringify(p.path) === pathKey);

  if (!pathStats) {
    // Nouveau chemin
    pathStats = {
      path: trace.executedPath,
      count: 0,
      successRate: 0.5,  // Prior neutre
      avgDurationMs: trace.durationMs
    };
    learning.paths.push(pathStats);
  }

  // TD Update pour successRate
  const actual = trace.success ? 1.0 : 0.0;
  const tdError = actual - pathStats.successRate;
  pathStats.successRate += alpha * tdError;

  // TD Update pour duration (weighted average)
  pathStats.avgDurationMs += alpha * (trace.durationMs - pathStats.avgDurationMs);

  pathStats.count++;

  // Update decisionStats si trace contient des décisions
  if (trace.decisions?.length) {
    for (const decision of trace.decisions) {
      let stats = learning.decisionStats?.find(d => d.nodeId === decision.nodeId);
      if (!stats) {
        stats = { nodeId: decision.nodeId, condition: decision.condition, outcomes: {} };
        learning.decisionStats = learning.decisionStats || [];
        learning.decisionStats.push(stats);
      }
      const outcome = stats.outcomes[decision.outcome] || { count: 0, successRate: 0.5 };
      outcome.count++;
      outcome.successRate += alpha * ((trace.success ? 1.0 : 0.0) - outcome.successRate);
      stats.outcomes[decision.outcome] = outcome;
    }
  }

  // Recalculer dominantPath
  learning.dominantPath = learning.paths
    .filter(p => p.count >= 3)  // Min 3 exécutions
    .sort((a, b) => (b.successRate * b.count) - (a.successRate * a.count))[0]?.path
    || learning.paths[0]?.path
    || [];

  return learning;
}
```

**Différence avec ADR-049 (Adaptive Thresholds):**

| Aspect | ADR-049 | Story 10.4 (PER/TD) |
|--------|---------|---------------------|
| Granularité | Tool | Capability |
| Table | algorithm_traces | capability_trace |
| But | Seuils de spéculation | Apprentissage de structure |
| Output | Threshold α (Thompson) | dominantPath, pathStats |

Pas de chevauchement : ADR-049 optimise **quand** exécuter un tool,
Story 10.4 apprend **comment** une capability se comporte.

**Learning structure (dans dag_structure):**

```typescript
interface CapabilityLearning {
  // Stats par chemin emprunté
  paths: Array<{
    path: string[];           // ["n1", "d1", "n2"]
    count: number;            // 150
    successRate: number;      // 0.95
    avgDurationMs: number;    // 234
  }>;

  // Chemin le plus fréquent avec succès
  dominantPath: string[];     // ["n1", "d1", "n2"]

  // Stats par nœud de décision
  decisionStats: Array<{
    nodeId: string;           // "d1"
    condition: string;        // "file.exists"
    outcomes: {
      [outcome: string]: {    // "true" | "false"
        count: number;
        successRate: number;
      }
    }
  }>;
}
```

**Algorithm:**

```typescript
async function storeTraceAndUpdateLearning(
  capabilityId: string,
  traces: TraceEvent[],
  success: boolean
): Promise<void> {
  // 1. Mapper les traces aux nodeIds de static_structure
  const capability = await capabilityStore.findById(capabilityId);
  const staticStructure = capability.dag_structure.static_structure;

  const executedPath = mapTracesToNodeIds(traces, staticStructure);
  const decisions = extractBranchDecisions(traces);
  const taskResults = extractTaskResults(traces);

  // 2. Calculer la priorité PER AVANT insert
  const learning = capability.dag_structure.learning || { paths: [], dominantPath: [] };
  const priority = calculateTracePriority(
    { executedPath, success, durationMs: totalDurationMs },
    learning
  );

  // 3. Insérer la trace avec priorité
  await db.query(`
    INSERT INTO capability_trace
    (capability_id, executed_path, decisions, task_results, success, duration_ms, priority)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [capabilityId, executedPath, decisions, taskResults, success, totalDurationMs, priority]);

  // 4. Mettre à jour le learning via TD Learning
  const updatedLearning = updateLearningTD(learning, {
    executedPath,
    success,
    durationMs: totalDurationMs
  });

  // 5. Sauvegarder le learning mis à jour
  await capabilityStore.updateLearning(capabilityId, updatedLearning);
}
```

**Acceptance Criteria (RÉVISÉS):**

1. **Table `capability_trace` créée** via migration
2. **Types TypeScript définis:**
   ```typescript
   interface CapabilityTrace {
     id: string;
     capabilityId: string;
     executedPath: string[];  // Node IDs from static_structure
     decisions: BranchDecision[];
     taskResults: TraceTaskResult[];
     success: boolean;
     durationMs: number;
     priority: number;        // PER: 0.0 (attendu) à 1.0 (surprenant)
     parentTraceId?: string;
     createdAt: Date;
   }

   interface BranchDecision {
     nodeId: string;
     condition: string;
     evaluatedValue: unknown;
     outcome: string;
   }

   interface TraceTaskResult {
     nodeId: string;
     tool: string;
     args: Record<string, unknown>;
     result: unknown;
     success: boolean;
     durationMs: number;
   }
   ```
3. **`TraceStore` class créée** avec:
   - `saveTrace(capabilityId, traces, success)` → insère dans `capability_trace`
   - `getTraces(capabilityId, limit?)` → liste les traces
   - `getTraceById(traceId)` → une trace spécifique
4. **Mapping traces → nodeIds:**
   - Fonction `mapTracesToNodeIds(traces, staticStructure)`
   - Match par tool/capabilityId
5. **Extraction des décisions de branches:**
   - Détecter quand un DecisionNode a été traversé
   - Enregistrer l'outcome choisi
6. **Mise à jour du learning (TD Learning):**
   - `updateLearningTD()` avec α = 0.1 (learning rate)
   - TD Update: `successRate += α * (actual - successRate)`
   - Recalculer `dominantPath` (chemin avec le plus de count * successRate)
7. **PER (Prioritized Experience Replay):**
   - `calculateTracePriority()` → 0.0 (attendu) à 1.0 (surprenant)
   - Priority = |predicted - actual| + bonus (durée anormale, chemin rare)
   - Nouveau chemin = priorité maximale (1.0)
   - `getHighPriorityTraces(capabilityId, limit)` → traces triées par priority DESC
8. **Intégration dans le flow d'exécution:**
   - Après exécution sandbox → appeler `storeTraceAndUpdateLearning`
   - Calculer priority AVANT insert
9. Tests: exécution réussie → trace insérée + learning updated via TD
10. Tests: exécution échouée → trace insérée avec success=false, priority élevée si chemin dominant
11. Tests: 3 exécutions même chemin → count=3, dominantPath correct
12. Tests: 2 chemins différents → paths[] contient les 2
13. Tests PER: échec sur chemin dominant (95% success) → priority ≈ 0.95
14. Tests PER: succès sur chemin dominant → priority ≈ 0.05
15. Tests PER: nouveau chemin → priority = 1.0

**Files to Create:**
- `src/db/migrations/XXX_capability_trace.ts` (~50 LOC)
- `src/capabilities/trace-store.ts` (~180 LOC, inclut PER/TD)
- `src/capabilities/learning-updater.ts` (~80 LOC, TD Learning + PER priority)

**Files to Modify:**
- `src/capabilities/types.ts` - Ajouter `CapabilityTrace`, `CapabilityLearning` (~60 LOC)
- `src/capabilities/capability-store.ts` - Ajouter `updateLearning()` (~30 LOC)
- `src/sandbox/worker-bridge.ts` - Appeler TraceStore après exécution (~20 LOC)

**Prerequisites:** Story 10.1 (static_structure must exist), Story 10.2 (result in traces)

**Estimation:** 3-4 jours (inclut PER et TD Learning)

**Note importante:**
Cette story ne **reconstruit** plus un DAG. La structure existe déjà (Story 10.1).
Elle **enregistre** le chemin emprunté et **enrichit** les statistiques d'apprentissage.

---

**Story 10.5: Unified Capability Model (Code, DAG, or Tool)**

As a capability storage system, I want capabilities to support code, DAG, and external tool sources,
So that any successful execution becomes a reusable capability, including delegation to orchestrators like Temporal.

**Context:**
Phase 3 de la tech spec. Actuellement les capabilities stockent uniquement du code.
On veut pouvoir stocker aussi des DAGStructures ET des références à des tools externes.

**Breaking Change:**
```typescript
// AVANT
interface Capability {
  code: string;
}

// APRÈS
interface Capability {
  source:
    | { type: "code"; code: string }
    | { type: "dag"; dagStructure: DAGStructure }
    | { type: "tool"; toolId: string; defaultArgs?: Record<string, unknown> };
}
```

**Exemple Tool Externe (Temporal):**
```typescript
// Capability apprise: pour "deploy to production", déléguer à Temporal
{
  id: "cap_deploy_prod",
  intent: "deploy to production",
  source: {
    type: "tool",
    toolId: "temporal:startWorkflow",
    defaultArgs: { workflowId: "deploy-prod-v2" }
  },
  success_rate: 0.98
}
```

**Acceptance Criteria:**

1. `Capability.source` remplace `Capability.code`:
   ```typescript
   source:
     | { type: "code"; code: string }
     | { type: "dag"; dagStructure: DAGStructure }
     | { type: "tool"; toolId: string; defaultArgs?: Record<string, unknown> };
   ```
2. `Capability.dag_structure.static_structure` existe déjà (from Story 10.1)
3. Migration DB: transformer `code` → `source` JSON column
4. `CapabilityStore.saveCapability()` updated:
   - Accepte `source` au lieu de `code`
   - `static_structure` est générée par Story 10.1 à l'analyse statique
5. `CapabilityStore.findById()` retourne le nouveau format
6. **DAG execution creates capability:**
   - Après succès `execute_dag` → créer capability `{ type: "dag" }`
   - Intent extrait du premier message ou paramètre
7. Helper `getCapabilityCode()` pour backward compat:
   ```typescript
   function getCapabilityCode(cap: Capability): string | null {
     return cap.source.type === "code" ? cap.source.code : null;
   }
   ```
8. Tous les usages de `capability.code` migrés
9. Tests: sauvegarder capability code → retrieve → source.type === "code"
10. Tests: sauvegarder capability dag → retrieve → source.type === "dag"
11. Tests: sauvegarder capability tool → retrieve → source.type === "tool"
12. Tests: execute_dag success → capability créée avec type=dag
13. Tests: capability type=tool → exécution délègue au tool référencé

**Files to Modify:**
- `src/capabilities/types.ts` (~30 LOC)
- `src/capabilities/capability-store.ts` (~50 LOC)
- `src/db/migrations/` - New migration (~40 LOC)
- All files using `capability.code` (grep and update)

**Prerequisites:** Story 10.4 (Trace Storage)

**Estimation:** 2-3 jours

---

**Story 10.6: pml_discover - Unified Discovery API**

As an AI agent, I want a single `pml_discover` tool to search both tools and capabilities,
So that I have a simplified API for finding what I need.

**Context:**
Phase 4 de la tech spec. Remplace `pml_search_tools`, `pml_search_capabilities`, `pml_find_capabilities`.

**API Design:**
```typescript
pml_discover({
  intent: "lire et parser un fichier JSON",
  filter?: {
    type?: "tool" | "capability" | "all",  // default: "all"
    minScore?: number,
  },
  limit?: number,  // default: 10
})

// Response
{
  results: [
    { type: "capability", id: "cap_123", score: 0.92, source: {...} },
    { type: "tool", id: "fs:read", score: 0.85 },
    { type: "capability", id: "cap_456", score: 0.78, source: {...} },
  ]
}
```

**Acceptance Criteria:**

1. Handler `pml_discover` créé dans `src/mcp/handlers/`
2. Recherche unifiée:
   - Vector search sur tools (`tool_graph.intent_embedding`)
   - Vector search sur capabilities (`workflow_pattern.intent_embedding`)
   - Merge et sort par score
3. Input validation avec JSON Schema
4. Filter par type: `tool`, `capability`, ou `all`
5. Pagination: `limit` + `offset`
6. Response inclut pour chaque résultat:
   - `type`: "tool" | "capability"
   - `id`: tool_id ou capability_id
   - `score`: similarity score
   - `source`: (pour capabilities) code ou dag preview
   - `toolSchemas`: (pour tools) input/output schemas
7. **Dépréciation** des anciens tools:
   - `pml_search_tools` → deprecated, redirige vers pml_discover
   - `pml_search_capabilities` → deprecated
   - `pml_find_capabilities` → deprecated
8. System prompt updated pour mentionner pml_discover
9. Tests: search "read file" → retourne mix tools + capabilities
10. Tests: filter type="tool" → que des tools
11. Tests: filter type="capability" → que des capabilities

**Files to Create:**
- `src/mcp/handlers/discover-handler.ts` (~150 LOC)

**Files to Modify:**
- `src/mcp/gateway-server.ts` - Register new handler
- `src/mcp/handlers/search-handler.ts` - Add deprecation notice

**Prerequisites:** Story 10.5 (unified capability model)

**Estimation:** 2-3 jours

---

**Story 10.7: pml_execute - Unified Execution API**

As an AI agent, I want a single `pml_execute` tool that handles both DAG and code execution,
So that I have a simplified API and the system always learns from my executions.

**Context:**
Phase 5 de la tech spec. Remplace `pml_execute_dag` et `pml_execute_code`.

**API Design:**
```typescript
pml_execute({
  intent: "analyser ce fichier JSON",

  // Optionnel - si l'IA veut forcer une implémentation
  implementation?: {
    type: "code" | "dag",
    code?: string,
    dagStructure?: DAGStructure,
  }
})
```

**Execution Flow:**
```
Intent → Implementation fournie?
           │
    ┌──────┴──────┐
    YES           NO
    │              │
    ▼              ▼
  Execute    Search graphe
  provided   (tools + caps)
    │              │
    │      ┌───────┴───────┐
    │      Confiance       Confiance
    │      haute           basse
    │      │               │
    │      ▼               ▼
    │    EXECUTE        RETURN
    │    (speculation)  suggestions
    │              │
    └──────────────┴──────────────┐
                                   ▼
                            After success:
                            - Create/update capability
                            - Update graph edges
```

**Acceptance Criteria:**

1. Handler `pml_execute` créé dans `src/mcp/handlers/`
2. Si `implementation` fournie → exécute directement (code ou dag)
3. Si pas d'implementation:
   - Appelle `pml_discover` en interne
   - Si confidence > seuil → exécute en speculation
   - Si confidence < seuil → retourne suggestions
4. Après succès (code ou dag):
   - Crée/update capability via `CapabilityStore`
   - Update graph edges
   - Trace structure (parallel, séquence)
5. Support `per_layer_validation` pour DAGs avec tools élevés
6. **Dépréciation** des anciens tools:
   - `pml_execute_dag` → deprecated
   - `pml_execute_code` → deprecated
7. Response unifiée:
   ```typescript
   {
     status: "success" | "approval_required" | "suggestions",
     result?: unknown,
     suggestions?: DiscoverResult[],
     capabilityId?: string,  // Si capability créée/updated
   }
   ```
8. Tests: execute avec intent seul → recherche + suggestion/execution
9. Tests: execute avec implementation code → exécute le code
10. Tests: execute avec implementation dag → exécute le dag
11. Tests: succès → capability créée avec inferredStructure

**Files to Create:**
- `src/mcp/handlers/execute-handler.ts` (~200 LOC)

**Files to Modify:**
- `src/mcp/gateway-server.ts` - Register new handler
- `src/mcp/handlers/workflow-execution-handler.ts` - Add deprecation

**Prerequisites:** Story 10.6 (pml_discover)

**Estimation:** 3-5 jours

---

**Story 10.8: pml_get_task_result - Result Fetching Meta-Tool**

As an AI agent reviewing DAG execution results, I want to fetch the full result of a specific task,
So that I can make informed decisions when the preview isn't sufficient.

**Context:**
Complémente le `resultPreview` (240 chars) déjà implémenté. Si l'IA a besoin de plus
de contexte pour décider, elle peut demander le résultat complet.

**API Design:**
```typescript
pml_get_task_result({
  workflow_id: string;
  task_id: string;
  offset?: number;      // Pour pagination (grands résultats)
  limit?: number;       // Longueur max à retourner
  format?: "raw" | "pretty";  // Formatage JSON
})
```

**Acceptance Criteria:**

1. Handler `pml_get_task_result` créé
2. Stockage des résultats complets:
   - Nouveau champ `fullResult` dans execution traces
   - Ou table séparée `task_results` (workflow_id, task_id, result)
3. Récupération avec pagination:
   - `offset` pour commencer à un point
   - `limit` pour limiter la taille
4. Formatage:
   - `raw`: JSON tel quel
   - `pretty`: JSON.stringify avec indentation
5. TTL sur les résultats stockés (configurable, default 1h)
6. Tests: execute dag → get_task_result → retourne résultat complet
7. Tests: pagination fonctionne sur grand résultat
8. Tests: résultat expiré → erreur appropriée

**Files to Create:**
- `src/mcp/handlers/task-result-handler.ts` (~80 LOC)

**Files to Modify:**
- `src/mcp/gateway-server.ts` - Register handler
- `src/dag/controlled-executor.ts` - Store full results

**Prerequisites:** Story 10.7 (pml_execute)

**Estimation:** 1-2 jours

---

**Story 10.9: Definition vs Invocation Views (Cytoscape)**

As a dashboard user, I want to toggle between Definition and Invocation views,
So that I can see either the abstract workflow structure or the actual execution.

**Context:**
Phase 6 de la tech spec. La vue Definition montre les nœuds dédupliqués (chaque tool une fois),
la vue Invocation montre chaque appel réel avec timestamps.

**View Differences:**

| Vue | Nœuds | Edges | Exemple |
|-----|-------|-------|---------|
| **Definition** | Dédupliqués | dependency, provides, contains | `fs:read` (1 nœud) |
| **Invocation** | Par appel | sequence, contains | `fs:read_1`, `fs:read_2` |

**Acceptance Criteria:**

1. Toggle button dans dashboard: `[Definition] [Invocation]`
2. **Vue Definition:**
   - Nœuds dédupliqués par tool/capability type
   - Edges: `dependency`, `provides`, `contains`
   - Layout optimisé pour structure
3. **Vue Invocation:**
   - Un nœud par appel réel (suffixe `_1`, `_2`, etc.)
   - Timestamps affichés sur les nœuds
   - Edges: `sequence` (basé sur ordre temporel)
   - Parallel visible par timestamps qui overlap
4. **Réutilise `capability_trace`** (Story 10.4) — pas de nouvelle table:
   - La table `capability_trace` contient déjà : executed_path, task_results, success, duration_ms
   - Ajouter colonne `arguments JSONB` si nécessaire pour stocker les args d'entrée
   - Vue Invocation = query `capability_trace` avec task_results détaillés
5. API endpoint `/api/traces/:capabilityId` (renommé de invocations)
6. Cytoscape layout adapté par vue:
   - Definition: dagre/hierarchical (depuis `static_structure`)
   - Invocation: timeline/temporal (depuis `capability_trace`)
7. Tests: même capability, 3 exécutions → Definition (1 nœud) vs Invocation (3 nœuds)
8. Tests: exécution avec parallélisme visible en Invocation view

**Files to Create:**
- `src/web/islands/DefinitionInvocationToggle.tsx` (~80 LOC)

**Files to Modify:**
- `src/web/routes/dashboard.tsx` - Add toggle
- `src/visualization/hypergraph-builder.ts` - Support both views

**Prerequisites:** Story 10.8, Epic 8 (Hypergraph visualization)

**Estimation:** 2-3 jours

---

**Story 10.10: Dry Run Mode with Mocks (Connector Debugging)** 🔮 FUTURE - Post-MVP

As a workflow developer, I want to dry-run code with mocked MCP responses,
So that I can debug and validate complex workflows without real side effects, especially for connector MCPs.

**Position dans l'Epic:**
- **NON NÉCESSAIRE pour le MVP** - Le parsing statique (10.1) suffit pour HIL/permissions
- Utile uniquement pour des cas avancés : estimation coût API, debug complexe, test connecteurs
- À implémenter SI et QUAND le besoin se présente

**Pourquoi le parsing statique suffit pour HIL:**
| Question HIL | Parsing statique | Dry run |
|--------------|------------------|---------|
| "Quels tools PEUVENT être appelés ?" | ✅ Détecté | Idem |
| "Quelles permissions nécessaires ?" | ✅ Détecté | Idem |
| "Y a-t-il des side effects ?" | ✅ Détecté | Idem |
| "Combien de fois exactement ?" | ❌ Inconnu | ✅ Avec mocks |

→ Les 3 premières questions suffisent pour HIL. La 4ème est un nice-to-have.

**Context:**
Le parsing statique (Story 10.1) suffit pour HIL/permissions, mais pour le **debugging** de workflows
complexes utilisant des MCP connecteurs (APIs externes, bases de données), on veut pouvoir :
- Voir exactement ce qui VA se passer avant de le faire
- Tester sans appeler les vraies APIs (coût, rate limits, effets de bord)
- Valider les données intermédiaires

**Use Cases spécifiques:**

| Use Case | Parsing Statique | Dry Run |
|----------|------------------|---------|
| HIL permissions | ✅ Suffit | Overkill |
| Estimation coût API | ❌ Approximatif | ✅ Exact (N appels) |
| Debug data flow | ❌ Types only | ✅ Vraies valeurs mockées |
| Test workflow sans side effects | ❌ Impossible | ✅ Full simulation |
| Validation avant prod | ❌ Statique | ✅ Comportement réel |

**Quand utiliser Dry Run vs Parsing:**
- **Parsing (10.1)** : Validation rapide, HIL, permissions → **toujours**
- **Dry Run (10.10)** : Debugging, estimation, test connecteurs → **opt-in depuis dashboard**

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard: "Test Workflow" button                          │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Mock MCP Proxy                                              │
│  - Intercepte tous les appels mcp.*.*()                     │
│  - Retourne mock responses basées sur output schemas        │
│  - Log chaque appel avec timestamp, args, mock result       │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Sandbox Execution (mode: dry_run)                          │
│  - Exécute le vrai code                                     │
│  - Mais avec mcp = mockMcpProxy                             │
│  - Capture le flow réel d'exécution                         │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Dry Run Report                                              │
│  - Liste exacte des appels qui seraient faits              │
│  - Données mockées à chaque étape                          │
│  - Warnings si comportement dépend des données réelles     │
└─────────────────────────────────────────────────────────────┘
```

**Mock Response Generation:**
```typescript
// Génère mock response depuis le schema MCP
function generateMockResponse(toolSchema: ToolSchema): unknown {
  // Utilise le output_schema pour générer des données réalistes
  // Ex: { type: "string" } → "mock_string_value"
  // Ex: { type: "object", properties: { id: { type: "number" } } } → { id: 12345 }
}

// Pour les connecteurs connus, on peut avoir des mocks plus intelligents
const CONNECTOR_MOCKS: Record<string, MockGenerator> = {
  "github:api": generateGitHubMock,      // Retourne des PRs, issues mockés
  "slack:post": generateSlackMock,       // Retourne { ok: true, ts: "..." }
  "postgres:query": generatePostgresMock, // Retourne rows mockées
};
```

**Acceptance Criteria:**

1. `MockMcpProxy` class créée:
   ```typescript
   interface MockMcpProxy {
     onToolCall(server: string, tool: string, args: unknown): Promise<unknown>;
     getCapturedCalls(): CapturedCall[];
     reset(): void;
   }

   interface CapturedCall {
     server: string;
     tool: string;
     args: unknown;
     mockResponse: unknown;
     timestamp: number;
     durationMs: number;
   }
   ```
2. Génération de mock responses depuis `tool_schema.output_schema`
3. Support pour mocks custom par connecteur (GitHub, Slack, DB, etc.)
4. Intégration sandbox: `execute(code, { mode: "dry_run" })`
5. `DryRunReport` généré après exécution:
   ```typescript
   interface DryRunReport {
     capturedCalls: CapturedCall[];
     executionTimeMs: number;
     warnings: string[];           // "Response depends on real data"
     estimatedApiCalls: number;
     estimatedCost?: number;       // Si on a des infos de pricing
   }
   ```
6. UI Dashboard: bouton "Test Workflow" sur les capabilities
7. UI Dashboard: affichage du DryRunReport (timeline des appels)
8. Tests: dry run avec 3 tools séquentiels
9. Tests: dry run avec boucle → capture tous les appels
10. Tests: mock custom pour connecteur GitHub

**Files to Create:**
- `src/sandbox/mock-mcp-proxy.ts` (~150 LOC)
- `src/sandbox/mock-generators.ts` (~100 LOC)
- `src/web/islands/DryRunReport.tsx` (~120 LOC)

**Files to Modify:**
- `src/sandbox/worker-bridge.ts` - Support mode dry_run (~30 LOC)
- `src/web/routes/dashboard.tsx` - Add "Test Workflow" button (~20 LOC)

**Prerequisites:** Story 10.7 (pml_execute), Epic 8 (Dashboard)

**Estimation:** 3-4 jours

**Note:** Cette story est **optionnelle pour le MVP**. Le parsing statique (10.1) suffit
pour le HIL. Le dry run est un nice-to-have pour le debugging avancé de workflows
avec des MCP connecteurs externes.

---

### Epic 10 Breaking Changes Summary

| Phase | Change | Breaking? | Impact |
|-------|--------|-----------|--------|
| 1 | `static_structure` in dag_structure | ❌ No | Additive |
| 2 | `result` in traces | ❌ No | Additive |
| 3 | `provides` EdgeType | ❌ No | Additive |
| 4 | New table `capability_trace` | ❌ No | Additive |
| 5 | Capability `source: code \| dag` | ⚠️ **Yes** | Schema change |
| 6 | Deprecate `pml_search_*` | ⚠️ **Yes** | MCP APIs |
| 7 | Deprecate `pml_execute_*` | ⚠️ **Yes** | MCP APIs |

**Migration Strategy:** Breaking changes in Phase 5-7. No transition period - clean cut.

---

### Epic 10 Dependencies — RÉVISÉES

```
┌─────────────────────────────────────────────────────────────────┐
│  FLOW SÉQUENTIEL (Capability d'abord, Traces ensuite)            │
│                                                                  │
│  ★ Story 10.1 (Static Analysis → Capability Creation)           │
│        │  ← VRAIE FONDATION : crée la Capability avec           │
│        │     static_structure, provides edges, HIL               │
│        │                                                         │
│        ├──────────────────┐                                      │
│        │                  │                                      │
│        ▼                  ▼                                      │
│  Story 10.2          Story 10.3                                  │
│  (result tracing)    (provides edge types)                       │
│        │                  │                                      │
│        └────────┬─────────┘                                      │
│                 ▼                                                │
│          Story 10.4 (Trace Storage & Learning)                   │
│                 │  ← Stocke traces dans capability_trace        │
│                 │     Met à jour dag_structure.learning          │
│                 ▼                                                │
│          Story 10.5 (Unified Capability Model)                   │
│                 │  ← source: code | dag | tool                  │
│                 ▼                                                │
│          Story 10.6 (pml_discover)                               │
│                 │                                                │
│                 ▼                                                │
│          Story 10.7 (pml_execute)                                │
│                 │                                                │
│                 ▼                                                │
│          Story 10.8 (pml_get_task_result)                        │
│                 │                                                │
│                 ▼                                                │
│          Story 10.9 (Definition/Invocation views)                │
│                 │                                                │
│                 ▼                                                │
│          Story 10.10 (Dry Run) ← Optional                        │
└─────────────────────────────────────────────────────────────────┘
```

**Ordre d'implémentation recommandé (RÉVISÉ):**

| Ordre | Story | Justification |
|-------|-------|---------------|
| 1 | **10.1** Static Analysis | **VRAIE FONDATION** - crée la Capability avec static_structure |
| 2 | **10.2** Result Tracing | Quick win - ajoute `result` aux traces |
| 3 | **10.3** Provides Edge | Types d'edges pour data flow |
| 4 | **10.4** Trace Storage | Stocke traces + update learning (dépend de 10.1 et 10.2) |
| 5 | **10.5** Unified Capability | source: code \| dag \| tool |
| 6 | **10.6** pml_discover | API unifiée de découverte |
| 7 | **10.7** pml_execute | API unifiée d'exécution |
| 8 | **10.8** pml_get_task_result | Complément pour AIL |
| 9 | **10.9** Views | UI Definition/Invocation |
| 10 | **10.10** Dry Run | Optional, pour debug connecteurs |

**Changement clé par rapport à avant:**
- **AVANT:** 10.2 était la fondation, 10.1 était optionnel
- **MAINTENANT:** 10.1 est la fondation, crée la Capability avec structure complète
- 10.4 stocke les Traces (pas reconstruction), dépend de 10.1

**Pourquoi 10.1 d'abord?**
1. La Capability est créée à l'analyse statique (structure complète avec conditions)
2. Les traces référencent les nodeIds de static_structure
3. L'HIL fonctionne immédiatement (on connaît les tools avant exécution)
4. L'apprentissage agrège les traces par chemin

**External Dependencies:**
- Epic 7 Story 7.1b (Worker RPC Bridge)
- HIL Phase 2 (per_layer_validation, resultPreview)
- Epic 8 (Hypergraph visualization for Story 10.9)

---

### Epic 10 FR Coverage

| FR | Description | Story |
|----|-------------|-------|
| **FR1** | **Capability Creation à l'analyse statique (static_structure)** | **10.1** |
| **FR1b** | **Validation permissions avant exécution** | **10.1** |
| **FR1c** | **HIL pre-execution approval flow** | **10.1** |
| **FR1d** | **Détection conditions/branches dans static_structure** | **10.1** |
| FR2 | Tracer `result` des tools et capabilities | 10.2 |
| FR3 | Edge type `provides` avec coverage | 10.3 |
| FR4 | **Stockage traces + agrégation learning** (capability_trace) | 10.4 |
| FR5 | Capability unifiée (code OU dag) | 10.5 |
| FR6 | API `pml_discover` unifiée | 10.6 |
| FR7 | API `pml_execute` unifiée | 10.7 |
| FR8 | `pml_get_task_result` pour résultats complets | 10.8 |
| FR9 | Vue Definition vs Invocation | 10.9 |
| FR10 | Dépréciation anciennes APIs | 10.6, 10.7 |
| FR11 | Learning automatique après succès | 10.7 |
| FR12 | Dry Run avec Mocks pour connecteurs (optional) | 10.10 |

### Epic 10 → PRD FR Traceability Matrix

> **Note:** Cette table lie les FRs locaux de l'Epic 10 aux FRs globaux du PRD pour assurer la traçabilité.

| Epic 10 FR | PRD FR | PRD Requirement | Relation |
|------------|--------|-----------------|----------|
| FR1 | FR005 | Analyser dépendances input/output pour construire graphe DAG | **Implements** |
| FR1 | FR006 | Identifier automatiquement tools parallèles vs séquentiels | **Implements** |
| FR1b | FR017 | Exécution TypeScript dans Deno sandbox isolé | **Extends** |
| FR1c | FR018 | Branches DAG safe-to-fail (resilient workflows) | **Extends** |
| FR2 | FR014 | Tracker métriques contexte et latence (opt-in) | **Extends** |
| FR2 | FR015 | Générer logs structurés pour debugging | **Extends** |
| FR3 | FR005 | Analyser dépendances input/output pour construire graphe DAG | **Extends** |
| FR4 | FR005 | Analyser dépendances input/output pour construire graphe DAG | **Implements** |
| FR4 | FR006 | Identifier automatiquement tools parallèles vs séquentiels | **Implements** |
| FR5 | FR017 | Exécution TypeScript dans Deno sandbox isolé | **Extends** |
| FR5 | FR019 | Injecter MCP tools dans contexte sandbox via vector search | **Extends** |
| FR6 | FR002 | Recherche sémantique pour identifier top-k tools pertinents | **Unifies** |
| FR6 | FR003 | Charger tool schemas on-demand pour tools pertinents | **Unifies** |
| FR7 | FR007 | Exécuter simultanément branches indépendantes du DAG | **Unifies** |
| FR7 | FR017 | Exécution TypeScript dans Deno sandbox isolé | **Unifies** |
| FR8 | FR008 | Streamer résultats via SSE pour feedback progressif | **Extends** |
| FR9 | FR014 | Tracker métriques contexte et latence (opt-in) | **Extends** |
| FR10 | - | N/A (internal cleanup) | **Internal** |
| FR11 | - | N/A (Epic 7 extension) | **Epic 7** |
| FR12 | FR017 | Exécution TypeScript dans Deno sandbox isolé | **Optional** |

**Legend:**
- **Implements**: Implémentation directe du FR PRD
- **Extends**: Étend/améliore un FR PRD existant
- **Unifies**: Unifie plusieurs FRs PRD en une seule API
- **Internal**: Nettoyage interne sans FR PRD correspondant
- **Optional**: Feature optionnelle

---

### Epic 10 Estimation Summary

| Ordre | Story | Description | Effort | Cumulative |
|-------|-------|-------------|--------|------------|
| 1 | **10.1** | **Static Analysis → Capability** ⭐ FONDATION | **3-4j** | **4j** |
| 2 | 10.2 | Result Tracing (quick win) | 0.5-1j | 5j |
| 3 | 10.3 | Provides Edge | 1-2j | 7j |
| 4 | 10.4 | Trace Storage + PER/TD Learning | 3-4j | 11j |
| 5 | 10.5 | Unified Capability | 2-3j | 14j |
| 6 | 10.6 | pml_discover | 2-3j | 17j |
| 7 | 10.7 | pml_execute | 3-5j | 21j |
| 8 | 10.8 | pml_get_task_result | 1-2j | 23j |
| 9 | 10.9 | Definition/Invocation | 2-3j | 26j |
| 10 | 10.10 | Dry Run + Mocks (optional) | 3-4j | 30j |

**Total MVP (10.1-10.9): ~4-5 semaines**
**Total avec 10.10: ~5-6 semaines**

**🎯 Story 10.1 (Static Analysis) est la vraie fondation car:**
1. Crée la Capability avec `static_structure` AVANT exécution
2. Les traces (10.4) référencent les nodeIds de static_structure
3. L'HIL fonctionne immédiatement (on connaît les tools avant exécution)
4. Les conditions/branches sont visibles dans la structure, pas perdues

**📝 Story 10.2 (Result Tracing) est un quick win:**
1. ~5-10 LOC à modifier dans worker-bridge.ts et code-generator.ts
2. Débloque 10.3 (provides edges calculated from results)
3. Peut être faite rapidement après 10.1

**📋 Story 10.10 (Dry Run) est optionnelle car:**
- Le parsing statique (10.1) suffit pour HIL/permissions
- Dry run = nice-to-have pour debugging de workflows avec connecteurs
- Utile quand on a des MCP APIs externes (GitHub, Slack, DB, etc.)
