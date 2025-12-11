# Tech-Spec: Capability-to-Capability Dependencies

**Created:** 2025-12-11
**Status:** Implemented
**Author:** Erwan + Claude

---

## Overview

### Problem Statement

Les capabilities sont stockées indépendamment dans `workflow_pattern` sans possibilité de les lier entre elles. Actuellement :

- `tool_dependency` gère les relations tool → tool avec `edge_type` et `edge_source` (ADR-041)
- Les capabilities peuvent techniquement être stockées dans `tool_dependency` comme `capability:{uuid}` mais :
  - Pas type-safe (UUIDs comme TEXT)
  - Sémantiquement confus (table "tool" pour capabilities)
  - Pas de foreign key vers `workflow_pattern`

**Use cases manquants :**
- Une capability "deploy app" **compose** les capabilities "build", "test", "push"
- Une capability "full report" **dépend** de "fetch data"
- Deux capabilities peuvent être liées en **séquence** (A puis B)

### Solution

Créer une table `capability_dependency` dédiée avec :
- Foreign keys vers `workflow_pattern(pattern_id)`
- Mêmes `edge_type` que `tool_dependency` + nouveau : `contains`, `sequence`, `dependency`, `alternative`
- Mêmes `edge_source` : `template`, `inferred`, `observed`
- Apprentissage automatique (inféré) + définition manuelle

### Scope

**In scope :**
- Migration DB pour `capability_dependency`
- Méthodes CRUD dans `CapabilityStore`
- Intégration dans `GraphRAGEngine` pour le graphe unifié
- Suggestion des dépendances lors du matching
- API endpoints pour CRUD des relations

**Out of scope :**
- UI pour gérer les relations (dashboard future)
- Import/export des relations
- Détection automatique de cycles complexes

---

## Context for Development

### Codebase Patterns

**Table `tool_dependency` existante (référence) :**
```sql
CREATE TABLE tool_dependency (
  from_tool_id TEXT NOT NULL,
  to_tool_id TEXT NOT NULL,
  observed_count INTEGER DEFAULT 1,
  confidence_score REAL DEFAULT 0.5,
  edge_type TEXT DEFAULT 'sequence',      -- 'contains', 'sequence', 'dependency', 'alternative'
  edge_source TEXT DEFAULT 'inferred',    -- 'template', 'inferred', 'observed'
  last_observed TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (from_tool_id, to_tool_id)
);
```

**Edge weights (ADR-041 + extension) :**
```typescript
// graph-engine.ts:601-614 (à étendre)
EDGE_TYPE_WEIGHTS = {
  dependency: 1.0,   // Explicit DAG
  contains: 0.8,     // Parent-child
  alternative: 0.6,  // Same intent, different impl (NEW)
  sequence: 0.5,     // Temporal order
};

EDGE_SOURCE_MODIFIERS = {
  observed: 1.0,    // 3+ observations
  inferred: 0.7,    // 1-2 observations
  template: 0.5,    // Bootstrap
};
```

**Seuil observation :** `OBSERVED_THRESHOLD = 3` (ligne 620)

### Files to Reference

| Fichier | Rôle |
|---------|------|
| `src/db/migrations/003_graphrag_tables.sql` | Schéma `tool_dependency` original |
| `src/db/migrations/012_edge_types_migration.ts` | Ajout `edge_type`/`edge_source` |
| `src/graphrag/graph-engine.ts` | Gestion du graphe, méthode `createOrUpdateEdge()` |
| `src/capabilities/capability-store.ts` | CRUD capabilities |
| `src/capabilities/types.ts` | Types `Capability`, `CapabilityEdge` |
| `src/mcp/gateway-server.ts:2390-2512` | API 8.1 existante (`/api/capabilities`, `/api/graph/hypergraph`) |

### Technical Decisions

1. **Table séparée vs extension** : Table `capability_dependency` séparée pour :
   - Foreign keys UUID propres
   - Sémantique claire
   - Queries optimisées par type

2. **Réutilisation edge_type/edge_source** : Même vocabulaire que `tool_dependency` pour cohérence

3. **Graphe unifié** : `GraphRAGEngine` charge les deux types d'edges dans le même graphe Graphology

4. **Conventions de nommage** (pattern existant du projet) :
   - **SQL/DB** : `snake_case` (`from_capability_id`, `edge_type`)
   - **TypeScript interne** : `camelCase` (`fromCapabilityId`, `edgeType`)
   - **API responses** : `snake_case` (mapping dans gateway-server.ts)
   - Voir `src/capabilities/types.ts` lignes 127-170 pour référence

---

## Implementation Plan

### Tasks

- [ ] **Task 1: Migration DB** - Créer `capability_dependency` table
  ```sql
  CREATE TABLE capability_dependency (
    from_capability_id UUID NOT NULL REFERENCES workflow_pattern(pattern_id) ON DELETE CASCADE,
    to_capability_id UUID NOT NULL REFERENCES workflow_pattern(pattern_id) ON DELETE CASCADE,
    observed_count INTEGER DEFAULT 1,
    confidence_score REAL DEFAULT 0.5,
    edge_type TEXT DEFAULT 'sequence',
    edge_source TEXT DEFAULT 'inferred',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_observed TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (from_capability_id, to_capability_id),
    CHECK (from_capability_id != to_capability_id)  -- No self-loops
  );

  CREATE INDEX idx_capability_dep_from ON capability_dependency(from_capability_id);
  CREATE INDEX idx_capability_dep_to ON capability_dependency(to_capability_id);
  CREATE INDEX idx_capability_dep_type ON capability_dependency(edge_type);
  CREATE INDEX idx_capability_dep_type_source ON capability_dependency(edge_type, edge_source);
  ```

- [ ] **Task 2: Types TypeScript** - Ajouter dans `types.ts`
  ```typescript
  export interface CapabilityDependency {
    fromCapabilityId: string;
    toCapabilityId: string;
    observedCount: number;
    confidenceScore: number;
    edgeType: 'contains' | 'sequence' | 'dependency' | 'alternative';
    edgeSource: 'template' | 'inferred' | 'observed';
    createdAt: Date;
    lastObserved: Date;
  }

  export interface CreateCapabilityDependencyInput {
    fromCapabilityId: string;
    toCapabilityId: string;
    edgeType: 'contains' | 'sequence' | 'dependency' | 'alternative';
    edgeSource?: 'template' | 'inferred' | 'observed';
  }
  ```

- [x] **Task 3: CapabilityStore methods** - CRUD pour relations
  ```typescript
  // capability-store.ts
  async addDependency(input: CreateCapabilityDependencyInput): Promise<CapabilityDependency>
  async updateDependency(fromId: string, toId: string, incrementBy?: number): Promise<void>  // incrementBy default=1
  async getDependencies(capabilityId: string, direction: 'from' | 'to' | 'both'): Promise<CapabilityDependency[]>
  async removeDependency(fromId: string, toId: string): Promise<void>
  async getDependenciesCount(capabilityId: string): Promise<number>  // Added for API
  async getAllDependencies(minConfidence?: number): Promise<CapabilityDependency[]>  // For graph sync
  async searchByIntentWithDeps(intent: string, limit?: number, minSemanticScore?: number): Promise<...>  // Task 6
  ```

- [ ] **Task 4: GraphRAGEngine integration** - Charger capability edges
  ```typescript
  // graph-engine.ts - Dans syncFromDatabase()
  // Après chargement tool_dependency, charger capability_dependency
  const capDeps = await this.db.query(`
    SELECT * FROM capability_dependency WHERE confidence_score > 0.3
  `);
  for (const dep of capDeps) {
    const fromNode = `capability:${dep.from_capability_id}`;
    const toNode = `capability:${dep.to_capability_id}`;
    // Ajouter au graphe...
  }
  ```

- [ ] **Task 5: Apprentissage automatique** - Inférer relations depuis traces
  - **Trigger 1:** Dans `CapabilityStore.saveCapability()` quand `toolsUsed` contient des tools d'une autre capability
  - **Trigger 2:** Dans `GraphRAGEngine.updateFromCodeExecution()` quand trace montre capability appelant capability
  - **Logique:**
    1. Pour chaque tool dans `toolsUsed`, chercher capabilities existantes qui utilisent ce tool
    2. Si capability A (nouvelle) partage 50%+ des tools de capability B → créer edge `sequence` (inferred)
    3. Si trace montre capability A appelant capability B directement → créer edge `contains` (inferred)
  ```typescript
  // Dans updateFromCodeExecution() ligne ~693
  // Quand parentTraceId pointe vers une capability et childNodeId est aussi capability
  if (parentNodeId.startsWith('capability:') && childNodeId.startsWith('capability:')) {
    await this.createOrUpdateCapabilityEdge(parentNodeId, childNodeId, 'contains');
  }
  ```

- [ ] **Task 6: Suggestion Engine** - Inclure dépendances dans matching
  ```typescript
  // Quand searchByIntent() trouve une capability,
  // aussi retourner ses dépendances (edge_type = 'dependency')
  async searchByIntentWithDeps(intent: string, limit: number): Promise<{
    capability: Capability;
    semanticScore: number;
    dependencies: Capability[];
  }[]>
  ```

- [ ] **Task 7: Tests unitaires**
  - Test création/lecture/suppression dépendances
  - Test upgrade inferred → observed après 3 observations
  - Test intégration graphe
  - Test suggestion avec dépendances
  - Test cycles A→B + B→A autorisés (deux edges distincts)
  - Test warning log si cycle `contains` détecté

- [ ] **Task 8: API Endpoints** - Intégration avec API 8.1 existante

  **8a. Modifier `/api/capabilities` existant (ligne 2483)** - Ajouter `dependencies_count`
  ```typescript
  // Dans la response, ajouter pour chaque capability :
  dependencies_count: await this.capabilityDataService.getDependenciesCount(cap.id),
  ```

  **8b. Nouveau endpoint GET `/api/capabilities/:id/dependencies`**
  - Query params: `direction=from|to|both` (default: both)
  - Response snake_case
  ```typescript
  // gateway-server.ts ~ligne 2512 (après /api/capabilities)
  if (url.pathname.match(/^\/api\/capabilities\/[\w-]+\/dependencies$/) && req.method === "GET") {
    const id = url.pathname.split("/")[3];
    const direction = url.searchParams.get("direction") || "both";
    const deps = await this.capabilityStore.getDependencies(id, direction);
    return new Response(JSON.stringify({
      capability_id: id,
      dependencies: deps.map(d => ({
        from_capability_id: d.fromCapabilityId,
        to_capability_id: d.toCapabilityId,
        observed_count: d.observedCount,
        confidence_score: d.confidenceScore,
        edge_type: d.edgeType,
        edge_source: d.edgeSource,
        created_at: d.createdAt.toISOString(),
        last_observed: d.lastObserved.toISOString(),
      })),
      total: deps.length,
    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
  ```

  **8c. Nouveau endpoint POST `/api/capabilities/:id/dependencies`** - Créer relation
  ```typescript
  // Body: { to_capability_id, edge_type, edge_source? }
  if (url.pathname.match(/^\/api\/capabilities\/[\w-]+\/dependencies$/) && req.method === "POST") {
    const fromId = url.pathname.split("/")[3];
    const body = await req.json();
    const dep = await this.capabilityStore.addDependency({
      fromCapabilityId: fromId,
      toCapabilityId: body.to_capability_id,
      edgeType: body.edge_type,
      edgeSource: body.edge_source || "manual",
    });
    return new Response(JSON.stringify({ created: true, dependency: dep }),
      { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
  ```

  **8d. Nouveau endpoint DELETE** - Supprimer relation
  - `DELETE /api/capabilities/:from/dependencies/:to`

  **8e. Modifier `/api/graph/hypergraph` (ligne 2514)** - Inclure capability edges
  ```typescript
  // Dans buildHypergraphData(), ajouter les edges capability→capability
  // depuis capability_dependency table (en plus des tool edges existants)
  ```

### Acceptance Criteria

- [ ] **AC 1:** La table `capability_dependency` existe avec FKs vers `workflow_pattern`
- [ ] **AC 2:** `addDependency()` crée une relation avec edge_type et edge_source corrects
- [ ] **AC 3:** `updateDependency()` incrémente `observed_count` et upgrade `edge_source` après 3 observations
- [ ] **AC 4:** `getDependencies()` retourne les relations dans les deux directions
- [ ] **AC 5:** `GraphRAGEngine.syncFromDatabase()` charge les capability edges dans le graphe
- [ ] **AC 6:** Le dashboard affiche les relations capability-capability (via `getGraphSnapshot()`)
- [ ] **AC 7:** `searchByIntentWithDeps()` retourne les dépendances avec la capability matchée
- [ ] **AC 8:** `GET /api/capabilities` inclut `dependencies_count` pour chaque capability
- [ ] **AC 9:** `GET /api/capabilities/:id/dependencies` retourne les relations avec direction filter
- [ ] **AC 10:** `POST /api/capabilities/:id/dependencies` crée une relation (201 Created)
- [ ] **AC 11:** `DELETE /api/capabilities/:from/dependencies/:to` supprime une relation
- [ ] **AC 12:** `/api/graph/hypergraph` inclut les edges capability→capability
- [ ] **AC 13:** Cycles A→B + B→A sont autorisés (observations valides dans contextes différents)
Oui 
---

## Additional Context

### Dependencies

- Migration doit s'exécuter après migration 011 (capability_storage)
- Numéro de migration suggéré : **016** (après 015_capability_community_id)

### Testing Strategy

1. **Unit tests** : `tests/unit/capabilities/capability-dependency_test.ts`
2. **Integration tests** : Vérifier persistence et reload depuis DB
3. **E2E** : Créer capability A → B, exécuter A, vérifier edge inféré

### Notes

- Le graphe Graphology supporte déjà les nodes `capability:{uuid}` (ligne 657-659 de graph-engine.ts)
- L'upgrade `inferred` → `observed` utilise le même seuil de 3 que pour tools
- **Gestion des cycles :**
  - Self-loops évités par `CHECK (from_capability_id != to_capability_id)`
  - Cycles A→B + B→A **autorisés** : observations valides dans contextes différents
  - Graphology gère les cycles (PageRank converge, Dijkstra trouve paths)
  - ⚠️ Warning log recommandé si cycle `contains` détecté (paradoxe logique potentiel)
- **Edge type `alternative` (nouveau) :**
  - Use case : Deux capabilities avec même intent, implémentations différentes
  - Exemple : "fetch via REST" ↔ "fetch via GraphQL"
  - Détection : Similarité intent embedding > 0.9 + tools différents
  - Utilisation : Suggestion Engine propose alternative si capability échoue
  - Note : `alternative` est *conceptuellement* symétrique, mais un seul edge est créé. Créer B→A manuellement si besoin.

---

*Tech-spec créée via BMAD Quick-Flow*
