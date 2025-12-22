# ADR-050: Simplification de la Recherche Unifiée

**Status:** Accepted
**Date:** 2025-12-22
**Supersedes:**
- ADR-015 (Dynamic Alpha)
- ADR-022 (Hybrid Search Alpha)
- ADR-038 (Scoring Algorithms Reference) - sections Search et alpha
- ADR-048 (Local Adaptive Alpha)
**Related:** spike `2025-12-21-capability-pathfinding-dijkstra.md`

## Context

### Problème identifié

La formule actuelle de Hybrid Search (ADR-022) est:

```
score = (semantic × α + graph × (1-α)) × reliability
```

Où:
- `semantic` = similarité cosinus avec la query (BGE-M3)
- `graph` = Adamic-Adar relatedness avec les `contextNodes`
- `α` = alpha adaptatif (global ou local via ADR-048)
- `reliability` = facteur basé sur `successRate`

### Le problème fondamental

**En mode Search (Active), il n'y a PAS de contexte.**

L'utilisateur tape une query ("read file"), il n'a pas encore utilisé d'outils. Donc:

```typescript
// Dans computeGraphRelatedness (adamic-adar.ts)
if (contextNodes.length === 0) return 0;  // ← Toujours 0!
```

**Conséquence:** `graphScore = 0` pour toutes les queries de recherche.

La formule devient:
```
score = (semantic × α + 0 × (1-α)) × reliability
score = semantic × α × reliability
```

L'alpha ne fait que **réduire** le score sémantique sans aucun bénéfice!

### Analyse des benchmarks

| Configuration | Hit@1 | Observation |
|---------------|-------|-------------|
| α=1.0 (pure semantic) | 61.3% | Baseline |
| α=0.5 (balanced) | 64.5% | Légère amélioration (queries avec context) |
| α=0.3 (graph heavy) | 67.7% | Meilleur (mais seulement pour queries avec context) |
| α=local (ADR-048) | 19.4% | **Pire!** Alphas variables perturbent le ranking |

Le benchmark mélangeait **Search** (sans context) et **Prediction** (avec context).

Pour les queries **sans context**, un alpha < 1.0 ne fait que réduire les scores uniformément (ranking préservé) ou de façon variable (ranking perturbé avec local alpha).

### Architecture cible (SHGAT + DR-DSP)

Le spike `2025-12-21-capability-pathfinding-dijkstra.md` définit l'architecture finale:

```
┌─────────────────────────────────────────────────────────────┐
│  1. SEARCH (Active) - unifiedSearch(intent)                 │
│     score = semantic × reliability                          │
│     Rapide, simple, pour recherche utilisateur              │
│                                                             │
│  2. PREDICTION (Forward) - predictNextNode(intent, context) │
│     a) SHGAT(intent) → TARGET capability                    │
│     b) DR-DSP(currentTool, TARGET) → next step              │
│                                                             │
│  3. SUGGESTION (Backward) - pml_execute(intent)             │
│     a) SHGAT(intent) → TARGET capability                    │
│     b) DR-DSP.backward(TARGET) → DAG des dépendances        │
└─────────────────────────────────────────────────────────────┘
```

### Clarification: SHGAT est context-free (2025-12-22)

**Décision:** SHGAT n'utilise **pas** le context pour le scoring.

Le papier original SHGAT (Fujita) ne traite pas du contexte externe. Les benchmarks
de précision ont confirmé que le contextBoost (×0.3) n'apportait **aucune amélioration**
(0% de différence en accuracy).

**SHGAT scoring (context-free):**
```typescript
// Multi-head attention (4 têtes) - All heads normalized to ~0-1 range
const spectralBonus = 1 / (1 + features.spectralCluster);

// Head 2: Structure (graph topology)
const structureScore = (
  0.4 * hypergraphPageRank +  // Global importance
  0.3 * spectralBonus +       // Cluster centrality
  0.3 * adamicAdar            // Neighbor similarity
);

// Head 3: Temporal (usage patterns)
const temporalScore = (
  0.4 * cooccurrence +        // Frequently used together
  0.4 * recency +             // Recently used
  0.2 * heatDiffusion         // Context influence
);

headScores = [
  intentSim,      // Head 0: semantic (~0-1)
  intentSim,      // Head 1: semantic (~0-1)
  structureScore, // Head 2: structure (~0-1)
  temporalScore,  // Head 3: temporal (~0-1)
];
score = sigmoid(weighted_sum(headScores) * reliabilityMult);
```

Le **context** (position actuelle) est géré par **DR-DSP**, pas SHGAT :
- `DR-DSP.findShortestHyperpath(currentTool, targetTool)` utilise le context comme point de départ
- SHGAT ne voit que l'intent et les features du graphe

**Flow complet (Search + Prediction + Suggestion):**
```
┌─────────────────────────────────────────────────────────────┐
│  1. SEARCH (Active) - unifiedSearch(intent)                 │
│     score = semantic × reliability                          │
│     Rapide, simple, pour recherche utilisateur              │
│                                                             │
│  2. PREDICTION (Forward) - predictNextNode(intent, context) │
│     a) SHGAT.scoreAllCapabilities(intent) → TARGET          │
│     b) DR-DSP.findShortestHyperpath(currentTool, TARGET)    │
│     c) Retourne next tool sur le chemin                     │
│                                                             │
│  3. SUGGESTION (Backward) - pml_execute(intent)             │
│     a) SHGAT.scoreAllCapabilities(intent) → TARGET          │
│     b) DR-DSP.backward(TARGET) → DAG des dépendances        │
│     c) Retourne DAG complet (pas de re-scoring, DR-DSP      │
│        utilise déjà les poids basés sur successRate)        │
└─────────────────────────────────────────────────────────────┘
```

**Note:** SHGAT remplace `unifiedSearch` pour Prediction et Suggestion car il
intègre les features du graphe (pageRank, cooccurrence, recency) en plus du
semantic. `unifiedSearch` reste pour le mode Search (plus rapide, suffisant).

## Decision

### 1. Simplifier la formule de Search

**Avant:**
```typescript
score = (semantic × α + graph × (1-α)) × reliability
```

**Après:**
```typescript
score = semantic × reliability
```

Pas d'alpha, pas de graph score (inutile sans context).

### 2. Réserver le graph pour Prediction

Le graph score (Adamic-Adar, co-occurrence) n'a de sens que quand il y a un **contexte** (outils déjà utilisés). C'est le cas en mode **Prediction**, pas en mode **Search**.

### 3. SHGAT remplace les heuristiques alpha

Les algorithmes d'alpha (ADR-048) étaient des **heuristiques manuelles**:
- EmbeddingsHybrides: "Si coherence haute → alpha bas"
- Heat Diffusion: "Si heat haute → alpha bas"
- Bayesian: "Si peu d'observations → alpha haut"

SHGAT apprend ces patterns automatiquement via attention sur les traces épisodiques. Plus besoin de règles manuelles.

### 4. Statut des ADRs précédents

| ADR | Nouveau statut |
|-----|----------------|
| **ADR-015** (Dynamic Alpha) | Superseded - remplacé par SHGAT |
| **ADR-022** (Hybrid Search Alpha) | Superseded - formule simplifiée |
| **ADR-038** (Scoring Algorithms) | Superseded - sections Search/alpha obsolètes, reste référence pour Prediction legacy |
| **ADR-048** (Local Alpha) | Superseded - remplacé par SHGAT |

## Implementation

### unifiedSearch simplifié

```typescript
/**
 * Unified Search - Simplified (ADR-050)
 *
 * For Active Search (query only, no context), the formula is simply:
 *   score = semantic × reliability
 *
 * Graph scores are not used because there's no context to relate to.
 * SHGAT will handle Prediction mode separately.
 */
export async function unifiedSearch(
  vectorSearch: VectorSearch,
  nodes: Map<string, SearchableNode>,
  query: string,
  options: { limit?: number; minScore?: number } = {}
): Promise<UnifiedSearchResult[]> {
  const { limit = 10, minScore = 0.5 } = options;

  // 1. Semantic search
  const candidates = await vectorSearch.search(query, limit * 2, minScore);

  // 2. Apply reliability factor
  const results = candidates.map(({ nodeId, score: semanticScore }) => {
    const node = nodes.get(nodeId);
    if (!node) return null;

    const reliabilityFactor = calculateReliabilityFactor(node.successRate);
    const finalScore = Math.min(semanticScore * reliabilityFactor, 0.95);

    return {
      nodeId,
      nodeType: node.type,
      name: node.name,
      description: node.description,
      semanticScore,
      reliabilityFactor,
      finalScore,
      serverId: node.serverId,
    };
  }).filter(Boolean);

  // 3. Sort and limit
  results.sort((a, b) => b.finalScore - a.finalScore);
  return results.slice(0, limit);
}
```

### Reliability factor (inchangé)

```typescript
function calculateReliabilityFactor(successRate: number): number {
  if (successRate < 0.5) return 0.1;      // Pénalité
  if (successRate > 0.9) return 1.2;      // Boost
  return 1.0;                              // Neutre
}
```

## Consequences

### Positives

1. **Simplicité** - Formule claire et facile à comprendre
2. **Performance** - Pas de calcul de graph score inutile
3. **Prédictibilité** - Le ranking reflète directement la similarité sémantique
4. **Préparation SHGAT** - Architecture clean pour intégrer SHGAT en Prediction

### Negatives

1. **Perte du graph en Search** - Mais il n'apportait rien sans context
2. **ADR-048 devient obsolète** - Travail "perdu", mais c'était transitoire

### Neutres

1. **Reliability reste** - C'est toujours utile de pénaliser les outils peu fiables

## Migration

1. Mettre à jour `src/graphrag/algorithms/unified-search.ts` avec la formule simplifiée
2. Supprimer les paramètres `alpha`, `localAlphaCalculator`, `contextNodes` de `UnifiedSearchOptions`
3. Mettre à jour les tests et benchmarks
4. Marquer ADR-022 et ADR-048 comme obsolètes pour Search

## Future Work

1. **Implémenter SHGAT** pour Prediction (intent + context → ranked candidates)
2. **Implémenter DR-DSP** pour DAG Suggestion (shortest hyperpath)
3. **Retirer le code alpha** une fois SHGAT stable

## References

- ADR-015: Dynamic Alpha (superseded)
- ADR-022: Hybrid Search Alpha (superseded)
- ADR-038: Scoring Algorithms Reference (superseded pour Search)
- ADR-048: Local Adaptive Alpha (superseded)
- Spike: `2025-12-21-capability-pathfinding-dijkstra.md`
