# Tech Spec: Hierarchie des capabilities cassee + FQDN mismatch dans SHGAT

**Date**: 2026-02-19
**Statut**: Fix P0 applique + code review + tests
**Severite**: CRITIQUE — le SHGAT de prod opere sur des embeddings aleatoires

---

## 1. Constat

### Hierarchie attendue

```
L0 = MCP tools individuels (std:psql_query, filesystem:read_file, ...)
L1 = Capabilities (workflow_patterns qui UTILISENT ces tools)
L2 = Capabilities de capabilities (cap qui APPELLE une autre cap)
```

### Hierarchie reelle

```
L0 = TOUT (workflow_patterns + tools, tout au meme niveau)
L1+ = Quasi-vide (seulement cap→cap nested, ~23 traces sur 1741)
```

### Chiffres

- `capability_dependency`: **63 records** (uniquement cap→cap nested)
- `workflow_pattern` L0: **416/469** patterns (89%) sans parent
- Tools les plus utilises (syson, plm, sim, onshape): **TOUS** orphelins

---

## 2. BUG CRITIQUE #1 — FQDN Mismatch dans le SHGAT graph

### Le flux casse

1. `initializer.ts:377` charge `dag_structure->'tools_used'` → **FQDN** format
   ```
   ["pml.mcp.std.psql_query.db48", "pml.mcp.filesystem.read_file.abc1"]
   ```

2. `capsForWorker` (L886-893) passe `toolsUsed` tel quel au worker

3. `train-worker.ts:223` appelle:
   ```typescript
   createSHGATFromCapabilities(input.capabilities, shgatPartialConfig)
   //                                              ^^^^^^^^^^^^^^^^
   //                              2eme arg = config object, PAS Map<string,number[]>
   ```

4. `createSHGATFromCapabilities` (shgat.ts:2116-2121):
   ```typescript
   for (const toolId of allTools) {  // toolId = "pml.mcp.std.psql_query.db48"
     shgat.registerTool({
       id: toolId,
       embedding: toolEmbeddings?.get(toolId)  // toolEmbeddings = undefined!
         || generateDefaultToolEmbedding(toolId, embeddingDim),  // ← RANDOM
     });
   }
   ```

5. Ensuite, `additionalToolsWithEmbeddings` (train-worker.ts:227-241) ajoute les tools
   en format **SHORT** avec de vrais embeddings:
   ```typescript
   // tool.id = "std:psql_query", tool.embedding = [0.123, ...] (reel BGE-M3)
   if (!shgat.hasToolNode("std:psql_query")) {  // → true (pas enregistre en short!)
     shgat.registerTool({ id: "std:psql_query", embedding: realEmbedding });
   }
   ```

### Resultat : DEUX nodes pour le meme tool

| Node ID | Embedding | Connecte aux caps ? |
|---------|-----------|---------------------|
| `pml.mcp.std.psql_query.db48` | **RANDOM** (generateDefault) | OUI (via `members`) |
| `std:psql_query` | **REEL** (BGE-M3 1024D) | NON (orphelin) |

**Le MP SHGAT propage des embeddings ALEATOIRES** entre les tools et les capabilities.
Les vrais embeddings BGE-M3 sont sur des nodes orphelins deconnectes du graphe.

C'est la raison pour laquelle le SHGAT detruit le GRU (-27pp Hit@1).

---

## 3. BUG #2 — `hierarchy_level` toujours 0

### `capability-store.ts:475-481`

```typescript
const calledCapabilities = await this.db.query(
  `SELECT wp.pattern_id, COALESCE(wp.hierarchy_level, 0) as hierarchy_level
   FROM workflow_pattern wp
   INNER JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
   WHERE (cr.namespace = $1 AND cr.action = $2)
      OR (cr.namespace || ':' || cr.action) = $3
   LIMIT 1`,
  [namespace, action, toolId],
);
```

Ce query cherche si le tool utilise (`std:psql_query`) est une **capability enregistree**.
Les MCP tools ne sont JAMAIS dans `capability_records` → JOIN echoue →
`maxChildLevel = -1` → `hierarchy_level = 0`.

**Toutes les nouvelles capabilities creees sont L0**, qu'elles utilisent 1 ou 10 tools.

---

## 4. BUG #3 — `capability_dependency` quasi-vide

Seules les aretes cap→cap (nested calls) sont creees. Les aretes cap→tool n'existent pas.

```sql
SELECT COUNT(*) FROM capability_dependency;  -- 63 records (cap→cap uniquement)
-- Attendu: milliers (cap→tool pour chaque workflow_pattern)
```

---

## 5. BUG #4 — Tool→Cap incidence existe mais sur mauvais IDs

Le code de `buildMultiLevelIncidence` (incidence.ts:92-109) construit correctement `toolToCapIncidence`
depuis `members` (qui vient de `createMembersFromLegacy(toolsUsed, children)`).

MAIS les tool IDs dans cette incidence sont en FQDN → les nodes correspondantes ont
des embeddings aleatoires (Bug #1). Donc le MP est mathematiquement correct mais
semantiquement vide.

---

## 6. Fix applique (P0) — 2026-02-19

### PIEGE: la normalisation seule rend les choses PIRES

Si on fait **seulement** le fix FQDN (normaliser dans `parseCapabilities`):
- Avant: FQDN nodes (random, connectes) + SHORT nodes (reels, orphelins)
- Apres normalisation seule: SHORT nodes (RANDOM, connectes), plus de duplicat orphelin
- Les tools deviennent l'unique copie, mais **toujours random** car `createSHGATFromCapabilities`
  ne recoit pas de `toolEmbeddings` Map (2eme arg = config, pas embeddings)

Il faut AUSSI passer les vrais embeddings au worker.

### Fix A: Normaliser FQDN partout

Utilise `normalizeToolId()` de `routing-resolver.ts` (gere FQDN, mcp.*, mcp__*).

| Fichier | Ligne | Changement |
|---------|-------|------------|
| `initializer.ts` | parseCapabilities L442 | `(c.tools_used ?? []).map(normalizeToolId).filter(Boolean)` |
| `post-execution.service.ts` | parseCapabilityWithEmbedding L84 | idem |
| `train-shgat-standalone.ts` | L258 | idem |
| `db-sync.ts` | L262 | Normalise tool IDs dans le graphe graphology |

### Fix B: Passer les vrais embeddings au worker

Nouveau champ `toolEmbeddings: Record<string, number[]>` dans `SpawnTrainingInput` / `WorkerInput`.

| Fichier | Changement |
|---------|------------|
| `initializer.ts` | Charge ALL tool embeddings (cap + example), passe `toolEmbeddings` |
| `per-training.ts` | idem |
| `spawn-training.ts` | Ajoute `toolEmbeddings` dans interface, transmet |
| `train-worker.ts` | Reconstruit Map, passe comme 2eme arg a `createSHGATFromCapabilities` |

Le worker passe maintenant `toolEmbeddingsMap` (Map) comme 2eme arg a `createSHGATFromCapabilities`,
qui utilise la surcharge `(capabilities, Map<string,number[]>, config)`. Les tools dans les caps
sont enregistres avec de vrais embeddings BGE-M3 au lieu de `generateDefaultToolEmbedding()`.

---

## 7. Code Review — 6 findings supplementaires

Apres le fix initial (7 fichiers), un code review a identifie 6 problemes additionnels.

### Finding #1 (CRITIQUE): `train-shgat-standalone.ts` ne passait pas `toolEmbeddings` au worker

Le script standalone utilisait un champ fantome `additionalTools` (jamais lu par le worker).
Les tools etaient enregistres avec des embeddings aleatoires meme apres le fix initial.

**Fix**: Charge les embeddings depuis `tool_embedding` et passe `toolEmbeddings: Record<string, number[]>`.

### Finding #2 (HAUTE): `train-shgat-standalone.ts` ne filtrait pas `contextTools`

Les `executed_path` contiennent des UUIDs (workflow_pattern IDs), des `code:*` et `loop:*`.
Ces IDs corrompus etaient passes tels quels comme `contextTools` au worker.

**Fix**: Applique `filterContextTools()` (exporte depuis `initializer.ts`) qui filtre UUIDs, `code:*`, `loop:*`.

### Finding #3 (MOYENNE): `contextTools` pas normalises dans standalone

Les FQDN dans `executed_path` n'etaient pas normalises en SHORT format.

**Fix**: `.map(normalizeToolId).filter(Boolean)` apres `filterContextTools()`.

### Finding #4 (BASSE): Champ fantome `additionalTools` dans standalone

Le script passait `additionalTools` dans `inputData`, mais `WorkerInput` n'a jamais eu ce champ.
Code mort qui donnait une fausse impression de fonctionnement.

**Fix**: Remplace par `toolEmbeddings` (le vrai champ).

### Finding #6 (MOYENNE): `tool_dependency` edges pas normalises dans `db-sync.ts`

Les edges `from_tool_id`/`to_tool_id` dans `tool_dependency` pouvaient etre en FQDN.
Le graph graphology les enregistrait tels quels, creant des nodes inconsistantes.

**Fix**: `normalizeToolId()` sur `from` et `to` dans la section 2 de `syncGraphFromDatabase`.

### Finding #7 (MOYENNE): `registerSHGATNodes` — toolsCalled pas normalises

Dans `post-execution.service.ts`, les `toolsCalled` bruts (potentiellement FQDN) etaient
passes a `shgat.registerTool()` sans normalisation.

**Fix**: `toolsCalled.map(normalizeToolId).filter(Boolean)` + idem sur `toolsUsed`.

---

## 8. Tests crees — 37 nouveaux tests

### `tests/unit/capabilities/normalize-tool-id-fqdn.test.ts` (17 tests)

| Test | Couverture |
|------|-----------|
| FQDN 5-part format → namespace:action | `pml.mcp.std.psql_query.db48` → `std:psql_query` |
| FQDN 4-part format | `local.default.startup.fullProfile` → `startup:fullProfile` |
| FQDN avec hash de longueur variable | `ab`, `abcdef1234` |
| mcp.server.action format | `mcp.std.fetch_url` → `std:fetch_url` |
| mcp__server__action format | `mcp__std__fetch_url` → `std:fetch_url` |
| Canonical format inchange | `std:psql_query` → `std:psql_query` |
| Edge cases (null, undefined, empty) | Retourne `""` |
| Application sur array toolsUsed | FQDN, mixed, empty, with filter |
| Idempotence | `normalize(normalize(x)) === normalize(x)` |
| Consistency avec tool_embedding format | FQDN normalisees matchent les IDs DB |

### `tests/unit/graphrag/shgat-fqdn-tool-embeddings.test.ts` (10 tests)

| Test | Couverture |
|------|-----------|
| Map embeddings vs defaults | `createSHGATFromCapabilities` avec Map utilise vrais embeddings |
| Sans Map → defaults | Fallback `generateDefaultToolEmbedding` |
| Map avec multiple tools | 3 tools, 2 caps, tous enregistres |
| Tool absent du Map → fallback | Mixed: Map pour certains, default pour le reste |
| Empty Map | Tous les tools en default |
| E2E: FQDN normalisee → Map lookup | Pipeline complet: FQDN → normalize → Map |
| Bug demo: sans normalisation, FQDN ne matche pas | Prouve que le bug existe |
| generateDefaultToolEmbedding deterministe | Meme ID → meme embedding |
| generateDefaultToolEmbedding different par ID | IDs differents → embeddings differents |
| FQDN vs SHORT → defaults differents | Prouve pourquoi la normalisation est necessaire |

### `tests/unit/graphrag/algorithm-init-fqdn.test.ts` (10 tests)

| Test | Couverture |
|------|-----------|
| filterContextTools: remove UUIDs | UUIDs v4/v7 filtres |
| filterContextTools: remove code:* | `code:filter`, `code:map` filtres |
| filterContextTools: remove loop:* | `loop:forOf` filtre |
| filterContextTools: keep valid tools | `std:psql_query`, `filesystem:read_file` conserves |
| filterContextTools: mixed | Combinaison UUID + code + valides |
| filterContextTools: empty array | `[]` → `[]` |
| filterContextTools: all filtered | Tous invalides → `[]` |
| filterContextTools: null/undefined | Retourne `[]` |
| filterContextTools: near-UUID strings | Strings qui ressemblent a des UUIDs sans l'etre |
| filterContextTools: preserves order | L'ordre est maintenu |

### `tests/debug/session-routing-flow.test.ts` — 1 fix

Assertion corrigee: `alice.default.startup.fullProfile` normalise correctement en `startup:fullProfile`.

### Resultats

```
37/37 nouveaux tests OK
33/33 tests de regression OK (graph-engine, edge-weights, shgat, db-sync)
```

---

## 9. Liste complete des fichiers modifies

### Fichiers source (10)

| Fichier | Type de changement |
|---------|-------------------|
| `src/mcp/algorithm-init/initializer.ts` | Fix A (normalize toolsUsed) + Fix B (load & pass toolEmbeddings) |
| `src/graphrag/algorithms/shgat/train-worker.ts` | Fix B (receive Map, pass to createSHGATFromCapabilities) |
| `src/graphrag/algorithms/shgat/spawn-training.ts` | Interface: `toolEmbeddings` field |
| `src/application/services/post-execution.service.ts` | Fix A (normalize toolsUsed + toolsCalled) |
| `src/graphrag/learning/per-training.ts` | Fix B (load all embeddings, pass toolEmbeddings) |
| `src/graphrag/sync/db-sync.ts` | Fix A (normalize contains edges + tool_dependency edges) |
| `tools/train-shgat-standalone.ts` | Fix A + Fix B + filterContextTools + remove ghost field |
| `src/capabilities/capability-store.ts` | Fix P1: hierarchy_level = L1 si toolsUsed > 0 |

### Fichiers test (4)

| Fichier | Type |
|---------|------|
| `tests/unit/capabilities/normalize-tool-id-fqdn.test.ts` | NOUVEAU (17 tests) |
| `tests/unit/graphrag/shgat-fqdn-tool-embeddings.test.ts` | NOUVEAU (10 tests) |
| `tests/unit/graphrag/algorithm-init-fqdn.test.ts` | NOUVEAU (10 tests) |
| `tests/debug/session-routing-flow.test.ts` | FIX assertion FQDN |

---

## 10. Fix P1 applique — hierarchy_level correct (2026-02-19)

### Probleme

`capability-store.ts:518-520` : le calcul de `hierarchy_level` dependait uniquement
de la detection de **capabilities enfants** (cap qui appelle une autre cap via `capability_records`).
Les MCP tools (`std:psql_query`, `filesystem:read_file`) ne sont jamais dans `capability_records`,
donc `maxChildLevel` restait a `-1` et `finalHierarchyLevel = 0` pour toutes les capabilities.

**Avant le fix** :
```
L0: 501 capabilities (tout au meme niveau)
L1: 44 (seulement les caps qui appellent d'autres caps)
L2: 10
```

### Fix code

`capability-store.ts:518-525` :
```typescript
// AVANT (casse):
const finalHierarchyLevel = maxChildLevel >= 0 ? maxChildLevel + 1 : 0;

// APRES (corrige):
const usesTools = capabilityTools.length > 0;
const finalHierarchyLevel = maxChildLevel >= 0
  ? maxChildLevel + 1          // calls other caps → above them
  : (usesTools ? 1 : 0);      // uses tools → L1, nothing → L0
```

Logique :
- **L0** = capability sans outils (bare capability, theorique — 3 cas)
- **L1** = capability qui utilise des MCP tools (cas le plus courant)
- **L2+** = capability qui appelle d'autres capabilities (nested)

### Backfill SQL

```sql
UPDATE workflow_pattern
SET hierarchy_level = 1
WHERE hierarchy_level = 0
  AND dag_structure->'tools_used' IS NOT NULL
  AND jsonb_array_length(dag_structure->'tools_used') > 0;
-- Result: 498 rows updated
```

**Apres le fix** :
```
L0:   3 capabilities (sans tools)
L1: 542 capabilities (utilisent des MCP tools)
L2:  10 capabilities (appellent d'autres caps)
```

### Rollback si necessaire

```sql
-- Revert le backfill (remettre les 498 a L0)
UPDATE workflow_pattern
SET hierarchy_level = 0
WHERE hierarchy_level = 1
  AND dag_structure->'tools_used' IS NOT NULL
  AND jsonb_array_length(dag_structure->'tools_used') > 0
  AND pattern_id NOT IN (
    -- Garder les L1 qui existaient deja (caps nested)
    SELECT DISTINCT from_capability_id
    FROM capability_dependency
    WHERE edge_type = 'contains'
  );
```

Pour le rollback code, reverter `capability-store.ts:518-525` a :
```typescript
const finalHierarchyLevel = maxChildLevel >= 0 ? maxChildLevel + 1 : 0;
if (maxChildLevel >= 0) {
```

---

## 11. Fix notebook 06 (2026-02-19)

Corrections SQL dans `lib/shgat-for-gru/notebooks/06-executed-path-audit.ipynb` :
- `capability_id` → `pattern_id` (PK de `workflow_pattern`)
- `intent_text` / `name` / `level` → `description` / `hierarchy_level` (vrais noms de colonnes)
- `r.ord` → `e.ord` (l'ordinality vient de `e(val, ord)`, pas de `r`)
- Ajout warning `serverName/toolName = null` dans le query de reconstruction

---

## 12. Bug restant (P2)

### `capability_dependency` cap→tool

Seulement 63 records (cap→cap). Les aretes `contains` cap→tool manquent a la capture.
Le code actuel ne cree des `capability_dependency` que quand un tool appele EST une capability.
Il ne cree pas d'arete entre une capability et les MCP tools qu'elle utilise.

---

## 13. Verification post-fix — Resultats 2026-02-20

### Fix supplementaires appliques (2026-02-20)

1. **`flattenExecutedPath` → task_results** : source primaire passe de `executed_path`
   (16.8% UUIDs, 7% FQDN corrompu) a `task_results` (0% corruption, structure JSONB).
   Fallback sur `executed_path` si task_results vide.

2. **Normalisation FQDN dans `dag_structure→tools_used`** (DB migration) :
   - 209 → 181 distinct tools (28 phantomes supprimes)
   - 1039 → 875 edges (164 duplicats fusionnes)
   - 82 capabilities deduplicees
   - Backup: `_backup_dag_structure_20260220`

3. **Filtrage `code:*/loop:*`** dans `flattenExecutedPath` via `isInternalOperation()`

4. **Simplification toolEmbeddings** dans `trainSHGATOnPathTracesSubprocess` :
   single `toolEmbeddings: Record<string, number[]>` au lieu de `additionalToolsWithEmbeddings`

### Benchmark post-fix (30 epochs, prod-only data)

| Metrique | NO_SHGAT | SHGAT_TRAINED | Delta |
|----------|----------|---------------|-------|
| Best Hit@1 | 52.8% (ep13) | 50.9% (ep20) | -1.9pp |
| MRR | 0.660 | 0.636 | -0.024 |
| **E2E Beam First-N** | 64.6% | **70.8%** | **+6.2pp** |

### Conclusion

**SHGAT ne detruit plus le GRU.** Delta Hit@1 passe de **-27.3pp a -1.9pp**.
Sur le E2E Beam (metrique la plus pertinente pour la prod), SHGAT GAGNE de +6.2pp.

Les fix FQDN (2026-02-19) + data quality (2026-02-20) ont resolu le probleme principal.
PaperMP (section 12 P2) n'est plus prioritaire — le MP actuel fonctionne sur des donnees propres.

### Bugs restants (non bloquants)

- **`flattenExecutedPath` design flaw** : insere B1,B2 a la suite entre A et C au lieu
  de les nester. Marginal (10 caps L2), conceptuellement faux.
- **`avgDelta` undefined** dans `benchmark-e2e.ts:2846` — crash mineur en fin de run
- **Dead code** : `additionalToolsWithEmbeddings` dans spawn-training/train-worker (remplace par `toolEmbeddings`)

---

*Investigation 2026-02-19, fix P0 (FQDN) + code review + 37 tests + fix P1 (hierarchy) + notebook 06 corrige*
*Fix data quality 2026-02-20 : task_results source, FQDN DB migration, benchmark OK*
