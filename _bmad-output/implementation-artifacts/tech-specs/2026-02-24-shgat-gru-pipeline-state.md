# Tech Spec : SHGAT + GRU Pipeline — Etat au 2026-02-24

**Date** : 2026-02-24
**Suite de** : `2026-02-23-consolidated-shgat-gru-state-and-roadmap.md`
**Scope** : Pipeline ML complet — SHGAT enrichment, GRU inference/training, hierarchy caps, DB schema

---

## 1. Vue d'ensemble du pipeline

```
                         DB (PostgreSQL)
                              |
            +-----------------+-----------------+
            |                 |                 |
     tool_embedding      workflow_pattern    execution_trace
     (918 tools,         (662 caps,          (2187 traces,
      BGE-M3 1024D)       dag_structure,      task_results,
                           intent_embedding)   capability_id)
            |                 |                 |
            v                 v                 v
    +-------+---------+  +---+---+     +-------+--------+
    | SHGAT Graph     |  | Caps  |     | Training Data  |
    | Builder         |  | L0-L2 |     | Builder        |
    | (shgat.ts)      |  |       |     | (train script) |
    +-------+---------+  +---+---+     +-------+--------+
            |                 |                 |
            v                 v                 v
    +-------+---------+  +---+---+     +-------+--------+
    | SHGAT Forward   |  | Vocab |     | GRU Training   |
    | Message Passing |  | Nodes |     | (TF.js/Node)   |
    | V->E->V + V2V   |  |       |     |                |
    +-------+---------+  +---+---+     +-------+--------+
            |                 |                 |
            +--------+--------+                 |
                     |                          |
                     v                          v
            +--------+--------+        +--------+--------+
            | Enriched Embs   |        | GRU Weights     |
            | (1024D, MP)     |        | (JSON ou DB)    |
            +-----------------+        +--------+--------+
                     |                          |
                     +------------+-------------+
                                  |
                                  v
                        +---------+---------+
                        | GRU Inference     |
                        | (Deno, pure JS)   |
                        | beam search +     |
                        | structural bias   |
                        +-------------------+
```

---

## 2. Schema DB — Tables ML

### 2.1 Tables sources

| Table | Role | Colonnes cles |
|-------|------|--------------|
| `tool_embedding` | Embeddings BGE-M3 des tools MCP | `tool_id TEXT PK`, `embedding vector(1024)` |
| `tool_schema` | Metadata des tools (sync MCP) | `tool_id TEXT PK`, `hash TEXT`, `previous_hash TEXT`, `input_schema JSONB` |
| `workflow_pattern` | Definition d'une capability | `pattern_id UUID PK`, `dag_structure JSONB`, `intent_embedding vector(1024)`, `hierarchy_level INT` |
| `capability_records` | Registre des capabilities nommees | `id UUID PK`, `namespace TEXT`, `action TEXT`, `workflow_pattern_id UUID FK`, `hash TEXT` |
| `execution_trace` | Trace d'execution complete | `id UUID PK`, `capability_id UUID FK→workflow_pattern`, `task_results JSONB`, `intent_embedding vector(1024)` |
| `capability_dependency` | Edges entre capabilities | `from_capability_id UUID`, `to_capability_id UUID`, `edge_type TEXT` |
| `tool_dependency` | Co-occurrence tools (V2V) | `from_tool_id TEXT`, `to_tool_id TEXT`, `observed_count INT` |

### 2.2 Relations cles

```
execution_trace.capability_id ──FK──> workflow_pattern.pattern_id
capability_records.workflow_pattern_id ──FK──> workflow_pattern.pattern_id
capability_dependency.from/to_capability_id ──> workflow_pattern.pattern_id (PAS capability_records.id)

workflow_pattern.dag_structure->>'tools_used' = TEXT[] de tool_id (format mixte FQDN/court)
```

**ATTENTION** : `capability_dependency` utilise des `workflow_pattern.pattern_id`, PAS des `capability_records.id`. Les JOINs doivent passer par `cr.workflow_pattern_id`.

### 2.3 Hierarchy

| Level | Description | Count | Source |
|-------|------------|-------|--------|
| L0 tools | MCP tools atomiques | 918 | `tool_embedding` |
| L0 caps | Caps sans tools_used (bare) | 3 | `workflow_pattern WHERE hierarchy_level=0 AND tools_used IS NULL` |
| L1 caps | Caps = sequence de tools | 649 | `workflow_pattern WHERE hierarchy_level=1` |
| L2 caps | Meta-caps = contient d'autres caps | 10 | `workflow_pattern WHERE hierarchy_level=2` |

**Comment savoir si une cap est L1 ou L2** :
- L1 : `dag_structure->'tools_used'` contient uniquement des tools (pas de caps)
- L2 : `capability_dependency` a des `contains` edges pointant vers des L1

**`hierarchy_level` est sur `workflow_pattern`**, PAS sur `capability_records`.

### 2.4 Chiffres DB actuels

| Metrique | Valeur |
|----------|--------|
| tool_embedding | 918 (BGE-M3 1024D) |
| workflow_pattern | 662 (3 L0 + 649 L1 + 10 L2) |
| capability_records | 673 (dont 400 `code:exec_*` auto-generees) |
| execution_trace | 2187 total, 1882 avec capability_id + task_results |
| capability_dependency (contains) | 63 edges (L2→L1 uniquement) |
| tool_dependency (co-occurrence) | 185 edges |
| Caps avec intent_embedding | 662/662 (100%) |
| Traces avec intent_embedding propre | 1716/2187 (78.5%) |

---

## 3. Fichiers — Carte complete

### 3.1 SHGAT (production)

| Fichier | Role |
|---------|------|
| `src/graphrag/algorithms/shgat.ts` | SHGAT principal : graph builder, forward, training, serialization |
| `src/graphrag/algorithms/shgat/graph/hierarchy.ts` | Calcul dynamique des niveaux (topological sort, PAS depuis DB) |
| `src/graphrag/learning/per-training.ts` | PER buffer, batch training K-head |

**`getToolEmbeddings()`** (shgat.ts:2003) : retourne les embeddings **enrichis** (post message-passing) via `forward()` lazy+cached. Fallback sur raw BGE-M3 si forward echoue, avec warning. `getRawToolEmbeddings()` disponible pour acces explicite au raw.

### 3.2 SHGAT adapter (pour GRU enrichment)

| Fichier | Role |
|---------|------|
| `lib/shgat-for-gru/src/adapter.ts` | SHGATAdapter : load OB params, build graph, enrich embeddings |
| `lib/shgat-for-gru/src/v2v.ts` | V2V phase (co-occurrence) |

**Level numbering adapter** : different de la DB.

| DB level | Adapter role | Adapter level |
|----------|-------------|---------------|
| 0 (tools) | L0 leaf | Auto-detecte (children=[]) |
| 1 (caps L1) | Premier hyperedge | 0 |
| 2 (caps L2) | Deuxieme hyperedge | 1 |

Le shift est : `adapterLevel = Math.max(0, dbLevel - 1)`.

### 3.3 GRU inference (Deno, production)

| Fichier | Role |
|---------|------|
| `src/graphrag/algorithms/gru/gru-inference.ts` | Forward GRU, beam search, structural bias, cap fingerprint |
| `src/graphrag/algorithms/gru/gru-loader.ts` | Load weights (JSON/DB), build vocab, Jaccard/bigram matrices |
| `src/graphrag/algorithms/gru/types.ts` | GRUWeights, GRUVocabulary, IGRUInference, StructuralMatrices |
| `src/graphrag/algorithms/gru/spawn-training.ts` | Deno→Node bridge pour lancer le training TF.js |
| `src/graphrag/algorithms/gru/mod.ts` | Re-exports |

**Vocab mismatch = throw** (gru-loader.ts:254). Si `numTools + vocabNodes.length != vocabSize` (derive du kernel similarity_head), c'est une erreur fatale.

### 3.4 GRU training (Node/TF.js)

| Fichier | Role |
|---------|------|
| `lib/gru/src/transition/gru-model.ts` | CompactInformedGRU : model TF.js, trainStep, hierarchy soft labels |
| `lib/gru/src/transition/types.ts` | CompactGRUConfig (dont `hierarchyAlpha`) |
| `lib/gru/src/train-worker-prod.ts` | Worker Node.js : recoit data via JSON, entraine, ecrit poids |
| `scripts/train-gru-with-caps.ts` | Script standalone : charge DB, SHGAT enrichment, lance worker |

### 3.5 Pipeline orchestration

| Fichier | Role |
|---------|------|
| `src/mcp/algorithm-init/initializer.ts` | Init SHGAT + GRU au demarrage. Charge poids, construit vocab |
| `src/application/services/post-execution.service.ts` | Post-execution : SHGAT training → GRU training (chaine) |
| `src/infrastructure/di/bootstrap.ts` | DI wiring (GRU injecte via options.gru) |
| `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts` | Utilise GRU inference pour suggerer des DAGs |

### 3.6 SHGAT training standalone

| Fichier | Role |
|---------|------|
| `tools/train-shgat-standalone.ts` | Entraine SHGAT depuis task_results, sauve params en DB |

**Gap mineur** : ne charge pas les 63 `capability_dependency` contains edges. Affecte uniquement les 10 L2 caps.

### 3.7 DB migrations (49-51)

| Fichier | Version DB | Contenu |
|---------|-----------|---------|
| `src/db/migrations/049_gru_params.ts` | 49 | Table `gru_params` pour persistence des poids GRU |
| `src/db/migrations/050_capability_name_history.ts` | 50 | Table `capability_name_history` pour tracking des renames |
| `src/db/migrations/051_tool_schema_hash.ts` | 51 | `hash` + `previous_hash` sur `tool_schema`, backfill, vue pml_registry |

**Note** : version 48 (`add_tool_sequence`) existe en DB mais le fichier source a ete supprime.

---

## 4. Changements effectues (2026-02-24)

### 4.1 Fix SHGAT getToolEmbeddings() — FAIT

**Avant** : `getToolEmbeddings()` retournait les embeddings **raw BGE-M3** depuis graphBuilder. `post-execution.service.ts` appelait cette methode en croyant recevoir des embeddings enrichis.

**Apres** : `getToolEmbeddings()` appelle `forward()` (lazy, cache via `lastCache`), extrait H (embeddings post message-passing). Fallback sur raw avec warning si forward echoue. Ajout de `getRawToolEmbeddings()`.

### 4.2 Script training SHGAT — FAIT

**Avant** : `tools/train-shgat-standalone.ts` utilisait `executed_path` (37.7% corruption).

**Apres** : utilise `task_results` (0% corruption), normalise via `normalizeToolId()`.

### 4.3 Script training GRU avec SHGAT enrichment — FAIT

**Fichier** : `scripts/train-gru-with-caps.ts`

Pipeline :
1. Charge 918 tool embeddings (BGE-M3) depuis `tool_embedding`
2. Charge 662 caps avec `tools_used` depuis `workflow_pattern` + `capability_records`
3. Charge SHGAT params depuis DB (`shgat_params`, format `msgpack+gzip+base64`)
4. Enrichit les embeddings via SHGATAdapter (message passing V→E→V + V2V)
5. Charge traces depuis `execution_trace.task_results`
6. Split 80/20 par trace (seeded PRNG), dedup consecutifs
7. Lance le worker TF.js avec les embeddings enrichis

**Env vars** : `SKIP_SHGAT=true` (pas d'enrichment), `SKIP_CAPS=true` (tools-only dans vocab)

### 4.4 GRU hierarchy soft labels — FAIT

`lib/gru/src/transition/gru-model.ts` : quand un tool target a des caps parentes dans le vocab, la distribution cible est adoucie : `(1-alpha)` sur le tool, `alpha/N` reparti sur les N caps parentes. Config : `hierarchyAlpha` (default 0.2).

### 4.5 GRU inference engine Deno — FAIT

Pure JS + BLAS FFI, zero TF.js. Forward pass GRU, beam search avec length normalization, structural bias (Jaccard + bigram). Vocab embarque dans le fichier poids pour garantir l'alignement.

### 4.6 Migrations DB 049-051 — FAIT

- 049 : `gru_params` (persistence poids GRU)
- 050 : `capability_name_history` (tracking renames caps)
- 051 : `hash` + `previous_hash` sur `tool_schema` + vue `pml_registry` mise a jour

---

## 5. Benchmarks (2026-02-24)

### 5.1 GRU Hit@1

| Config | Vocab | Hit@1 | Term Acc | Notes |
|--------|-------|-------|----------|-------|
| Baseline raw BGE-M3, tools-only | 918 | **58.0%** | ~80% | PROD_ONLY, 2026-02-23 |
| + SHGAT enrichment, tools-only | 918 | 49.0% | 87.4% | SHGAT degrade Hit@1, ameliore term |
| + SHGAT enrichment, caps in vocab | 1516 | 49.4% | 86.8% | Caps = dead weight (0 gradient) |
| Sans SHGAT, caps in vocab | 1516 | 47.0% | 85.6% | |

**Constat** : SHGAT enrichment degrade Hit@1 de -9pp mais ameliore termination de +7pp. Les caps dans le vocab sont du dead weight sans gradient. Le meilleur resultat reste le baseline tools-only sans SHGAT.

**Explication probable** : Le SHGAT a ete entraine pour le scoring de caps (K-head bilineaire), pas pour la prediction sequentielle. Les embeddings enrichis sont "tires" vers l'espace des capabilities, ce qui brouille la similarite inter-tools utilisee par le GRU.

### 5.2 SHGAT standalone (retrained 2026-02-24)

Retraine avec task_results (0% corruption) : loss 0.50, accuracy 73%, best test 78%.

---

## 6. Probleme ouvert : Caps jamais ciblees dans le GRU

### 6.1 Root cause

**Le training GRU ne lit jamais `execution_trace.capability_id`.** La query SELECT charge uniquement `task_results`, `intent_embedding`, `success`. Les exemples ciblent uniquement des tools atomiques extraits de `task_results`.

Chaque trace EST une capability L1 (via `capability_id → workflow_pattern → capability_records`). Cette information est presente en DB mais ignoree par le training.

**Chiffres** :
- 1882 traces ont `capability_id` + `task_results` non vides
- 0 de ces traces ont leur propre cap dans `task_results`
- `task_results` contient les tools atomiques (`std:psql_query`), pas la cap wrappante (`db:postgresQuery`)
- 0 caps dans `tool_embedding` → 0 caps dans le vocab de base

### 6.2 Donnees disponibles pour le fix

La jointure est triviale :

```sql
SELECT
  et.task_results,
  et.intent_embedding,
  cr.namespace || ':' || cr.action as cap_name,
  wp.intent_embedding as cap_embedding
FROM execution_trace et
JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
WHERE et.task_results IS NOT NULL
  AND jsonb_array_length(et.task_results) >= 1
  AND et.intent_embedding IS NOT NULL
```

Resultat : 1882 exemples avec trace + cap name + cap embedding.

### 6.3 Approche retenue : Cap-as-terminal-target

Pour chaque trace `[tool1, tool2, ..., toolN]` avec `capability_id → cap_name` :

```
Exemples existants (tools-only) :
  intent, []             → tool1     (step 1)
  intent, [tool1]        → tool2     (step 2)
  intent, [tool1, tool2] → toolN     (step N, isTerminal=1)

Exemple ajoute (cap terminal) :
  intent, [tool1, tool2, ..., toolN] → cap_name  (isTerminal=1)
```

La cap devient le target **apres** la sequence complete. Ca enseigne : "apres avoir vu [tool1, tool2, ...], le tout = cette cap".

**Pre-requis** :
- Ajouter les cap embeddings au vocab (depuis `workflow_pattern.intent_embedding`, meme format 1024D BGE-M3)
- Ajouter `capability_id` au SELECT du training script
- JOIN pour recuperer le cap name
- Generer l'exemple supplementaire dans `buildExamples()`

### 6.4 Les `code:exec_*` — pas du bruit

Les 404 caps `code:exec_*` sont des capabilities auto-creees pas encore renommees. Elles font partie du pipeline normal : une cap nait comme `code:exec_hash`, l'utilisateur la renomme en `db:postgresQuery`. Le GRU doit pouvoir predire TOUTES les caps, renommees ou pas. Table `capability_name_history` (migration 050) track les renames.

### 6.5 L2 (meta-caps)

10 meta-caps L2 existent. Elles contiennent des L1 via `capability_dependency` (63 contains edges). Exemples :

```
meta:compositeProfile CONTIENT fake:companies, fake:addresses, faker:generatePerson, fake:person
meta:composedProfile  CONTIENT fake:companies, fake:addresses, faker:generatePerson, fake:person
```

Les L2 sont peu nombreuses. Le training fonctionnera mais avec peu d'exemples. Pas un blocage.

---

## 7. Workflow complet (post-fix prevu)

### 7.1 Au demarrage (`initializer.ts`)

```
1. Charge workflow_pattern → caps avec dag_structure.tools_used, intent_embedding
2. Charge capability_dependency (contains edges L2→L1)
3. Construit le graphe SHGAT via AlgorithmFactory.createBoth()
   (tools L0 extraits de tools_used + caps L1/L2)
4. Demarre GraphSyncController
5. Charge SHGAT params depuis shgat_params (msgpack+gzip+base64)
6. Peuple les features tools (embeddings BGE-M3 depuis le graphEngine)
7. Charge GRU weights (fichier gru-weights-prod.json d'abord, DB fallback)
8. Construit le vocab GRU : 918 tools + N caps (depuis le fichier poids ou DB)
   - Chaque cap a un embedding (workflow_pattern.intent_embedding)
   - Chaque cap a des children (dag_structure.tools_used normalises)
9. Construit matrices structurelles (Jaccard, bigram) depuis execution_trace
10. GRU pret pour inference
```

**NOTE** : Il n'y a PAS de forward SHGAT au demarrage. Le message passing est lazy — il se declenche au premier appel a `getToolEmbeddings()` (via `forward()` cache).

### 7.2 A l'execution (`post-execution.service.ts`)

```
1. Execution terminee → trace sauvee avec capability_id + task_results
2. SHGAT batch training (K-head, PER buffer)
3. → GRU batch training (chaine dans le finally du SHGAT)
   - Charge traces recentes
   - Genere exemples tools-only (cap-as-terminal = P0 a faire, voir section 8)
   - Spawn worker TF.js
   - Sauve poids en DB
   - Hot-reload GRU inference (reloadGRUWeights si savedToDb)
```

### 7.3 A l'inference (`gru-inference.ts`)

```
1. Intent embedding (1024D) + context tools (deja executes)
2. Cap fingerprint : vecteur binaire des caps couvertes par le contexte
   (input du forward pass via cap_proj, PAS du structural bias)
3. GRU forward pass : processToolStep pour chaque tool du contexte
   - Input = concat(emb_proj(tool_emb), intent_proj(intent), cap_proj(fingerprint))
4. Hidden state → similarity_head → logits (vocabSize = tools + caps)
5. Structural bias (Jaccard + bigram) applique en log-space, puis re-softmax
6. Beam search avec length normalization (lengthAlpha=0.7)
7. Retourne le path predit (caps retournees telles quelles, pas d'expansion)
```

**NOTE** : `expandPrediction()` existe dans `lib/gru/gru-model.ts` (TF.js training) mais PAS dans l'inference Deno. Si le GRU predit une cap, elle est retournee dans le path sans expansion. L'expansion cap→tools doit etre ajoutee dans l'inference (P0-bis) ou geree par l'appelant (`dag-suggester-adapter.ts`).

---

## 8. Ce qui reste a faire

### P0 — Cap-as-terminal dans le training GRU

**Effort** : ~2h. Fichiers : `scripts/train-gru-with-caps.ts`, `lib/gru/src/train-worker-prod.ts`

1. Ajouter `capability_id` au SELECT des traces
2. JOIN `workflow_pattern` + `capability_records` pour le cap name
3. Ajouter les cap embeddings au vocab (depuis `workflow_pattern.intent_embedding`)
4. Generer l'exemple terminal `(context=full_sequence, target=cap_name)`
5. Verifier que le worker indexe correctement les caps dans le softmax
6. Entrainer et comparer Hit@1 tools vs Hit@1 caps

### P1 — Sparse MP pour lib/shgat-tf (inchange)

Blocage pour le training OB sur gros datasets. ~2500 lignes, ~2 jours. Voir spec 2026-02-23 section P1.

### P2 — Items ouverts

| # | Item | Effort | Statut |
|---|------|--------|--------|
| P2-1 | V2V activation dans train-ob | 1j | Pas commence |
| P2-3 | Migrer trace-feature-extractor vers task_results | 1j | Pas commence |
| P2-4 | capability_dependency cap→tool (seulement cap→cap actuellement) | 1j | Pas commence |
| P2-6 | Benchmark provides edges SHGAT | 2j | Pas commence |

### P3 — Nettoyage (inchange)

Naming consistency, colonnes inutilisees, flattenExecutedPath hierarchy flaw. Voir spec 2026-02-23 section P3.

---

## 9. Lecons ajoutees (2026-02-24)

11. **`getToolEmbeddings()` retournait du raw.** Le SHGAT enrichissait les embeddings dans `forward()` mais `getToolEmbeddings()` lisait directement depuis `graphBuilder` (raw BGE-M3). Fix : appeler `forward()` lazy+cached.

12. **SHGAT enrichment degrade Hit@1 mais ameliore termination.** -9pp Hit@1, +7pp term acc. Le SHGAT est entraine pour le scoring de caps, pas pour la prediction sequentielle. Les embeddings enrichis brouillent la similarite inter-tools.

13. **`capability_dependency` utilise `workflow_pattern.pattern_id`, PAS `capability_records.id`.** Les JOINs doivent passer par `cr.workflow_pattern_id = cd.from_capability_id`.

14. **task_results ne contient QUE des tools atomiques.** La cap wrappante est dans `execution_trace.capability_id` (colonne separee). 0 traces ont leur propre cap dans task_results.

15. **`code:exec_*` = caps pas encore renommees, pas du bruit.** Font partie du pipeline normal. Le GRU doit les predire.

16. **SHGAT params = msgpack+gzip+base64.** Le champ `shgat_params` en DB est JSONB avec `{format, data}`. Le format historique etait `gzip+base64` (JSON compresse), le nouveau est `msgpack+gzip+base64` (msgpack compresse). Detection automatique via le champ `format`.

17. **postgres.js OOM sur 160MB+ bytea.** Utiliser `psql` CLI en subprocess pour extraire les gros blobs (SHGAT params ~97MB base64).

---

## 10. Tests

| Fichier | Tests | Couverture |
|---------|-------|-----------|
| `tests/unit/graphrag/gru_inference_test.ts` | 565 | Forward, beam, structural bias, vocab |
| `tests/unit/graphrag/gru_dag_suggester_test.ts` | 55 | DAG suggestion E2E |
| `tests/unit/capabilities/normalize-tool-id-fqdn.test.ts` | 17 | FQDN→short |
| `tests/unit/graphrag/shgat-fqdn-tool-embeddings.test.ts` | 10 | Map embeddings, E2E pipeline |
| `tests/unit/graphrag/algorithm-init-fqdn.test.ts` | 10 | filterContextTools |
| `tests/unit/capabilities/trace_path_test.ts` | 16 | getCleanToolPath |
| `lib/shgat-tf/src/training/__tests__/*.test.ts` | 26+ | batch-contrastive, InfoNCE, KL |
| `lib/shgat-for-gru/src/__tests__/*.test.ts` | 38+ | adapter, paper-mp, v2v |

Total : **737+ tests**, 0 failures.

---

*Suite de la spec consolidee 2026-02-23. Prochaine etape : implementer cap-as-terminal (section 8 P0).*
