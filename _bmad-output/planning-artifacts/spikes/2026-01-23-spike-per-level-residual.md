# Spike: Per-Level Residual pour SHGAT

**Date**: 2026-01-23
**Statut**: Validated by benchmark
**Auteur**: Claude + User

---

## Contexte

Le SHGAT utilise actuellement un ratio residual fixe (`preserveDimResidual: 0.3`) pour blender les embeddings originaux avec les embeddings propagés :

```
output = α * original + (1-α) * propagated
```

Où `α = 0.3` est fixe pour tous les nœuds.

**Hypothèse** : Le ratio optimal dépend de la complexité/niveau du nœud. Les nœuds simples devraient garder plus de leur embedding original, tandis que les nœuds complexes bénéficient davantage du message passing.

---

## Benchmark Réalisé

### Configuration
- **Dataset**: production-traces (30 caps, 77 queries, 376 training events)
- **Epochs**: 30
- **Learning Rate**: 0.05 (production)
- **Temperature Annealing**: τ=0.10 → τ=0.06 (cosine schedule)
- **Niveaux testés**:
  - L0: Caps simples (0-1 tools)
  - L1: Caps moyennes (2-3 tools)
  - L2: Caps complexes (4+ tools)

### Techniques Comparées

| Technique | Description |
|-----------|-------------|
| Fixed(α=0.3) | Baseline - ratio fixe |
| LearnableScalar | Un seul α appris global |
| PerLevel | Un α appris par niveau de complexité |
| GatingPerNode | Réseau de gating par nœud (highway-style) |
| Hybrid | PerLevel + GatingPerNode combinés |

### Résultats

```
Technique         MRR      Hit@1    Stabilité
─────────────────────────────────────────────────
Cosine baseline  58.5%    39.0%    -
PerLevel         60.6%    53.2%    ✅ Stable (60% sur 30 epochs)
GatingPerNode    61.1%*   53.2%    ❌ Peak puis crash (→11%)
Hybrid           18.6%     9.1%    ❌ Collapse
LearnableScalar  20.9%    11.7%    ❌ Collapse
Fixed(α=0.3)     14.2%     3.9%    ❌ Collapse

* GatingPerNode a atteint 61.1% à epoch 15 puis s'est effondré
```

### Alphas Appris par PerLevel

```
α_L0 = 0.986  →  Caps simples: garder 99% original
α_L1 = 0.167  →  Caps moyennes: garder 17% original (max message passing)
α_L2 = 0.281  →  Caps complexes: garder 28% original
```

**Insight clé**: Les capabilities simples (peu de tools) doivent préserver leur embedding original, tandis que les capabilities de complexité moyenne bénéficient le plus du message passing.

---

## Architecture SHGAT - Points d'Application

PerLevel peut s'appliquer à **3 endroits** dans le pipeline :

### 1. V2V Phase (Tools → Tools)

```typescript
// Fichier: lib/shgat/src/message-passing/vertex-to-vertex-phase.ts
// Actuel:
interface V2VParams {
  residualLogit: number;      // Un seul α
  temperatureLogit: number;
}

// PerLevel:
interface V2VParams {
  residualLogits: number[];   // Un α par "niveau" de tool
  temperatureLogit: number;
}
```

**Critère de niveau pour tools**: Fréquence d'usage, nombre de co-occurrences, ou clustering.

### 2. Multi-Level Message Passing (Downward)

```typescript
// Fichier: lib/shgat/src/message-passing/multi-level-orchestrator.ts
// Lignes ~482-488 et ~530-534

// Actuel (additive simple):
const E_new = capsAtLevelPreDownward.map((row, i) =>
  row.map((val, j) => val + (E_concat[i]?.[j] ?? 0))
);

// PerLevel:
const α = sigmoid(residualLogits[level]);
const E_new = capsAtLevelPreDownward.map((row, i) =>
  row.map((val, j) => α * val + (1 - α) * E_concat[i]?.[j])
);
```

### 3. Final Scoring (preserveDimResidual)

```typescript
// Fichier: lib/shgat/src/core/types.ts
// Ligne ~258

// Actuel:
preserveDimResidual: 0.3,  // Fixe

// PerLevel:
preserveDimResiduals: number[],  // Par niveau de Node.level
```

---

## Implémentation Proposée

### Interface Unifiée

```typescript
/**
 * Configuration PerLevel pour residual connections
 * Applicable à V2V, message passing, et scoring final
 */
interface PerLevelResidualConfig {
  /** Logits par niveau (sigmoid → α) */
  levelLogits: number[];

  /** Nombre max de niveaux supportés */
  maxLevels: number;

  /** Valeur par défaut si niveau > maxLevels */
  defaultLogit: number;
}

/** Valeurs par défaut basées sur benchmark */
const DEFAULT_PER_LEVEL_RESIDUAL: PerLevelResidualConfig = {
  levelLogits: [
    Math.log(0.98 / 0.02),   // L0: α ≈ 0.98
    Math.log(0.17 / 0.83),   // L1: α ≈ 0.17
    Math.log(0.28 / 0.72),   // L2: α ≈ 0.28
  ],
  maxLevels: 3,
  defaultLogit: Math.log(0.3 / 0.7),  // α ≈ 0.3
};
```

### Backward Pass

```typescript
// Gradient pour chaque levelLogit
function backwardPerLevelResidual(
  dOutput: number[][],
  cache: { level: number; alpha: number; original: number[][]; propagated: number[][] }[],
  levelLogits: number[],
  lr: number
): number[] {
  const dLogits = new Array(levelLogits.length).fill(0);

  for (const { level, alpha, original, propagated } of cache) {
    // d(loss)/d(alpha) = sum(dOutput * (original - propagated))
    let dAlpha = 0;
    for (let i = 0; i < dOutput.length; i++) {
      for (let j = 0; j < dOutput[i].length; j++) {
        dAlpha += dOutput[i][j] * (original[i][j] - propagated[i][j]);
      }
    }

    // Chain rule: d(alpha)/d(logit) = sigmoid'(logit) = alpha * (1 - alpha)
    const dLogit = dAlpha * alpha * (1 - alpha);
    dLogits[level] += dLogit;
  }

  return dLogits;
}
```

---

## Complexité d'Implémentation

| Location | Fichiers | Lignes estimées | Priorité |
|----------|----------|-----------------|----------|
| preserveDim (scoring) | types.ts, shgat.ts | ~40 | P0 - Testé par benchmark |
| V2V Phase | vertex-to-vertex-phase.ts | ~60 | P1 |
| Downward MP | multi-level-orchestrator.ts | ~80 | P2 |

**Total estimé**: ~180 lignes de code

---

## Benchmark Multi-Location (Part 2)

### Configuration
- **Epochs**: 15 (réduit pour observer les peaks)
- **Combinaisons testées**: 7 configurations de locations

### Résultats par Location

```
Location(s)            MRR Peak   MRR Final   Hit@1   Stabilité
─────────────────────────────────────────────────────────────────
Cosine baseline          58.5%      58.5%    39.0%   ✅ Stable
PL@Down+Final            60.3%*     39.7%    24.7%   ❌ Peak @ epoch 10, crash
PL@V2V                   54.0%*     21.6%     5.2%   ❌ Peak @ epoch 5, crash
PL@V2V+Down              43.7%      43.7%    35.1%   ⚠️ Meilleur final
PL@V2V+Final             51.7%      41.0%    33.8%   ❌ Crash
PL@Down                  38.9%      35.7%    26.0%   ⚠️ Relativement stable
PL@Final                 52.3%      28.6%    19.5%   ❌ Crash
PL@V2V+Down+Final        28.5%      36.4%    26.0%   ⚠️ Instable

* Peak MRR avant crash
```

### Learning Curves Multi-Location

```
Epoch   PL@Down+Final   PL@V2V   PL@V2V+Down
────────────────────────────────────────────
1            22.2%      30.7%        9.2%
5            59.2%      54.0%       34.6%
10           60.3%      25.7%       38.1%    ← PL@Down+Final peak
15           39.7%      21.6%       43.7%
```

### Insight Clé: Early Stopping Critique

**PL@Down+Final atteint 60.3% MRR à epoch 10**, battant le baseline cosine, mais crash ensuite. Cela suggère:

1. **Early stopping est obligatoire** - sans validation set, le modèle overfit
2. **Downward + Final est prometteur** avec la bonne stratégie d'arrêt
3. **V2V seul est instable** - les tools ont besoin de plus de régularisation
4. **Combiner les 3 locations amplifie l'instabilité**

### Alphas Appris (Multi-Location)

```
PL@Down+Final @ epoch 10:
  Downward: α_L0 = 1.00, α_L1 = 0.85, α_L2 = 0.32
  Final:    α_L0 = 1.00, α_L1 = 0.85, α_L2 = 0.32

  → L0 (simples): garder 100% original
  → L1 (moyens): garder 85% original
  → L2 (complexes): garder 32% original
```

**Pattern différent du Part 1**: Ici α_L1 est plus élevé (0.85 vs 0.17), suggérant que la combinaison Down+Final nécessite moins de message passing pour les nœuds moyens.

---

## Prochaines Étapes

1. ~~[Fait]~~ Étendre le benchmark pour tester les 3 locations
2. **[Priorité P0]** Implémenter early stopping avec validation set
3. Tester PL@Down+Final avec early stopping
4. Implémenter PerLevel sur preserveDim (scoring final)
5. Valider en production avec monitoring des métriques

---

## Recommandations

### Pour Production

1. **Commencer par PL@Final seul** (moins de risque)
   - Plus simple à implémenter
   - Fallback facile vers α fixe

2. **Ajouter early stopping** basé sur:
   - Validation MRR plateau sur 3 epochs
   - Ou seuil fixe (ex: stop si MRR > 60%)

3. **Monitorer les alphas appris**:
   - α_L0 devrait rester > 0.9 (nœuds simples)
   - α_L1 et α_L2 peuvent varier

### Ce qu'on évite

- **Ne pas utiliser V2V seul** - trop instable
- **Ne pas combiner les 3 locations** sans régularisation supplémentaire
- **Ne pas entraîner plus de 15 epochs** sans early stopping

---

## Fichiers de Référence

- Benchmark: `tests/benchmarks/strategic/residual-techniques-extended.bench.ts`
- V2V Phase: `lib/shgat/src/message-passing/vertex-to-vertex-phase.ts`
- Multi-Level Orchestrator: `lib/shgat/src/message-passing/multi-level-orchestrator.ts`
- Types/Config: `lib/shgat/src/core/types.ts`
- SHGAT Core: `lib/shgat/src/core/shgat.ts`

---

## Statut d'Implémentation dans lib/shgat

### ✅ Fait

1. **Types et Config** (`lib/shgat/src/core/types.ts`)
   - Ajout de `preserveDimResiduals?: number[]` dans la config

2. **Paramètres Learnable** (`lib/shgat/src/initialization/parameters.ts`)
   - Ajout de `residualLogits: number[]` dans `SHGATParams`
   - Initialisation avec `logit(0.3) ≈ -0.847` pour tous les niveaux

3. **Forward Pass** (`lib/shgat/src/core/forward-helpers.ts`)
   - Ajout de `residualLogits` dans `ForwardPassContext`
   - Fonction `applyResidualConnectionPerLevel()` qui applique:
     ```typescript
     α = sigmoid(residualLogits[level])
     output = α * original + (1-α) * propagated
     ```
   - Détection dynamique du niveau max via `ctx.hierarchy?.maxHierarchyLevel`

4. **SHGAT Core** (`lib/shgat/src/core/shgat.ts`)
   - Passage de `residualLogits` au contexte de forward pass

5. **Helpers Graph** (`lib/shgat/src/graph/graph-builder.ts`)
   - `getCapabilityLevels()` - retourne les niveaux des capabilities
   - `getToolLevels()` - retourne les niveaux des tools

6. **Benchmark ToolBench** (`tests/benchmarks/strategic/residual-shgat-toolbench.bench.ts`)
   - Benchmark utilisant le vrai SHGAT avec OpenBLAS
   - Dataset: 5318 APIs, 2000 queries (ToolBench)
   - Hiérarchie: Category (L2) → Tool (L1) → API (L0)

### 🔴 À Faire pour Implémentation Dynamique Complète

1. **Cache pour Backward Pass**

   Le forward pass doit stocker les valeurs intermédiaires pour permettre le backprop:

   ```typescript
   interface ResidualCache {
     original: number[][];      // Embeddings avant message passing
     propagated: number[][];    // Embeddings après message passing
     levels: number[];          // Niveau de chaque node
     alphas: number[];          // sigmoid(logit) calculé pour chaque niveau
   }
   ```

   **Fichiers à modifier**: `forward-helpers.ts` - retourner le cache en plus du résultat

2. **Backward Pass pour residualLogits**

   Implémenter le gradient descent sur les logits:

   ```typescript
   // Gradient: d(loss)/d(logit) = d(loss)/d(α) * d(α)/d(logit)
   // où d(α)/d(logit) = sigmoid'(logit) = α * (1 - α)

   function backwardResidualLogits(
     dOutput: number[][],
     cache: ResidualCache,
     residualLogits: number[],
     lr: number
   ): void {
     const dLogits = new Array(residualLogits.length).fill(0);

     for (let i = 0; i < cache.levels.length; i++) {
       const level = cache.levels[i];
       const alpha = cache.alphas[level];

       // d(loss)/d(alpha) = sum over dims of dOutput * (original - propagated)
       let dAlpha = 0;
       for (let d = 0; d < dOutput[i].length; d++) {
         dAlpha += dOutput[i][d] * (cache.original[i][d] - cache.propagated[i][d]);
       }

       // Chain rule
       dLogits[level] += dAlpha * alpha * (1 - alpha);
     }

     // Update logits
     for (let l = 0; l < residualLogits.length; l++) {
       residualLogits[l] -= lr * dLogits[l];
     }
   }
   ```

   **Fichiers à modifier**: `shgat.ts` ou nouveau fichier `backward-helpers.ts`

3. **Intégration dans trainBatchV1KHeadBatched**

   Le backward pass pour residualLogits doit être appelé après le backward de l'attention:

   ```typescript
   // Dans trainBatchV1KHeadBatched:
   // 1. Forward pass (existant)
   // 2. Compute loss (existant)
   // 3. Backward attention weights (existant)
   // 4. Backward residualLogits (NOUVEAU)
   if (this.residualCache && this.config.preserveDim) {
     backwardResidualLogits(
       dOutput,
       this.residualCache,
       this.params.residualLogits,
       this.config.learningRate
     );
   }
   ```

4. **Supprimer MAX_LEVELS Hardcodé**

   Actuellement dans `parameters.ts`:
   ```typescript
   const MAX_LEVELS = 10;  // ← Arbitraire
   const residualLogits = new Array(MAX_LEVELS).fill(initLogit);
   ```

   Remplacer par:
   ```typescript
   // Initialiser avec le nombre réel de niveaux dans le graphe
   function initResidualLogits(maxLevel: number): number[] {
     const initLogit = Math.log(0.3 / 0.7);
     return new Array(maxLevel + 1).fill(initLogit);
   }
   ```

   **Fichiers à modifier**: `parameters.ts`, `shgat.ts` (passer maxLevel à l'init)

5. **Tests Unitaires**

   - Test forward pass avec différents niveaux
   - Test backward pass: vérifier que les gradients sont corrects
   - Test intégration: vérifier que les logits convergent sur données synthétiques

### Ordre d'Implémentation Suggéré

```
1. Cache forward pass          [~30 lignes]
2. Backward pass function      [~40 lignes]
3. Intégration train batch     [~15 lignes]
4. Dynamic MAX_LEVELS          [~20 lignes]
5. Tests unitaires             [~100 lignes]
────────────────────────────────────────────
Total estimé                   ~200 lignes
```

---

## Session 2026-01-23 (suite) - Implémentation dans shgat-trainer.ts

### ✅ Changements Effectués

1. **Exports des fonctions residual** (`forward-helpers.ts`)
   ```typescript
   export function applyResidualConnection(...)
   export function applyResidualConnectionPerLevel(...)
   ```

2. **Ajout du residual dans le training path** (`shgat-trainer.ts:trainBatchV1KHeadBatchedCore`)
   - Après `forwardMultiLevelWithCache`, application du residual avec création du `residualCache`
   - Appel de `backwardResidualLogits()` avec le cache local

3. **Suppression des fallbacks silencieux**
   - V2V: throw si v2vParams fourni mais V2V non configuré
   - BCE: throw si pas de `negativeCapIds` (InfoNCE requis)
   - Suppression de l'ancien trainer non-batched (`trainBatchV1KHeadCore`)

4. **Fix v2vParams conditionnel**
   ```typescript
   const useV2V = ctx.config.v2vResidual !== undefined && ctx.config.v2vResidual > 0;
   orchestrator.forwardMultiLevelWithCache(..., useV2V ? ctx.v2vParams : undefined);
   ```

5. **Benchmark avec négatives**
   - Ajout de `negativeCapIds` (15 random negatives) dans les exemples d'entraînement

### 🔴 Problème Actuel: PAS D'APPRENTISSAGE

Malgré les fixes, le MRR ne bouge pas entre les epochs:
```
Epoch 1/30: MRR=79.3%, Hit@1=69.0%, Hit@3=88.1%
Epoch 5/30: MRR=79.3%, Hit@1=69.0%, Hit@3=88.1%  ← IDENTIQUE!
```

**Hypothèses à investiguer:**

1. **Gradient pas propagé** - Les paramètres K-head ne reçoivent pas de gradient?
2. **Learning rate trop faible** - 0.05 par défaut, peut-être insuffisant pour InfoNCE?
3. **Score function issue** - `scoreLeaves()` utilisé pour l'éval n'utilise peut-être pas les mêmes params?
4. **Cache stale** - Le forward pass utilise peut-être des embeddings cachés non mis à jour?

### 🔍 Debug à faire

```typescript
// Ajouter dans trainBatchV1KHeadBatchedCore:
console.log('gradNorm:', gradNorm);
console.log('W_q[0][0]:', ctx.params.headParams[0].W_q[0][0]);  // Avant/après

// Dans l'éval:
console.log('Params utilisés:', shgat.params.headParams[0].W_q[0][0]);
```

---

## Conclusion

**PerLevel est la seule technique qui bat le baseline cosine de manière stable.**

- MRR: +3.6% relatif (60.6% vs 58.5%)
- Hit@1: +36% relatif (53.2% vs 39.0%)
- Stabilité: Pas d'overfitting sur 30 epochs

Les autres techniques (GatingPerNode, Hybrid, LearnableScalar) overfittent ou collapsent. PerLevel offre le meilleur compromis simplicité/performance/stabilité.
