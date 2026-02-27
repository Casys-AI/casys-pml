# Tech Spec Consolidee : SHGAT + GRU — Etat au 2026-02-23

**Date** : 2026-02-23
**Scope** : `lib/shgat-tf`, `lib/shgat-for-gru`, `lib/gru`, `src/graphrag/`, `src/capabilities/`
**Remplace** :
- `2026-02-13-shgat-tf-training-improvements.md`
- `2026-02-13-sparse-mp-and-parquet-migration.md`
- `2026-02-17-tech-spec-shgat-intent-diversity-training.md`
- `2026-02-18-arch-executed-path-gru-hierarchy.md`
- `2026-02-19-tech-spec-capability-hierarchy-broken.md`

---

## 1. Architecture des 3 libs

```
lib/gru/              GRU sequenceur (TF.js/Node pour training, pure JS/Deno pour inference)
  src/training/         train-loop, PER buffer, TD-error, Thompson sampler
  src/transition/       gru-model (CompactInformedGRU), structural-bias
  src/training-utils.ts buildDAGAwareExamples (lit task_results, normalise FQDN)
  src/benchmark-e2e.ts  benchmark unifie GRU + SHGAT + E2E beam (Node/TF.js)

src/graphrag/algorithms/gru/   Inference Deno (pure JS + BLAS FFI, zero TF.js)
  gru-inference.ts      Forward pass, beam search, structural bias
  gru-loader.ts         Load weights (JSON file ou DB), build vocab, Jaccard/Bigram
  types.ts              GRUWeights, GRUVocabulary, IGRUInference

lib/shgat-tf/         SHGAT natif (pure JS + optional BLAS, zero TF.js)
  src/core/             shgat.ts, builder, factory, serialization, types
  src/attention/        k-head scorer, multi-level scorer
  src/message-passing/  V->E, E->V, E->E, V->V, multi-level orchestrator
  src/training/         autograd-trainer, adam, InfoNCE, batch-contrastive, PER
  src/graph/            graph-builder, hierarchy, incidence
  benchmark/            LiveMCP, ToolBench, OB training scripts
  tools/                train-ob.ts, export-dataset.ts, smoke-test.ts

lib/shgat-for-gru/    Adaptateur SHGAT -> GRU (pure JS, zero dep TF.js)
  src/adapter.ts        Load OB params, build graph, enrich embeddings, K-head scoring
  src/v2v.ts            Vertex-to-Vertex phase (pure JS)
  src/paper-mp.ts       PaperMP W_up/W_down (experimental, P2)
  notebooks/            01-08 (analyse, benchmark, visualisation)
```

### Deux pipelines SHGAT distincts

**Pipeline 1 — Production (train-worker.ts)**
- Code : `src/graphrag/algorithms/shgat.ts` (le SHGAT "paper")
- Entree : `createSHGATFromCapabilities` → graphe prod ~579 caps × 160 tools
- Training : `trainBatchV1KHeadBatched` (K-head bilineaire W_q, W_k)
- MP : `forwardMultiLevelWithCache` avec matrices **denses** (`buildToolToCapMatrix`, `buildCapToCapMatrices`)
- Pas de probleme OOM — le graphe est petit
- PER buffer, curriculum learning, temperature annealing, health check

**Pipeline 2 — OB Training (lib/shgat-tf)**
- Code : `lib/shgat-tf/tools/train-ob.ts` → autograd trainer
- Entree : dataset n8n+prod exporté via `export-dataset.ts`
- Matrices **denses** — OOM a ~12GB sur gros datasets (7047 caps × 1901 tools)
- Pas utilise en prod actuellement (n8n data noie le signal prod, 2.9% overlap)

**Pipeline 3 — Benchmark (lib/shgat-for-gru)**
- Code : `lib/shgat-for-gru/src/adapter.ts` (SHGATAdapter)
- Read-only : charge params OB-trained, enrichit embeddings via MP, K-head scoring
- Utilise par `lib/gru/src/benchmark-e2e.ts`
- Zero training, zero TF.js

---

## 2. Problemes resolus (2026-02-18 → 2026-02-20)

### 2.1 FQDN Mismatch dans le graphe SHGAT — RESOLU

**Bug** : `dag_structure.tools_used` contenait des FQDN (`pml.mcp.std.psql_query.db48`), les embeddings BGE-M3 etaient indexes en format court (`std:psql_query`). Le SHGAT creait 2 nodes par tool : une FQDN avec embedding ALEATOIRE (connectee au graphe) et une SHORT avec vrai embedding (orpheline). Le MP propageait du bruit.

**Impact** : SHGAT detruisait le GRU (-27.3pp Hit@1).

**Fix** (10 fichiers source, 37 tests) :
- `normalizeToolId()` applique dans tous les read paths (initializer, post-execution, db-sync, train-worker, standalone)
- `toolEmbeddings: Record<string, number[]>` transmis au worker → `createSHGATFromCapabilities` utilise les vrais embeddings BGE-M3
- `trace-path.ts` cree comme source unique (`getCleanToolPath`, `cleanToolIds`)
- `filterContextTools()` filtre UUIDs, `code:*`, `loop:*`

### 2.2 Hierarchy cassee — RESOLU

**Bug** : `hierarchy_level = 0` pour 89% des caps. Le calcul dependait de `capability_records` (cap->cap only), les MCP tools n'y sont jamais.

**Fix** : `toolsUsed.length > 0 → L1`. Backfill 498 caps L0→L1.

**Etat** : L0=3, L1=597, L2=10.

### 2.3 Data corruption executed_path — RESOLU

**Bug** : 18.4% UUIDs, 6.1% FQDN, 9% code/loop dans `executed_path`.

**Fix** : `flattenExecutedPath` utilise `task_results` (0% corruption) comme source primaire. Fallback sur `executed_path` si `task_results` vide. Normalisation FQDN + filtrage `code:*/loop:*`.

### 2.4 FQDN format canonique (ADR-068) — RESOLU

**Decision** : FQDN est le format canonique de `dag_structure.tools_used`. Normalisation cote consommateur, pas cote producteur. Les 3 write paths (execution-capture, execute-direct, worker-bridge) alignes sur FQDN.

**Erreur passee** : la migration DB 2026-02-20 qui normalisait `dag_structure` a detruit de l'info. Ne PAS re-executer. Backup : `_backup_dag_structure_20260220`.

### 2.5 Dead code — SUPPRIME

~3350 lignes : `v2-scorer.ts`, `lib/shgat-ob-legacy/` (40 fichiers), `_trainOnTraces()`, imports morts.

### 2.6 Intent Diversity pour le K-head SHGAT — RESOLU

**Bug** : migration 030 avait supprime `execution_trace.intent_embedding`. Le K-head SHGAT s'entrainait avec le MEME embedding (description cap via `workflow_pattern`) pour toutes les traces d'une capability — pas de diversite d'intent.

**Fix** (migration 047 + code) :
- Migration 047 : restaure `intent_embedding vector(1024)` sur `execution_trace` avec semantique corrigee (vrai intent utilisateur, pas description cap)
- `execution-trace-store.ts` : INSERT `intentEmbedding` dans `saveTrace()`, SELECT avec `COALESCE(et.intent_embedding, wp.intent_embedding)`
- `discover-handler-facade.ts` : encode l'intent via BGE-M3 au moment du discover, passe dans `LearningContext`
- `per-training.ts` : utilise l'intent embedding pour le negative mining semi-hard

**Etat** : 1604/1982 traces (80.9%) ont un `intent_embedding` propre (post-backfill 2026-02-23). Les 378 restantes (sans intent text) tombent sur le fallback COALESCE vers `wp.intent_embedding`. Fix du bug package client (intent_embedding=NULL) dans `execute-direct.use-case.ts`.

### 2.7 Bugs mineurs — RESOLUS

- `avgDelta` undefined dans `benchmark-e2e.ts:2846` → scope fix
- `workflow-sync.ts` : `edge_type='dependency'` dans INSERT (etait NULL)
- `additionalToolsWithEmbeddings` dead code → supprime, remplace par `toolEmbeddings`
- Notebook 06 : SQL corrige (`pattern_id`, `hierarchy_level`, `e.ord`)

---

## 3. Etat actuel du systeme (2026-02-23)

### 3.1 Donnees

| Metrique | Valeur | Source |
|----------|--------|--------|
| Execution traces | 1982 | `execution_trace` |
| Avec task_results | 1955 (98.6%) | |
| Avec intent_embedding propre | 1604 (80.9%) | Post-backfill 2026-02-23 (359 traces backfillees) |
| Avec intent_embedding (COALESCE) | 1982 (100%) | Fallback sur `wp.intent_embedding` pour pre-047 |
| Capabilities | 610 (3 L0, 597 L1, 10 L2) | `workflow_pattern` |
| Distinct tools (dag) | 188 | `dag_structure.tools_used` |
| Tool embeddings | 918 | `tool_embedding` (BGE-M3, 1024D) |
| Cap→cap edges | 63 | `capability_dependency` (50 L1→L1, 10 L2→L1) |
| Graphe SHGAT | 739 nodes (579 caps + 160 tools), 861 edges | notebook 07 |
| Composantes connexes | 80 (plus grande = 283 nodes) | |

### 3.1b GRU Inference en production (2026-02-23)

- **Inference Deno** : `src/graphrag/algorithms/gru/gru-inference.ts` (pure JS + BLAS FFI)
- **Poids** : `lib/gru/gru-weights-prod.json` (25MB, vocab=918 tools, 0 caps)
- **Chargement** : `src/mcp/algorithm-init/initializer.ts` → fichier d'abord, DB fallback
- **Vocab embarque** : Le fichier poids contient `vocab.toolIds` + `vocab.vocabNodes` pour garantir l'alignement avec le training
- **Fix intent_embedding package client** : `execute-direct.use-case.ts` genere maintenant l'embedding avant de construire le `LearningContext` (etait NULL avant 2026-02-23)
- **Backfill** : 359 traces sans embedding backfillees via `scripts/backfill-intent-embeddings.ts`
- **Etat** : le GRU predit des **tools uniquement** (voir section 5.3). Pas de caps dans le vocab actuel.

### 3.2 Distribution traces

- **85.7% = 1 seul tool** par trace (1058/1235 traces utilisables)
- Mean = 1.3 tools/trace
- 54% des exemples = first-step (ctx_len <= 2)

### 3.3 Graphe SHGAT

- Densite incidence : 0.84% (tres creux)
- Hub tools (>= 10 caps) : 23 tools, couvrent 55.5% des edges
- Top hubs : `syson:syson_element_children` (39 caps), `syson:syson_query_aql` (35), `std:agent_help` (30)
- Co-occurrence : 86.7% same-server, 13.3% cross-server
- Top cross-server : `onshape+syson` (14), `std+syson` (11), `code+filesystem` (11)
- Jaccard inter-caps : mean=0.019, median=0 — le graphe est tres creux, le MP n'over-smooth pas

### 3.4 task_results vs executed_path

| Source | UUID | FQDN | code/loop | Normalise | Utilisation |
|--------|------|------|-----------|-----------|-------------|
| `executed_path` | 16.6% | 7.1% | 9.0% | 67.2% | Legacy UI, deprecated |
| `task_results` | 0% | 51.8% | 4.3% | 43.6% | Source de verite compute/ML |

Le 51.8% FQDN dans task_results est normal (ADR-068). Normalisation cote consommateur.

---

## 4. Benchmark actuel

### 4.1 GRU Hit@1 — Evolution

| Phase | Hit@1 | MRR | Test | Vocab | Date |
|-------|-------|-----|------|-------|------|
| Pre-FQDN (small vocab) | 65.7% | 76.8% | 84 | 644 | 2026-02-15 |
| Post-FQDN (big vocab) | 44.4% | 59.9% | 107 | 1884 | 2026-02-18 |
| Post-fix NO_SHGAT (full) | 52.8% | 66.0% | 107 | 1884 | 2026-02-20 |
| Post-fix SHGAT (full) | 50.9% | 63.6% | 107 | 1884 | 2026-02-20 |
| **PROD_ONLY** (tools-only) | **58.0%** | **68.4%** | 375 | **918** | 2026-02-23 |

Hit@1 a baisse de 65.7→44.4% parce que le vocab a triple (644→1884). Recuperation a 52.8% apres fix data quality. Le PROD_ONLY (918 tools, sans n8n/Smithery) atteint **58.0%** — le meilleur resultat a ce jour, montrant que le vocab reduit + donnees prod pures > vocab large dilue.

**ATTENTION** : Tous ces benchmarks predisent des **tools uniquement** (voir section 5.3.1). Les caps n'ont jamais ete des targets d'entrainement.

### 4.2 E2E Beam — La metrique qui compte

| Config | Vocab | E2E Beam First-N | Notes |
|--------|-------|-----------------|-------|
| Full NO_SHGAT (2026-02-20) | 1884 | 64.6% | n8n + Smithery, vocab large |
| Full SHGAT_TRAINED (2026-02-20) | 1884 | 70.8% | SHGAT +6.2pp sur vocab large |
| **PROD_ONLY NO_SHGAT (2026-02-23)** | **918** | **72.0%** | **Meilleur resultat a ce jour** |

**ATTENTION comparaison** : Le PROD_ONLY (918 tools, 0 caps, pas de SHGAT) bat le full SHGAT (1884 vocab, n8n, Smithery). La comparaison SHGAT vs NO_SHGAT n'est valide qu'a vocab egal. Le gain SHGAT (+6.2pp) sur le full run est reel mais le vocab large dilue les performances. Le PROD_ONLY montre que **vocab reduit + donnees propres > vocab large + SHGAT enrichment**.

Le SHGAT enrichment reste potentiellement utile a vocab egal (PROD_ONLY + SHGAT pas encore teste).

### 4.3 SHGAT delta historique

| Date | SHGAT delta Hit@1 | Cause |
|------|-------------------|-------|
| Pre-fix | **-27.3pp** | FQDN random embeddings |
| Post-fix | **-1.9pp** | Donnees propres |

### 4.4 SHGAT OB Training (lib/shgat-tf)

| Metrique | Valeur | Config |
|----------|--------|--------|
| Best Recall@1 LiveMCP | 16.4% | B-Flat, LR=0.001, 10ep, 282 ex |
| Best Recall@1 OB | 24.3% | epoch 8, 7.35M params, 36K ex (overfit after) |
| Batch contrastive | DONE | symmetric CE, in-batch negatives |
| Eval batche | DONE | precompute K projections, 50x speedup |
| KL sub-sampling | DONE | `--kl-subsample 2000` |
| V2V activation | NOT STARTED | baseline no-KL done (R@1=49.5%) |

---

## 5. Ce qui reste a faire

### P1 — Sparse Message Passing (tech spec 2026-02-13)

**Probleme** : les matrices denses `[numTools x numCaps]` dans les phases MP de `lib/shgat-tf` OOM a ~12GB sur le dataset OB (7047 caps n8n + 1901 tools = 13.4M entries). **C'est la raison pour laquelle le pipeline OB n'est pas utilise** — pas un choix, un blocage.

**Pourquoi c'est P1** : le pipeline prod (paper SHGAT, 579×160) tourne sur un petit graphe. Pour entrainer un SHGAT de qualite sur les donnees reelles (36K exemples OB, meilleur R@1=24.3% epoch 8), il faut debloquer `lib/shgat-tf`. Sparse MP est le prerequis.

**Plan** (~2 jours, ~2500 lignes) :

| Fichier | Changement |
|---------|------------|
| `vertex-to-edge-phase.ts` | `connectivity: number[][]` → `SparseConnectivity` (Map-based) |
| `edge-to-vertex-phase.ts` | idem |
| `edge-to-edge-phase.ts` | `containment: number[][]` → `SparseConnectivity` |
| `multi-level-orchestrator.ts` | Adapter les appels |
| `phase-interface.ts` | Type `SparseConnectivity` |
| `tools/train-ob.ts` | `buildGraphStructure()` retourne sparse |

**Impact memoire** : ~560KB (sparse) vs ~107MB (dense). Facteur ~190x.

### P2 — Items ouverts

| # | Item | Effort | Notes |
|---|------|--------|-------|
| P2-1 | V2V activation dans train-ob | 1j | Baseline no-KL R@1=49.5%. V2V pas encore active au training. |
| P2-2 | Mesurer activation Tier 2 GRU (layer_index) | rapide | 61% traces ont `layer_index`, devrait s'activer post-fix FQDN. |
| P2-3 | Migrer `trace-feature-extractor` vers `task_results` JSONB | 1j | 39 queries SQL sur `executed_path` a migrer. |
| P2-4 | `capability_dependency` cap→tool | 1j | Seulement 63 records cap→cap. Les aretes cap→tool manquent. |
| P2-5 | PaperMP (`lib/shgat-for-gru/paper-mp.ts`) | a evaluer | 525K params, InfoNCE. Peut-etre pas necessaire vu que le MP actuel fonctionne sur donnees propres. |
| P2-6 | Benchmark provides edges dans SHGAT MP | 2j | Seulement quand >200 provides edges. Actuellement ~116 (23 tools avec output_schema). |
| P2-7 | GRU Vocabulary unifie : caps comme targets | **P1** | Voir section P1-bis ci-dessous. Bloquant pour que le GRU predise des capabilities. |

### P1-bis — GRU Vocabulary Unifie et Caps-as-Targets (audit panel 2026-02-23)

**Contexte** : Un panel de 3 experts (benchmark-analyst, model-architect, data-architect) a audite le GRU le 2026-02-23. Verdict unanime ci-dessous.

#### 5.3.1 Constat : le GRU n'a JAMAIS predit de capabilities

Le GRU a l'**architecture** pour predire des capabilities (softmax sur `vocabSize = numTools + numVocabNodes`, `expandPrediction()` explose un cap predit en ses tools enfants), mais il n'a **jamais ete entraine a le faire** :

- `buildDAGAwareExamples` (`training-utils.ts:220`) : `targetToolId = current.tool` = toujours un tool L0
- `trainStep` (`gru-model.ts:697`) : `targetIndices.push(nodeToIndex.get(ex.targetToolId) ?? 0)` — les caps ne sont jamais ciblees
- Les n8n soft targets (`gru-model.ts:706-709`) : paddes a vocabSize, les positions caps remplies de zeros
- Le E2E beam a 70.8% first-N = **predictions tools-only**. Si un cap est predit (accidentel, via similarite embedding), il est expanse en tools par `expandPrediction()` avant insertion dans le path

**Les caps dans le vocab etaient du dead weight** — elles diluent le softmax sans recevoir de gradient.

#### 5.3.2 Bug PROD_ONLY : 0 caps dans le vocab (effet cascade)

En mode `PROD_ONLY=true` (sans n8n ni Smithery), le GRU a vocab = 918 tools, **0 higher-level nodes**. Voici la cascade :

1. `benchmark-e2e.ts:275` : query `WHERE hierarchy_level = 0` → 3 caps L0 qui ont `tools_used: []` vide
2. Les **597 caps L1** ont TOUTES des `tools_used` non vides, mais ne sont PAS chargees par cette query
3. 0 tool→cap connections → `capToToolChildren` vide pour toutes les caps
4. Les 13 caps L1+/L2 sont construites avec `children = capToCapChildren` = UUIDs de caps
5. `setToolVocabulary` filtre `allChildrenKnown` : les UUIDs ne sont pas dans `nodeToIndex` → toutes rejetees
6. Resultat : `Vocab: 918 tools + 0 higher-level nodes = 918 total`

**C'est un bug de data pipeline**, pas un choix.

#### 5.3.3 Donnees disponibles en DB prod

| Metrique | Valeur |
|----------|--------|
| Caps L0 (avec intent_embedding) | 3 (tools_used vide) |
| Caps L1 (avec intent_embedding) | 597 (100% ont tools_used) |
| Caps L2 (avec intent_embedding) | 10 (tools_used directs + 1 sub-cap L1 chacune) |
| Format tools_used | 93% court (`std:psql_query`), 7% FQDN |
| Tools uniques dans tools_used | 190 (dont 146 matchent tool_embedding, 44 orphelins type `code:exec_*`) |
| Tools couverts par >= 1 cap | 146/918 (15.9%) |
| Tools orphelins (aucune cap) | 772/918 (84.1%) |
| Caps avec 1 seul tool | 429/597 (71.9%) |
| Caps avec 2+ tools | 168/597 (28.1%) |
| capability_dependency records | 63 (50 L1→L1, 10 L2→L1, 0 L2→L2) |

**Vocab cible** : 918 tools + ~550 caps (apres filtrage) ≈ **~1470 vocab**

#### 5.3.4 Fix Axe 1 — Caps dans le vocab (data pipeline)

**Effort** : ~1h, benchmark-e2e.ts uniquement.

Le fix : dans `benchmark-e2e.ts`, charger `capToToolChildren` pour TOUS les levels (pas juste L0). Les 597 caps L1 ont toutes `dag_structure.tools_used` avec des FQDN normalisables. Apres normalisation, les tools matchent les tool_embedding → les caps passent `allChildrenKnown`.

```
Avant : WHERE hierarchy_level = 0  → 3 caps, tools_used vide → 0 connections
Apres : (pas de filtre level)      → 610 caps, 597 avec tools_used → ~550 caps dans le vocab
```

Les children de CHAQUE cap = ses `tools_used` normalises (FQDN→court). Pour les L2 : tools_used directs + union des tools des sub-caps L1 via `capability_dependency`.

**IMPORTANT** : Ce fix seul ne suffit PAS pour que le GRU predise des caps. Les caps seront dans le softmax mais sans gradient (meme situation que le run E2E avec n8n — 6814 caps dans le vocab, jamais ciblees).

#### 5.3.5 Fix Axe 2 — Caps-as-targets dans le training (P2-7)

**Effort** : ~1 jour, training-utils.ts + gru-model.ts.

Pour que le GRU apprenne a predire des capabilities, il faut generer des training examples avec `targetToolId = capId`. Chaque trace a `capability_id` — c'est le signal naturel.

**3 pistes identifiees** (aucune validee, travail de design necessaire avant implementation) :

| Approche | Principe | Avantage | Risque |
|----------|----------|----------|--------|
| A. Cap-as-extra-target | Pour chaque trace `[A, B, C]` avec `capability_id = X`, ajouter un exemple avec target = cap X en position "fin de sequence" | Simple, utilise les donnees existantes | 72% des caps = 1 tool, pas de gain vs predire le tool directement |
| B. Cap-as-first-step | Predire le cap AVANT les tools : intent → cap → tools du cap | Hierarchique : d'abord "quoi faire" puis "comment" | Change la semantique du path (cap != tool) |
| C. Loss auxiliaire caps | Ajouter un term dans la loss : quand le target est tool T, penaliser aussi si cap(T) a un score faible | Le modele apprend a scorer les caps hautes sans changer les targets | Complexe, interference possible avec la loss principale |

**Aucune recommandation ferme a ce stade.** Les 3 pistes ont des trade-offs non trivaux. Un travail de design dedie est necessaire avant implementation :
- Quel impact sur le Hit@1 tools (regression possible si le softmax est dilue par les cap targets) ?
- 72% des caps = 1 seul tool → est-ce que predire le cap apporte vraiment plus que predire le tool ?
- Les 168 caps multi-tools (28%) sont les seules ou la prediction cap a un vrai avantage (macro-step)
- Faut-il un mecanisme de weighting cap-targets vs tool-targets dans la loss ?
- Comment evaluer ? Il faut un benchmark qui mesure la qualite des predictions de caps, pas seulement de tools

**TODO** : Session de design dediee avant de coder quoi que ce soit.

#### 5.3.6 Objectif final

Le GRU doit etre capable de :
1. **Predire des chemins de tools** ✅ (fonctionne, 58% Hit@1 prod-only)
2. **Predire des capabilities** quand la trace entiere correspond a un cap connu
3. **Predire des chemins mixtes** (cap → expand en tools, ou tool → tool → cap)
4. **Savoir si un cap couvre les tools predits** (via `expandPrediction` + matching)

---

### P3 — Nettoyage et optionnel

| # | Item | Effort | Notes |
|---|------|--------|-------|
| P3-1 | Naming consistency `toolsUsed`/`toolsCalled`/`contextTools`/`capabilityTools` | large (~50 fichiers) | |
| P3-2 | Auditer colonnes `decisions` et `initial_context` (quasi jamais peuplees) | rapide | |
| P3-3 | Fix `flattenExecutedPath` hierarchy flaw (B1,B2 a la suite au lieu de nester) | marginal (10 caps L2) | |
| P3-4 | 8 tools FQDN restants dans dag_structure (residus nouveaux write paths FQDN) | pas bloquant | normalisation lecture les gere |

---

## 6. Lecons cles (extraites des 5 tech specs + audit panel 2026-02-23)

1. **Le probleme etait les donnees, pas l'algorithme.** SHGAT delta passe de -27pp a -1.9pp en nettoyant FQDN + task_results. Pas de changement algorithmique.

2. **task_results > executed_path.** 0% corruption vs 37.7%. Source de verite pour tout le compute/ML.

3. **FQDN = format canonique, normaliser a la lecture.** ADR-068. Ne jamais re-normaliser la DB.

4. **Le SHGAT aide le E2E beam (+6.2pp), pas le Hit@1 (-1.9pp).** Il enrichit les embeddings structurellement (cross-server co-occurrence) pour le re-ranking, pas pour la prediction unitaire.

5. **85.7% traces = 1 tool.** Le GRU manque de donnees multi-step. Le E2E Beam a 70.8% est bon *malgre* ca.

6. **Hub tools = 55.5% des edges.** Si le MP weight est trop eleve, signal leak via hubs (`std:psql_query`, `syson:syson_element_children`). Le graphe tres creux (Jaccard median=0) protege naturellement contre l'over-smoothing.

7. **N8n v2 noie le signal prod.** 2.9% de donnees prod dans le pool, overlap 39%. Desactive.

8. **Intent diversity = deja fixe.** Migration 047 + code en place. 80.9% des traces ont un vrai intent embedding (post-backfill 2026-02-23, etait 62.3% avant). Les 19.1% restantes (sans intent text) utilisent le COALESCE vers la description cap. Fix du bug package client (intent_embedding=NULL) dans `execute-direct.use-case.ts`. Les nouvelles traces capturent automatiquement le vrai intent.

9. **Deux pipelines SHGAT, ne pas confondre.** Le pipeline prod (`train-worker.ts` → `shgat.ts` paper) utilise des matrices denses sur un petit graphe (579×160), pas d'OOM. Le pipeline OB (`lib/shgat-tf`) OOM sur gros datasets — c'est un **blocage actif**, pas un choix. Sparse MP debloque l'OB training.

10. **Le GRU n'a jamais predit de capabilities.** (Audit panel 2026-02-23, 3 experts unanimes.) L'architecture le supporte (`vocabSize = numTools + numVocabNodes`, `expandPrediction()`), mais le training ne genere jamais de cap targets (`targetToolId = current.tool` = toujours L0). Les caps dans le vocab etaient du dead weight sans gradient. Le E2E beam 70.8% = predictions tools-only. Le PROD_ONLY avait 0 caps a cause d'un bug pipeline (`WHERE hierarchy_level = 0` dans benchmark-e2e.ts, alors que les 597 L1 caps ont toutes `tools_used`). Fix = 2 axes : (1) charger les caps dans le vocab avec children = tools FQDN, (2) generer des training examples avec `targetToolId = capId` via `capability_id` de chaque trace.

---

## 7. Tests existants

| Fichier | Tests | Couverture |
|---------|-------|-----------|
| `tests/unit/capabilities/normalize-tool-id-fqdn.test.ts` | 17 | FQDN→short, edge cases, idempotence |
| `tests/unit/graphrag/shgat-fqdn-tool-embeddings.test.ts` | 10 | Map embeddings vs defaults, E2E pipeline |
| `tests/unit/graphrag/algorithm-init-fqdn.test.ts` | 10 | filterContextTools (UUIDs, code, loop) |
| `tests/unit/capabilities/trace_path_test.ts` | 16 | getCleanToolPath, cleanToolIds |
| `lib/shgat-tf/src/training/__tests__/*.test.ts` | 26+ | batch-contrastive, InfoNCE, KL, Adam |
| `lib/shgat-for-gru/src/__tests__/*.test.ts` | 38+ | adapter, paper-mp, v2v |

---

## 8. Notebooks

| # | Notebook | Contenu | Derniere execution |
|---|---------|---------|-------------------|
| 01 | MP Toy Problem | PoC message passing sur graphe jouet | ok |
| 02 | Hierarchical Workflow Retrieval | Comparaison flat vs hierarchique | ok |
| 03 | GRU Workflow Sequencer | Premier GRU sur n8n, co-occurrence graph | ok |
| 04 | Sequential Graph + GRU | Transition graph dirigé vs co-occurrence. Dir Walk > Cooc, GRU 0% SeqAcc (PyTorch toy) | ok |
| 05 | GRU Benchmark Analysis | Post-FQDN. Vocab 644→1884, Hit@1 65.7→44.4%. First-tool match 100%. | ok |
| 06 | Executed Path Audit | 18.4% UUIDs, 6.1% FQDN, task_results = source propre | ok |
| 07 | SHGAT Graph Visualization | 739 nodes, 80 composantes, hub tools, pyvis interactif | ok |
| 08 | Post-Fix Benchmark | Consolidation des 3 fixes. SHGAT delta -27pp → -1.9pp. E2E Beam +6.2pp. | ok |

---

*Consolide le 2026-02-23. Remplace 5 tech specs (2026-02-13 a 2026-02-19).*
