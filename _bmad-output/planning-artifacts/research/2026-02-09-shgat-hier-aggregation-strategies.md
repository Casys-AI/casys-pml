# Strategies pour corriger SHGAT-Hier sur LiveMCPBench

**Date:** 2026-02-09
**Statut:** Synthese complete
**Auteurs:** ml-code-analyst, report-analyst, benchmark-analyst (equipe shgat-hier-fix)
**Contexte:** LiveMCPBench — 525 tools, 69 MCP servers, 8 categories, 3 niveaux

---

## 1. Diagnostic

### 1.1 Resultats observes

| Scorer | R@1 | R@5 | R@10 | NDCG@5 | NDCG@10 |
|--------|-----|-----|------|--------|---------|
| Cosine (baseline) | 14.4% | 32.2% | 43.3% | 22.0% | 27.0% |
| SHGAT-Flat (16-head ortho) | 15.9% | 33.3% | 43.3% | 23.0% | 27.6% |
| **SHGAT-Hier (3L MP)** | **3.4%** | **10.0%** | **17.8%** | **6.2%** | **9.3%** |

SHGAT-Flat surpasse legerement Cosine (+1.5pp R@1) : la projection orthogonale K-head
fonctionne. Mais SHGAT-Hier collapse a 3.4% R@1 — 4x pire que le baseline.

### 1.2 Cause racine : dilution en cascade

Le collapse provient de 6 facteurs qui s'amplifient mutuellement :

1. **Construction des parents par mean pooling.** Les embeddings L1 (servers) et L2 (categories)
   sont des moyennes des enfants. Avec 7-8 tools par serveur, la moyenne dilue le signal
   discriminant de chaque outil individuel.

2. **Attention vectors aleatoires (Option A).** Sans entrainement, les vecteurs d'attention
   `a_upward` et `a_downward` sont initialises par Xavier random. Le softmax sur des scores
   aleatoires produit une attention quasi-uniforme — aucune specialisation.

3. **Upward pass remplace les embeddings parents.** L'aggregation V→E remplace E^0 par
   la somme attentionnelle des children. Comme l'attention est uniforme (point 2), le resultat
   est proche du mean pooling original — pas de gain.

4. **Downward pass sans residual (alpha=0).** C'est le facteur critique.
   Dans `multi-level-orchestrator.ts:488-494` :
   ```typescript
   const alpha = config.downwardResidual ?? 0;  // DEFAULT = 0
   // E_new = (1-0)*propagated + 0*original = 100% propagated
   ```
   Les embeddings L0 (tools) sont **entierement remplaces** par le signal descendant
   des parents dilues. L'information discriminante des tools BGE-M3 originaux est perdue.

5. **preserveDimResidual=0.3 insuffisant.** Apres le MP, `forward-helpers.ts:418` applique :
   ```
   final = 0.7 * propagated + 0.3 * original
   ```
   30% du signal original ne compense pas la corruption a 100% subie durant le downward pass.

6. **K-head scoring sur embeddings degrades.** Le scorer opere sur des embeddings qui ne
   representent plus les tools individuels mais un melange diffus de la hierarchie.

### 1.3 Bug d'inconsistance identifie

`forwardMultiLevel` (utilise par le benchmark) et `forwardMultiLevelWithCache` (utilise
pour le training) implementent le downward residual differemment :

| Methode | Formule downward | Fichier:ligne |
|---------|-----------------|---------------|
| `forwardMultiLevel` | `(1-alpha)*propagated + alpha*original` | orchestrator.ts:488-494 |
| `forwardMultiLevelWithCache` | `original + propagated` (additif) | orchestrator.ts:787-789 |

Avec alpha=0, `forwardMultiLevel` donne 100% propagated. `forwardMultiLevelWithCache` fait
une addition sans alpha — comportement completement different. C'est un bug a corriger
independamment des strategies ci-dessous.

### 1.4 Pourquoi SHGAT-Flat fonctionne

SHGAT-Flat n'a aucun noeud composite (children=[] pour tous les nodes).
Consequence : `forwardCore` detecte `capabilityNodes.size === 0`, saute le MP,
et retourne les embeddings BGE-M3 intacts. Le K-head scoring opere sur les embeddings
originaux, ce qui explique le gain marginal vs cosine brut (+1.5pp R@1).

---

## 2. Ce qui existe deja dans le code

### 2.1 Parametres configurables (sans modification de code)

| Parametre | Default | Effet | Fichier |
|-----------|---------|-------|---------|
| `downwardResidual` | 0 | Weight du residual dans le downward pass | types.ts:317 |
| `preserveDimResidual` | 0.3 | Residual post-MP global | types.ts:313 |
| `preserveDimResiduals` | [] | Residual post-MP par niveau | types.ts (config) |
| `v2vResidual` | 0 | Residual dans le V2V pre-phase | types.ts:316 |
| `preserveDim` | true | Garde dim=1024 durant le MP | types.ts:312 |
| `numHeads` | 16 | Nombre de heads d'attention | types.ts:303 |
| `leakyReluSlope` | 0.2 | Pente negative du LeakyReLU | types.ts:334 |
| `numLayers` | 2 | Nombre de layers GAT | types.ts:307 |

### 2.2 Mecanismes codes mais non utilises

**Learnable per-level residuals** (`forward-helpers.ts:384-408`) :
Residuals adaptatifs par niveau avec logits apprenables. Necessite le training loop
(pas compatible Option A no-training).

**V2V pre-phase** (`vertex-to-vertex-phase.ts`) :
Enrichit les tool embeddings avec les co-occurrences avant le MP hierachique.
Parametres: `residualWeight`, `useAttention`, `temperature` (tous apprenables).
Desactive par defaut (`v2vResidual=0`).

**Tensor-native forward** (`tensor-forward.ts`) :
Forward pass TF.js 10-20x plus rapide. A son propre handling du residual.
Utilise par `scoreNodes()` dans le SHGAT principal mais pas par le benchmark.

### 2.3 Initialisation des projections MP

Avec `preserveDim=true`, les matrices `W_child` et `W_parent` sont initialisees comme
des quasi-identites (blocs identite + bruit Xavier faible). Cela signifie que le MP
projette les embeddings dans un sous-espace quasi-identique a l'original, puis le
downward pass ecrase ce signal avec le resultat aggregate.

Les vecteurs d'attention (`a_upward`, `a_downward`) sont Xavier random — c'est le seul
composant qui pourrait apporter de la discrimination, mais sans entrainement il est
aleatoire.

---

## 3. Strategies proposees

### 3.1 Quick Win A : Augmenter `downwardResidual` (effort: 0, impact: eleve)

**Principe:** Preserver l'embedding original des tools durant le downward pass.

```typescript
// Dans le benchmark : run-livemcp.ts
const scorer = await SHGATBuilder.create()
  .nodes(nodes)
  .architecture({ downwardResidual: 0.9 })  // 90% original, 10% propagated
  .build();
```

**Pourquoi ca devrait marcher:** Avec `downwardResidual=0.9`, les embeddings tools restent
a 90% les originaux BGE-M3 + 10% signal hierarchique. Le K-head scoring opere alors sur
des embeddings quasi-intacts mais legerement enrichis par la structure.

**Valeurs a tester:** 0.7, 0.8, 0.9, 0.95, 1.0 (1.0 = ignorer le MP completement).

**Attention:** `downwardResidual` n'est PAS expose par `ArchitectureOptions` dans le builder.
Il faut soit l'ajouter au builder, soit passer la config directement. Actuellement il transite
via `forwardMultiLevel` config arg (`forward-helpers.ts:361`).

**Prediction:** Avec alpha=0.9, SHGAT-Hier devrait se rapprocher de SHGAT-Flat (~15% R@1)
voire le depasser si le 10% de signal hierarchique apporte de l'info utile.

### 3.2 Quick Win B : Augmenter `preserveDimResidual` (effort: 0, impact: moyen)

**Principe:** Renforcer le residual post-MP pour compenser la dilution.

```typescript
// preserveDimResidual = 0.8 → 80% original + 20% MP
```

**Limite:** Ce residual s'applique APRES le MP complet. Si le downward pass a deja
completement corrompu les embeddings (alpha=0), meme un residual de 0.9 post-MP ne
suffit pas : `0.1 * corrupted + 0.9 * original` est meilleur mais le scoring perd
la contribution hierarchique.

**Meilleur en combo:** Combiner avec Quick Win A pour un double residual.

### 3.3 Quick Win C : Residuels par niveau (effort: minimal, impact: moyen)

**Principe:** Appliquer un residual plus fort aux niveaux hauts (L2 categories) ou la
dilution est maximale, et plus faible aux niveaux bas (L0 tools).

```typescript
// preserveDimResiduals = [0.3, 0.6, 0.9]
// L0 tools: 30% original (le MP peut les enrichir)
// L1 servers: 60% original (dilution moderee)
// L2 categories: 90% original (dilution maximale)
```

Deja code dans `forward-helpers.ts:409-415`.

### 3.4 Medium Effort : Attention-weighted aggregation au lieu de mean pooling (effort: moyen, impact: eleve)

**Principe:** Remplacer le mean pooling dans la construction des embeddings parents par
une aggregation attentionnelle.

Actuellement dans `run-livemcp.ts:178` et `shgat-scorer.ts:106` :
```typescript
// Mean pooling — dilue le signal
const meanEmb = meanEmbedding(apis.map((a) => a.embedding), dim);
```

**Alternative:** Utiliser les embeddings originaux des enfants et laisser l'attention
GAT (deja codee dans les phases V→E et E→E) faire l'aggregation.

**Implementation:** Ne pas pre-calculer d'embedding parent. A la place, passer un
embedding zero ou aleatoire pour les parents et compter sur le upward pass pour les
construire via attention.

**Risque:** Sans entrainement, l'attention est aleatoire. La mean pooling donne au
moins un signal stable. L'attention aleatoire pourrait donner un signal plus bruite.

**Mitigation:** Initialiser les embeddings parents comme la moyenne des enfants
(comme actuellement) mais avec `downwardResidual` eleve (0.8+) pour que le signal
descendant soit un complement, pas un remplacement.

### 3.5 Medium Effort : Max-pooling au lieu de mean-pooling (effort: faible, impact: a tester)

**Principe:** Remplacer le mean pooling par un max pooling element-wise.

```typescript
function maxEmbedding(embeddings: number[][], dim: number): number[] {
  const result = new Array(dim).fill(-Infinity);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      result[i] = Math.max(result[i], emb[i]);
    }
  }
  return result;
}
```

**Avantage:** Preserve les features saillantes au lieu de les diluer. Un serveur qui
contient un outil de "database query" conservera les dimensions fortement activees
par ce concept, meme si les autres outils du serveur ont des patterns differents.

**Inconvenient:** Introduit un biais vers les valeurs extremes. Moins stable que la
moyenne pour des embeddings normalises L2 (les max d'embeddings L2-normalises ne sont
pas L2-normalises).

### 3.6 Option radicale : Hierarchie comme edges seulement (effort: eleve, impact: potentiellement eleve)

**Principe:** Ne pas creer de noeuds parents du tout. Utiliser la hierarchie uniquement
comme information de connectivite entre les outils feuilles.

Concretement :
- Tous les 525 outils restent des feuilles
- Deux outils du meme serveur partagent un edge "co-server"
- Deux outils de la meme categorie partagent un edge "co-category"
- Le V2V pre-phase (deja code) enrichit chaque outil via l'attention sur ses co-occurrents

**Avantage:** Pas de mean pooling, pas de noeuds composites dilues, pas de downward pass.
Les embeddings restent les originaux BGE-M3, enrichis par un signal de co-occurrence
structurelle.

**Inconvenient:** Completement incompatible avec le pipeline multi-level actuel.
Necessite de repenser l'architecture.

### 3.7 Option training leger : Freeze K-head, train MP seulement (effort: moyen-eleve, impact: a valider)

**Principe:** Garder les projections K-head orthogonales (gelees, Option A) mais
entrainer uniquement les parametres du message passing (vecteurs `a_upward`, `a_downward`,
et eventuellement `W_child`, `W_parent`).

**Parametres a entrainer :** ~66K (16 heads x 2 vecteurs attention x ~2048 dim)
au lieu de ~2M (K-head complet).

**Avantage:** L'attention n'est plus aleatoire — elle apprend a ponderer les enfants
de maniere discriminante. Le downward pass transmet alors de l'information utile
au lieu de bruit moyen.

**Inconvenient:** Necessite des labels d'entrainement (queries + ground truth).
LiveMCPBench en fournit (95 queries avec ground truth) mais c'est insuffisant
pour 66K parametres (ratio 1:700). Necessite augmentation de donnees ou cross-validation.

**Pre-requis:** Corriger le bug d'inconsistance entre `forwardMultiLevel` et
`forwardMultiLevelWithCache` (section 1.3).

---

## 4. Plan d'experimentation

### Phase 1 : Config-only (30 min, zero code)

Tester les Quick Wins A+B+C en variant les parametres. Le benchmark `run-livemcp.ts`
doit etre modifie pour passer les options de config au builder.

**Experience 1.1 — downwardResidual sweep:**
```
downwardResidual = [0.0, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0]
preserveDimResidual = 0.3 (defaut)
```
Objectif : trouver le alpha optimal. Prediction : optimum entre 0.8 et 0.95.

**Experience 1.2 — preserveDimResidual sweep (avec meilleur downwardResidual):**
```
downwardResidual = [meilleur de 1.1]
preserveDimResidual = [0.3, 0.5, 0.7, 0.9]
```

**Experience 1.3 — residuels par niveau:**
```
downwardResidual = [meilleur de 1.1]
preserveDimResiduals = [0.3, 0.6, 0.9]  // L0, L1, L2
```

**Critere de succes Phase 1:** SHGAT-Hier R@1 >= 14.4% (= baseline cosine).

### Phase 2 : Aggregation alternative (2h, modification benchmark)

Si Phase 1 ne suffit pas, changer l'aggregation des embeddings parents.

**Experience 2.1 — Max pooling:**
Remplacer `meanEmbedding` par `maxEmbedding` dans `run-livemcp.ts` et `shgat-scorer.ts`.

**Experience 2.2 — Attention-weighted init:**
Initialiser les parents avec l'embedding du child le plus "representative"
(embedding le plus proche de la moyenne) au lieu de la moyenne.

### Phase 3 : Architecture (1-2 jours)

**Experience 3.1 — V2V pre-enrichment:**
Activer le V2V phase avec les co-occurrences par serveur/categorie.
```
v2vResidual = 0.3
```

**Experience 3.2 — Edges-only (section 3.6):**
Si tout le reste echoue, implanter la hierarchie en edges seulement.

### Phase 4 : Training leger (2-3 jours)

**Experience 4.1 — MP-only training:**
Corriger le bug d'inconsistance, freeze K-head, train MP sur les 95 queries
LiveMCPBench avec augmentation (paraphrases -> 500 queries).

---

## 5. Metriques de succes

| Palier | R@1 | R@5 | NDCG@5 | Verdict |
|--------|-----|-----|--------|---------|
| **Minimum viable** | >= 14.4% | >= 32.2% | >= 22.0% | Egalise cosine baseline |
| **Objectif** | >= 16% | >= 35% | >= 25% | Depasse SHGAT-Flat |
| **Excellent** | >= 20% | >= 40% | >= 30% | Gain significatif (+5pp) |

Le delta SHGAT-Flat vs Cosine (+1.5pp R@1) montre que la projection orthogonale K-head
apporte un gain modeste mais reel. L'objectif est que le MP hierarchique ajoute un
gain supplementaire de +2-4pp par rapport au K-head seul.

---

## 6. Priorites d'implementation

1. **Corriger le bug** d'inconsistance `forwardMultiLevel` vs `forwardMultiLevelWithCache`
2. **Exposer `downwardResidual`** dans le builder (ou directement dans le benchmark)
3. **Executer Phase 1** (sweep de parametres) — priorite maximale, zero risque
4. Si Phase 1 reussit : documenter les resultats, valider sur ToolBench (Phase 2 du roadmap)
5. Si Phase 1 echoue : passer a Phase 2 (aggregation alternative)

---

## 7. Fichiers impactes

| Fichier | Action |
|---------|--------|
| `lib/shgat-tf/src/message-passing/multi-level-orchestrator.ts` | Bug fix: aligner `forwardMultiLevelWithCache` sur `forwardMultiLevel` |
| `lib/shgat-tf/src/core/types.ts` | Aucune modification (defaults documentes) |
| `lib/shgat-tf/src/core/builder.ts` | Exposer `downwardResidual` dans `ArchitectureOptions` |
| `lib/shgat-tf/benchmark/src/run-livemcp.ts` | Ajouter param sweep + passer config au builder |
| `lib/shgat-tf/benchmark/src/shgat-scorer.ts` | (Phase 2) Remplacer `meanEmbedding` par alternatives |
| `lib/shgat-tf/src/core/forward-helpers.ts` | Aucune modification (residuels per-level deja codes) |

---

## References

- ADR no-training: `lib/shgat-tf/docs/2026-02-08-no-training-decision.md`
- Benchmark roadmap: `lib/shgat-tf/docs/2026-02-09-benchmark-roadmap.md`
- Projection head analysis: `_bmad-output/implementation-artifacts/tech-specs/2026-02-07-projection-head-theoretical-analysis.md`
- Velickovic et al. (2018), "Graph Attention Networks", ICLR 2018
- Johnson-Lindenstrauss (1984), dimension reduction lemma
- Li et al. (2025), "LiveMCPBench", arXiv:2508.01780
