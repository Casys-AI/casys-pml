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

### Unified Learning Model (Philosophy)

> **Principe fondamental:** Le CODE est le chemin principal. Les DAGs émergent de l'exécution,
> ils ne sont pas définis à priori. Une Capability est un workflow validé par l'usage.

**Le flow d'apprentissage:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. INTENT                                                               │
│     "Analyser ce fichier JSON et créer un ticket GitHub"                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. CAPABILITY EXISTS?                                                   │
│     Recherche GraphRAG: intent → capabilities existantes                │
│     Match > 0.85 ? → Replay capability (skip to step 6)                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ NO MATCH
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. CODE GENERATION                                                      │
│     L'IA génère du TypeScript qui appelle des MCP tools                 │
│     ```typescript                                                        │
│     const content = await mcp.fs.read({ path: "data.json" });           │
│     const parsed = JSON.parse(content);                                 │
│     await mcp.github.createIssue({ title: parsed.summary, ... });       │
│     ```                                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. CODE EXECUTION (Sandbox)                                             │
│     - Traces capturées: tool_start, tool_end + result                   │
│     - Timestamps pour détection parallélisme                            │
│     - HIL si tools sensibles détectés                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  5. DAG RECONSTRUCTION (POST-EXEC)                                       │
│     Traces → DAGStructure:                                              │
│     - Tasks: fs:read → json:parse → github:createIssue                  │
│     - Dependencies: data flow détecté via result → args                 │
│     - Parallel: timestamps overlapping = pas de dépendance              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  6. CAPABILITY CREATED/UPDATED                                           │
│     Le DAG reconstruit devient une Capability réutilisable              │
│     Stockée avec: intent_embedding, source (code ou dag), success_rate  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  7. NEXT TIME: REPLAY                                                    │
│     Intent similaire → Capability matchée → Exécution sans regénération │
└─────────────────────────────────────────────────────────────────────────┘
```

**Capabilities = Tools abstraits:**

Une Capability n'est pas forcément un DAG interne. Elle peut être:

| Type | Exemple | Exécution |
|------|---------|-----------|
| **DAG interne** | `fs:read → json:parse → github:createIssue` | PML exécute les tasks |
| **Code snippet** | TypeScript avec logique complexe | Sandbox PML |
| **Tool externe** | Temporal workflow, Airflow DAG | Délégation à l'orchestrateur |

**Exemple Temporal:**

```typescript
// Capability apprise: "deploy_to_production"
// Au lieu de reconstruire le DAG, on délègue à Temporal
{
  type: "external_tool",
  tool: "temporal:startWorkflow",
  workflowId: "deploy-prod-v2",
  args: { version: "{{input.version}}" }
}
```

→ PML apprend que pour "deploy to production", le meilleur chemin est d'appeler Temporal,
pas d'exécuter 15 tools MCP séquentiellement.

**Implications pour l'implémentation:**

1. **Story 10.7 `pml_execute`**: L'option `implementation.type = "dag"` est pour **replay**,
   pas pour l'exécution normale. Le chemin par défaut = code → traces → learning.

2. **Capability.source** peut être:
   - `{ type: "code", code: string }` - Code TypeScript
   - `{ type: "dag", dagStructure: DAGStructure }` - DAG interne reconstruit
   - `{ type: "tool", toolId: string, args: Record }` - Délégation à un tool (ex: Temporal)

3. **Learning continu**: Chaque exécution réussie améliore la capability
   (success_rate++, structure raffinée).

4. **Gestion des conditionnels (KISS):**
   - On capture **ce qui s'est passé** (traces réelles), pas ce qui pourrait se passer
   - La capability représente le **pattern dominant** (happy path)
   - Si les arguments changent le chemin d'exécution → on trace la variante
   - **Future:** Merge des branches si le besoin est prouvé (pas dans Epic 10)

   ```
   Exécution 1: args={exists:true}  → trace [fs:read]           → count++
   Exécution 2: args={exists:false} → trace [fs:create,fs:write] → variant tracked
   Exécution 3: args={exists:true}  → trace [fs:read]           → count++

   → Capability.dominantPath = [fs:read] (66% des exécutions)
   → Capability.variants = [{ path: [fs:create,fs:write], count: 1 }]
   ```

---

**Architecture Unifiée:**

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
│  │  EXECUTION (Sandbox)                                 │        │
│  │  - Traces: tool_start/end + result                  │        │
│  │  - Timestamps pour parallel detection               │        │
│  └─────────────────────────────────────────────────────┘        │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  LEARNING                                            │        │
│  │  - Reconstruction DAG depuis traces                  │        │
│  │  - Création/update Capability                        │        │
│  │  - Edges: provides (definition) + sequence (invoc)   │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Estimation:** 10 stories (9 MVP + 1 optional), ~3-4 semaines MVP

---

### Story Breakdown - Epic 10

**Story 10.1: Static Code Analysis - DAG Preview (PRE-EXECUTION)** ∥ PARALLEL avec Track A

As an execution system, I want to parse code statically to generate a DAG preview BEFORE execution,
So that I can validate permissions, detect tools, and enable proper HIL/AIL approval flows.

**Position dans l'Epic:**
- Peut être développée **en parallèle** avec Track A (10.2 → 10.3 → 10.4)
- N'est PAS un prérequis pour 10.2-10.4 (contrairement à ce qui était indiqué avant)
- Devient nécessaire pour 10.5 (unified capability) et 10.7 (pml_execute avec HIL)

**Context:**
C'est le **chaînon manquant** entre le code et la validation par layer. Sans parsing statique :
- On ne peut pas savoir quels tools seront appelés avant d'exécuter
- L'AIL/HIL doit attendre l'échec au lieu de prévenir
- `per_layer_validation` ne peut pas calculer `requiresValidation()` correctement

**Différence avec Story 10.4 (Reconstruction POST-exec):**

| Aspect | 10.1 Static (PRE) | 10.4 Traces (POST) |
|--------|--------------------|--------------------|
| **Quand** | Avant exécution | Après exécution |
| **Input** | Code source (AST) | Traces d'exécution |
| **Précision** | Approximatif (code dynamique) | Exact (ce qui s'est passé) |
| **Use case** | Validation, HIL preview | Learning, replay |

**Réutilisation de l'existant (pas une réécriture !):**

On a DÉJÀ tout le pipeline SWC :
- `SchemaInferrer` (726 LOC, 19 tests) → parse AST, trouve `args.xxx`, infère types
- `PermissionInferrer` (510 LOC) → parse AST, détecte patterns dangereux
- `tool_schema` table → schemas input/output des MCP tools
- `workflow_pattern` table → schemas des capabilities

**Story 10.1 = Extension de ~100-150 LOC**, pas 250 LOC from scratch.

**Architecture:**
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
│  Call Detector (Tools + Capabilities)                        │
│  - `mcp.server.tool()` → lookup tool_schema                 │
│  - `capabilities.name()` → lookup workflow_pattern           │
│  - `await` → dépendance séquentielle                        │
│  - `Promise.all()` → parallélisme                           │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Schema Validation (provides edges)                          │
│  - tool A output → tool B input : types compatibles ?       │
│  - capability output → tool input : chaînage valide ?       │
│  - Utilise les schemas qu'on a DÉJÀ en DB                   │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  DAG Preview Generator                                       │
│  - Tasks: tools ET capabilities détectés                    │
│  - dependsOn inféré depuis variables + schemas              │
│  - Flag: preview: true (peut être incomplet si dynamique)   │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
Validation permissions → HIL si nécessaire → Exécution
```

**Patterns à détecter:**

```typescript
// Pattern 1: Appel MCP tool simple
const result = await mcp.fs.read({ path: "config.json" });
// → Task { type: "tool", tool: "fs:read", dependsOn: [] }

// Pattern 2: Appel capability
const summary = await capabilities.summarize({ text: content });
// → Task { type: "capability", capability: "summarize", dependsOn: [] }

// Pattern 3: Séquence avec validation schema
const config = await mcp.fs.read({ path: "config.json" });
const data = await mcp.json.parse({ json: config });
// → fs:read.output.content → json:parse.input.json ✓ (via schemas)
// → Task json:parse dependsOn: [fs:read]

// Pattern 4: Chaînage capability → tool
const summary = await capabilities.summarize({ text: args.input });
const translated = await mcp.translate.text({ content: summary });
// → summarize.output → translate.input ✓ (via workflow_pattern + tool_schema)

// Pattern 5: Parallèle
const [a, b] = await Promise.all([
  mcp.api.fetch({ url: urlA }),
  mcp.api.fetch({ url: urlB }),
]);
// → Task api:fetch_1, Task api:fetch_2, pas de dependsOn entre eux

// Pattern 6: Conditionnel → détecté comme appel potentiel
if (condition) {
  await mcp.db.write({ data });
}

// Pattern 7: Loop → détecté comme appel potentiel
for (const item of items) {
  await mcp.process.run({ item });
}
```

**Gestion des Loops et Conditions - Approche minimaliste:**

On ne stocke PAS si c'est loop/conditionnel. Pourquoi ?

| Vue | Ce qu'on voit | Suffisant ? |
|-----|---------------|-------------|
| **HIL pre-approval** | "db:write peut être appelé" | ✅ Oui |
| **Invocation** | Traces réelles (N appels si loop) | ✅ Oui |
| **Definition** | Tool existe dans le graphe | ✅ Oui |

**Conclusion** : Le parsing détecte TOUS les appels potentiels → HIL approuve → traces montrent la réalité.

**Acceptance Criteria:**

1. `CodeToDAGParser` class créée, **étend les patterns de SchemaInferrer**
2. Réutilise le même `parse()` SWC et la même traversée AST que SchemaInferrer/PermissionInferrer
3. Method `parseToDAGPreview(code: string, db: PGliteClient)` → `DAGPreview`:
   ```typescript
   interface DAGPreview {
     tasks: PreviewTask[];
     isComplete: boolean;        // false si code dynamique détecté
     dynamicSections: string[];  // ["line 15: conditional", "line 23: loop"]
     detectedTools: string[];    // Liste unique des tools
     detectedCapabilities: string[];  // Liste des capabilities appelées
     schemaValidation: SchemaValidationResult[];  // Chaînages validés
   }

   interface PreviewTask {
     id: string;
     type: "tool" | "capability";
     name: string;               // tool_id ou capability name
     dependsOn: string[];
     sourceLocation: { line: number; column: number };
   }

   // Note: Pas de `certainty` - on détecte TOUS les appels potentiels.
   // Les traces POST-exec montrent ce qui s'est vraiment passé.

   interface SchemaValidationResult {
     from: string;
     to: string;
     valid: boolean;
     matchedFields: string[];    // Quels champs output→input matchent
   }
   ```
4. Détection des appels:
   - `mcp.*.*()` → lookup `tool_schema` pour validation
   - `capabilities.*()` → lookup `workflow_pattern` pour validation
5. Validation des chaînages via schemas:
   - Variable assignment tracking (comme SchemaInferrer fait déjà)
   - Lookup schemas en DB pour valider output→input compatibility
6. Détection control flow (pour dependsOn):
   - `await` séquentiel → dépendance
   - `Promise.all/allSettled` → parallélisme (pas de dependsOn entre eux)
   - Traverser `if/else`, `for/while/map` pour trouver les appels à l'intérieur
7. **Intégration avec `requiresValidation()`:**
   - Avant exécution, parse le code
   - Extraire `detectedTools` + `detectedCapabilities`
   - Vérifier permissions via `getToolPermissionConfig()`
8. **Intégration avec HIL:**
   - Si tool avec `approvalMode: "hil"` détecté → preview AVANT exécution
9. Tests: code avec tools → détection correcte
10. Tests: code avec capabilities → détection correcte
11. Tests: chaînage tool→tool → validation schema
12. Tests: chaînage capability→tool → validation schema
13. Tests: code avec if/loop → tous les appels internes détectés

**Files to Create:**
- `src/capabilities/code-to-dag-parser.ts` (~100-150 LOC, étend patterns existants)

**Files to Modify:**
- `src/capabilities/schema-inferrer.ts` - Extraire méthodes communes si besoin (~20 LOC)
- `src/mcp/handlers/code-execution-handler.ts` - Intégrer preview (~30 LOC)

**Prerequisites:** Story 7.2b (SWC parsing - DONE)

**Estimation:** 2-3 jours

**Lien avec HIL Phase 4:**
Cette story est le **enabler** pour le vrai HIL per-task (Option B de la tech spec HIL).
Avec le DAG preview, on peut demander l'approbation AVANT d'exécuter, pas après l'échec.

---

**Story 10.2: Result Tracing - Capture des Résultats d'Exécution** ⭐ FONDATION - START HERE

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

**Story 10.4: DAG Reconstruction from Traces (POST-EXECUTION)**

As a learning system, I want to reconstruct a DAGStructure from code execution traces,
So that code-based workflows can be replayed as DAGs.

**Context:**
Phase 2 de la tech spec. Avec les traces enrichies (result), on peut détecter les
dépendances data réelles: "si args de B contient result de A, alors B dépend de A".

**Algorithm:**
```typescript
function detectDataDependencies(traces: TraceEvent[]): string[] {
  for (const prevTrace of traces) {
    if (containsValue(currentTrace.args, prevTrace.result)) {
      dependsOn.push(prevTrace.traceId);
    }
  }
}

function containsValue(args, result): boolean {
  // Match exact ou partiel (champs extraits d'un objet)
}
```

**Acceptance Criteria:**

1. `DAGReconstructor` class créée (`src/graphrag/dag-reconstruction.ts`)
2. Method `reconstructFromTraces(traces: TraceEvent[])` → `DAGStructure`
3. Détection dépendances data:
   - Match exact: `JSON.stringify(args).includes(JSON.stringify(result))`
   - Match partiel: champs individuels d'un objet result
4. Détection parallélisme via timestamps:
   - Si `endTime(A) < startTime(B)` → séquence
   - Si timestamps overlap → parallel (pas d'edge)

   > **BUG FIX:** Actuellement `execution-learning.ts` crée des edges `sequence`
   > basés uniquement sur l'**ordre dans l'array**, ce qui est incorrect pour les
   > exécutions parallèles. Le fix utilise **timestamps (ts + durationMs) EN DUO
   > avec l'ordre array**:
   > - `ts + durationMs` → détermine si overlap (parallel) ou séquence
   > - `ordre array` → détermine la direction de l'edge quand séquence
   >   (A avant B dans l'array ET pas d'overlap → edge A→B)
5. `inferredStructure` ajouté à `Capability`:
   ```typescript
   inferredStructure: {
     tools: string[];
     edges: Array<{ from, to, type }>;
     executionOrder: ExecutionOrder;  // ← NOUVEAU
   }
   ```
6. **`executionOrder` structure** - Capture séquence ET parallélisme en une structure nested:
   ```typescript
   // Type: (string | ExecutionOrder[])[]
   // Exemples:
   ["A", "B", "C"]           // Séquence simple
   ["A", ["B", "C"], "D"]    // A → (B || C) → D (fan-out/fan-in)
   ["fs:read", ["fs:read", "http:get"], "json:parse"]  // Same tool 2x = position implicite
   ```
   - Calculé UNE fois à l'exécution (via ts + durationMs)
   - Stocké dans `dag_structure.execution_order` (JSONB)
   - Pas de recalcul à chaque lecture
   - Same tool appelé 2x → position dans l'array = identifiant implicite, détails dans traces
7. Method `buildExecutionOrder(traces: TraceEvent[])` → `ExecutionOrder`:
   - Trier traces par `ts` (start time)
   - Calculer `endTime = ts + durationMs` pour chaque trace
   - Grouper les traces dont timestamps overlap → array nested
   - Les autres → string simple dans l'ordre
8. Tests: trace séquence A→B→C → `executionOrder: ["A", "B", "C"]`
9. Tests: trace parallèle [A, B]→C → `executionOrder: ["A", ["B", "C"]]` + edges A→C, B→C
10. Tests: trace avec result utilisé partiellement (result.data.id) → dépendance détectée
11. Tests: same tool 2x séquentiel → `["fs:read", "fs:read"]`, distingués par position

**Files to Create:**
- `src/graphrag/dag-reconstruction.ts` (~200 LOC, inclut `buildExecutionOrder`)

**Files to Modify:**
- `src/capabilities/types.ts` (~30 LOC, ajout `ExecutionOrder` type)
- `src/capabilities/capability-store.ts` (~10 LOC, stockage `execution_order`)

**Prerequisites:** Story 10.2, Story 10.3

**Estimation:** 2-3 jours (inchangé, `executionOrder` est ~0.5j inclus)

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
2. `Capability.inferredStructure` ajouté (from Story 10.4)
3. Migration DB: transformer `code` → `source` JSON column
4. `CapabilityStore.saveCapability()` updated:
   - Accepte `source` au lieu de `code`
   - Appelle `DAGReconstructor` si type=code pour générer `inferredStructure`
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

**Prerequisites:** Story 10.4 (DAG reconstruction)

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
   - Edges: `dependency`, `provides`, `contains`, `alternative`
   - Layout optimisé pour structure
3. **Vue Invocation:**
   - Un nœud par appel réel (suffixe `_1`, `_2`, etc.)
   - Timestamps affichés sur les nœuds
   - Edges: `sequence` (basé sur ordre temporel)
   - Parallel visible par timestamps qui overlap
4. Table `capability_invocations` créée:
   ```typescript
   {
     id: string;
     capabilityId: string;
     timestamp: Date;
     arguments: Record<string, unknown>;
     results: TaskResult[];
     success: boolean;
     durationMs: number;
   }
   ```
5. API endpoint `/api/invocations/:capabilityId`
6. Cytoscape layout adapté par vue:
   - Definition: dagre/hierarchical
   - Invocation: timeline/temporal
7. Tests: même capability, 3 exécutions → Definition (1 nœud) vs Invocation (3 nœuds)
8. Tests: exécution avec parallélisme visible en Invocation view

**Files to Create:**
- `src/db/migrations/XXX_capability_invocations.ts` (~40 LOC)
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
| 1 | `result` in traces | ❌ No | Additive |
| 2 | `provides` EdgeType | ❌ No | Additive |
| 3 | Capability `source: code \| dag` | ⚠️ **Yes** | Schema change |
| 4 | Deprecate `pml_search_*` | ⚠️ **Yes** | MCP APIs |
| 5 | Deprecate `pml_execute_*` | ⚠️ **Yes** | MCP APIs |
| 6 | New table `capability_invocations` | ❌ No | Additive |

**Migration Strategy:** Breaking changes in Phase 3-5. No transition period - clean cut.

---

### Epic 10 Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│  DEUX TRACKS PARALLÈLES                                          │
│                                                                  │
│  Track A (Learning - POST-exec):    Track B (HIL - PRE-exec):   │
│  ────────────────────────────────   ─────────────────────────   │
│                                                                  │
│  ★ Story 10.2 (result tracing)      Story 10.1 (static analysis)│
│        │  ← VRAIE FONDATION              │                      │
│        │                                 │  (indépendant)       │
│        ▼                                 │                      │
│  Story 10.3 (provides edge)              │                      │
│        │                                 │                      │
│        ▼                                 │                      │
│  Story 10.4 (DAG reconstruction)         │                      │
│        │                                 │                      │
│        └────────────┬────────────────────┘                      │
│                     ▼                                            │
│              Story 10.5 (unified capability)                     │
│                     │  ← Merge 10.1 + 10.4                      │
│                     ▼                                            │
│              Story 10.6 (pml_discover)                           │
│                     │                                            │
│                     ▼                                            │
│              Story 10.7 (pml_execute) ← Intègre 10.1 pour HIL   │
│                     │                                            │
│                     ▼                                            │
│              Story 10.8 (pml_get_task_result)                    │
│                     │                                            │
│                     ▼                                            │
│              Story 10.9 (Definition/Invocation views)            │
│                     │                                            │
│                     ▼                                            │
│              Story 10.10 (Dry Run) ← Optional                    │
└─────────────────────────────────────────────────────────────────┘
```

**Ordre d'implémentation recommandé:**

| Ordre | Story | Justification |
|-------|-------|---------------|
| 1 | **10.2** Result Tracing | Vraie fondation - sans `result` dans traces, rien ne marche |
| 2 | **10.3** Provides Edge | Utilise les traces enrichies |
| 3 | **10.4** DAG Reconstruction | Reconstruction POST-exec |
| ∥ | **10.1** Static Analysis | **En parallèle** avec 10.2-10.4, ou après |
| 4 | **10.5** Unified Capability | Merge 10.1 (PRE) + 10.4 (POST) |
| 5 | **10.6** pml_discover | API unifiée de découverte |
| 6 | **10.7** pml_execute | API unifiée d'exécution |
| 7 | **10.8** pml_get_task_result | Complément pour AIL |
| 8 | **10.9** Views | UI Cytoscape |
| 9 | **10.10** Dry Run | Optional, pour debug connecteurs |

**Note sur Story 10.1 (Static Analysis):**
- N'est PAS un prérequis pour 10.2-10.4 (contrairement à ce qui était indiqué avant)
- Peut être fait en parallèle ou après le Track A
- Devient nécessaire pour 10.5 (unified capability) et 10.7 (pml_execute avec HIL)

**External Dependencies:**
- Epic 7 Story 7.1b (Worker RPC Bridge)
- HIL Phase 2 (per_layer_validation, resultPreview)
- Epic 8 (Hypergraph visualization for Story 10.9)

---

### Epic 10 FR Coverage

| FR | Description | Story |
|----|-------------|-------|
| **FR1** | **DAG Preview pré-exécution (parsing statique)** | **10.1** |
| **FR1b** | **Validation permissions avant exécution** | **10.1** |
| **FR1c** | **HIL pre-execution approval flow** | **10.1** |
| FR2 | Tracer `result` des tools et capabilities | 10.2 |
| FR3 | Edge type `provides` avec coverage | 10.3 |
| FR4 | Reconstruction DAG depuis traces code | 10.4 |
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
| 1 | **10.2** | **Result Tracing** ⭐ FONDATION | **0.5-1j** | **1j** |
| 2 | 10.3 | Provides Edge | 1-2j | 3j |
| 3 | 10.4 | DAG Reconstruction (POST-exec) | 2-3j | 6j |
| ∥ | 10.1 | Static Analysis (PRE-exec) ~100-150 LOC | 2-3j | ∥ |
| 4 | 10.5 | Unified Capability | 2-3j | 9j |
| 5 | 10.6 | pml_discover | 2-3j | 12j |
| 6 | 10.7 | pml_execute | 3-5j | 16j |
| 7 | 10.8 | pml_get_task_result | 1-2j | 18j |
| 8 | 10.9 | Definition/Invocation | 2-3j | 21j |
| 9 | 10.10 | Dry Run + Mocks (optional) | 3-4j | 25j |

**Total MVP (10.1-10.9): ~3-4 semaines**
**Total avec 10.10: ~4-5 semaines**

**🎯 Story 10.2 (Result Tracing) est la vraie fondation car:**
1. Sans `result` dans les traces, impossible de détecter les dépendances data
2. Débloque 10.3 (provides edges) et 10.4 (DAG reconstruction)
3. Quick win : ~5-10 LOC à modifier dans worker-bridge.ts et code-generator.ts

**📝 Story 10.1 (Static Analysis) est importante mais pas bloquante:**
1. Peut être faite en parallèle avec Track A (10.2 → 10.3 → 10.4)
2. Réutilise l'existant : SchemaInferrer (726 LOC), PermissionInferrer (510 LOC)
3. Devient nécessaire pour 10.5 (unified capability) et 10.7 (HIL pre-execution)

**📋 Story 10.10 (Dry Run) est optionnelle car:**
- Le parsing statique (10.1) suffit pour HIL/permissions
- Dry run = nice-to-have pour debugging de workflows avec connecteurs
- Utile quand on a des MCP APIs externes (GitHub, Slack, DB, etc.)
