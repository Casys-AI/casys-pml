# ADR-038: Scoring Algorithms & Formulas Reference

**Status:** 📝 Draft
**Date:** 2025-12-08
**Related Epics:** Epic 5 (Tools), Epic 7 (Capabilities)

## Context

AgentCards utilise plusieurs algorithmes pour la découverte d'outils (Tools) et de capacités (Capabilities). Ce document centralise les formules mathématiques et justifie les choix d'architecture (Graphes simples vs Hypergraphes, Additif vs Multiplicatif).

_Note: Cet ADR remplace et consolide les anciennes tentatives de définition d'algorithmes (ex-ADR-033)._

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

- **Alpha Adaptatif :**

  - `density < 0.01` (Cold Start) → `alpha = 1.0` (100% Sémantique)
  - `density > 0.25` (Mature) → `alpha = 0.5` (Equilibré)
  - _Rationale :_ On ne fait pas confiance au graphe quand il est vide.

- **Graph Score (Adamic-Adar) :**
  - `AA(u,v) = Σ 1/log(|N(w)|)`
  - Mesure si l'outil cherché a des "amis communs" avec les outils du contexte actuel.

### 2.2 Next Step Prediction (Passive Tool Suggestion)

**Location:** `src/graphrag/dag-suggester.ts`

Prédit le prochain outil probable après l'action courante. Formule simplifiée pour favoriser la réactivité (Récence) plutôt que la popularité globale.

```typescript
const toolScore =
  cooccurrenceConfidence * 0.6 + // Historique direct (A -> B)
  communityBoost * 0.3 + // Louvain (Même cluster dense)
  recencyBoost * 0.1; // Récence (Utilisé récemment dans le projet)
```

- **Cooccurrence :** Poids de l'arête A -> B.
- **Louvain :** Bonus si A et B sont dans la même communauté.
- **Recency (NEW) :** Bonus si l'outil a été utilisé dans les dernières 24h du projet.
- _Note:_ PageRank et Adamic-Adar ont été retirés de ce scope pour réduire le bruit et le biais de popularité.

---

## 3. Capability Algorithms (Strategic Layer)

Les algorithmes pour les Capabilities (groupes d'outils) utilisent un **Hypergraphe Bipartite** et des formules **Multiplicatives**.

### 3.1 Capability Match (Active Capability Search)

**Location:** `src/capabilities/matcher.ts`

Trouve une capability qui répond à une demande explicite.

```typescript
// Formule Multiplicative Stricte
const matchScore = SemanticSimilarity * ReliabilityFactor;
```

- **SemanticSimilarity :** Vector Cosine Similarity (Intent vs Description).
- **ReliabilityFactor :** `SuccessRate` historique.

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

| Value    | Algorithm       | Role                          | Status             |
| :------- | :-------------- | :---------------------------- | :----------------- |
| **0.60** | Tool Prediction | Poids Cooccurrence            | Validé (Empirique) |
| **0.30** | Tool Prediction | Poids Louvain                 | Validé (Empirique) |
| **0.50** | Hybrid Search   | Alpha Floor                   | Validé (ADR-022)   |
| **0.50** | Reliability     | Seuil de pénalité SuccessRate | À valider          |
| **1.20** | Reliability     | Bonus High Success            | À valider          |

---

## 5. Future Improvements

1.  **Online Learning des Poids :** Remplacer les poids statiques (0.50, 0.25) par des poids appris via régression logistique sur les feedbacks utilisateurs.
2.  **Unified Hypergraph :** À terme, fusionner le graphe des Tools et l'hypergraphe des Capabilities pour un calcul unifié (mais coûteux).
