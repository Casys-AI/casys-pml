# ADR-048: Hierarchical Heat Diffusion for Local Adaptive Alpha

**Status:** Draft
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

Implémenter un **Hierarchical Heat Diffusion** pour calculer un alpha adaptatif **local** pour chaque nœud.

### Principe

La "chaleur" représente la **confiance structurelle** - combien on peut faire confiance aux signaux du graphe pour un nœud donné.

- **Zone dense** → Chaleur haute → Alpha bas → Utiliser le graphe
- **Zone sparse** → Chaleur basse → Alpha haut → Utiliser le semantic

### 1. Sources de Chaleur

```typescript
interface HeatSources {
  intrinsic: number;   // Degré du nœud (liens directs)
  neighbor: number;    // Chaleur propagée des voisins
  hierarchy: number;   // Chaleur propagée dans la hiérarchie
}
```

### 2. Propagation Hiérarchique

```
Direction de propagation :

Tools ──────► Capabilities ──────► MetaCapabilities
       agrège              agrège

MetaCapabilities ──────► Capabilities ──────► Tools
                 hérite              hérite (atténué)
```

- **Bottom-up (agrégation)** : Une MetaCapability "chaude" si ses Capabilities enfants sont chaudes
- **Top-down (héritage)** : Un Tool isolé peut hériter de la chaleur de sa Capability parente

### 3. Formules

#### 3.1 Chaleur Intrinsèque

```typescript
function intrinsicHeat(nodeId: string, nodeType: NodeType): number {
  const degree = graph.degree(nodeId);
  const maxDegree = getMaxDegree(nodeType);
  return degree / maxDegree;
}
```

#### 3.2 Chaleur des Voisins (Diffusion)

```typescript
function neighborHeat(nodeId: string): number {
  const neighbors = getNeighbors(nodeId);
  if (neighbors.length === 0) return 0;

  // Moyenne pondérée par le poids des edges
  return neighbors.reduce((sum, n) => {
    const edgeWeight = getEdgeWeight(nodeId, n.id);
    return sum + computeLocalHeat(n.id, n.type) * edgeWeight;
  }, 0) / neighbors.length;
}
```

#### 3.3 Chaleur Hiérarchique

```typescript
function hierarchyHeat(nodeId: string, nodeType: NodeType): number {
  switch (nodeType) {
    case 'meta':
      // Agrégation bottom-up des capabilities enfants
      const children = getChildren(nodeId);
      if (children.length === 0) return 0;
      return children.reduce((sum, c) =>
        sum + computeLocalHeat(c, 'capability'), 0) / children.length;

    case 'capability':
      // Héritage de la meta-capability parente (si existe)
      const metaParent = getParent(nodeId, 'meta');
      if (!metaParent) return 0;
      return computeLocalHeat(metaParent, 'meta') * 0.7; // Atténuation

    case 'tool':
      // Héritage de la capability parente
      const capParent = getParent(nodeId, 'capability');
      if (!capParent) return 0;
      return computeLocalHeat(capParent, 'capability') * 0.5; // Plus d'atténuation
  }
}
```

#### 3.4 Chaleur Combinée

```typescript
function computeLocalHeat(nodeId: string, nodeType: NodeType): number {
  const weights = getWeights(nodeType);

  return weights.intrinsic * intrinsicHeat(nodeId, nodeType)
       + weights.neighbor * neighborHeat(nodeId)
       + weights.hierarchy * hierarchyHeat(nodeId, nodeType);
}

function getWeights(nodeType: NodeType): HeatWeights {
  // Tools : plus de poids sur les liens directs
  // Meta : plus de poids sur l'agrégation hiérarchique
  switch (nodeType) {
    case 'tool':       return { intrinsic: 0.5, neighbor: 0.3, hierarchy: 0.2 };
    case 'capability': return { intrinsic: 0.3, neighbor: 0.4, hierarchy: 0.3 };
    case 'meta':       return { intrinsic: 0.2, neighbor: 0.2, hierarchy: 0.6 };
  }
}
```

### 4. Alpha Local Final

```typescript
function getLocalAlpha(
  targetNodeId: string,
  contextNodes: string[]  // Tools déjà utilisés dans le workflow
): number {
  const targetHeat = computeLocalHeat(targetNodeId, getNodeType(targetNodeId));

  // Chaleur du contexte (d'où on vient)
  const contextHeat = contextNodes.length > 0
    ? contextNodes.reduce((sum, n) =>
        sum + computeLocalHeat(n, getNodeType(n)), 0) / contextNodes.length
    : 0;

  // Chaleur du "chemin" entre contexte et cible
  const pathHeat = computePathHeat(contextNodes, targetNodeId);

  // Score de confiance structurelle [0, 1]
  const structuralConfidence =
    0.4 * targetHeat +
    0.3 * contextHeat +
    0.3 * pathHeat;

  // Alpha inversement proportionnel à la confiance
  return Math.max(0.5, 1.0 - structuralConfidence * 0.5);
}
```

### 5. Intégration avec le Cache Spectral

Le Heat Diffusion peut réutiliser les structures du `SpectralClusteringManager` :

```typescript
class HierarchicalHeatDiffusion {
  private spectralClustering: SpectralClusteringManager;
  private heatCache: Map<string, number>;  // Cache TTL

  constructor(spectralClustering: SpectralClusteringManager) {
    this.spectralClustering = spectralClustering;
    this.heatCache = new Map();
  }

  // Utilise la matrice d'adjacence déjà calculée
  private getNeighbors(nodeId: string): string[] {
    return this.spectralClustering.getAdjacencyRow(nodeId)
      .filter(weight => weight > 0);
  }

  // Utilise les clusters pour identifier les zones denses
  private getClusterDensity(nodeId: string): number {
    const cluster = this.spectralClustering.getCluster(nodeId);
    return this.spectralClustering.getClusterDensity(cluster);
  }
}
```

## Alternatives Considérées

### A. Fiedler Vector (2ème vecteur propre)

```typescript
// Position dans le spectre du Laplacien
const fiedlerValue = eigenvectors.getColumn(1)[nodeIndex];
const isIsolated = Math.abs(fiedlerValue) > threshold;
```

**Rejeté car :** Mesure seulement la position globale, pas la densité locale.

### B. Effective Resistance (Distance électrique)

```typescript
// R_eff(i,j) = L⁺[i,i] + L⁺[j,j] - 2*L⁺[i,j]
const resistance = computeEffectiveResistance(laplacian, i, j);
```

**Rejeté car :** Coût O(n³) pour le pseudo-inverse. Pourrait être combiné en v2.

### C. Node Degree Simple

```typescript
const degree = graph.degree(nodeId);
const localAlpha = degree < 3 ? 1.0 : globalAlpha;
```

**Rejeté car :** Trop simpliste, ne capture pas la hiérarchie ni la propagation.

### D. Graph Wavelets (Multi-échelle)

**Considéré pour v2 :** Permettrait d'analyser la structure à différentes échelles.

## Implementation Plan

### Phase 1 : Core Heat Diffusion

| Fichier | Changement |
|---------|------------|
| `src/graphrag/heat-diffusion.ts` | Nouvelle classe `HierarchicalHeatDiffusion` |
| `src/graphrag/types.ts` | Types `HeatSources`, `HeatWeights`, `LocalAlpha` |
| `tests/unit/graphrag/heat_diffusion_test.ts` | Tests unitaires |

### Phase 2 : Intégration

| Fichier | Changement |
|---------|------------|
| `src/graphrag/graph-engine.ts` | `getLocalAlpha()` remplace `getAdaptiveAlpha()` |
| `src/graphrag/dag-suggester.ts` | Utiliser alpha local dans `calculateConfidenceHybrid()` |
| `src/graphrag/spectral-clustering.ts` | Exposer méthodes pour Heat Diffusion |

### Phase 3 : Observabilité

| Fichier | Changement |
|---------|------------|
| `src/graphrag/types.ts` | Ajouter `localAlpha` à `GraphMetrics` |
| `src/telemetry/algorithm-tracer.ts` | Tracer les calculs de heat |
| API `/api/metrics` | Exposer distribution des alphas locaux |

## Consequences

### Positives

- **Précision** : Alpha adapté à chaque zone du graphe
- **Hiérarchie** : Respecte la structure Tool → Cap → Meta
- **Émergent** : Les MetaCapabilities héritent naturellement
- **Graceful degradation** : Zone sparse → semantic, zone dense → graphe
- **Compatible** : Réutilise l'infrastructure SpectralClustering

### Négatives

- **Complexité** : Plus de calculs qu'un alpha global
- **Cache** : Nécessite invalidation quand le graphe change
- **Tuning** : Poids à ajuster (intrinsic, neighbor, hierarchy)

### Risques

- **Performance** : Récursion dans la hiérarchie → Mitigé par cache + memoization
- **Cycles** : Capabilities avec dépendances circulaires → Détection + limite de profondeur
- **Cold start local** : Nœud nouveau dans zone dense → Héritage hiérarchique aide

## Métriques de Succès

| Métrique | Avant | Après (cible) |
|----------|-------|---------------|
| Variance des alphas | 0 (global) | > 0.1 (distribution) |
| Précision suggestions zone dense | ~70% | > 85% |
| Précision suggestions zone sparse | ~60% | > 75% (via semantic) |
| Latence calcul alpha | < 1ms | < 5ms (avec cache) |

## References

- [Hypergraph Signal Processing](https://arxiv.org/abs/2003.08034)
- [Heat Diffusion on Graphs](https://arxiv.org/abs/1205.6347)
- [Spectral Graph Theory](https://mathweb.ucsd.edu/~fan/research/revised.html)
- ADR-038: Scoring Algorithms Reference
- ADR-042: Capability-to-Capability Hyperedges
