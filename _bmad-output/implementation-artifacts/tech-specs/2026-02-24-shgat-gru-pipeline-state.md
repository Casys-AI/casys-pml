# Tech Spec : SHGAT + GRU Pipeline — Etat au 2026-02-26

**Date** : 2026-02-26 (mise a jour)
**Historique** : `2026-02-23-consolidated-shgat-gru-state-and-roadmap.md` → `2026-02-24` → cette version
**Scope** : Pipeline ML complet — SHGAT enrichment, GRU inference/training, hierarchy caps, DB schema

---

## 1. Vue d'ensemble du pipeline

```
                         DB (PostgreSQL)
                              |
            +-----------------+------------------+
            |                 |                  |
     tool_embedding      workflow_pattern     execution_trace
     (918 tools,         (333 caps,           (2187 traces,
      BGE-M3 1024D)       intent_embedding,    task_results,
                           shgat_embedding,     capability_id)
                           dag_structure)
            |                 |                  |
            v                 v                  v
    +-------+---------+  +---+---+      +-------+--------+
    | SHGAT Graph     |  | Caps  |      | Training Data  |
    | Builder         |  | L0-L2 |      | Builder        |
    | (shgat.ts)      |  |       |      | (train script) |
    +-------+---------+  +---+---+      +-------+--------+
            |                 |                  |
            v                 v                  v
    +-------+---------+  +---+---+      +-------+--------+
    | SHGAT Forward   |  | Vocab |      | GRU Training   |
    | Message Passing |  | Nodes |      | (TF.js/Node)   |
    | V->E->V + V2V   |  |       |      |                |
    +-------+---------+  +---+---+      +-------+--------+
            |                 |                  |
            +--------+--------+                  |
                     |                           |
                     v                           v
            +--------+--------+         +--------+--------+
            | Enriched Embs   |         | GRU Weights     |
            | tools: tool_emb |         | (DB gru_params) |
            | caps: shgat_emb |         +--------+--------+
            +--------+--------+                  |
                     |                           |
                     +-------------+-------------+
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
| `workflow_pattern` | Definition d'une capability | `pattern_id UUID PK`, `dag_structure JSONB`, `intent_embedding vector(1024)`, `shgat_embedding vector(1024)`, `hierarchy_level INT` |
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
workflow_pattern.shgat_embedding = embeddings SHGAT-enriches (MP, preserveDim=0)
workflow_pattern.intent_embedding = embeddings raw BGE-M3 (fallback si shgat_embedding NULL)
```

**ATTENTION** : `capability_dependency` utilise des `workflow_pattern.pattern_id`, PAS des `capability_records.id`. Les JOINs doivent passer par `cr.workflow_pattern_id`.

### 2.3 Hierarchy

| Level | Description | Count | Source |
|-------|------------|-------|--------|
| L0 tools | MCP tools atomiques | 918 | `tool_embedding` |
| L0 caps | Caps sans tools_used (bare) | 3 | `workflow_pattern WHERE hierarchy_level=0 AND tools_used IS NULL` |
| L1 caps | Caps = sequence de tools | 649 | `workflow_pattern WHERE hierarchy_level=1` |
| L2 caps | Meta-caps = contient d'autres caps | 10 | `workflow_pattern WHERE hierarchy_level=2` |

### 2.4 Chiffres DB actuels (2026-02-26)

| Metrique | Valeur |
|----------|--------|
| tool_embedding | 918 (BGE-M3 1024D) |
| workflow_pattern | 333 (avec shgat_embedding) |
| capability_records | 673 (dont ~400 `code:exec_*` auto-generees) |
| execution_trace | 2187 total, 1882 avec capability_id + task_results |
| Caps avec shgat_embedding | **333/333 (100%)** |
| capability_dependency (contains) | 63 edges (L2→L1 uniquement) |
| tool_dependency (co-occurrence) | 185 edges |

---

## 3. Fichiers — Carte complete

### 3.1 SHGAT (production)

| Fichier | Role |
|---------|------|
| `src/graphrag/algorithms/shgat.ts` | SHGAT principal : graph builder, forward, training, serialization |
| `src/graphrag/algorithms/shgat/graph/hierarchy.ts` | Calcul dynamique des niveaux (topological sort, PAS depuis DB) |
| `src/graphrag/learning/per-training.ts` | PER buffer, batch training K-head |

Methodes cles sur SHGAT :

| Methode | Ligne | Role |
|---------|-------|------|
| `getToolEmbeddings()` | ~2003 | Embeddings enrichis tools (post MP). Fallback raw + warn |
| `getCapEmbeddings()` | ~2146 | Embeddings enrichis caps (post MP). Retourne `Map<UUID, number[]>`. Fallback raw + warn |
| `getRawToolEmbeddings()` | ~2030 | Acces explicite aux raw BGE-M3 |
| `invalidateForwardCache()` | ~2069 | Efface `lastCache`. Appelee apres `importParams()` (~2061) |
| `forward()` | ~368 | MP V→E→V. `preserveDimResidual = 0` (pure MP, pas de dilution BGE-M3). Cache lazy via `lastCache` |

### 3.2 SHGAT adapter (pour GRU enrichment)

| Fichier | Role |
|---------|------|
| `lib/shgat-for-gru/src/adapter.ts` | SHGATAdapter : load OB params, build graph, enrich embeddings |
| `lib/shgat-for-gru/src/v2v.ts` | V2V phase (co-occurrence) |

### 3.3 GRU inference (Deno, production)

| Fichier | Role |
|---------|------|
| `src/graphrag/algorithms/gru/gru-inference.ts` | Forward GRU, beam search, structural bias, cap fingerprint |
| `src/graphrag/algorithms/gru/gru-loader.ts` | Load weights (JSON/DB), build vocab, Jaccard/bigram matrices |
| `src/graphrag/algorithms/gru/types.ts` | GRUWeights, GRUVocabulary, IGRUInference, StructuralMatrices |
| `src/graphrag/algorithms/gru/spawn-training.ts` | Deno→Node bridge pour lancer le training TF.js |

### 3.4 GRU training (Node/TF.js)

| Fichier | Role |
|---------|------|
| `lib/gru/src/transition/gru-model.ts` | CompactInformedGRU : model TF.js, trainStep, hierarchy soft labels, `nodeId` dans `predictNext()` |
| `lib/gru/src/transition/types.ts` | CompactGRUConfig, PredictionResult (avec `nodeId`) |
| `lib/gru/src/train-worker-prod.ts` | Worker Node.js : training, early stop (patience=5), eval tool/cap separee, MLflow |
| `scripts/train-gru-with-caps.ts` | Script standalone : DB → SHGAT V2V+MP → L2 norm → dedup → cap-as-terminal → worker |

### 3.5 Pipeline orchestration

| Fichier | Role |
|---------|------|
| `src/mcp/algorithm-init/initializer.ts` | Init SHGAT + GRU au demarrage. Charge poids, construit vocab |
| `src/application/services/post-execution.service.ts` | Post-execution : SHGAT training → cap embedding persistence → GRU training |
| `src/infrastructure/di/bootstrap.ts` | DI wiring (GRU injecte via options.gru) |
| `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts` | Utilise GRU inference pour suggerer des DAGs |

### 3.6 SHGAT training standalone

| Fichier | Role |
|---------|------|
| `tools/train-shgat-standalone.ts` | Entraine SHGAT depuis task_results, sauve params en DB |

### 3.7 DB migrations (49-52)

| Fichier | Version DB | Contenu |
|---------|-----------|---------|
| `src/db/migrations/049_gru_params.ts` | 49 | Table `gru_params` pour persistence des poids GRU |
| `src/db/migrations/050_capability_name_history.ts` | 50 | Table `capability_name_history` pour tracking des renames |
| `src/db/migrations/051_tool_schema_hash.ts` | 51 | `hash` + `previous_hash` sur `tool_schema`, backfill, vue pml_registry |
| `src/db/migrations/052_workflow_pattern_shgat_embedding.ts` | 52 | `shgat_embedding vector(1024)` sur `workflow_pattern` (nullable) |

---

## 4. Changements effectues

### 4.1 Vague 2026-02-24 — SHGAT pipeline fixes

| # | Changement | Fichier(s) |
|---|-----------|------------|
| 4.1 | Fix `getToolEmbeddings()` → appelle `forward()` lazy+cached | `shgat.ts:~2003` |
| 4.2 | Script SHGAT training → task_results (0% corruption) | `tools/train-shgat-standalone.ts` |
| 4.3 | Script GRU training avec SHGAT V2V+MP enrichment | `scripts/train-gru-with-caps.ts` |
| 4.4 | GRU hierarchy soft labels (`hierarchyAlpha`) | `gru-model.ts:~785` |
| 4.5 | GRU inference Deno (pure JS + BLAS FFI) | `src/graphrag/algorithms/gru/` |
| 4.6 | Migrations DB 049-051 | `src/db/migrations/` |

### 4.2 Vague 2026-02-25 — Cap-as-terminal + SHGAT persistence

| # | Changement | Fichier(s) | Detail |
|---|-----------|------------|--------|
| 4.7 | Migration 052 `shgat_embedding vector(1024)` | `052_workflow_pattern_shgat_embedding.ts` | Colonne nullable, 333/333 peuplees |
| 4.8 | `getCapEmbeddings()` methode | `shgat.ts:~2146` | `Map<UUID, number[]>`, fallback raw + warn |
| 4.9 | `invalidateForwardCache()` | `shgat.ts:~2069` | Appelee apres `importParams()` |
| 4.10 | `preserveDimResidual` default → 0 | `shgat.ts:520` | Pure MP, plus de dilution BGE-M3 |
| 4.11 | Persistence cap embeddings post-SHGAT training | `post-execution.service.ts:490-506` | Batch UPDATE par 50, AVANT GRU training |
| 4.12 | `COALESCE(shgat_embedding, intent_embedding)` | `post-execution.service.ts:692`, `train-gru-with-caps.ts:66` | Prod + script |
| 4.13 | LIMIT 500 → 2000 | `post-execution.service.ts:562` | |
| 4.14 | Cap-as-terminal dans le training | `train-gru-with-caps.ts:497-514` | 1 exemple terminal par trace avec `capability_id` |
| 4.15 | L2 normalisation post-SHGAT | `train-gru-with-caps.ts:285-333` | Normalise tools + caps apres enrichment |
| 4.16 | Intent dedup exact | `train-gru-with-caps.ts:419-445` | Hash full embedding `toFixed(6)`, par groupe cap/tools |
| 4.17 | `nodeId` dans `predictNext()` | `gru-model.ts:1057-1065`, `types.ts:190-197` | Raw vocab ID, pas resolu en children |
| 4.18 | Eval tool/cap separee + nodeId comparison | `train-worker-prod.ts:51-88` | `pred.nodeId === ex.targetToolId \|\| pred.toolId === ex.targetToolId` |
| 4.19 | Early stopping patience=5 + best checkpoint restore | `train-worker-prod.ts:284-348` | |
| 4.20 | MLflow integration | `train-worker-prod.ts:97-426` | Hyperparams, epoch metrics, artifacts, model version |
| 4.21 | Warm start GRU depuis DB | `train-gru-with-caps.ts:535-548` | `gru_params ORDER BY updated_at DESC LIMIT 1` |

---

## 5. Benchmarks

### 5.1 GRU Hit@1 — Evolution complete

| Phase | Global Hit@1 | Tool Hit@1 | Cap Hit@1 | Term Acc | Vocab | Date |
|-------|-------------|-----------|----------|----------|-------|------|
| Pre-FQDN (small vocab) | 65.7% | — | — | — | 644 | 2026-02-15 |
| Post-FQDN (big vocab) | 44.4% | — | — | — | 1884 | 2026-02-18 |
| PROD_ONLY (tools-only) | 58.0% | 58.0% | N/A | ~80% | 918 | 2026-02-23 |
| NO_SHGAT (raw BGE-M3) | 52.6% (ep26) | — | — | 85.8% | 918 | 2026-02-24 |
| SHGAT MP seul | 53.1% (ep48) | — | — | 86.8% | 918 | 2026-02-24 |
| SHGAT V2V+MP | 53.2% (ep18) | — | — | 90.7% | 918 | 2026-02-24 |
| **Cap-as-terminal (3 fixes)** | **45.2% (ep12)** | **48.1%** | **41.6%** | **97.0%** | **918+326 caps** | **2026-02-25** |

### 5.2 Dernier run detaille (2026-02-25, MLflow v3 champion)

```
Vocab: 918 tools + 326 caps = 1244 total (281 caps effectivement dans le graph SHGAT)
Training: 2648 examples (1176 traces → dedup → 1471 + 1176 cap-as-terminal)
Test: 649 examples (295 traces + 295 cap-as-terminal)
Early stop: epoch 22, best epoch 12 (patience=5)
Best: Global 45.2%, Tool 48.1% (324 ex), Cap 41.6% (274 ex), Term 97.0%
Train final: loss=1.3823, accuracy=56.3%
Warm start: oui (depuis DB gru_params)
SHGAT: V2V+MP, 97.6MB params, preserveDimResidual=0
L2 norm: tools avg=1.3257 (156 re-normalized), caps avg=1.8099 (326 re-normalized)
Dedup: 2182 → 1471 traces (711 doublons exacts supprimes)
```

### 5.3 Les 3 fixes qui ont debloque cap Hit@1

Le GRU avait **0% Cap Hit@1** avant les fixes du 2026-02-25. Trois root causes :

1. **`predictNext()` resolution bug** : `gru-model.ts:1057` resolvait les caps en `children[0]` → l'evaluation comparait un tool ID avec un cap target → toujours faux. Fix : `nodeId` field retourne le raw vocab ID.

2. **Pas de L2 normalisation post-SHGAT** : Les embeddings enrichis avaient des normes non-unitaires (tools 1.33, caps 1.81). Dans le `similarity_head` (kernel = embeddings^T / temp), ca biaise les scores en faveur des vecteurs a haute norme. Fix : normalisation L2 apres enrichment.

3. **Doublons d'intent** : ~711 traces etaient des re-executions identiques (meme cap, meme intent embedding). Ca sur-representait certaines caps dans le training. Fix : dedup exact sur hash full embedding `toFixed(6)`.

### 5.4 Observations sur le Cap Hit@1

- **41.6% Cap Hit@1** est un premier resultat solide vu les contraintes :
  - 28 tool sets partages par 71 caps (ambiguite structurelle)
  - 47% des caps ont 1 seul exemple
  - Cap-Cap similarite NN = 0.9826 (tres difficile a distinguer)
- **Global Hit@1 a baisse** de 53.2% (tools-only V2V+MP) a 45.2% (avec caps)
  - Normal : le vocab a grandi de 918 → 1244, et les 1176 cap-as-terminal exemples diluent le training
  - Tool Hit@1 a baisse de ~53% → 48.1% (le softmax a 326 nouvelles cibles)
  - Termination a monte de 90.7% → 97.0% (les cap-as-terminal exemples sont tous terminaux)

---

## 6. Workflow complet (etat actuel)

### 6.1 Au demarrage (`initializer.ts`)

```
1. Charge workflow_pattern → caps avec dag_structure.tools_used, intent_embedding, shgat_embedding
2. Charge capability_dependency (contains edges L2→L1)
3. Construit le graphe SHGAT via AlgorithmFactory.createBoth()
4. Demarre GraphSyncController
5. Charge SHGAT params depuis shgat_params (msgpack+gzip+base64)
6. Peuple les features tools (embeddings BGE-M3 depuis le graphEngine)
7. Charge GRU weights (fichier gru-weights-prod.json d'abord, DB fallback)
8. Construit le vocab GRU : 918 tools + N caps
   - Cap embedding = COALESCE(shgat_embedding, intent_embedding)
   - Cap children = dag_structure.tools_used normalises
9. Construit matrices structurelles (Jaccard, bigram) depuis execution_trace
10. GRU pret pour inference
```

### 6.2 A l'execution (`post-execution.service.ts`)

```
1. Execution terminee → trace sauvee avec capability_id + task_results
2. SHGAT batch training (K-head, PER buffer)
3. invalidateForwardCache() apres importParams()
4. Persist SHGAT cap embeddings → workflow_pattern.shgat_embedding (batch 50)
5. → GRU training (APRES persistence cap embeddings)
   - Charge traces recentes (LIMIT 2000)
   - Cap embeddings via COALESCE(shgat_embedding, intent_embedding)
   - Genere exemples tools + cap-as-terminal
   - Spawn worker TF.js (warm start depuis DB)
   - Sauve poids en DB (gru_params)
   - Hot-reload GRU inference (reloadGRUWeights si savedToDb)
```

### 6.3 A l'inference (`gru-inference.ts`)

```
1. Intent embedding (1024D) + context tools (deja executes)
2. Cap fingerprint : vecteur binaire des caps couvertes par le contexte
3. GRU forward pass : processToolStep pour chaque tool du contexte
4. Hidden state → similarity_head → logits (vocabSize = tools + caps)
5. Structural bias (Jaccard + bigram) applique en log-space, puis re-softmax
6. Beam search avec length normalization (lengthAlpha=0.7)
7. Retourne le path predit (caps retournees telles quelles, pas d'expansion)
```

---

## 7. Ce qui reste a faire

### Data quality — Caps ambigues et dead weight

| # | Item | Effort | Impact estime |
|---|------|--------|--------------|
| D1 | **Merger les 71 caps ambigues** (28 tool sets partages) | 2h | +3-5pp Cap Hit@1 |
| D2 | **Purger les 139 dead caps** (multi-tool, jamais dans BPE) | 1h | Vocab plus propre |
| D3 | **Seuil minimum 3 exemples** pour caps dans le vocab | 30min | Moins de bruit |

Source : Notebooks 09, 12, 13.

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

## 8. Notebooks

| # | Notebook | Contenu | Derniere execution |
|---|---------|---------|-------------------|
| 01 | MP Toy Problem | PoC message passing sur graphe jouet | ok |
| 02 | Hierarchical Workflow Retrieval | Comparaison flat vs hierarchique | ok |
| 03 | GRU Workflow Sequencer | Premier GRU sur n8n, co-occurrence graph | ok |
| 04 | Sequential Graph + GRU | Transition graph dirige vs co-occurrence | ok |
| 05 | GRU Benchmark Analysis | Post-FQDN. Vocab 644→1884, Hit@1 65.7→44.4% | ok |
| 06 | Executed Path Audit | 18.4% UUIDs, 6.1% FQDN, task_results = source propre | ok |
| 07 | SHGAT Graph Visualization | 739 nodes, 80 composantes, hub tools, pyvis | ok |
| 08 | Post-Fix Benchmark | 3 fixes. SHGAT delta -27pp → -1.9pp. E2E Beam +6.2pp | ok |
| 09 | BPE Capability Analysis | 139 dead multi-tool caps, 66% caps used 1x, 79 tools partages | 2026-02-25 |
| 10 | SHGAT Impact Analysis | V2V intra-cap +0.0826, KNN co-cap 24%→43.2%, tool-cap gap | 2026-02-25 |
| 11 | Cap-as-Terminal Diagnostic | Embedding gap tools/caps, pipeline v3 post-fix | 2026-02-25 |
| 12 | PreserveDim Residual Analysis | Sweep r=[0,1], r=0.2 optimal global, r=0.3 bon compromis, 25 collisions 1-child | 2026-02-26 |
| 13 | Cap Prediction Diagnostic | 36.5% argmax on caps, 2.4% correct, 28 ambiguous tool sets, NN sim 0.9826 | 2026-02-25 |

---

## 9. Lecons (cumulees)

1. **Le probleme etait les donnees, pas l'algorithme.** SHGAT delta -27pp → -1.9pp en nettoyant FQDN + task_results.
2. **task_results > executed_path.** 0% corruption vs 37.7%.
3. **FQDN = format canonique, normaliser a la lecture.** ADR-068.
4. **V2V stabilise, ne booste pas.** Hit@1 comparable, mais overfitting drastiquement reduit (52.2% vs 41.3% a ep50).
5. **85.7% traces = 1 tool.** Le GRU manque de donnees multi-step.
6. **Hub tools = 55.5% des edges.** Graphe creux (Jaccard median=0) protege contre over-smoothing.
7. **N8n v2 noie le signal prod.** 2.9% de donnees prod dans le pool. Desactive.
8. **Intent diversity = fixe.** Migration 047 + backfill. 80.9% traces avec vrai intent.
9. **Deux pipelines SHGAT, ne pas confondre.** Prod (petit graphe, OK) vs OB (gros, OOM, bloque).
10. **`getToolEmbeddings()` retournait du raw.** Fix : `forward()` lazy+cached.
11. **`capability_dependency` utilise `pattern_id`, PAS `capability_records.id`.**
12. **task_results ne contient QUE des tools atomiques.** La cap wrappante = `execution_trace.capability_id`.
13. **SHGAT params = msgpack+gzip+base64.** Detection automatique via `format`.
14. **postgres.js OOM sur 160MB+ bytea.** Utiliser `psql` CLI pour gros blobs.
15. **`predictNext()` resolvait les caps en `children[0]`.** → 0% Cap Hit@1 artificiel. Fix : `nodeId` field.
16. **L2 normalisation obligatoire post-SHGAT.** Norms non-unitaires (tools 1.33, caps 1.81) biaisent le similarity_head.
17. **Intent dedup = exact, pas fuzzy.** Fuzzy risque de merger des intents similaires-mais-differents. Le vrai probleme = imbalance, pas similarite.
18. **Cap NN similarite = 0.9826.** Les caps sont trop proches en embedding pour etre distinguees facilement. 28 tool sets partages par 71 caps = ambiguite structurelle.
19. **preserveDimResidual = 0 optimal.** 100% des caps preferent r*=0 (child sim). r=0.3 coute 10.1% discrimination. Mais 25 tools partages par 37 paires 1-child caps → collisions a r=0 (attenuation : multi-head attention != mean pooling).
20. **Le sequencing cap persistence → GRU training est critique.** Si GRU lit avant que les shgat_embeddings soient ecrits, il tombe sur le fallback intent_embedding.

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

*Mise a jour 2026-02-26. Precedentes versions : 2026-02-24, 2026-02-23.*
