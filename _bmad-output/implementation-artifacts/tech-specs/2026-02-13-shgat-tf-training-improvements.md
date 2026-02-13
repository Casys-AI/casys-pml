# Tech Spec : SHGAT-TF Training — Améliorations identifiées (2026-02-13)

> Issu de l'audit consolidé `lib/shgat-tf/docs/2026-02-13-audit-consolidated.md`

---

## 0. Statut d'implémentation (mis à jour 2026-02-13 12:15)

| # | Item | Statut | Détails |
|---|------|--------|---------|
| 0a | **Logging enrichi train-ob.ts** | **DONE** | batch acc, grad norms, ETA, Recall@1/3/5, best tracking |
| 1 | Batch contrastive loss (module) | **DONE** | `batch-contrastive-loss.ts` + 5/5 tests PASS |
| 1b | Intégration dans train-ob.ts | **DONE** | flag `--batch-contrastive` (ON par défaut) |
| 1c | LR default 0.01→0.005 | **DONE** | + eval-every 5→2 |
| 1d | **Eval batché** | **DONE** | Precompute K projections via dgemm → 50x speedup |
| 1e | **KL sub-sampling** | **DONE** | `--kl-subsample 2000` |
| 1f | **Memory staged loading** | **DONE** | null intermediate buffers |
| 2 | Activation V2V | NOT STARTED | Baseline no-KL done (R@1=49.5%) |
| 3 | Doc Q/K sharing | NOT STARTED | P3 |
| 4 | Doc KL/MP asymétrie | NOT STARTED | P3 |
| 8 | **shgat-for-gru adapter** | **DONE** | Pure JS, 38 tests, zéro dep TF.js |
| 8b | **benchmark-e2e.ts migration** | **DONE** | -650 lignes glue, V→V migré |
| 9 | **Tool schema exploitation** | **2/5 DONE** | 9.1, 9.3 implémentés — voir §9 |
| 9.1 | Schema-Enriched Embeddings | **DONE** | `buildToolText()` enrichi params+types+enums, cap 500 chars, flag `--force` |
| 9.3 | Schema Similarity soft targets | **DONE** | Jaccard blending α=0.8 cosine + 0.2 schema, `--schema-alpha`, tokens pré-calculés |
| 9.4 | Tool Clustering par archetype | **DEFERRED** | Usage futur SHGAT hiérarchique uniquement, pas d'impact sur le pipeline actuel |
| 10a | Training no-KL | **DONE** | Best R@1=49.5% MRR=0.624 (epoch 12) |
| 10b | Training KL | **EN COURS** | --kl --kl-weight 0.2 --kl-subsample 2000 |

### Vérification
- `deno check tools/train-ob.ts` : **OK**
- `deno test src/training/__tests__/` (hors legacy TF.js) : **26/26 PASS**

### Training run #1 (killé epoch 5/15)
- **Config**: LR=0.01, τ=0.1→0.07, BS=32, 15 neg, per-example InfoNCE, seed=42
- **Problème**: loss oscillait (0.82→0.21→0.46→0.81→0.71) après warmup LR complet
- **Diagnostic**: LR=0.01 trop élevé (benchmarks: 0.001 pour 282 ex, 0.005 recommandé pour 36K)

### Prochaine étape : Training run #2
```bash
cd lib/shgat-tf
DENO_V8_FLAGS="--max-old-space-size=12288" deno run -A tools/train-ob.ts \
  --epochs 20 --lr 0.005 --seed 42 --kl --kl-weight 0.2 --eval-every 2
```
Changements vs run #1: LR 0.01→0.005, batch contrastive ON (défaut), eval-every 5→2, epochs 15→20

---

## 1. Batch Contrastive Loss en Plain JS (P1) — DONE (module)

### Contexte

Le training actuel (`tools/train-ob.ts`) utilise une boucle per-example avec InfoNCE :
- Pour chaque exemple du batch (32), on calcule Q, K séparément → 32 appels `matVec`
- Les négatifs sont sélectionnés explicitement (pas de vrai curriculum)

### Implémentation

- `src/training/batch-contrastive-loss.ts` : forward + backward, symmetric CE, in-batch negatives
- `src/training/__tests__/batch-contrastive-loss.test.ts` : 5 tests gradient checking (finite diff)
- `deno check` : OK, `deno test` : 5/5 PASS (29ms)

### Intégration dans train-ob.ts (TODO)

Remplacer la boucle per-example InfoNCE par batch forward/backward. Impact :
- Le forward groupé (B exemples à la fois) remplace B appels individuels `computeMultiHeadKHeadScoresWithCache`
- Le backward groupé accumule dW_q, dW_k via la matrice B×B de gradients
- Le MP backward reste per-graph (inchangé)
- L'Adam step reste identique

### Proposition (design original)

```typescript
// Forward (batch)
const Q_all = blasDgemm(W_q, intents);   // [scoringDim × batchSize]
const K_all = blasDgemm(W_k, tools);     // [scoringDim × batchSize]
const sim = blasDgemm(Q_all.T, K_all);   // [batchSize × batchSize]
const logits = scale(sim, 1/sqrt(dim));
const logits_scaled = div(logits, tau);

// Symmetric cross-entropy
const loss1 = crossEntropy(eye(B), softmax(logits_scaled, axis=1)); // intent→tool
const loss2 = crossEntropy(eye(B), softmax(logits_scaled, axis=0)); // tool→intent
const loss = (loss1 + loss2) / 2;

// Backward
// dLogits = softmax_grad(loss) → [B×B]
// dQ = dgemm(dLogits, K_all) / sqrt(dim) / tau
// dK = dgemm(dLogits.T, Q_all) / sqrt(dim) / tau
// dW_q = dgemm(dQ, intents.T)
// dW_k = dgemm(dK, tools.T)
```

### Performance estimée

| Métrique | Actuel (per-example) | Batch contrastive |
|----------|---------------------|-------------------|
| K-head forward | 32 × matVec | 3 × dgemm |
| K-head backward | 32 × (outer + matVecT) | 4 × dgemm |
| Speedup K-head | baseline | **2-4x** |
| Speedup total (incl. MP) | ~7min/epoch | **~4-5min/epoch** |

### Risques

- **Négatifs faciles** : Avec 38K exemples répartis sur 870 outils, la probabilité de collisions dans un batch de 32 est faible (~3.6%). Acceptable.
- **Symmetric loss** : La loss bidirectionnelle (intent→tool + tool→intent) est plus informative. Pas un risque, un avantage.
- **Gradient shape** : Le gradient de la symmetric CE est une matrice [B×B] au lieu d'un vecteur. Plus de mémoire (~4KB pour B=32, négligeable).

### Fichiers créés/modifiés

- `src/training/batch-contrastive-loss.ts` : **CRÉÉ** — forward + backward en plain JS
- `src/training/__tests__/batch-contrastive-loss.test.ts` : **CRÉÉ** — 5 tests gradient checking (ALL PASS)
- `tools/train-ob.ts` : **À MODIFIER** — intégrer batch forward/backward (remplace boucle per-example)

### Compatibilité

- Ne change PAS le MP (message passing reste per-graph)
- Ne change PAS l'Adam optimizer
- Compatible avec le KL divergence n8n (séparé)
- Les négatifs prod explicites sont remplacés par in-batch negatives

---

## 2. Activation V2V (P1 post-résultats training)

### Contexte

Le V2V (vertex-to-vertex) est implémenté dans l'orchestrator mais **non activé** dans train-ob.ts :
- Pas de cooccurrence data chargée
- Pas de v2vParams passés au forward
- Le backward V2V existe dans l'orchestrator

### Proposition

#### 2.1 Pipeline cooccurrence

Construire les données de cooccurrence depuis les exemples d'entraînement (prod + n8n) :

```typescript
interface CooccurrenceEntry {
  sourceId: string;  // tool ID
  targetId: string;  // tool ID
  weight: number;    // fréquence de cooccurrence normalisée
}
```

Sources :
- **Production traces** (52 traces) : paires d'outils consécutifs dans les séquences
- **n8n workflows** (35K exemples) : paires d'outils dans les mêmes workflows

#### 2.2 Activation dans train-ob.ts

```typescript
// 1. Construire cooccurrence
const coocData = buildCooccurrenceFromExamples(prodExamples, n8nExamples);

// 2. Configurer orchestrator
const orchestrator = new MultiLevelOrchestrator(true, v2vConfig);
orchestrator.setCooccurrenceData(coocData);

// 3. Initialiser v2v params
const v2vParams = { residualLogit: 0.0, temperatureLogit: 0.0 };

// 4. Forward avec V2V
const { result, cache } = orchestrator.forwardMultiLevelWithCache(
  H_init, E_levels, toolToCapMatrix, capToCapMatrices, levelParams, orchConfig,
  v2vParams  // ← 7ème argument
);
```

#### 2.3 Backward V2V

Le backward V2V est déjà implémenté dans l'orchestrator (lignes ~1222-1231). Il faut :
- Accumuler les gradients dV2V (residualLogit, temperatureLogit)
- Ajouter un Adam step pour les v2v params

### Fichiers à modifier

- `tools/train-ob.ts` : activer V2V, charger cooccurrence, backward + Adam step
- `tools/build-cooccurrence.ts` : nouveau script pour construire les données
- `src/training/multi-level-trainer-khead.ts` : ajouter v2v grads à l'accumulateur (optionnel)

### Dépendance

**Attendre les résultats epoch 5+** du training actuel (sans V2V) pour avoir un baseline. Ensuite comparer avec V2V activé.

---

## 3. Q/K Sharing : documentation du design (P3)

### Constat

| Contexte | W_q / W_k | Raison |
|----------|-----------|--------|
| Inférence (`parameters.ts`) | **Partagés** (même référence JS) | Préserve similarité cosine sans training |
| Training (`train-ob.ts`) | **Séparés** (matrices distinctes) | Permet projections asymétriques Q≠K |

### Justification

- À l'init sans training, `W_q = W_k` garantit que `Q·K = (Wx)·(Wy)` est une vraie similarité cosine dans l'espace projeté
- Pendant le training, séparer Q et K permet au modèle d'apprendre que la projection "question" (intent) et la projection "clé" (tool) peuvent être différentes
- Le commentaire dans `parameters.ts` documente que "random different projections destroy discriminability (MRR 0.148 → 1.0 with shared)"
- `train-ob.ts` (ligne 14) documente explicitement : "W_q/W_k are SEPARATE for training"

### Action

Pas de changement de code. Ajouter un commentaire dans `parameters.ts` expliquant que le sharing est pour l'inférence uniquement, et que `train-ob.ts` utilise des matrices séparées.

---

## 4. KL/MP Asymétrie : documentation du design (P3)

### Constat

- Exemples **prod** (InfoNCE) : passent par le Message Passing complet → embeddings enrichis → K-head scoring
- Exemples **n8n** (KL divergence) : passent **uniquement** par le K-head scoring → embeddings bruts

### Justification

- Les exemples n8n sont des **soft targets** approximatifs (cosine similarity ≥0.70, T=0.005)
- Le MP est coûteux et ses résultats ne sont fiables que si les W_up/W_down sont bien entraînés
- Entraîner le MP sur des soft targets bruités risque de propager du bruit dans les poids MP
- Le K-head scoring (W_q, W_k, W_intent) est plus robuste au bruit car c'est une projection simple

### Action

Documenter cette asymétrie dans `train-ob.ts` avec un commentaire expliquant pourquoi les exemples n8n ne passent pas par le MP.

---

## 5. Eval batché (precomputed K projections) — DONE

### Problème
L'eval scorait 107 test × 1901 tools = 203K appels individuels `computeMultiHeadKHeadScoresWithCache`. Chaque appel fait 16 heads × (matVec Q + matVec K + dot) = ~48 BLAS calls. Total : ~10M BLAS calls → **~10 minutes** par eval.

### Solution
Precompute les K projections pour TOUS les tools une fois par eval :
```typescript
// 1. AllToolEmbs^T: [embDim × numTools]
const AllToolEmbsT = math.transpose(AllToolEmbs);
// 2. K_all[h] = W_k[h] @ AllToolEmbs^T → [headDim × numTools] (16 dgemm BLAS)
for (let h = 0; h < numHeads; h++)
  K_all[h] = math.matmul(headParams[h].W_k, AllToolEmbsT);
// 3. Per example: Q_h = matVecBlas(W_q[h], intent) → dot with K_all columns
```

### Résultat
- **16 dgemm** precompute + **107 × 16 matVec** per-example = 1,728 BLAS calls (vs 203K)
- **12 secondes** au lieu de ~10 minutes → **50x speedup**
- Résultats identiques (même calcul, juste réorganisé)

---

## 5b. KL sub-sampling — DONE

### Problème
35,189 exemples n8n × ~10 sparse tools/exemple = **~350K** appels `computeMultiHeadKHeadScoresWithCache` par epoch dans le path KL. C'est 1100 batches KL vs 37 batches prod → ratio **1:30**, le KL dominait les gradients.

### Solution
- Flag `--kl-subsample 2000` (défaut) → 63 batches KL au lieu de 1100
- Chaque epoch shuffle puis prend les 2000 premiers → couverture stochastique
- Ratio prod:n8n rééquilibré à **1:1.7** (1155 prod vs 2000 n8n)

### Justification théorique
- **SGD** : le gradient d'un sous-ensemble aléatoire est un estimateur non-biaisé du gradient complet
- **Couverture** : P(exemple jamais vu en 20 epochs) = (1-2000/35189)^20 ≈ 31%. ~69% couverts.
- **Multi-task balance** : trop de KL modifie les poids partagés (W_q, W_k) au détriment du signal prod (leçon GRU v0.3.0 : "feature interference")
- **Le KL est secondaire** : régularisation via soft targets, pas l'objectif principal

### Logging
- Ancien : `\r` (invisible dans `tee`)
- Nouveau : `console.log` toutes les 20 batches

---

## 5c. Memory staged loading — DONE

### Problème
Le chargement `bench-dataset-export.msgpack.gz` (1.2GB) faisait coexister 3 buffers en mémoire :
1. `compressed` (1.2GB Uint8Array)
2. `raw = pako.ungzip(compressed)` (~4GB Uint8Array)
3. `ds = msgpackDecode(raw)` (~5GB JS objects)

Peak : ~10GB pendant le decode → OOM avec `--max-old-space-size=8192`.

### Solution
```typescript
{
  let compressed: Uint8Array | null = Deno.readFileSync(dataPath);
  let raw: Uint8Array | null = pako.ungzip(compressed);
  compressed = null; // free 1.2GB
  ds = msgpackDecode(raw) as ExportedDataset;
  raw = null; // free ~4GB
}
```
Block scope + `null` assignments pour permettre la GC des buffers intermédiaires.

### Résultat
- Fonctionne avec `--max-old-space-size=12288` (avant : OOM avec 8GB, SIGTERM avec 12GB)
- La GC récupère `compressed` avant que `raw` soit entièrement matérialisé (overlap réduit)

---

## 5d. Training run no-KL (en cours)

### Config
```bash
DENO_V8_FLAGS='--max-old-space-size=12288' deno run -A tools/train-ob.ts \
  --epochs 20 --lr 0.005 --seed 42 --no-kl --eval-every 2 \
  --tau-start 0.1 --tau-end 0.06 --negatives 32
```

### Résultats partiels (epochs 1-4)
| Epoch | Loss | Acc | R@1 | R@3 | R@5 | MRR | LR | tau | KL_w |
|-------|------|-----|-----|-----|-----|-----|----|-----|------|
| 1 | 2.342 | 43.5% | — | — | — | — | 0.0017 | 0.100 | 0 |
| 2 | 1.556 | 64.2% | 25.2% | 57.0% | 64.5% | 0.414 | 0.0034 | 0.100 | 0 |
| 3 | 1.437 | 71.9% | — | — | — | — | 0.0050 | 0.099 | 0 |
| 4 | 1.356 | 72.4% | 38.3% | 49.5% | 57.9% | 0.473 | 0.0050 | 0.098 | 0 |

- ~40s/epoch, ~12s eval → **~17 min total** pour 20 epochs
- Loss descend régulièrement, pas d'oscillation (LR=0.005 stable)
- R@1 passe de 25.2% à 38.3% en 2 epochs

---

## 6. Logging enrichi train-ob.ts — DONE

Changements effectués par agent (aucun impact sur la logique de training) :

| Amélioration | Détail |
|---|---|
| **Import** | `MultiLevelKHeadGradientAccumulators` pour signature helper |
| **Helpers** | `matrixL2Norm()`, `tensor3DL2Norm()`, `computeGradNorms()` |
| **Batch accuracy** | Positive index 0 ≥ max logit → correct |
| **Batch log** | `[Batch 12/36] loss=0.45 acc=68.8% \|dWq\|=0.023 \|dWk\|=0.019 \|dWi\|=0.012 1234MB` |
| **Epoch summary** | `Epoch 3/15 \| LR=0.0100 τ=0.098 KL_w=0.00 \| loss=0.465+kl=0.123 acc=72.3% \| \|grad\|=0.021 \| MP=303ms \| 395.2s \| 12.2GB \| ETA 54min` |
| **Eval** | `[EVAL epoch 5] Recall@1=X.X% Recall@3=X.X% Recall@5=X.X% MRR=X.XXX (N exemples test, Xms)` |
| **Best tracking** | `Best Recall@1=X.X% MRR=X.XXX (epoch N)` |
| **ETA** | Moyenne des durées d'epochs passés × epochs restants |

---

## 6. Priorités actualisées

| # | Item | Priorité | Statut |
|---|------|----------|--------|
| 0a | Logging enrichi train-ob.ts | **P0** | **DONE** |
| 1 | Batch contrastive loss (module + intégration) | **P1** | **DONE** |
| 1d | Eval batché (precomputed K projections) | **P1** | **DONE** (50x speedup) |
| 1e | KL sub-sampling | **P1** | **DONE** (`--kl-subsample 2000`) |
| 1f | Memory staged loading | **P1** | **DONE** (null intermediate buffers) |
| 2 | Activation V2V + pipeline cooccurrence | **P1** | NOT STARTED (besoin baseline) |
| 3 | Documentation Q/K sharing | P3 | NOT STARTED |
| 4 | Documentation KL/MP asymétrie | P3 | NOT STARTED |

## 7. Config recommandée

### Run baseline (no-KL, en cours)
```bash
DENO_V8_FLAGS="--max-old-space-size=12288" deno run -A tools/train-ob.ts \
  --epochs 20 --lr 0.005 --seed 42 --no-kl --eval-every 2 \
  --tau-start 0.1 --tau-end 0.06 --negatives 32
```
Durée : ~17 min (40s/epoch + 12s eval)

### Run avec KL (prochaine)
```bash
DENO_V8_FLAGS="--max-old-space-size=12288" deno run -A tools/train-ob.ts \
  --epochs 20 --lr 0.005 --seed 42 --kl --kl-weight 0.2 --kl-warmup 3 \
  --kl-subsample 2000 --eval-every 2 --tau-start 0.1 --tau-end 0.06 --negatives 32
```
Durée estimée : ~40 min (40s training + 12s eval + ~60s KL × 63 batches)

---

## 8. `@casys/shgat-for-gru` — Adapteur SHGAT→GRU (SCAFFOLD)

### Contexte

Le couplage SHGAT→GRU existe déjà dans `benchmark-e2e.ts` (~800 lignes de glue) :
1. Chargement des params SHGAT (DB ou fichier JSON)
2. Message passing V↔E pour enrichir les embeddings tools
3. K-head scoring pour la sélection du premier outil
4. `model.setToolVocabulary(enrichedToolEmbeddings, ...)` pour le GRU

**Problèmes** :
- Glue code monolithique dans un benchmark de 2000+ lignes
- Import depuis `shgat-tf/dist-node/` (copie manuelle du code TF.js)
- Dépendance TF.js (`tf.Variable`, `arraySync`, `messagePassingForward`)
- Format params hérité (autograd-trainer) ≠ format OB (train-ob.ts export)

### Solution : module réutilisable

`lib/shgat-for-gru/` — Node.js natif, zero TF.js, pure JS.

### API

```typescript
import { SHGATAdapter } from "@casys/shgat-for-gru";

const adapter = new SHGATAdapter();

// 1. Charger les params OB-trained
adapter.loadParams("lib/gru/data/shgat-params-ob-2026-02-13T10-00-00-000Z.json");

// 2. Construire le graphe depuis les noeuds
adapter.buildGraph(nodes); // [{id, embedding, children, level}]

// 3. Enrichir les embeddings via MP (V→E upward + E→V downward)
const { toolEmbeddings, enrichmentMs } = adapter.enrichEmbeddings();
// toolEmbeddings: Map<string, number[]> — enriched 1024D

// 4. Fournir au GRU
model.setToolVocabulary(toolEmbeddings, toolCapMap, higherLevelNodes);

// 5. K-head scoring pour le premier outil
const { topK } = adapter.scoreTools(intentEmbedding, 5);
const firstTool = topK[0].toolId;
```

### Fichiers

| Fichier | Contenu |
|---------|---------|
| `src/types.ts` | Types (OBTrainedParams, GraphNode, GraphStructure, etc.) |
| `src/adapter.ts` | `SHGATAdapter` class (loadParams, buildGraph, enrichEmbeddings, scoreTools) |
| `src/index.ts` | Re-exports publics |

### Ce que ça remplace dans benchmark-e2e.ts

| Avant (benchmark-e2e.ts) | Après (adapter) |
|---|---|
| L446-490 : chargement params SHGAT | `adapter.loadParams(path)` |
| L495-737 : parsing params (2 formats) | Parsing unifié format OB |
| L777-858 : MP forward (TF.js tensors) | `adapter.enrichEmbeddings()` (pure JS) |
| L1308-1365 : K-head scoring setup | `adapter.scoreTools(intent, k)` |
| Import `dist-node/autograd-trainer.ts` | Aucune dépendance shgat-tf |

### Prochaines étapes

1. ~~Scaffold (types, adapter class, index)~~ **DONE**
2. ~~Tests unitaires (`adapter.test.ts`) avec tiny synthetic graph~~ **DONE** (24 tests)
3. ~~Migrer `benchmark-e2e.ts` pour utiliser l'adapter au lieu du glue code~~ **DONE** (-650 lignes)
4. ~~Supprimer les imports `dist-node/` dans `lib/gru/`~~ **DONE** (zéro ref shgat-tf)
5. ~~V→V enrichment (buildCooccurrenceFromWorkflows, v2vEnrich)~~ **DONE** (14 tests)

---

## 9. Exploitation des Tool Schemas scrapés (Smithery)

### Données disponibles

- **17 150** MCP tools scrapés (Smithery), **tous avec `inputSchema`** (JSON Schema)
- **17 387** embeddings BGE-M3 1024D
- Fichier: `lib/gru/data/smithery-mcp-tools.json` (30 MB)
- Embeddings: `lib/gru/data/smithery-mcp-embeddings.json` (381 MB)
- Scripts: `lib/gru/src/n8n/scrape-mcp-tools.ts`, `embed-mcp-tools.ts`

### 9.1 Schema-Enriched Embeddings (P1 — quick win) — DONE

**Idée**: Inclure les noms de paramètres et types dans le texte embedé.

Ancien format:
```
Tool: {name}. Server: {server}. {description}
```
Nouveau format:
```
Tool: {name}. Server: {server}. {description}. Parameters: {param1} ({type}), {param2} (enum: a|b|c).
```

**Implémentation** (2026-02-13):
- Fichier: `lib/gru/src/n8n/embed-mcp-tools.ts`
- `SchemaProperty` / `InputSchema` interfaces ajoutées
- `formatParam(name, prop)`: affiche type simple ou `enum: val1|val2|val3` (top 3 + `|...`)
- Params triés: required en premier, puis alphabétique
- Description tronquée à 250 chars (au lieu de 300) pour laisser de la place
- Total texte cap strict à 500 chars
- Flag `--force` : supprime anciens embeddings JSON+Parquet avant re-embed
- 15 335/17 150 tools ont des properties, 2 137 ont des enums

**Prochaine étape**: `npx tsx src/n8n/embed-mcp-tools.ts --force` (~20min)

### 9.2 Schema-Aware Negative Sampling pour InfoNCE (P2)

**Idée**: Pour le training contrastif, choisir des negatives qui sont **sémantiquement proches**
mais **structurellement différents** (schemas incompatibles).

- Hard negatives basées sur schema similarity → force le model à distinguer au-delà de la sémantique
- Exemple: `search_files(query, path)` vs `search_web(query, engine)` — même verbe, params différents

**Impact**: Améliore la discrimination fine entre tools similaires.
**Effort**: Moyen — nécessite calcul de schema similarity et intégration dans le sampling.

### 9.3 Schema Similarity pour soft targets n8n→MCP (P2) — DONE

**Idée**: Quand on mappe un n8n node vers un MCP tool, ajouter un score de **schema
compatibility** au cosine similarity sur les embeddings.

**Implémentation** (2026-02-13):
- Fichier: `lib/gru/src/n8n/build-soft-targets.ts` (+377/-83 lignes)
- `normalizeParamName(s)`: tokenise camelCase/snake_case/kebab-case/dot.notation
- Jaccard similarity sur les token sets normalisés des param names
- Formule: `final_sim = α * cosine_emb + (1-α) * jaccard_schema_sim`
- CLI flag: `--schema-alpha 0.8` (défaut α=0.8 → 80% cosine + 20% schema)
- Token sets pré-calculés pour tous les 1901 tools du vocab (évite N×M redundant normalization)
- PML tools: pas de schema dispo depuis DB → schema_sim=0 → pure cosine (fallback gracieux)
- Smithery tools: 15 335/17 150 avec schema properties
- Stats loggées: combien de mappings top-1 ont changé grâce au blending

### 9.4 Tool Clustering par Schema Pattern — DEFERRED

**Idée originale**: Grouper les tools par "schema archetype" fonctionnel pour construire
des noeuds L1+ dans la hiérarchie SHGAT (alternative au groupement par server).

**Statut**: Exploré (heuristique regex + k-means sur embeddings), mais **non branché**
sur le pipeline de training. Le SHGAT hiérarchique (message passing) ne fonctionne pas
encore avec le volume de données actuel (282→36K exemples, mais MP reste no-op ou collapse).
Les fichiers de clustering ont été supprimés car inutilisés.

**Quand revisiter**: Quand le MP hiérarchique fonctionnera avec suffisamment de données,
les clusters pourraient servir de noeuds L1 alternatifs au groupement par server.

### 9.5 Schema-Conditioned GRU Input (P4 — defer)

**Idée**: Ajouter un **6ème input au GRU = schema fingerprint** :
- `param_count + type_distribution + required_ratio` → 8-16D compact
- Ne pas dominer les 64D GRU hidden

**Impact**: Le GRU pourrait apprendre des patterns de séquence liés aux signatures.
**Effort**: Élevé — nouveau feature engineering + retraining.

### Priorité recommandée

1. **9.1 Schema-Enriched Embeddings** — quick win, re-embed — **DONE**
2. **9.2 Schema-Aware Negatives** — high impact pour contrastive — defer
3. **9.3 Schema Similarity** — improve n8n→MCP mapping — **DONE**
4. **9.4 Tool Clustering** — SHGAT hiérarchique uniquement, **DEFERRED**
5. **9.5 Schema-Conditioned GRU** — highest effort, defer

---

## 10. Training Runs — Résultats

### Run no-KL (terminé, seed=42)

```
Config: --epochs 20 --lr 0.005 --seed 42 --no-kl --eval-every 2
Dataset: 1155 prod train, 107 prod test, 1901 tools, 8984 nodes
```

| Epoch | Loss | Acc | R@1 | R@3 | R@5 | MRR | Notes |
|-------|------|-----|-----|-----|-----|-----|-------|
| 2 | 1.556 | 64.2% | 25.2% | 57.0% | 64.5% | 0.414 | |
| 4 | 1.356 | 72.4% | 38.3% | 49.5% | 57.9% | 0.473 | |
| 6 | 1.264 | 74.6% | 35.5% | 61.7% | 72.9% | 0.501 | |
| 8 | 1.200 | 75.5% | 40.2% | 67.3% | 76.6% | 0.569 | |
| 10 | 1.178 | 75.4% | 43.9% | 73.8% | 77.6% | 0.597 | |
| **12** | **1.115** | **77.7%** | **49.5%** | **72.9%** | **79.4%** | **0.624** | **BEST** |
| 14 | 1.081 | 78.6% | 38.3% | 74.8% | 79.4% | 0.562 | Overfit starts |

**Best: R@1=49.5%, MRR=0.624** (epoch 12). Overfit après epoch 12.

### Run KL (en cours, seed=42)

```
Config: --epochs 20 --lr 0.005 --seed 42 --kl --kl-weight 0.2 --kl-warmup 3 --kl-subsample 2000
```

En cours — résultats à remplir.
