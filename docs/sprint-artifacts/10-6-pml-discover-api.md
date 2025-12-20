# Story 10.6: pml_discover - Unified Discovery API

Status: ready-for-dev

> **Epic:** 10 - DAG Capability Learning & Unified APIs
> **Tech-Spec:** [epic-10-dag-capability-learning-unified-apis.md](../epics/epic-10-dag-capability-learning-unified-apis.md)
> **ADR:** [ADR-038 Scoring Algorithms](../adrs/ADR-038-scoring-algorithms-reference.md) - Mode **Active Search**
> **Prerequisites:** Story 10.5 (Execute Code via DAG - DONE)
> **Depends on:** VectorSearch, GraphRAGEngine, DAGSuggester, CapabilityStore

---

## Story

As an AI agent,
I want a single `pml_discover` tool to search both tools and capabilities,
So that I have a simplified API for finding what I need instead of using multiple separate tools.

---

## Context & Problem

**Le gap actuel:**

Claude doit actuellement choisir entre plusieurs tools de recherche :

| Tool actuel | Ce qu'il fait | Quand l'utiliser |
|-------------|---------------|------------------|
| `pml_search_tools` | Recherche sémantique + graph sur les MCP tools | Quand on veut découvrir des tools |
| `pml_search_capabilities` | Recherche de capabilities apprises | Quand on veut réutiliser du code éprouvé |

**Problèmes :**
1. **Fragmentation cognitive** - L'IA doit décider quel tool utiliser
2. **Deux appels séparés** - Si l'IA veut les deux, elle fait 2 requêtes
3. **Pas de ranking unifié** - Les scores ne sont pas comparables

**Mode Active Search (ADR-038):**

`pml_discover` implémente le mode **Active Search** - une recherche explicite par intent.
C'est différent du mode **Passive Suggestion** qui suggère automatiquement pendant l'exécution.

| Mode | Trigger | Algorithms | Implémentation |
|------|---------|------------|----------------|
| **Active Search** | `pml_discover({ intent })` | Hybrid Search + Capability Match | Cette story |
| **Passive Suggestion** | Pendant workflow (contextTools) | Next Step Prediction + Strategic Discovery | `DAGSuggester.predictNextTools()` |

**Solution : `pml_discover`**

Un seul tool qui :
- Cherche **à la fois** tools ET capabilities
- Retourne un ranking **unifié** par score
- Permet de **filtrer** par type si besoin
- Inclut les **schemas** pour exécution immédiate

**Migration:**

| Phase | Changement |
|-------|------------|
| 10.6 | `pml_discover` créé, anciens tools **dépréciés** |
| 10.7+ | Suppression des anciens tools |

---

## Acceptance Criteria

### AC1: Handler pml_discover créé ✅
- [ ] Créer `src/mcp/handlers/discover-handler.ts`
- [ ] Handler `handleDiscover(args, vectorSearch, graphEngine, dagSuggester)`
- [ ] Input validation avec JSON Schema
- [ ] Export dans `src/mcp/handlers/mod.ts`

### AC2: Tool Definition créée ✅
- [ ] Ajouter `discoverTool` dans `src/mcp/tools/definitions.ts`
- [ ] Schema d'input :
  ```typescript
  {
    intent: string;              // Required: natural language query
    filter?: {
      type?: "tool" | "capability" | "all";  // default: "all"
      minScore?: number;         // default: 0.0
    };
    limit?: number;              // default: 10
    include_related?: boolean;   // default: false (graph-based related tools)
  }
  ```
- [ ] Ajouter à `getMetaTools()` array

### AC3: Recherche unifiée implémentée ✅
- [ ] Vector search sur tools via `graphEngine.searchToolsHybrid()`
- [ ] Vector search sur capabilities via `dagSuggester.searchCapabilities()`
- [ ] Merge des résultats avec scores normalisés (0-1)
- [ ] Sort par `finalScore` décroissant

### AC4: Response format unifié ✅
- [ ] Structure de réponse :
  ```typescript
  interface DiscoverResponse {
    results: Array<{
      type: "tool" | "capability";
      id: string;                    // tool_id ou capability_id
      name: string;                  // Tool name ou capability name
      description: string;
      score: number;                 // Final score (0-1)
      // Tool-specific
      server_id?: string;
      input_schema?: JSONSchema;
      related_tools?: RelatedTool[];
      // Capability-specific
      code_snippet?: string;
      success_rate?: number;
      usage_count?: number;
      semantic_score?: number;       // For capabilities
    }>;
    meta: {
      query: string;
      filter_type: string;
      total_found: number;
      tools_count: number;
      capabilities_count: number;
    };
  }
  ```

### AC5: Filtrage par type ✅
- [ ] `filter.type = "tool"` → uniquement des tools
- [ ] `filter.type = "capability"` → uniquement des capabilities
- [ ] `filter.type = "all"` (default) → mix trié par score
- [ ] `filter.minScore` → exclure les résultats sous le seuil

### AC6: Pagination ✅
- [ ] `limit` parameter (default: 10, max: 50)
- [ ] Résultats triés par score puis tronqués au limit

### AC7: Include Related Tools ✅
- [ ] Si `include_related = true`, ajouter `related_tools` pour chaque tool
- [ ] Réutiliser la logique existante de `handleSearchTools()`
- [ ] Les related tools ne comptent pas dans le `limit`

### AC8: Dépréciation des anciens tools ✅
- [ ] `pml_search_tools` : ajouter deprecation notice dans description
- [ ] `pml_search_capabilities` : ajouter deprecation notice dans description
- [ ] Log warning quand les anciens tools sont utilisés
- [ ] Les anciens tools continuent de fonctionner (backward compat)

### AC9: Enregistrement dans GatewayServer ✅
- [ ] Importer `handleDiscover` dans `gateway-server.ts`
- [ ] Ajouter case `"pml:discover"` dans `handleToolCall()`
- [ ] Passer les dépendances nécessaires (vectorSearch, graphEngine, dagSuggester)

### AC10: Tests unitaires ✅
- [ ] Test: search "read file" → retourne mix tools + capabilities
- [ ] Test: filter type="tool" → que des tools retournés
- [ ] Test: filter type="capability" → que des capabilities retournées
- [ ] Test: minScore filtre les résultats sous le seuil
- [ ] Test: limit respecté
- [ ] Test: scores normalisés entre 0 et 1
- [ ] Test: include_related ajoute related_tools

### AC11: Tests d'intégration ✅
- [ ] Test E2E: appel MCP `pml:discover` via gateway
- [ ] Test: dépréciation logged quand `pml_search_tools` utilisé
- [ ] Test: réponse backward compatible pour anciens tools

---

## Tasks / Subtasks

- [ ] **Task 1: Créer le handler discover** (AC: 1, 3, 4)
  - [ ] Créer `src/mcp/handlers/discover-handler.ts`
  - [ ] Implémenter `handleDiscover()` function
  - [ ] Appeler `graphEngine.searchToolsHybrid()` pour tools
  - [ ] Appeler `dagSuggester.searchCapabilities()` pour capabilities
  - [ ] Normaliser les scores (tools: finalScore, capabilities: score)
  - [ ] Merge et sort par score décroissant
  - [ ] Formater la réponse unifiée

- [ ] **Task 2: Ajouter la tool definition** (AC: 2, 9)
  - [ ] Ajouter `discoverTool` dans `definitions.ts`
  - [ ] Définir inputSchema avec tous les paramètres
  - [ ] Ajouter à `getMetaTools()` array
  - [ ] Enregistrer dans `gateway-server.ts` handleToolCall

- [ ] **Task 3: Implémenter le filtrage** (AC: 5, 6)
  - [ ] Parser `filter.type` et appliquer
  - [ ] Implémenter `filter.minScore` threshold
  - [ ] Appliquer `limit` après merge et sort
  - [ ] Valider les paramètres (limit max 50)

- [ ] **Task 4: Support include_related** (AC: 7)
  - [ ] Si `include_related=true`, enrichir les résultats tools
  - [ ] Réutiliser logique de `handleSearchTools()` pour related
  - [ ] S'assurer que related_tools ne comptent pas dans limit

- [ ] **Task 5: Déprécier les anciens tools** (AC: 8)
  - [ ] Ajouter "[DEPRECATED]" au début des descriptions
  - [ ] Ajouter note de migration vers `pml_discover`
  - [ ] Ajouter log.warn() quand les anciens handlers sont appelés
  - [ ] Vérifier backward compatibility

- [ ] **Task 6: Tests** (AC: 10, 11)
  - [ ] Créer `tests/mcp/handlers/discover-handler_test.ts`
  - [ ] Tests unitaires pour chaque AC
  - [ ] Tests d'intégration avec GatewayServer

---

## Dev Notes

### Architecture existante à réutiliser (ADR-038 Active Search)

**Pour les tools - Hybrid Search (ADR-038 §2.1):**
```typescript
// Formule: finalScore = alpha * semanticScore + (1 - alpha) * graphScore
// Utilise graphEngine.searchToolsHybrid() qui retourne:
interface HybridSearchResult {
  toolId: string;
  serverId: string;
  description: string;
  schema?: { inputSchema: JSONSchema };
  semanticScore: number;
  graphScore: number;      // Weighted Adamic-Adar
  finalScore: number;      // Score normalisé 0-1
  relatedTools?: RelatedTool[];
}
```

**Pour les capabilities - searchByIntent + Capability Match (ADR-038 §3.1):**
```typescript
// Flow: dagSuggester.searchCapabilities()
//       → capabilityMatcher.findMatch()
//           → capabilityStore.searchByIntent() (vector search)
//           → score = semanticScore * reliabilityFactor (ADR-038)

// capabilityStore.searchByIntent() retourne:
interface CapabilitySearchResult {
  capability: Capability;
  semanticScore: number;   // Cosine similarity (vector search)
}

// capabilityMatcher.findMatch() applique ADR-038 et retourne:
interface CapabilityMatch {
  capability: Capability;
  score: number;           // Final = semanticScore * reliabilityFactor
  semanticScore: number;
  parametersSchema?: JSONSchema;
  thresholdUsed: number;
}
```

**Note cold start:** Pas de problème - une capability existe seulement après 1ère exécution réussie,
donc `successRate >= 1.0` au départ (Story 7.2a eager learning).

**Note:** Le mode Passive Suggestion (`DAGSuggester.predictNextTools()`) utilise des algorithmes
différents (Next Step Prediction, Strategic Discovery) - voir ADR-038 §2.2 et §3.2.

### Score Normalization

Les scores des deux sources sont déjà normalisés entre 0 et 1 :
- Tools: `finalScore` = weighted combination of semantic + graph scores
- Capabilities: `score` = semantic × reliability

**Pas besoin de normalisation supplémentaire** - on peut directement merger et trier.

### Response Mapping

```typescript
// Tool result → DiscoverResult
{
  type: "tool",
  id: result.toolId,
  name: result.toolId.split(":")[1],  // e.g., "read_file"
  description: result.description,
  score: result.finalScore,
  server_id: result.serverId,
  input_schema: result.schema?.inputSchema,
  related_tools: result.relatedTools,
}

// Capability result → DiscoverResult
{
  type: "capability",
  id: match.capability.id,
  name: match.capability.name ?? match.capability.id.substring(0, 8),
  description: match.capability.description ?? "Learned capability",
  score: match.score,
  code_snippet: match.capability.codeSnippet,
  success_rate: match.capability.successRate,
  usage_count: match.capability.usageCount,
  semantic_score: match.semanticScore,
}
```

### Files to Create

| File | Description | LOC estimé |
|------|-------------|------------|
| `src/mcp/handlers/discover-handler.ts` | Handler principal | ~150 LOC |
| `tests/mcp/handlers/discover-handler_test.ts` | Tests unitaires | ~200 LOC |

### Files to Modify

| File | Changement | LOC estimé |
|------|------------|------------|
| `src/mcp/tools/definitions.ts` | Ajouter `discoverTool` + getMetaTools | ~40 LOC |
| `src/mcp/handlers/mod.ts` | Export handleDiscover | ~2 LOC |
| `src/mcp/handlers/search-handler.ts` | Deprecation warnings | ~15 LOC |
| `src/mcp/gateway-server.ts` | Register discover handler | ~20 LOC |

### Learnings from Previous Story (10.5)

1. **Architecture unifiée Worker-only** - Tout passe par WorkerBridge maintenant
2. **Performance** - Worker ~31ms vs subprocess ~53ms (1.7x speedup)
3. **createToolExecutorViaWorker()** - Nouveau pattern pour exécution tools
4. **Pas de fallback** - Un seul chemin d'exécution (simplicité)

Ces patterns ne s'appliquent pas directement à cette story (recherche pure, pas d'exécution), mais le principe de **simplicité** s'applique : UN seul tool de découverte.

### Git Intelligence (Recent Commits)

```
ae79a59 fix: update std_tools tests for expanded tool library
eb96cbb fix: resolve type errors and add MiniToolsClient after branch merge
9545420 feat(std): expand docker and database tools for comprehensive coverage
6d348fe feat(config): add reliability and community multipliers to DagScoringConfig
```

**Patterns observés :**
- Ajout récent de ~120 tools dans `lib/std/` (docker, database, etc.)
- Configuration scoring via `DagScoringConfig`
- Tests mis à jour pour nouvelle tool library

### Key References

**Source Files:**
- `src/mcp/handlers/search-handler.ts:28-119` - handleSearchTools (réutiliser)
- `src/mcp/handlers/search-handler.ts:131-193` - handleSearchCapabilities (réutiliser)
- `src/mcp/tools/definitions.ts:49-111` - searchToolsTool, searchCapabilitiesTool (déprécier)
- `src/graphrag/graph-engine.ts` - searchToolsHybrid()
- `src/graphrag/dag-suggester.ts` - searchCapabilities()

**Epic & Previous Stories:**
- [Epic 10](../epics/epic-10-dag-capability-learning-unified-apis.md) - Unified APIs goal
- [Story 10.5](10-5-execute-code-via-dag.md) - Architecture Worker unifiée

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

- 2025-12-20: Story context created via create-story workflow (Claude Opus 4.5)

### File List

- [ ] `src/mcp/handlers/discover-handler.ts` - NEW (~150 LOC)
- [ ] `src/mcp/tools/definitions.ts` - MODIFY (~40 LOC)
- [ ] `src/mcp/handlers/mod.ts` - MODIFY (~2 LOC)
- [ ] `src/mcp/handlers/search-handler.ts` - MODIFY (~15 LOC deprecation)
- [ ] `src/mcp/gateway-server.ts` - MODIFY (~20 LOC)
- [ ] `tests/mcp/handlers/discover-handler_test.ts` - NEW (~200 LOC)
