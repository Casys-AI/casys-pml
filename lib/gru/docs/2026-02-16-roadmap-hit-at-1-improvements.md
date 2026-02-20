# GRU Hit@1 Improvement Roadmap

**Date**: 2026-02-16
**Baseline**: Hit@1 = 69.0% (NO_SHGAT ep22/30), 65.5% (PaperMP random ep28/30), K-fold mean 60.6%
**Target réaliste**: ~68-73% Hit@1 (consensus expert panel v1) — **ATTEINT** par noshgat=69.0%
**Nouveau target**: >69.0% (doit battre le GRU sans SHGAT)

## Expert Panel (2026-02-16)

**Participants**: ml-expert (sequence modeling), data-engineer (IR / data engineering)

**Consensus**:
- 80-85% **irréaliste** avec les données actuelles (3100 exemples, 258K params)
- Schema reranker Jaccard post-cosine = **SKIP** (polishing +0.5pp, ROI trop faible)
- Cosine threshold 0.70→0.80 = quick win unanime
- InfoNCE nécessite label smoothing (PAS de hard argmax) — top-3 [0.7, 0.2, 0.1]

**Désaccord**: DAG fix en P0 (data-engineer, +3-5pp) vs P2 (ml-expert, +0-2pp).
Argument data-engineer retenu : 258K params / 3100 ex = pas de budget pour ignorer le bruit corrélé. Principe : fix data first, fix loss second.

---

## Benchmark Results (2026-02-16, seed=42, 30 epochs)

| Config | Best Hit@1 | Best Epoch | MRR | Notes |
|---|---|---|---|---|
| **gru-noshgat** (NO_SHGAT, linear ctx) | **69.0%** | 22 | 0.779 | **Meilleur résultat** |
| **gru-frozen** (PaperMP random, linear ctx) | 65.5% | 28 | 0.768 | Random MP **dégrade** -3.5pp |
| **gru-edges** (NO_SHGAT, causal edges) | 58.3% | 6 | 0.719 | Causal edges **nuisent** -10.7pp |

**Findings critiques:**
- Le GRU SANS enrichissement MP est le meilleur (69.0%)
- Le MP random injecte du bruit destructif (-3.5pp)
- Les causal edges réduisent le contexte et créent un mismatch train/inference (-10.7pp)

---

## Expert Panel v3 — PaperMP Training (2026-02-16)

**Participants**: ml-expert (sequence modeling / GNN), data-engineer (IR / data quality)

### Consensus unanime

| Point | Décision |
|---|---|
| Causal edges (P1) | **REVERTER** — le contexte large est un feature pour le GRU séquentiel, pas du bruit |
| Scoring PaperMP | Cosine directe (intent, enriched_tool), PAS de W_intent supplémentaire |
| Backward pass | Single-level L0→L1 suffisant (99% des relations) |
| Geler W ou W1 | Non — entraîner les deux ensemble |
| LR | ~0.001, warmup 2 epochs, cosine decay |
| gru-noshgat=69% | C'est le **vrai baseline** à battre |

### Désaccords

| Point | ml-expert | data-engineer |
|---|---|---|
| Ratio params/data | 16 params/ex (33K) = safe | **87 params/ex effectif** (n8n ≠ data réelle) |
| Epochs | 15-20 (underfitting) | **10 max + early stopping prod** |
| KL vs hard targets | KL weight < 0.1 | **Supprimer KL, passer aux hard targets argmax** |

### Red flags

1. **Le MP clusterise, le GRU a besoin de discriminer** (ml-expert)
   - Le MP fait un moyennage pondéré de siblings → homogénéise intra-capability
   - Le GRU atteint 69% SANS cette clusterisation → elle est redondante voire nuisible
   - "Le training peut au mieux neutraliser l'effet négatif, difficilement dépasser 69%"

2. **55% d'orphelins = problème structurel** (data-engineer)
   - 1065/1932 tools n'ont aucun parent → aucun enrichissement MP
   - Le MP crée 2 populations d'embeddings (enrichis vs raw) → le GRU doit gérer un mismatch
   - Le MP ne reçoit presque pas de gradient prod (si les targets prod sont majoritairement orphelins)

3. **residualAlpha=0.3 trop agressif** (ml-expert)
   - 70% random aggregation + 30% original = destruction de spécificité
   - Recommandation : alpha=0.7-0.9 (préserver 70-90% de l'embedding original)

### Pistes alternatives au MP hiérarchique

1. **V→V co-occurrence contrastive** (les deux experts convergent)
   - 103K edges de co-occurrence n8n couvrent potentiellement TOUS les tools (pas que les 45% connectés)
   - Pas de problème d'orphelins
   - Le V2V code existe déjà (`v2v.ts` dans shgat-for-gru)

2. **Plus de traces prod** — chaque trace vaut infiniment plus que 1000 exemples n8n

3. **Intent augmentation** (paraphrase) — diversifie les intents sans bruit de mapping

### Décisions prises

- **P1 (causal edges) : REVERTÉ** — revenir au mode linear/layerIndex
- **P2 (training PaperMP) : CONDITIONNEL** — tenter avec alpha=0.9, 10 epochs, early stopping prod. Si pas d'amélioration après 3 runs → pivoter vers V→V
- **P2-alt : V→V co-occurrence** — alternative plus prometteuse, à explorer si P2 échoue
- **Pré-requis P2 : hard targets n8n** (seuil 0.80, argmax, subsample 5-7K)

---

## Plan d'exécution

### P0. Monter MIN_COSINE_SIM 0.70 → 0.80

**Impact**: +0.5-1pp
**Effort**: 30 min
**Statut**: DONE (2026-02-16)

Coupe les mappings n8n les plus bruités dans `build-soft-targets.ts`. Zero risque, baseline propre.

**Fichier**: `lib/gru/src/n8n/build-soft-targets.ts` (constante `MIN_COSINE_SIM`)

---

### P1. ~~Fix DAG Ancestor Contamination~~ → INVALIDÉE

**Impact**: **-11.6pp** (contraire de l'attendu)
**Effort**: 1 jour
**Statut**: INVALIDÉE (2026-02-16) — les edges réduisent le contexte, le GRU a besoin du contexte complet

#### Hypothèse (invalidée)

Les branches parallèles du DAG "polluent" le contexte GRU → les retirer devrait aider.

#### Résultat

| Config | Epoch 1 | Best |
|--------|---------|------|
| NO_EDGES (linear ctx) | 55.3% | ~69% (proj.) |
| Causal edges (fix BFS ordre) | 43.7% | ~58% (plafonné) |

#### Analyse

Le GRU est un modèle **séquentiel de co-occurrence**, pas de causalité. Il a besoin de TOUT le contexte :
- Les branches parallèles = signal positif ("dans ce workflow, on utilise aussi X")
- Retirer des outils = retirer du signal → moins de patterns apprenables

#### Conclusion

**Les edges sont pour le message passing (SHGAT), pas pour le contexte GRU.**

- Edges `sequence/contains/provides` → définissent le graphe pour V→E→V (PaperMP)
- Contexte GRU → toujours linear (tous les outils avant le courant)
- Flag `NO_EDGES=true` ajouté pour forcer linear fallback dans benchmark-e2e.ts

#### Fichiers modifiés

- `lib/gru/src/training-utils.ts` — Fix BFS order (correct mais inutile pour le GRU)
- `lib/gru/src/benchmark-e2e.ts` — Ajout flag `NO_EDGES=true` pour A/B test

---

### P2. Entraîner PaperMP directement (remplace SHGAT-TF)

**Impact**: +3-5pp (meilleurs embeddings enrichis pour le GRU)
**Effort**: 2-3 jours
**Statut**: EN COURS (2026-02-16)

#### Avancée

| Étape | Statut | Détails |
|-------|--------|---------|
| 1. Backward pass (`paper-mp.ts`) | **DONE** | `enrichWithCache()` + `backward()`, gradient dW/dW1 |
| 2. Gradient numérique validation | **DONE** | 26/26 tests PASS, maxRelErr dW=1.6e-6, dW1=2.5e-6 |
| 3. Training script | TODO | `train-paper-mp.ts` — InfoNCE + Adam |
| 4. Intégrer dans benchmark | TODO | Charger params entraînés, re-benchmark |

#### Implémentation backward (2026-02-16)

**Méthodes ajoutées à `PaperMP`** (`lib/shgat-for-gru/src/paper-mp.ts`):

- `enrichWithCache()`: forward pass identique à `enrich()` mais cache tous les intermédiaires (projections, attention weights, pre-activations) dans `PaperMPForwardCache`
- `backward(cache, dH)`: backprop analytique à travers Phase 2 (E→V) puis Phase 1 (V→E), retourne `{ dW, dW1 }`

**Simplification clé**: seul le niveau L0→L1 affecte les embeddings enrichis H. Les niveaux supérieurs modifient les E mais pas H (le forward est bottom-up, H est mis à jour en premier). Donc le backward ne traverse qu'un seul niveau.

**Types de cache** (`PaperMPForwardCache`, `LevelCache`, `P1ParentCache`, `P2ChildCache`):
- Per-parent Phase 1: childIndices, rawScores (pré-LeakyReLU), attn (softmax), aggPreAct
- Per-child Phase 2: parentIndices, rawScores, attn, aggPreAct
- Per-level: projections W/W1, embeddings sauvegardés, connectivité

**Tests** (`lib/shgat-for-gru/src/__tests__/paper-mp.test.ts`):
- Gradient numérique (finite differences, eps=1e-5) pour dW et dW1
- Vérification `enrichWithCache()` = `enrich()` (delta < 1e-10)

#### Décision architecturale

**Drop SHGAT-TF**, entraîner PaperMP directement.

| | SHGAT-TF (abandonné) | PaperMP (retenu) |
|---|---|---|
| Params | 7.35M | 525K |
| Archi | Custom multi-head, K-head scoring | Fidèle au papier Fujita n-SuHGAT |
| Training | InfoNCE + KL, backward manuel + OpenBLAS | InfoNCE + backward analytique validé |
| Ratio params/data (33K ex) | 223 | **16** |
| Ratio params/data (1155 ex) | 6364 (overfit ep 3) | 455 |
| Compat benchmark | Params incompatibles avec PaperMP | Direct |

#### Solution

1. ~~Ajouter backward pass à `paper-mp.ts`~~ **DONE** — gradient des 2 matrices W, W1 par backprop analytique, validé par gradient numérique
2. **InfoNCE sur 33K exemples** (1155 prod × 3 + 30K n8n) — tous les exemples passent par InfoNCE, pas juste les prod
3. **KL comme régularisateur** sur le subset n8n — garde le gradient dense du KL (distribution sur 10-20 outils) en complément du gradient sparse InfoNCE (1 positif vs négatifs). Le KL a prouvé son utilité (+2.8pp R@1 vs sans KL dans train-ob.ts)
4. Label smoothing adaptatif top-3 (softmax T=0.005 tronqué) + filtre sim ≥ 0.80 pour les targets n8n
5. PAS de hard argmax (avg top-1 sim = 0.796, pas assez discriminant)

#### Récupérer de train-ob.ts (legacy SHGAT-TF)

- Batched forward/backward KL (3.7x speedup) — `batched-kl-backward.test.ts` (11/11 PASS)
- In-place gradient clipping (adam-optimizer.ts)
- KL batch size 128, grad accum 4 steps
- Seed support (mulberry32 PRNG)
- Contrastive InfoNCE loss computation

#### Fichiers concernés

- `lib/shgat-for-gru/src/paper-mp.ts` — ~~ajouter backward pass~~ **DONE**
- `lib/shgat-for-gru/src/train-paper-mp.ts` — nouveau script training (TODO)
- `lib/gru/src/benchmark-e2e.ts` — charger les params entraînés (TODO)

---

### P3. Re-benchmark GRU + PaperMP entraîné

**Impact**: mesure le vrai delta SHGAT
**Effort**: 0.5 jour
**Statut**: TODO (bloqué par P2)

Le benchmark actuel `gru-frozen` utilise PaperMP avec params **random** (`benchmark-e2e.ts:430`).
Après P2, relancer avec les params entraînés pour mesurer le vrai apport du message passing.

---

## Items écartés

### SHGAT-TF archi (ABANDONNÉ, code réutilisé)

7.35M params, overfit systématique epoch 3-4, archi incompatible avec PaperMP.
Remplacé par PaperMP entraînable (P2). Mais le code de training (`train-ob.ts`) a des optimisations précieuses à récupérer : batched KL, gradient clipping, Adam optimizer, seed support.

### Schema Reranker Jaccard (SKIP)

1833 paires cos > 0.90, 906 séparables par Jaccard (49%). Mais impact estimé +0.5pp max — le 3-tier dispatch existant fait déjà le gros du travail. ROI trop faible pour 1 jour d'effort.

### Matching Input→Output (FUTURE)

Infra prête (`output-schema-inferrer.ts`, `PostExecutionService` step 5), peuplé automatiquement à chaque exécution. Couverture insuffisante aujourd'hui. Revisiter quand > 500 outils ont des output schemas.

---

## Changelog

| Date | Action | Résultat |
|------|--------|----------|
| 2026-02-16 | Roadmap créée | Baseline documentée |
| 2026-02-16 | Expert panel v1 | Consensus: 68-73% réaliste, schema reranker SKIP |
| 2026-02-16 | P0: MIN_COSINE_SIM 0.70→0.80 | Coupe les mappings n8n bruités |
| 2026-02-16 | Expert panel v2 (archi 3 couches) | DAG fix = GRU only, InfoNCE = SHGAT-TF only, benchmark PaperMP invalide (params random) |
| 2026-02-16 | P1: DAG causal ancestor fix | Utilise edges sequence+provides de static_structure au lieu de layerIndex |
| 2026-02-16 | Décision: drop SHGAT-TF archi, entraîner PaperMP directement | 525K params, ratio 16 params/ex, archi fidèle au papier |
| 2026-02-16 | Décision: InfoNCE (33K) + KL régularisateur (n8n) | KL prouvé utile (+2.8pp R@1), garde le gradient dense en complément |
