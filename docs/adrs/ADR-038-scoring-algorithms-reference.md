# ADR-038: Scoring Algorithms & Formulas Reference

**Status:** 📝 Draft
**Date:** 2025-12-08
**Related Epics:** Epic 5 (Tools), Epic 7 (Capabilities)
**Related ADRs:** ADR-048 (Local Adaptive Alpha)

## Context

Casys PML utilise plusieurs algorithmes pour la découverte d'outils (Tools) et de capacités (Capabilities). Ce document centralise les formules mathématiques et justifie les choix d'architecture (Graphes simples vs Hypergraphes, Additif vs Multiplicatif).

_Note: Cet ADR remplace et consolide les anciennes tentatives de définition d'algorithmes (ex-ADR-033)._

## Implementation Status

| Algorithm                | Component    | Status             | Location                                              |
| :----------------------- | :----------- | :----------------- | :---------------------------------------------------- |
| **Hybrid Search**        | Tools        | ✅ **Implemented** | `src/graphrag/graph-engine.ts`                        |
| **Next Step Prediction** | Tools        | ✅ **Implemented** | `src/graphrag/dag-suggester.ts` (Refactored Dec 2025) |
| **DAG Construction**     | Structure    | ✅ **Implemented** | `src/graphrag/graph-engine.ts` (Shortest Path)        |
| **Strategic Discovery**  | Capabilities | 🚧 **In Progress** | Story 7.4 (Spectral Clustering + Hypergraph PageRank) |

---

## 1. Algorithms Matrix (Summary)

| Object Type     | Mode: Active Search (User Intent)                                                                      | Mode: Passive Suggestion (Workflow Context)                                                                           |
| :-------------- | :----------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **Simple Tool** | **1. Hybrid Search** <br> `Semantic * Alpha + Graph * (1-Alpha)` <br> _Approche Additive (Permissive)_ | **2. Next Step Prediction** <br> `Co-occurrence + Louvain + Recency` <br> _Approche Additive (Probabiliste)_          |
| **Capability**  | **3. Capability Match** <br> `Semantic * SuccessRate` <br> _Approche Multiplicative (Stricte)_         | **4. Strategic Discovery** <br> `Spectral Cluster Boost * ToolsOverlap` <br> _Approche Multiplicative (Contextuelle)_ |

---

## 2. Tool Algorithms (Tactical Layer)

Les algorithmes pour les outils unitaires (ex: `fs:read`) utilisent un **Graphe Simple Orienté** et des formules **Additives**.

### 2.1 Hybrid Search (Active Tool Search)

**Location:** `src/graphrag/graph-engine.ts`

Combine recherche sémantique et pertinence contextuelle.

```typescript
const finalScore = alpha * semanticScore + (1 - alpha) * graphScore;
```

- **Alpha Adaptatif (voir ADR-048 pour alpha local) :**

  - ~~Global (legacy) : `density < 0.01` → `alpha = 1.0`, `density > 0.25` → `alpha = 0.5`~~
  - **Local (ADR-048) :** Alpha calculé par nœud selon le mode et le type :
    - Active Search : Embeddings Hybrides (cohérence sémantique/structurelle)
    - Passive Suggestion : Heat Diffusion (propagation de chaleur depuis le contexte)
    - Cold Start (<5 obs.) : Bayésien (prior alpha=1.0)
  - _Rationale :_ L'alpha global ne capture pas l'hétérogénéité locale du graphe.

- **Graph Score (Weighted Adamic-Adar - ADR-041):**
  - `AA(u,v) = Σ (edge_weight × 1/log(|N(w)|))`
  - Mesure si l'outil cherché a des "amis communs" avec les outils du contexte actuel.
  - **Pondération :** Les contributions sont multipliées par la qualité de l'edge (type × source).

### 2.2 Next Step Prediction (Passive Tool Suggestion)

**Location:** `src/graphrag/dag-suggester.ts`

Prédit le prochain outil probable après l'action courante. Formule simplifiée pour favoriser la réactivité (Récence) plutôt que la popularité globale.

```typescript
const toolScore =
  cooccurrenceConfidence * 0.6 + // Historique direct (A -> B)
  communityBoost * 0.3 + // Louvain (Même cluster dense)
  recencyBoost * 0.1 + // Récence (Utilisé récemment dans le projet)
  pageRank * 0.1; // Bonus mineur d'importance globale
```

- **Cooccurrence :** Poids de l'arête A -> B.
- **Louvain :** Bonus si A et B sont dans la même communauté. Préféré à LPA pour sa stabilité et qualité (modularité), malgré une complexité théorique plus élevée (O(n log n)).
- **Recency (NEW) :** Bonus si l'outil a été utilisé dans les dernières 24h du projet.
- **PageRank :** Mesure l'importance globale du nœud dans le graphe. Utilisé comme bonus mineur.
- _Note:_ Adamic-Adar a été retiré de ce scope pour réduire le bruit, mais reste utilisé dans le Hybrid Search.

### 2.3 DAG Construction (Structural Layer)

**Location:** `src/graphrag/graph-engine.ts`

Une fois les outils sélectionnés, il faut déterminer leur ordre d'exécution (dépendances).

- **Dijkstra Weighted Shortest Path (ADR-041):**
  - Utilisé pour inférer les dépendances entre outils sélectionnés.
  - Si `PathLength(A, B) <= 3` (dans le graphe historique), on considère que B dépend de A.
  - **Pondération par qualité d'edge :** `cost = 1 / weight` (poids élevé = coût faible = préféré)
  - **Edge Types :** `dependency` (1.0) > `contains` (0.8) > `sequence` (0.5)
  - **Edge Sources :** `observed` (×1.0) > `inferred` (×0.7) > `template` (×0.5)
  - Permet de favoriser les chemins confirmés par l'historique vs les templates bootstrap.

---

## 3. Capability Algorithms (Strategic Layer)

Les algorithmes pour les Capabilities (groupes d'outils) utilisent un **Hypergraphe Bipartite** et des formules **Multiplicatives**.

### 3.1 Capability Match (Active Capability Search)

**Location:** `src/capabilities/matcher.ts`

Trouve une capability qui répond à une demande explicite.

```typescript
// Formule Multiplicative Stricte
const matchScore = semanticScore * reliabilityFactor;
```

- **semanticScore :** Vector Cosine Similarity (Intent vs Description).
- **reliabilityFactor :** Basé sur `successRate` historique.

  - Si `success_rate < 0.5` → Factor `0.1` (Disqualification).
  - Si `success_rate > 0.9` → Factor `1.2` (Bonus).

- _Rationale :_ Si une capability ne marche pas (Reliability faible), elle ne doit pas être proposée, même si elle ressemble sémantiquement à la demande.

### 3.2 Strategic Discovery (Passive Capability Suggestion)

**Location:** `src/graphrag/dag-suggester.ts` (Story 7.4)

Suggère des capabilities basées sur le comportement actuel de l'utilisateur.

```typescript
const discoveryScore = ToolsOverlap * (1 + StructuralBoost);
```

- **ToolsOverlap :** Ratio d'outils de la capability déjà présents dans le contexte.
- **StructuralBoost (Spectral Clustering) :**
  - Utilise le **Spectral Clustering** sur l'hypergraphe Tools-Capabilities.
  - Si la capability est dans le même "Cluster Spectral" que les outils actifs → Boost significatif (ex: +50%).
  - _Pourquoi Spectral ?_ Mieux adapté que Louvain pour détecter les relations "soft" dans les hypergraphes bipartites.

---

## 4. Decision & Adaptation

### 4.1 Interaction avec Adaptive Thresholds (ADR-008)

Le score calculé par les algorithmes ci-dessus (`finalScore`, `matchScore`, etc.) est une valeur brute. La décision finale passe par l'`AdaptiveThresholdManager`.

```typescript
// 1. Calcul du Score Brut (ADR-038)
const score = calculateScore(...); // ex: 0.82

// 2. Récupération du Seuil de Risque (ADR-008)
// Le seuil s'adapte selon le type de workflow et l'historique de succès
const threshold = await adaptiveThresholdManager.getThreshold(context); // ex: 0.85

// 3. Décision
if (score >= threshold) {
  return suggestion;
} else {
  return null; // Rejeté (trop risqué pour ce contexte)
}
```

### 4.2 Magic Numbers Inventory

Les valeurs utilisées dans les formules doivent être monitorées et ajustées.

| Value    | Algorithm           | Role                          | Status             |
| :------- | :------------------ | :---------------------------- | :----------------- |
| **0.60** | Tool Prediction     | Poids Cooccurrence            | Validé (Empirique) |
| **0.30** | Tool Prediction     | Poids Louvain                 | Validé (Empirique) |
| **0.50** | Hybrid Search       | Alpha Floor                   | Validé (ADR-022)   |
| **0.50** | Reliability         | Seuil de pénalité SuccessRate | À valider          |
| **1.20** | Reliability         | Bonus High Success            | À valider          |
| **0.50** | Strategic Discovery | Spectral Cluster Boost        | À valider          |
| **1.00** | Edge Type (ADR-041) | Poids `dependency`            | Validé             |
| **0.80** | Edge Type (ADR-041) | Poids `contains`              | Validé             |
| **0.50** | Edge Type (ADR-041) | Poids `sequence`              | Validé             |
| **1.00** | Edge Source (ADR-041) | Multiplicateur `observed`   | Validé             |
| **0.70** | Edge Source (ADR-041) | Multiplicateur `inferred`   | Validé             |
| **0.50** | Edge Source (ADR-041) | Multiplicateur `template`   | Validé             |
| **3**    | Edge Promotion (ADR-041) | Seuil inferred→observed  | Validé             |

---

## 5. Future Improvements

1.  **Online Learning des Poids :** Remplacer les poids statiques (0.50, 0.25) par des poids appris via régression logistique sur les feedbacks utilisateurs.
2.  ~~**Unified Hypergraph :**~~ **→ ADR-042 (Capability Hyperedges)** : Les relations capability→capability (hyperedges) sont maintenant stockées dans `capability_dependency`. ADR-042 définit comment enrichir le Spectral Clustering, PageRank, et Capability Match avec ces relations.

## 6. Related ADRs

- **ADR-041:** Hierarchical Trace Tracking (edge_type, edge_source)
- **ADR-042:** Capability-to-Capability Hyperedges (enrichissement des algorithmes avec les relations cap→cap)
