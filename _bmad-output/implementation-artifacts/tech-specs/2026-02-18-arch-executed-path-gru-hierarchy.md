# Architecture : `execution_trace` — source de vérité unique

**Date** : 2026-02-18
**Statut** : Validé (post-audit)

---

## 1. Constat

### 1.1 `execution_trace` a déjà tout

La table `execution_trace` contient toutes les données nécessaires :

| Colonne | Contenu | Utilité |
|---------|---------|---------|
| `task_results` (JSONB) | Liste ordonnée des tools appelés : `tool`, `task_id`, `layer_index`, `success`, `duration_ms`, `is_fused`, `loop_id` | **Source de vérité unique** pour séquences, entraînement GRU, stats |
| `capability_id` (UUID FK → workflow_pattern) | Quelle capacité a été exécutée | Lien intent → trace |
| `parent_trace_id` (UUID FK → self) | Trace parent pour exécution imbriquée (cap appelle cap) | Hiérarchie |
| `intent_embedding` (vector 1024) | Embedding de l'intent | Entraînement GRU, similarité |
| `success`, `duration_ms`, `executed_at` | Métadonnées de l'exécution | Stats, scoring |

### 1.2 Ce qui est redondant

| Colonne | Pourquoi c'est redondant | Statut |
|---------|--------------------------|--------|
| `executed_path` (TEXT[]) | = `task_results.map(t => t.tool)` + UUIDs caps intercalés + `code:*`/`loop:*`. Mélange 4 types incompatibles. Aucune info de hiérarchie malgré les UUIDs présents. | **À déprécier** |
| `tool_sequence` (TEXT[]) | = `executed_path` filtré. **Supprimé** le 2026-02-18 (migration 048 retirée, colonne droppée). | **Supprimé** |
| `decisions` (JSONB) | Quasi jamais peuplé | À auditer |
| `initial_context` (JSONB) | Quasi jamais peuplé | À auditer |

### 1.3 Peuplement réel de `task_results` (audit DB 2026-02-18)

| Champ | Clé JSONB | Taux de peuplement |
|-------|-----------|-------------------|
| tool | `tool` | 100% |
| task_id | `task_id` | 99% (1729/1753) |
| layer_index | `layer_index` | 61% (1070/1753) |
| success | `success` | ~100% |
| duration_ms | `duration_ms` | variable |
| is_fused | `is_fused` | quelques % |
| loop_id | `loop_id` | quelques % |

**Note** : les clés sont en **snake_case** en DB (`task_id`, `layer_index`), pas camelCase. Le code GRU (`training-utils.ts`) gère les deux formats (L158-159).

---

## 2. Bug FQDN : format de tool dans `task_results`

### Le problème

`task_results` stocke les noms d'outils en **3 formats** selon le chemin d'exécution :

| Format | Exemple | Chemin | Volume |
|--------|---------|--------|--------|
| Court | `std:psql_query` | worker-bridge (L811: `` `${server}:${tool}` ``) | 1246 (jan 2026) |
| FQDN | `pml.mcp.std.psql_query.db48` | execute-direct (result-mapper.ts) | 837 (fév 2026) |
| Local | `local.default.db.tableSchemas.d3d7` | local execution | 119 (fév 2026) |

Le vocabulaire GRU (`tool_embedding.tool_id`) est en format court. Les FQDN ne matchent pas → **657 traces (38%) silencieusement ignorées**.

### Décision : le FQDN est le bon format à stocker

Le FQDN est plus riche (inclut le hash de version). C'est le **consommateur** qui normalise, pas la source.

### Fix appliqué

**`lib/gru/src/training-utils.ts`** (L155-163) : normalisation FQDN→short au moment de la lecture dans `buildDAGAwareExamples()` :

```typescript
let tool = task.tool;
if (!tool) continue;
if (!validToolIds.has(tool)) {
  const parts = tool.split(".");
  if (parts.length >= 4 && (parts[0] === "pml" || parts[0] === "local")) {
    tool = `${parts[2]}:${parts[3]}`;
  }
}
if (!validToolIds.has(tool)) continue;
```

Impact attendu : +38% de traces pour l'entraînement GRU.

---

## 3. `executed_path` — pourquoi c'est inutile

### Ce qu'il contient

```
["std:psql_query", "0a01917e-...", "code:filter", "pml.mcp.std.git_log.db48", "std:psql_query"]
```

4 types mélangés, aucune sémantique, aucune hiérarchie. Les UUIDs de capabilities sont intercalés dans le flux sans aucune indication de quel tool appartient à quelle cap.

### Ce qui l'utilise (26 fichiers)

| Catégorie | Fichiers | Remplaçable par |
|-----------|----------|-----------------|
| **Producteurs** (écriture) | worker-bridge, execution-capture, capability-store, execution-trace-store, db-sync | Continuer à écrire pour compat, déprécier |
| **Stats/ML** (compute) | initializer, per-priority, path-level-features, per-training, static-structure-builder | `task_results` directement |
| **Stats SQL** (trace-feature-extractor) | 39 requêtes SQL sur `executed_path` | `task_results` avec JSONB queries ou GIN sur expression |
| **UI/API** (display) | CytoscapeGraph, TraceTimeline, graph-mappers, traces | Peut rester pour display tant que non supprimé |

### Plan de dépréciation

Pas urgent. Le code continue d'écrire `executed_path` pour la compat UI. Les consommateurs compute migrent progressivement vers `task_results`. Pas de nouvelle migration, pas de nouvelle colonne.

---

## 4. GRU : `buildDAGAwareExamples` utilise déjà `task_results`

Le GRU n'a **jamais** utilisé `executed_path`. Il lit `task_results` via :

```sql
SELECT et.id, et.task_results, ...
FROM execution_trace et
JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
WHERE et.task_results IS NOT NULL
```

Puis `buildDAGAwareExamples()` extrait les exemples avec 3 tiers de contexte :

| Tier | Condition | Contexte | Taux en DB |
|------|-----------|----------|------------|
| 1 (edges) | `task_id` + static_edges | Ancêtres causaux DAG | ~0% (static_edges rarement peuplé) |
| 2 (layerIndex) | `layer_index` ≥ 0 | Tools des layers précédents | ~61% potentiel |
| 3 (linear) | fallback | Tools précédents dans l'ordre | 100% |

**Avec le fix FQDN**, le Tier 2 devrait s'activer pour les ~61% de traces qui ont `layer_index`. À mesurer.

---

## 5. Capabilities dans le GRU — sujet ouvert

### État actuel
- 226 VocabNodes (capabilities L1+) dans le vocabulaire GRU
- Ils n'apparaissent **jamais** comme targets d'entraînement
- `isCapabilityCall` = 0 dans toute la DB (jamais peuplé)
- `parent_trace_id` = 23 traces enfant (hiérarchie minime)
- Option A (cap comme target parallèle) → **rejetée** (conflits de signal, pas de follow-up)

### Données disponibles
Chaque trace a `capability_id` → on sait quelle cap a été exécutée. C'est un signal de supervision naturel. L'approche n'est pas encore définie.

---

## 6. Flux de données actuel

```
PML package (client)
  → collecte taskResults[] pendant l'exécution (collector.ts)
  → envoie LocalExecutionTrace { taskResults, capabilityId, parentTraceId, ... }
  → PAS de executedPath (le package ne connaît pas ce concept)

Serveur (src/)
  → reçoit la trace
  → construit executedPath depuis les trace events (worker-bridge) — legacy
  → persiste execution_trace { task_results, executed_path, capability_id, ... }
```

Le package PML est déjà clean. C'est le serveur qui ajoute `executed_path` comme artefact legacy.

---

## 7. Actions réalisées (2026-02-18)

| Action | Statut |
|--------|--------|
| Fix FQDN→short dans `training-utils.ts` | **FAIT** |
| Migration 048 (`tool_sequence`) supprimée | **FAIT** |
| Colonne `tool_sequence` droppée en DB | **FAIT** |
| Désenregistrement migration dans `migrations.ts` | **FAIT** |
| Nettoyage `toolSequence` dans ~15 fichiers source + 8 fichiers test | **FAIT** |
| `trace-feature-extractor` : revenu sur `executed_path` (la colonne existe toujours) | **FAIT** |

## 8. Actions réalisées (2026-02-20) — Data Quality Fix

| Action | Statut |
|--------|--------|
| `flattenExecutedPath` migré vers `task_results` (source primaire, 0% corruption) | **FAIT** |
| `per-priority.ts` migré vers `task_results` via `cleanPathForSHGAT` | **FAIT** |
| `path-level-features.ts` migré vers `task_results` via `getCleanToolPath` local | **FAIT** |
| Normalisation FQDN dans `dag_structure.tools_used` (DB migration : 209→181 tools, 1039→875 edges) | **FAIT** — ⚠️ **ERREUR**, voir ADR-068 |
| Backup `_backup_dag_structure_20260220` créé avant migration | **FAIT** |

### Benchmark post-fix (2026-02-20)

| Métrique | NO_SHGAT | SHGAT | Delta |
|----------|----------|-------|-------|
| Hit@1 (GRU seul) | **52.8%** | 50.9% | -1.9pp |
| E2E Beam First-N | 64.6% | **70.8%** | **+6.2pp** |

**Résultat clé** : avant le fix, SHGAT détruisait le GRU (-27.3pp). Après fix, SHGAT aide le E2E Beam (+6.2pp). Le problème n'était pas l'algorithme mais les données corrompues (FQDN non-normalisé, UUIDs dans executed_path).

## 9. Actions réalisées (2026-02-20) — Consolidation trace-path

| Action | Statut |
|--------|--------|
| Créé `src/capabilities/trace-path.ts` — source unique `getCleanToolPath()` + `cleanToolIds()` | **FAIT** |
| Remplacé 4 copies identiques dans `per-priority.ts`, `path-level-features.ts`, `per-training.ts`, `initializer.ts` | **FAIT** |
| Fix résidu `cleanPathForLookup` dans `per-training.ts:traceToTrainingExamples` → `getCleanToolPath(trace)` | **FAIT** |
| Marqué `executedPath` `@deprecated` dans `ExecutionTrace` et `SaveCapabilityInput.traceData` | **FAIT** |
| 16 tests consolidés dans `tests/unit/capabilities/trace_path_test.ts` | **FAIT** |
| `filterContextTools` dans initializer → alias deprecated de `cleanToolIds` | **FAIT** |
| `train-shgat-standalone.ts` migré vers `cleanToolIds` direct | **FAIT** |

## 10. Nettoyage dead code SHGAT (2026-02-20)

| Action | Lignes supprimées | Statut |
|--------|-------------------|--------|
| `v2-scorer.ts` supprimé (jamais importé en prod) | ~553 | **FAIT** |
| `ScorerVersion` enum + `ScorerInterface` supprimés du barrel | ~20 | **FAIT** |
| `_trainOnTraces()` deprecated supprimé de `initializer.ts` | ~280 | **FAIT** |
| Imports morts retirés (`TrainingExample`, `NUM_NEGATIVES`, `spawnSHGATTraining`, `trainingLock`, `TraceRow`) | 5 | **FAIT** |
| `lib/shgat-ob-legacy/` supprimé (40 fichiers, 0 imports depuis `src/`) | ~2500 | **FAIT** |

**Total** : ~3350 lignes de dead code supprimées, 64/64 tests de régression OK.

## 11. État du système de graphe (2026-02-20)

### Edge types — état actuel

| Type | Poids | Source | État |
|------|-------|--------|------|
| `dependency` | 1.0 | workflow templates YAML | OK |
| `contains` | 0.8 | `dag_structure.tools_used` (cap→tool) + `capability_dependency` (cap→cap) | Mixed format (short + FQDN), voir ADR-068 |
| `provides` | 0.7 | `createProvidesEdges()` — matching `output_schema` ↔ `input_schema` | OK, ~116 edges (23 tools avec output_schema) |
| `sequence` | 0.5 | `generateSequenceEdges()` — data dependencies + fallback `code:*` | OK, fix fallback en place |

### Provides edges — plan d'accumulation naturelle

Les provides edges sont actuellement limitées par le nombre de tools ayant un `output_schema` déclaré (23/~200). Ce n'est pas un bug — c'est une limitation qui se résout naturellement :

1. **Aujourd'hui** : `createProvidesEdges()` tourne déjà en prod, matching O(n²) sur les schemas
2. **Accumulation** : chaque nouvelle exécution de tool peut enrichir les schemas via `tool_observation` → output_schema inféré
3. **Impact** : plus d'output_schema → plus de provides edges → meilleur PageRank + DAG suggester
4. **SHGAT** : les provides edges ne sont PAS injectées dans SHGAT (utilise `toolsUsed` membership seulement). Les injecter dans le message passing est un levier futur — à benchmarker avant de câbler.

### Ce qui consomme les edges

| Consommateur | Edges utilisées | Notes |
|---|---|---|
| `syncGraphFromDatabase()` → Graphology | Toutes (confidence > 0.3) | PageRank, community detection |
| SHGAT message passing | `toolsUsed` membership uniquement | PAS les edges tool→tool |
| DAG suggester | PageRank sur la structure edge | Suggestions de workflows |
| Provides edge queries | `provides` uniquement | O(1) lookup par type |

## 12. Actions restantes

### Fait (ADR-068 — 2026-02-20)

| Action | Priorité | Statut | Vérification |
|--------|----------|--------|--------------|
| **Normaliser `toolsUsed` dans `rowToCapability`** | **P1** | **FAIT** | `capability-store.ts:915` — `.map(normalizeToolId).filter(Boolean)` |
| Fix SQL `searchByContext` : normaliser côté SQL | P1 | **FAIT** | `capability-store.ts:810` — `CASE WHEN tool LIKE '%.%.%.%' THEN split_part(...)` |
| Retirer les normalisations redondantes | P1 | **FAIT** | Gardées comme défensives (`initializer.ts` lit la DB directement, pas via `rowToCapability`) |
| Aligner `execute-direct.use-case.ts` pour écrire FQDN | P2 | **FAIT** | `execute-direct.use-case.ts:677` — `resolveToolIdsToFqdns()` avant `saveCapability` |
| Aligner `worker-bridge.ts` pour écrire FQDN | P2 | **FAIT** | `worker-bridge.ts:425,667` — main + loop save paths |
| NE PAS re-normaliser la DB | P0 | **Noté** | ADR-068 — les futures écritures sont en FQDN |
| Fix `bodyTools` manquant dans task results parent | — | **FAIT** | `result-mapper.ts:114` + `worker-bridge.ts:1074` — loop card TraceTimeline |

### Reste à faire

| Action | Priorité | Effort | Notes |
|--------|----------|--------|-------|
| Migrer `trace-feature-extractor` de `executed_path` vers `task_results` JSONB | P2 | 1 jour | 39 requêtes SQL à migrer |
| Benchmark : injecter provides edges dans SHGAT message passing | P2 | 2 jours | Seulement si les provides edges atteignent >200 |
| Définir l'approche capability dans le GRU | P2 | À discuter | `capability_id` par trace = signal de supervision naturel |
| Mesurer activation Tier 2 GRU (layer_index) post-fix FQDN | P2 | rapide | ~61% traces ont `layer_index`, devrait s'activer maintenant |
| Fix `workflow-sync.ts` : spécifier `edge_type='dependency'` dans INSERT | P3 | 15min | Actuellement NULL silencieux |
| Naming consistency : `toolsUsed`/`toolsCalled`/`contextTools`/`capabilityTools` | P3 | large | Même concept, 4+ noms différents à travers ~50 fichiers |
| Auditer colonnes `decisions` et `initial_context` | P3 | rapide | Quasi jamais peuplées (section 1.2) |

## 13. ADR-068 : FQDN = format canonique de `dag_structure.tools_used` (2026-02-20)

### Investigation

Trois chemins d'écriture vers `dag_structure.tools_used` avec des formats incohérents :

| Chemin | Fichier | Format | Intent |
|---|---|---|---|
| Package PML (client) | `execution-capture.service.ts:143` | **FQDN** | Intentionnel — commentaire explicite + `resolveToolsToFqdns()` dédié |
| Serveur local | `execute-direct.use-case.ts:684` | **Court** | Non-intentionnel — `generateLogicalTrace()` retourne les noms DAG statiques |
| Worker sandbox | `worker-bridge.ts:429` | **Court** | Non-intentionnel — `getToolsCalled()` lit les trace events bruts |

La branche client d'`execute-direct` (L370-404) résout aussi les FQDN via `resolveToolFqdn()` avant stockage dans le `LearningContext`. Seules les branches serveur/sandbox n'ont jamais été alignées.

### Décision

**Le FQDN est le format canonique.** Raisons :
- Encode org/projet (multi-tenant) + hash (version)
- `execution-capture.service.ts` l'a implémenté intentionnellement
- Normalisation FQDN→court est triviale (consommateurs le font déjà)
- Dé-normalisation court→FQDN nécessite un lookup registry (peut échouer)
- Les `tool_observations` (migration 042/045) stockent des configs observées par outil/serveur — le FQDN dans `tools_used` permet la jointure par namespace

### Erreur de migration (2026-02-20)

La migration manuelle qui a normalisé `dag_structure.tools_used` (209→181 outils, 1039→875 edges) a **détruit de l'information** (org, project, hash). Backup disponible : `_backup_dag_structure_20260220`. Cette migration ne doit PAS être re-exécutée.

### Consommateurs de `Capability.toolsUsed` (audit 2026-02-20)

`rowToCapability` (L908) retourne `toolsUsed` brut depuis `dag_structure.tools_used` JSONB.
Le fix = `.map(normalizeToolId)` dans `rowToCapability`. Un seul changement, tous les consommateurs corrigés.

| Consommateur | Normalise déjà ? | Impact FQDN sans fix |
|---|---|---|
| `post-execution.service.ts:266` | **Oui** (`.map(normalizeToolId)`) | Aucun — double-normalise = no-op |
| `db-sync.ts:266` | **Oui** | Aucun |
| `initializer.ts:421` | **Oui** | Aucun |
| `searchByContext` SQL (L806) | **Non** — compare en SQL | `WHERE tool = ANY($1)` rate les FQDN (fix SQL séparé nécessaire) |
| `calculateCapabilityRisk` (L950) | **Non** — `toolId.split(":")[0]` | FQDN → server prefix = `pml.mcp.std.psql_query` au lieu de `std` |
| `get-suggestion.ts:144` | **Non** — `buildTaskFromTool(toolsUsed[0])` | `getToolNode(FQDN)` retourne null (graphe indexé en court) |
| `dag-suggester.ts:184` | **Non** — `allTools.add(tool)` | FQDN ≠ court → outils comptés 2x |
| `spectral-clustering.ts:199` | **Non** — matrice d'incidence | FQDN ≠ court → matrice corrompue |
| `boost-calculator.ts:32` | **Non** — `capability.toolsUsed ?? []` | Cascade depuis spectral-clustering |
| `hypergraph-builder.ts:155` | **Non** — `for (const toolId of cap.toolsUsed)` | Nœuds FQDN dans l'hypergraphe |
| `graph-insights.ts:259` | **Non** — Jaccard intersection | FQDN vs court → Jaccard = 0 |
| `api/capabilities.ts:368` | **Non** — `.includes(toolId)` | Recherche par tool ID rate le match |
| UI (CytoscapeGraph, NamespaceDetail, CapabilityDetailPanel) | **Non** — display | Pas critique, montre le raw |

### Impact sur GRU/SHGAT

- **GRU** : apprend sur vocabulaire court (`std:psql_query`). `normalizeToolId()` à la lecture. Pas d'impact.
- **SHGAT** : scores par membership, agnostique au format. `normalizeToolId()` à la lecture. Pas d'impact.
- **Futur** : le GRU pourrait apprendre des distinctions FQDN si le multi-tenant croît.

Voir `docs/adrs/ADR-068-fqdn-canonical-format-dag-structure.md` pour la décision complète.
