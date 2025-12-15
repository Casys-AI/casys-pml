# ADR-048: Local Adaptive Alpha by Mode

**Status:** Accepted (Implemented)
**Date:** 2025-12-15
**Related:** ADR-015 (Dynamic Alpha), ADR-026 (Cold Start), ADR-038 (Scoring Algorithms), ADR-042 (Capability Hyperedges)

## Context

### Problème avec l'Alpha Global

L'alpha actuel (ADR-015, ADR-026) est calculé sur la **densité globale** du graphe :

```typescript
const density = totalEdges / maxPossibleEdges;  // Global
const alpha = Math.max(0.5, 1.0 - density * 2);  // Même pour tous les nœuds
```

**Problème identifié :** Dans un hypergraphe de Tools/Capabilities/MetaCapabilities, certaines zones sont denses et bien connectées, tandis que d'autres sont isolées. Un alpha global ne capture pas cette hétérogénéité.

### Cas problématiques

```
┌─────────────────────────────────────────────────────────┐
│                    HYPERGRAPHE                          │
│                                                         │
│  ┌──────────────────┐       ┌──────────────────┐       │
│  │  Cluster A       │       │  Cluster B       │       │
│  │  (File Ops)      │       │  (ML - isolé)    │       │
│  │                  │       │                  │       │
│  │  ●──●──●──●      │       │       ●          │       │
│  │  │╲ │ ╱│ ╲│      │       │                  │       │
│  │  ●──●──●──●      │       │                  │       │
│  │  Densité: 0.8    │       │  Densité: 0.0    │       │
│  └──────────────────┘       └──────────────────┘       │
│                                                         │
│  Densité GLOBALE = 0.15                                │
│  Alpha GLOBAL = 0.7                                    │
│                                                         │
│  PROBLÈME:                                             │
│  - Cluster A devrait avoir alpha ≈ 0.5 (graphe utile)  │
│  - Cluster B devrait avoir alpha ≈ 1.0 (semantic only) │
│  - Mais les deux ont alpha = 0.7 !                     │
└─────────────────────────────────────────────────────────┘
```

### Structure Hiérarchique

Le système a une hiérarchie naturelle :

```
MetaCapabilities (∞, émergentes)
       │ contains
       ▼
Capabilities (dependency, sequence, alternative)
       │ contains
       ▼
Tools (co-occurrence, edges directs)
```

Les MetaCapabilities sont **infinies** et **émergentes** - elles se créent dynamiquement à partir des patterns d'usage. L'alpha doit respecter cette hiérarchie.

## Decision

Comme pour les algorithmes de scoring (ADR-038), utiliser **différents algorithmes d'alpha selon le mode et le type d'objet**.

### Matrice des Algorithmes Alpha

| Mode | Type | Algorithme | Rationale |
|------|------|------------|-----------|
| **Active Search** | Tool | Embeddings Hybrides | Query explicite → comparer semantic vs structure |
| **Active Search** | Capability | Embeddings Hybrides | Idem |
| **Passive Suggestion** | Tool | Heat Diffusion | Propagation depuis le contexte |
| **Passive Suggestion** | Capability | Heat Diffusion Hiérarchique | Respecte Tool→Cap→Meta |
| **Cold Start** | Tous | Bayésien (prior) | Observations insuffisantes → incertitude haute |

### Alignement avec ADR-038

```
ADR-038 (Scoring Algorithms):
┌─────────────────┬────────────────────┬─────────────────────┐
│                 │ Active Search      │ Passive Suggestion  │
├─────────────────┼────────────────────┼─────────────────────┤
│ Tool            │ Hybrid Search      │ Next Step Predict   │
│ Capability      │ Capability Match   │ Strategic Discovery │
└─────────────────┴────────────────────┴─────────────────────┘

ADR-048 (Alpha Algorithms):
┌─────────────────┬────────────────────┬─────────────────────┐
│                 │ Active Search      │ Passive Suggestion  │
├─────────────────┼────────────────────┼─────────────────────┤
│ Tool            │ Emb. Hybrides      │ Heat Diffusion      │
│ Capability      │ Emb. Hybrides      │ Heat Diffusion Hier.│
└─────────────────┴────────────────────┴─────────────────────┘

+ Fallback Bayésien si observations < seuil (Cold Start)
```

---

## 1. Embeddings Hybrides (Active Search)

**Utilisé pour :** Active Search (Tool & Capability)

**Principe :** Comparer l'embedding sémantique (BGE-M3) avec l'embedding structurel (vecteurs propres du Laplacien) pour mesurer la **cohérence** entre ce que dit le texte et ce que dit la structure.

### Rationale

En mode Active Search, on a une **query explicite**. La question est : "Le graphe confirme-t-il ce que la sémantique suggère ?"

- Si les deux embeddings sont proches → le graphe renforce la sémantique → alpha bas
- Si les deux embeddings divergent → incohérence → faire confiance au semantic seul → alpha haut

### Implémentation

```typescript
/**
 * Calcule l'alpha local via cohérence des embeddings (Active Search)
 *
 * @param nodeId - ID du nœud cible
 * @returns Alpha entre 0.5 et 1.0
 */
function computeAlphaEmbeddingsHybrides(nodeId: string): number {
  // Embedding sémantique (BGE-M3) - déjà calculé
  const semanticEmb = getSemanticEmbedding(nodeId);

  // Embedding structurel (vecteurs propres du Laplacien)
  // Réutilise le calcul de SpectralClusteringManager.computeClusters()
  const structuralEmb = getStructuralEmbedding(nodeId);

  if (!semanticEmb || !structuralEmb) {
    return 1.0; // Fallback: semantic only
  }

  // Cohérence = similarité cosinus entre les deux embeddings
  const coherence = cosineSimilarity(
    normalizeEmbedding(semanticEmb),
    normalizeEmbedding(structuralEmb)
  );

  // Cohérence haute → graphe fiable → alpha bas
  // Cohérence basse → incohérence → alpha haut
  return Math.max(0.5, 1.0 - coherence * 0.5);
}

/**
 * Récupère l'embedding structurel depuis le Spectral Clustering
 */
function getStructuralEmbedding(nodeId: string): number[] | null {
  const spectral = getSpectralClusteringManager();
  if (!spectral.hasComputedClusters()) return null;

  const nodeIndex = spectral.getNodeIndex(nodeId);
  if (nodeIndex === -1) return null;

  // Les k premiers vecteurs propres forment l'embedding structurel
  return spectral.getEmbeddingRow(nodeIndex);
}
```

### Briques existantes

| Composant | Statut | Location |
|-----------|--------|----------|
| Embedding sémantique (BGE-M3) | ✅ Existe | `src/vector/embeddings.ts` |
| Embedding structurel | ✅ Existe | `SpectralClusteringManager.computeClusters()` ligne 312-318 |
| Cosine similarity | ✅ Existe | Utilitaire standard |

---

## 2. Heat Diffusion (Passive Suggestion - Tools)

**Utilisé pour :** Passive Suggestion de Tools

**Principe :** La "chaleur" représente la **confiance structurelle** locale. Elle se propage depuis les zones denses vers les zones sparse.

### Rationale

En mode Passive Suggestion, on n'a **pas de query** - juste un contexte (outils déjà utilisés). La question est : "Y a-t-il de la structure utile autour du nœud cible, depuis là où on est ?"

- Zone dense et bien connectée au contexte → chaleur haute → alpha bas
- Zone sparse ou déconnectée du contexte → chaleur basse → alpha haut

### Implémentation

```typescript
/**
 * Calcule l'alpha local via Heat Diffusion (Passive Suggestion Tools)
 *
 * @param targetNodeId - ID du nœud cible
 * @param contextNodes - Tools déjà utilisés dans le workflow
 * @returns Alpha entre 0.5 et 1.0
 */
function computeAlphaHeatDiffusion(
  targetNodeId: string,
  contextNodes: string[]
): number {
  // Chaleur intrinsèque du nœud (basée sur son degré)
  const targetHeat = computeLocalHeat(targetNodeId);

  // Chaleur du contexte (d'où on vient)
  const contextHeat = contextNodes.length > 0
    ? contextNodes.reduce((sum, n) => sum + computeLocalHeat(n), 0) / contextNodes.length
    : 0;

  // Chaleur du chemin (connectivité entre contexte et cible)
  const pathHeat = computePathHeat(contextNodes, targetNodeId);

  // Score de confiance structurelle [0, 1]
  const structuralConfidence =
    0.4 * targetHeat +
    0.3 * contextHeat +
    0.3 * pathHeat;

  return Math.max(0.5, 1.0 - structuralConfidence * 0.5);
}

/**
 * Chaleur locale d'un nœud (degré normalisé + voisinage)
 */
function computeLocalHeat(nodeId: string): number {
  const degree = graph.degree(nodeId);
  const maxDegree = getMaxDegreeForType('tool');

  // Chaleur intrinsèque
  const intrinsicHeat = degree / maxDegree;

  // Chaleur des voisins (propagation)
  const neighbors = graph.neighbors(nodeId);
  const neighborHeat = neighbors.length > 0
    ? neighbors.reduce((sum, n) => sum + graph.degree(n), 0) / (neighbors.length * maxDegree)
    : 0;

  return 0.6 * intrinsicHeat + 0.4 * neighborHeat;
}

/**
 * Chaleur du chemin entre contexte et cible
 */
function computePathHeat(contextNodes: string[], targetId: string): number {
  if (contextNodes.length === 0) return 0;

  // Moyenne des scores de connectivité
  let totalConnectivity = 0;
  for (const ctx of contextNodes) {
    // Edge direct ?
    if (graph.hasEdge(ctx, targetId)) {
      totalConnectivity += graph.getEdgeAttribute(ctx, targetId, 'weight') || 1.0;
    } else {
      // Adamic-Adar pour connexion indirecte
      totalConnectivity += computeAdamicAdar(ctx, targetId);
    }
  }

  return Math.min(1.0, totalConnectivity / contextNodes.length);
}
```

---

## 3. Heat Diffusion Hiérarchique (Passive Suggestion - Capabilities)

**Utilisé pour :** Passive Suggestion de Capabilities

**Principe :** Comme Heat Diffusion, mais avec **propagation hiérarchique** à travers Tool → Capability → MetaCapability.

### Rationale

Les Capabilities ont une structure hiérarchique. Un Tool isolé peut appartenir à une Capability bien connectée. La chaleur doit se propager dans les deux sens :

- **Bottom-up** : MetaCapability chaude si ses Capabilities enfants sont chaudes
- **Top-down** : Tool isolé hérite de la chaleur de sa Capability parente

### Implémentation

```typescript
/**
 * Calcule l'alpha local via Heat Diffusion Hiérarchique (Passive Suggestion Capabilities)
 */
function computeAlphaHeatDiffusionHierarchical(
  targetNodeId: string,
  targetType: 'tool' | 'capability' | 'meta',
  contextNodes: string[]
): number {
  const heat = computeHierarchicalHeat(targetNodeId, targetType);
  const contextHeat = computeContextHeat(contextNodes);
  const pathHeat = computeHierarchicalPathHeat(contextNodes, targetNodeId);

  const structuralConfidence =
    0.4 * heat +
    0.3 * contextHeat +
    0.3 * pathHeat;

  return Math.max(0.5, 1.0 - structuralConfidence * 0.5);
}

/**
 * Chaleur hiérarchique avec propagation bidirectionnelle
 */
function computeHierarchicalHeat(nodeId: string, nodeType: NodeType): number {
  const weights = getHierarchyWeights(nodeType);

  const intrinsicHeat = computeIntrinsicHeat(nodeId, nodeType);
  const neighborHeat = computeNeighborHeat(nodeId);
  const hierarchyHeat = computeHierarchyPropagation(nodeId, nodeType);

  return weights.intrinsic * intrinsicHeat
       + weights.neighbor * neighborHeat
       + weights.hierarchy * hierarchyHeat;
}

/**
 * Propagation dans la hiérarchie
 */
function computeHierarchyPropagation(nodeId: string, nodeType: NodeType): number {
  switch (nodeType) {
    case 'meta':
      // Agrégation bottom-up des capabilities enfants
      const children = getChildren(nodeId, 'capability');
      if (children.length === 0) return 0;
      return children.reduce((sum, c) =>
        sum + computeHierarchicalHeat(c, 'capability'), 0) / children.length;

    case 'capability':
      // Héritage de la meta-capability parente
      const metaParent = getParent(nodeId, 'meta');
      if (!metaParent) return 0;
      return computeHierarchicalHeat(metaParent, 'meta') * 0.7;

    case 'tool':
      // Héritage de la capability parente
      const capParent = getParent(nodeId, 'capability');
      if (!capParent) return 0;
      return computeHierarchicalHeat(capParent, 'capability') * 0.5;
  }
}

/**
 * Poids selon le niveau hiérarchique
 */
function getHierarchyWeights(nodeType: NodeType): HeatWeights {
  switch (nodeType) {
    case 'tool':       return { intrinsic: 0.5, neighbor: 0.3, hierarchy: 0.2 };
    case 'capability': return { intrinsic: 0.3, neighbor: 0.4, hierarchy: 0.3 };
    case 'meta':       return { intrinsic: 0.2, neighbor: 0.2, hierarchy: 0.6 };
  }
}
```

---

## 4. Bayésien - Cold Start Fallback

**Utilisé pour :** Tous les modes quand observations < seuil

**Principe :** Modéliser l'**incertitude** explicitement. Un nœud avec peu d'observations a une variance haute → on ne fait pas confiance au graphe.

### Rationale

Pour les nouveaux nœuds (MetaCapabilities émergentes notamment), on n'a pas assez de données pour que les autres algorithmes soient fiables. Le fallback Bayésien garantit qu'on ne fait pas confiance au graphe prématurément.

### Implémentation

```typescript
const COLD_START_THRESHOLD = 5; // Minimum observations

/**
 * Vérifie si on est en cold start et calcule l'alpha Bayésien si nécessaire
 */
function computeAlphaWithColdStartCheck(
  nodeId: string,
  mode: 'active' | 'passive',
  nodeType: NodeType,
  contextNodes: string[]
): number {
  const observations = getObservationCount(nodeId);

  // Cold start: pas assez d'observations
  if (observations < COLD_START_THRESHOLD) {
    return computeAlphaBayesian(nodeId, observations);
  }

  // Sinon, utiliser l'algorithme approprié au mode
  if (mode === 'active') {
    return computeAlphaEmbeddingsHybrides(nodeId);
  } else {
    if (nodeType === 'tool') {
      return computeAlphaHeatDiffusion(nodeId, contextNodes);
    } else {
      return computeAlphaHeatDiffusionHierarchical(nodeId, nodeType, contextNodes);
    }
  }
}

/**
 * Alpha Bayésien basé sur l'incertitude
 *
 * Prior: alpha = 1.0 (semantic only)
 * Posterior: converge vers l'algo principal avec plus d'observations
 */
function computeAlphaBayesian(nodeId: string, observations: number): number {
  // Prior: on ne fait pas confiance au graphe
  const priorAlpha = 1.0;

  // Avec plus d'observations, on fait de plus en plus confiance
  // Formule: alpha = prior * (1 - observations/threshold) + target * (observations/threshold)
  const confidence = observations / COLD_START_THRESHOLD;
  const targetAlpha = 0.7; // Valeur cible intermédiaire

  return priorAlpha * (1 - confidence) + targetAlpha * confidence;
}
```

---

## Implementation Plan

### Fichiers à CRÉER

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `src/graphrag/local-alpha.ts` | ~200 | Classe `LocalAlphaCalculator` avec les 4 algorithmes |
| `tests/unit/graphrag/local_alpha_test.ts` | ~150 | Tests unitaires pour les 4 algos |

### Fichiers à MODIFIER

| Fichier | Impact | Changements |
|---------|--------|-------------|
| `src/graphrag/graph-engine.ts` | Moyen | `searchToolsHybrid()` : remplacer calcul alpha global par `LocalAlphaCalculator` |
| `src/graphrag/dag-suggester.ts` | Moyen | `getAdaptiveWeights()` : utiliser alpha local au lieu de densité globale |
| `src/graphrag/spectral-clustering.ts` | Faible | Exposer `getEmbeddingRow(nodeIndex)` pour Embeddings Hybrides |
| `src/graphrag/types.ts` | Faible | Ajouter `AlphaMode`, `NodeType`, `LocalAlphaResult` |

### Tests à ADAPTER

| Fichier | Changements |
|---------|-------------|
| `tests/unit/graphrag/graph_engine_metrics_test.ts` | Adapter tests `getAdaptiveAlpha` → `getLocalAlpha` |
| `tests/integration/dashboard_metrics_test.ts` | Adapter tests `adaptiveAlpha` dans metrics |

### Estimation

```
Créer:    2 fichiers  (~350 lignes)
Modifier: 4 fichiers  (~100 lignes de changements)
Tests:    2 à adapter

Total: ~450 lignes de code
```

### Interface principale

```typescript
type AlphaMode = 'active' | 'passive';
type NodeType = 'tool' | 'capability' | 'meta';

interface LocalAlphaCalculator {
  /**
   * Point d'entrée principal
   */
  getLocalAlpha(
    mode: AlphaMode,
    nodeId: string,
    nodeType: NodeType,
    contextNodes?: string[]
  ): number;

  /**
   * Pour debug/observabilité
   */
  getAlphaBreakdown(
    mode: AlphaMode,
    nodeId: string,
    nodeType: NodeType,
    contextNodes?: string[]
  ): {
    algorithm: 'embeddings_hybrides' | 'heat_diffusion' | 'heat_hierarchical' | 'bayesian';
    alpha: number;
    inputs: Record<string, number>;
    coldStart: boolean;
  };
}
```

---

## API: Alpha Statistics Endpoint

### GET /api/alpha-stats

Returns statistics about local adaptive alpha usage for observability and algorithm tuning.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `windowHours` | number | 24 | Query window (1-168 hours) |

**Response Schema:**

```json
{
  "success": true,
  "windowHours": 24,
  "stats": {
    "avgAlphaByMode": {
      "activeSearch": 0.75,
      "passiveSuggestion": 0.82
    },
    "alphaDistribution": {
      "bucket05_06": 15,
      "bucket06_07": 25,
      "bucket07_08": 30,
      "bucket08_09": 20,
      "bucket09_10": 10
    },
    "algorithmDistribution": {
      "embeddingsHybrides": 40,
      "heatDiffusion": 35,
      "heatHierarchical": 10,
      "bayesian": 15,
      "none": 0
    },
    "coldStartStats": {
      "total": 15,
      "percentage": 15.0
    },
    "alphaImpact": {
      "lowAlphaAvgScore": 0.72,
      "highAlphaAvgScore": 0.58
    }
  }
}
```

**Response Fields:**

| Field | Description |
|-------|-------------|
| `avgAlphaByMode` | Average alpha values per algorithm mode |
| `alphaDistribution` | Histogram of alpha values in 0.1 buckets |
| `algorithmDistribution` | Count of traces per alpha algorithm |
| `coldStartStats` | Cold start occurrences and percentage |
| `alphaImpact` | Average scores for low (<0.7) vs high (≥0.7) alpha |

**Example Usage:**

```bash
# Get last 24 hours stats
curl -X GET "http://localhost:8000/api/alpha-stats"

# Get last 48 hours stats
curl -X GET "http://localhost:8000/api/alpha-stats?windowHours=48"
```

**Authentication:**
- Local mode: No authentication required
- Cloud mode: Requires authenticated user (returns 401 if not authenticated)

---

### Algorithm Trace Signals (Extended)

The `algorithm_traces` table now includes alpha-related signals:

```typescript
interface AlgorithmSignals {
  // Existing fields...
  semanticScore?: number;
  toolsOverlap?: number;
  successRate?: number;
  pagerank?: number;
  cooccurrence?: number;
  graphDensity: number;
  spectralClusterMatch: boolean;
  adamicAdar?: number;

  // ADR-048: New alpha signals
  localAlpha?: number;        // Alpha value used (0.5-1.0)
  alphaAlgorithm?: string;    // Algorithm: "embeddings_hybrides" | "heat_diffusion" | "heat_hierarchical" | "bayesian" | "none"
  coldStart?: boolean;        // True if in cold start mode
}
```

---

## Consequences

### Positives

- **Cohérent avec ADR-038** : Même pattern (algo par mode/type)
- **Chaque algo optimisé pour son cas** : Pas de compromis one-size-fits-all
- **Cold start géré explicitement** : Bayésien évite les faux positifs
- **Interprétable** : On sait quel algo est utilisé et pourquoi

### Négatives

- **4 algorithmes à maintenir** : Plus complexe qu'un algo unique
- **Transitions** : Passage cold start → normal peut créer des discontinuités

### Risques

- **Performance** : Embeddings Hybrides requiert 2 embeddings → Mitigé par cache
- **Tuning** : Poids dans Heat Diffusion à ajuster → Valeurs par défaut raisonnables

---

## Métriques de Succès

| Métrique | Avant | Après (cible) |
|----------|-------|---------------|
| Variance des alphas | 0 (global) | > 0.1 (distribution) |
| Précision Active Search | ~70% | > 85% |
| Précision Passive Suggestion zone dense | ~70% | > 85% |
| Précision Passive Suggestion zone sparse | ~60% | > 75% |
| Cold start false positives | N/A | < 5% |

---

## References

- [Hypergraph Signal Processing](https://arxiv.org/abs/2003.08034)
- [Heat Diffusion on Graphs](https://arxiv.org/abs/1205.6347)
- [Spectral Graph Theory](https://mathweb.ucsd.edu/~fan/research/revised.html)
- ADR-038: Scoring Algorithms Reference
- ADR-042: Capability-to-Capability Hyperedges
