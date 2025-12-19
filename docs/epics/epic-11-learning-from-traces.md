# Epic 11: Learning from Execution Traces

> **Status:** Proposed (2025-12-18)
> **Author:** Erwan + Claude
> **Depends on:** Epic 10 (Capability Creation & Unified APIs)

> **⚠️ CLARIFICATION ARCHITECTURE (2025-12-19)**
>
> **Source des traces:** Les traces d'exécution proviennent du **WorkerBridge RPC**, pas d'appels MCP directs.
>
> **Pourquoi c'est important:**
> - Le Worker exécute avec `permissions: "none"` (sandbox isolée)
> - Tous les appels MCP passent par le proxy RPC (`postMessage`)
> - Cela garantit **100% traçabilité** - aucun appel ne bypass le système
>
> **Prérequis architectural:** Story 10.5 (Architecture Unifiée) doit être complétée
> pour que `ControlledExecutor` utilise `WorkerBridge` au lieu d'appels directs.
>
> Voir: `docs/sprint-artifacts/10-5-execute-code-via-dag.md#architecture-unifiée-2025-12-19`

**Expanded Goal (2-3 sentences):**

Implémenter le système d'apprentissage basé sur les traces d'exécution. Capturer les résultats des tools/capabilities, stocker les traces avec priorité (PER), et mettre à jour les statistiques de learning via TD Learning. Fournir des vues pour visualiser les patterns d'exécution.

**Problèmes Résolus:**

| Problème | Solution | Story |
|----------|----------|-------|
| Schema DB avec dette technique | Cleanup complet (KV, FKs, duplications) | **11.0** |
| Pas de capture des résultats d'exécution | Result tracing dans les events | 11.1 |
| Traces non persistées | Table `execution_trace` avec FK capability | 11.2 |
| Apprentissage batch (pas incrémental) | TD Learning avec α = 0.1 | 11.3 |
| Toutes les traces ont même importance | PER (Prioritized Experience Replay) | 11.3 |
| Pas de vue sur les exécutions réelles | Definition vs Invocation views | 11.4 |

**Value Delivery:**

- ✅ **Mémoire épisodique** - Traces d'exécution persistées et requêtables
- ✅ **Apprentissage incrémental** - TD Learning met à jour après chaque exécution
- ✅ **Priorisation intelligente** - PER focus sur les traces surprenantes
- ✅ **Observabilité** - Vues Definition (structure) vs Invocation (exécutions)

---

## Relation avec Epic 10

**Epic 10** crée les Capabilities (analyse statique) et les APIs unifiées.
**Epic 11** apprend des exécutions pour enrichir les Capabilities.

### Décision Architecturale: DAG Complet vs Trace Exécutée

| Couche | Stocke | Raison | Envoyé au LLM |
|--------|--------|--------|---------------|
| **Capability** (Epic 10) | DAG complet avec branches conditionnelles | Réutilisabilité, toutes les alternatives | ❌ Non (trop verbeux) |
| **Trace** (Epic 11) | Chemin réellement exécuté | Learning, résultats concrets | ✅ Oui (minimal, pertinent) |

**Pourquoi stocker le DAG complet dans Capability ?**
- Les conditions (`file.exists`, `response.status === 200`) ne sont évaluables qu'au runtime
- On ne peut pas savoir à l'avance quel chemin sera pris
- Stocker toutes les branches permet de réutiliser la capability dans différents contextes

**Pourquoi ne retourner que la trace au LLM ?**
- Évite la pollution du contexte avec des branches non prises
- Le LLM n'a besoin que de ce qui s'est passé, pas de ce qui aurait pu se passer
- La trace inclut les `decisions` (quelle branche prise et pourquoi)

**Flow d'exécution :**
```
┌─────────────────────────────────────────────────────────────┐
│  1. Capability.static_structure (DAG complet)               │
│     └── Stocké avec toutes les branches conditionnelles     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ exécution runtime
┌─────────────────────────────────────────────────────────────┐
│  2. Évaluation des conditions au runtime                    │
│     └── file.exists? → true → prend branche A               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ après exécution
┌─────────────────────────────────────────────────────────────┐
│  3. ExecutionTrace (chemin réel)                            │
│     └── executed_path: ["check_file", "read_file"]          │
│     └── decisions: [{nodeId: "d1", outcome: "true"}]        │
│     └── task_results: [...]                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ retour au LLM
┌─────────────────────────────────────────────────────────────┐
│  4. Réponse minimale                                        │
│     └── Seulement les résultats du chemin exécuté           │
│     └── Pas les branches non prises                         │
└─────────────────────────────────────────────────────────────┘
```

### Flux Epic 10 → Epic 11

```
Epic 10 (Capability Creation)          Epic 11 (Learning from Traces)
─────────────────────────────          ─────────────────────────────────
                                       11.0 DB Schema Cleanup ⭐ FIRST
                                            ↓
10.1 Static Analysis ──────────────▶   11.1 Result Tracing
     ↓                                      ↓
10.3 Provides Edges                    11.2 execution_trace Table
     ↓                                      ↓
10.5 Unified Capability Model          11.3 PER + TD Learning
     ↓                                      ↓
10.6 pml_discover                      11.4 Definition/Invocation Views
     ↓                                      ↓
10.7 pml_execute ──────────────────▶   (traces générées par pml_execute)
     ↓
10.8 pml_get_task_result
```

---

## Story Breakdown - Epic 11

### Story 11.0: DB Schema Cleanup & Infrastructure ⭐ FOUNDATION

As a developer, I want a clean database schema with proper separation of concerns,
So that the learning system has solid infrastructure foundations.

**Context:**

Audit complet du schéma DB (spike 2025-12-18) révèle plusieurs problèmes à corriger
AVANT d'implémenter le learning :

1. **`workflow_dags`** : état runtime temporaire stocké en PostgreSQL (overkill)
2. **`tool_schema` vs `mcp_tool`** : duplication partielle
3. **FKs manquantes** : `permission_audit_log` → `workflow_pattern`
4. **Colonnes redondantes** : `source` vs `edge_source` dans `tool_dependency`

**Référence:** `docs/spikes/2025-12-18-database-schema-audit.md`

**Changements proposés:**

**1. Migrer `workflow_dags` → Deno KV (réactiver ADR-037)**

**Infrastructure existante à réutiliser :**
- `src/server/auth/kv.ts` - Singleton KV avec `getKv()` / `closeKv()`
- Pattern déjà utilisé pour les sessions auth

```typescript
// AVANT (src/mcp/workflow-dag-store.ts - PostgreSQL)
await db.query(`INSERT INTO workflow_dags ...`, [workflowId, dag, intent]);
await db.query(`SELECT dag FROM workflow_dags WHERE expires_at > NOW()`, [workflowId]);

// APRÈS (Deno KV avec singleton existant)
import { getKv } from "../server/auth/kv.ts";  // Réutiliser le singleton

const kv = await getKv();
await kv.set(["workflow", workflowId], { dag, intent }, { expireIn: 3600_000 }); // 1h TTL
const result = await kv.get<{ dag: DAGStructure; intent: string }>(["workflow", workflowId]);
```

**Note:** Considérer déplacer `src/server/auth/kv.ts` → `src/cache/kv.ts` pour un meilleur naming.

**2. Merger `mcp_tool` → `tool_schema`**

```sql
-- Vérifier que toutes les données de mcp_tool sont dans tool_schema
-- (elles le sont normalement car tool_schema est la source principale)

-- Drop mcp_tool (principalement utilisée par E2E tests)
DROP TABLE IF EXISTS mcp_tool CASCADE;

-- Adapter les E2E tests pour utiliser tool_schema
```

**3. Ajouter FK sur `permission_audit_log`**

```sql
ALTER TABLE permission_audit_log
  ALTER COLUMN capability_id TYPE UUID USING capability_id::uuid;
ALTER TABLE permission_audit_log
  ADD CONSTRAINT fk_permission_audit_capability
  FOREIGN KEY (capability_id) REFERENCES workflow_pattern(pattern_id);
```

**4. Supprimer colonne redondante `source` de `tool_dependency`**

```sql
-- Garder uniquement edge_source (plus précis)
-- source: 'user' | 'learned' | 'hint'
-- edge_source: 'template' | 'inferred' | 'observed' ← KEEP
ALTER TABLE tool_dependency DROP COLUMN IF EXISTS source;
```

**Stratégie de Migration (IMPORTANT):**

On utilise une **migration additive idempotente** pour ne pas casser l'historique :

```sql
-- src/db/migrations/019_db_schema_cleanup.sql

-- 1. Drop workflow_dags (remplacé par Deno KV)
DROP TABLE IF EXISTS workflow_dags CASCADE;

-- 2. Drop mcp_tool (merged into tool_schema)
DROP TABLE IF EXISTS mcp_tool CASCADE;

-- 3. Remove redundant column from tool_dependency
ALTER TABLE tool_dependency DROP COLUMN IF EXISTS source;

-- 4. Add missing FK on permission_audit_log (idempotent)
DO $$ BEGIN
  -- First ensure capability_id is UUID type
  ALTER TABLE permission_audit_log
    ALTER COLUMN capability_id TYPE UUID USING capability_id::uuid;
EXCEPTION
  WHEN others THEN NULL; -- Already UUID or doesn't exist
END $$;

DO $$ BEGIN
  ALTER TABLE permission_audit_log
    ADD CONSTRAINT fk_permission_audit_capability
    FOREIGN KEY (capability_id) REFERENCES workflow_pattern(pattern_id);
EXCEPTION
  WHEN duplicate_object THEN NULL; -- FK already exists
END $$;
```

**Pourquoi cette approche ?**
- ✅ Fonctionne avec ou sans données existantes
- ✅ Ne modifie pas les anciennes migrations (historique intact)
- ✅ Idempotente (peut être rejouée sans erreur)
- ✅ Les migrations 004, 008, 009 continuent de fonctionner, puis 019 nettoie

**Acceptance Criteria:**

1. Migration 019 créée avec `IF EXISTS` / `IF NOT EXISTS`
2. `workflow_dags` supprimée de PostgreSQL
3. `src/mcp/workflow-dag-store.ts` utilise Deno KV avec TTL
4. `mcp_tool` table supprimée, E2E tests adaptés
5. FK ajoutée sur `permission_audit_log.capability_id`
6. Colonne `source` supprimée de `tool_dependency`
7. Tests: store/retrieve workflow state via KV
8. Tests: TTL expiration fonctionne
9. Tests E2E: utilisent `tool_schema` au lieu de `mcp_tool`
10. Migration rejouable sans erreur (idempotente)

**Files to Create:**
- `src/db/migrations/019_db_schema_cleanup.sql` (~40 LOC)
- `src/cache/kv.ts` (~30 LOC) - Singleton KV
- `src/cache/workflow-state-cache.ts` (~60 LOC) - Remplace workflow-dag-store

**Files to Modify:**
- `src/mcp/workflow-dag-store.ts` → utiliser KV
- E2E tests utilisant `mcp_tool` → utiliser `tool_schema`
- Code utilisant `tool_dependency.source` → utiliser `edge_source`

**Prerequisites:** Aucun (peut commencer immédiatement)

**Estimation:** 2-3 jours

---

### Story 11.1: Result Tracing - Capture des Résultats d'Exécution

As a learning system, I want to capture the `result` of each tool and capability execution,
So that I can store execution traces with actual outcomes for learning.

**Context:**

Actuellement on trace `args` mais pas `result`. Pour apprendre des exécutions,
on a besoin des résultats réels pour :
- Valider que les provides edges fonctionnent
- Calculer les success rates par chemin
- Détecter les patterns de données

**Note:** Cette story n'est PAS requise pour les provides edges (calculés statiquement en 10.1).
Elle est pour le **learning** basé sur les exécutions réelles.

**Acceptance Criteria:**

1. `tool_end` event inclut `result` dans `worker-bridge.ts`:
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
2. `capability_end` event inclut `result` dans `code-generator.ts`:
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
4. Tests: tool execution → result captured in trace
5. Tests: capability execution → result captured in trace
6. Tests: result is JSON-serializable (no circular refs)

**Files to Modify:**
- `src/sandbox/worker-bridge.ts` (~5 LOC)
- `src/capabilities/code-generator.ts` (~5 LOC)
- `src/dag/types.ts` (~10 LOC)

**Prerequisites:** Epic 10 complete (capabilities exist)

**Estimation:** 0.5-1 jour

---

### Story 11.2: Execution Trace Table & Store

As a learning system, I want a unified `execution_trace` table that stores execution history,
So that I can track execution patterns with proper FK to capabilities and learning-specific fields.

**Context:**

Remplace `workflow_execution` (pas de FK, stocke dag_structure en dur) par
`execution_trace` avec :
- FK vers `workflow_pattern` (capability)
- Champs learning (executed_path, decisions, priority)
- Multi-tenancy (user_id, created_by)

**Schema:**

```sql
CREATE TABLE execution_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK vers capability (nullable pour exécutions ad-hoc)
  capability_id UUID REFERENCES workflow_pattern(pattern_id),

  -- Contexte
  intent_text TEXT,
  initial_context JSONB DEFAULT '{}',   -- Arguments initiaux du workflow (Epic 12 dependency)
  executed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Résultats
  success BOOLEAN NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,

  -- Multi-tenancy
  user_id TEXT DEFAULT 'local',
  created_by TEXT DEFAULT 'local',
  updated_by TEXT,

  -- Learning
  executed_path TEXT[],             -- Chemin pris dans static_structure
  decisions JSONB DEFAULT '[]',     -- Décisions aux DecisionNodes
  task_results JSONB DEFAULT '[]',  -- Résultats par tâche

  -- PER (Prioritized Experience Replay)
  priority FLOAT DEFAULT 0.5,       -- 0.0=attendu, 1.0=surprenant

  -- Hiérarchie (ADR-041)
  parent_trace_id UUID REFERENCES execution_trace(id)
);

-- Indexes
CREATE INDEX idx_exec_trace_capability ON execution_trace(capability_id);
CREATE INDEX idx_exec_trace_timestamp ON execution_trace(executed_at DESC);
CREATE INDEX idx_exec_trace_user ON execution_trace(user_id);
CREATE INDEX idx_exec_trace_path ON execution_trace USING GIN(executed_path);
CREATE INDEX idx_exec_trace_priority ON execution_trace(capability_id, priority DESC);
```

**Migration depuis workflow_execution:**

```sql
-- Option 1: Si données à migrer
INSERT INTO execution_trace (intent_text, executed_at, success, duration_ms, error_message, user_id)
SELECT intent_text, executed_at, success, execution_time_ms, error_message, COALESCE(user_id, 'local')
FROM workflow_execution;

-- Option 2: Si base de test vide
DROP TABLE IF EXISTS workflow_execution CASCADE;
```

**Acceptance Criteria:**

1. Migration créée (`src/db/migrations/019_execution_trace.ts`)
2. `workflow_execution` migrée ou supprimée
3. Types TypeScript définis:
   ```typescript
   // JSON-serializable type (for JSONB storage)
   type JsonPrimitive = string | number | boolean | null;
   type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

   interface ExecutionTrace {
     id: string;
     capabilityId?: string;
     intentText?: string;
     initialContext?: Record<string, JsonValue>;  // ← Epic 12 dependency
     executedAt: Date;
     success: boolean;
     durationMs: number;
     errorMessage?: string;
     executedPath?: string[];
     decisions: BranchDecision[];
     taskResults: TraceTaskResult[];
     priority: number;
     parentTraceId?: string;
   }

   interface TraceTaskResult {
     taskId: string;
     tool: string;
     args: Record<string, JsonValue>;  // ← Epic 12 dependency
     result: JsonValue;
     success: boolean;
     durationMs: number;
   }
   ```
4. `ExecutionTraceStore` class créée avec:
   - `saveTrace(capabilityId, trace)` → INSERT
   - `getTraces(capabilityId, limit?)` → SELECT
   - `getTraceById(traceId)` → SELECT
   - `getHighPriorityTraces(limit)` → SELECT ORDER BY priority DESC
5. Fichiers mis à jour pour utiliser `execution_trace`:
   - `src/graphrag/sync/db-sync.ts`
   - `src/graphrag/metrics/collector.ts`
   - `src/web/routes/api/user/delete.ts`
6. Tests: INSERT trace avec FK capability
7. Tests: SELECT traces par capability_id
8. Tests: migration depuis workflow_execution (si données)
9. `initial_context` stocke les arguments initiaux du workflow (Epic 12 dependency)
10. `task_results[].args` stocke les arguments de chaque tâche (Epic 12 dependency)
11. Data sanitization appliquée avant stockage (redact sensitive, truncate large payloads)

**Files to Create:**
- `src/db/migrations/019_execution_trace.ts` (~100 LOC)
- `src/capabilities/execution-trace-store.ts` (~150 LOC)
- `src/utils/sanitize-for-storage.ts` (~50 LOC) - Shared with Epic 12

**Files to Modify:**
- `src/capabilities/types.ts` (~50 LOC)
- `src/graphrag/sync/db-sync.ts` (~20 LOC)
- `src/graphrag/metrics/collector.ts` (~15 LOC)

**Prerequisites:** Story 11.1 (result in traces)

**Estimation:** 2-3 jours

---

### Story 11.3: PER + TD Learning

As a learning system, I want to prioritize surprising traces and update learning incrementally,
So that I can learn efficiently from execution patterns.

**Context:**

**PER (Prioritized Experience Replay):**
Prioriser les traces **surprenantes** pour l'apprentissage. Une trace est surprenante si
son résultat diverge de ce qu'on attendait.

```typescript
function calculateTracePriority(
  trace: { executedPath: string[]; success: boolean; durationMs: number },
  learning: CapabilityLearning
): number {
  const pathKey = JSON.stringify(trace.executedPath);
  const pathStats = learning.paths.find(p => JSON.stringify(p.path) === pathKey);

  if (!pathStats) {
    // Nouveau chemin = surprenant = priorité maximale
    return 1.0;
  }

  // Priority = |predicted - actual|
  const predicted = pathStats.successRate;
  const actual = trace.success ? 1.0 : 0.0;
  let priority = Math.abs(predicted - actual);

  // Bonus si durée anormale (> 2 std dev)
  if (pathStats.avgDurationMs > 0) {
    const durationDiff = Math.abs(trace.durationMs - pathStats.avgDurationMs);
    if (durationDiff > pathStats.avgDurationMs * 0.5) {
      priority = Math.min(1.0, priority + 0.2);
    }
  }

  return priority;
}
```

**TD Learning (Temporal Difference):**
Mise à jour incrémentale après chaque trace, pas de batch.

```typescript
function updateLearningTD(
  learning: CapabilityLearning,
  trace: ExecutionTrace,
  alpha: number = 0.1
): CapabilityLearning {
  const pathKey = JSON.stringify(trace.executedPath);
  let pathStats = learning.paths.find(p => JSON.stringify(p.path) === pathKey);

  if (!pathStats) {
    pathStats = { path: trace.executedPath, count: 0, successRate: 0.5, avgDurationMs: 0 };
    learning.paths.push(pathStats);
  }

  // TD Update: V(s) ← V(s) + α(actual - V(s))
  const actual = trace.success ? 1.0 : 0.0;
  pathStats.successRate += alpha * (actual - pathStats.successRate);
  pathStats.avgDurationMs += alpha * (trace.durationMs - pathStats.avgDurationMs);
  pathStats.count++;

  // Update decisionStats
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
      outcome.successRate += alpha * (actual - outcome.successRate);
      stats.outcomes[decision.outcome] = outcome;
    }
  }

  // Recalculer dominantPath
  learning.dominantPath = learning.paths
    .filter(p => p.count >= 3)
    .sort((a, b) => (b.successRate * b.count) - (a.successRate * a.count))[0]?.path
    || learning.paths[0]?.path
    || [];

  return learning;
}
```

**Acceptance Criteria:**

1. `calculateTracePriority()` implémentée
2. `updateLearningTD()` implémentée
3. `CapabilityLearning` type défini:
   ```typescript
   interface CapabilityLearning {
     paths: PathStats[];
     dominantPath: string[];
     decisionStats?: DecisionStats[];
   }

   interface PathStats {
     path: string[];      // Node IDs
     count: number;
     successRate: number; // 0.0 - 1.0
     avgDurationMs: number;
   }

   interface DecisionStats {
     nodeId: string;
     condition: string;
     outcomes: Record<string, { count: number; successRate: number }>;
   }
   ```
4. `capabilityStore.updateLearning(capabilityId, learning)` ajoutée
5. Après exécution → priority calculée → trace insérée → learning mis à jour
6. Tests PER: nouveau chemin → priority = 1.0
7. Tests PER: échec sur chemin dominant (95% success) → priority ≈ 0.95
8. Tests PER: succès sur chemin dominant → priority ≈ 0.05
9. Tests TD: 3 exécutions même chemin → successRate converge
10. Tests TD: decisionStats mis à jour pour chaque décision

**Files to Create:**
- `src/capabilities/learning-updater.ts` (~120 LOC)

**Files to Modify:**
- `src/capabilities/types.ts` (~40 LOC)
- `src/capabilities/capability-store.ts` (~30 LOC)
- `src/capabilities/execution-trace-store.ts` (~30 LOC)

**Prerequisites:** Story 11.2 (execution_trace table)

**Estimation:** 2-3 jours

---

### Story 11.4: Definition vs Invocation Views

As a user, I want to toggle between Definition view (structure) and Invocation view (executions),
So that I can understand both the capability structure and its execution patterns.

**Context:**

| Vue | Nœuds | Edges | Source |
|-----|-------|-------|--------|
| **Definition** | Dédupliqués par type | dependency, provides, contains | `static_structure` |
| **Invocation** | Par appel réel | sequence (temporel) | `execution_trace` |

**Acceptance Criteria:**

1. Toggle button dans dashboard: `[Definition] [Invocation]`
2. **Vue Definition:**
   - Nœuds dédupliqués par tool/capability type
   - Edges: `dependency`, `provides`, `contains`
   - Layout optimisé pour structure (dagre/hierarchical)
   - Source: `static_structure` de la capability
3. **Vue Invocation:**
   - Un nœud par appel réel (suffixe `_1`, `_2`, etc.)
   - Timestamps affichés sur les nœuds
   - Edges: `sequence` (basé sur ordre temporel)
   - Parallel visible par timestamps qui overlap
   - Source: `execution_trace.task_results`
4. API endpoint `/api/traces/:capabilityId`
5. Cytoscape layout adapté par vue
6. Tests: même capability, 3 exécutions → Definition (1 nœud) vs Invocation (3 nœuds)
7. Tests: exécution avec parallélisme visible en Invocation view

**Files to Create:**
- `src/web/islands/DefinitionInvocationToggle.tsx` (~80 LOC)

**Files to Modify:**
- `src/web/routes/dashboard.tsx` (~30 LOC)
- `src/visualization/hypergraph-builder.ts` (~50 LOC)

**Prerequisites:** Story 11.2 (execution_trace), Epic 8 (Hypergraph visualization)

**Estimation:** 2-3 jours

---

### Story 11.5: Dry Run Mode (Optional)

As a developer, I want to dry-run a capability without side effects,
So that I can test and debug workflows before real execution.

**Context:**

Exécute la capability avec des mocks pour les tools à effets de bord.
Utile pour debugging de workflows avec MCP connecteurs externes.

**Acceptance Criteria:**

1. `pml_execute({ ..., dryRun: true })` option
2. Mode dry-run:
   - Tools marqués `sideEffect: true` → mock response
   - Tools read-only → exécution réelle
   - Traces générées normalement (marquées `dryRun: true`)
3. Mock responses configurables:
   - Default: `{ success: true, mocked: true }`
   - Custom via `dryRunMocks: { "github:createIssue": {...} }`
4. Tests: dry-run avec side-effect tool → pas d'appel réel
5. Tests: dry-run avec read-only tool → appel réel
6. Tests: traces générées avec flag dryRun

**Prerequisites:** Epic 10 complete, Story 11.1 (result tracing)

**Estimation:** 3-4 jours

**Status:** Optional (post-MVP)

---

## Epic 11 Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│  EPIC 10 (Prerequisite)                                          │
│  - Capabilities exist with static_structure                      │
│  - pml_execute generates traces                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Story 11.1: Result Tracing                                      │
│  - Add `result` to tool_end and capability_end events           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Story 11.2: Execution Trace Table                               │
│  - CREATE TABLE execution_trace                                  │
│  - ExecutionTraceStore class                                     │
│  - Migrate/DROP workflow_execution                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Story 11.3: PER + TD Learning                                   │
│  - calculateTracePriority()                                      │
│  - updateLearningTD()                                            │
│  - CapabilityLearning type                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Story 11.4: Definition/Invocation Views                         │
│  - Toggle UI component                                           │
│  - API endpoint for traces                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Story 11.5: Dry Run Mode (Optional)                             │
│  - Mock side-effect tools                                        │
│  - dryRun flag in traces                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Epic 11 Estimation Summary

| Ordre | Story | Description | Effort | Cumulative |
|-------|-------|-------------|--------|------------|
| 1 | 11.1 | Result Tracing | 0.5-1j | 1j |
| 2 | 11.2 | execution_trace Table | 2-3j | 4j |
| 3 | 11.3 | PER + TD Learning | 2-3j | 7j |
| 4 | 11.4 | Definition/Invocation Views | 2-3j | 10j |
| 5 | 11.5 | Dry Run (optional) | 3-4j | 14j |

**Total MVP (11.1-11.4): ~2 semaines**
**Total avec 11.5: ~2.5-3 semaines**

---

## Breaking Changes Summary

| Story | Change | Breaking? | Impact |
|-------|--------|-----------|--------|
| 11.1 | `result` in trace events | ❌ No | Additive |
| 11.2 | DROP `workflow_execution` | ⚠️ **Yes** | Table supprimée |
| 11.2 | CREATE `execution_trace` | ❌ No | Additive |
| 11.3 | `learning` in dag_structure | ❌ No | Additive |
| 11.4 | Toggle UI component | ❌ No | Additive |

---

## References

- **Spike:** `docs/spikes/2025-12-17-complex-adaptive-systems-research.md` (PER, TD Learning)
- **Spike:** `docs/spikes/2025-12-18-database-schema-audit.md` (execution_trace schema)
- **ADR-041:** Hierarchical Trace Tracking (parentTraceId)
- **Epic 10:** Capability Creation & Unified APIs (prerequisite)
