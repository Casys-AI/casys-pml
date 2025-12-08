# ADR-033: Scoring Algorithms & Formulas Reference

**Status:** 📝 Draft
**Date:** 2025-12-07

## Context

AgentCards utilise plusieurs algorithmes de scoring pour:

- Recherche hybride de MCP tools
- Suggestion de DAG workflows
- Matching de capabilities (Epic 7)
- Prédiction du prochain tool

Ces algorithmes sont dispersés dans le code avec des "magic numbers" parfois non documentés.
Ce document centralise toutes les formules pour faciliter la maintenance et l'évolution.

## Algorithms Reference

---

### 1. Hybrid Search (MCP Tools)

**Location:** `src/graphrag/graph-engine.ts:952-1069`

#### 1.1 Alpha Adaptatif (Semantic vs Graph Balance)

```typescript
const density = edgeCount / (nodeCount * (nodeCount - 1));
const alpha = Math.max(0.5, 1.0 - density * 2);
```

| Density | Alpha | Interpretation                       |
| ------- | ----- | ------------------------------------ |
| 0.00    | 1.0   | Pure semantic (cold start)           |
| 0.25    | 0.5   | 50/50 balance                        |
| >0.25   | 0.5   | Floor (never less than 50% semantic) |

**Rationale:** Quand le graph est vide, on ne peut pas faire confiance aux signaux graph.

#### 1.2 Graph Score (Adamic-Adar)

```typescript
// Direct neighbor = 1.0
if (hasEdge(contextTool, toolId)) return 1.0;

// Sinon: Adamic-Adar normalisé
const aaScore = adamicAdarBetween(toolId, contextTool);
return Math.min(aaScore / 2, 1.0); // ⚠️ /2 = arbitrary normalization
```

**Formula Adamic-Adar:** `AA(u,v) = Σ 1/log(|N(w)|)` pour tous les voisins communs w.

#### 1.3 Final Score

```typescript
const finalScore = alpha * semanticScore + (1 - alpha) * graphScore;
```

---

### 2. DAG Suggester

**Location:** `src/graphrag/dag-suggester.ts`

#### 2.1 PageRank Boost

```typescript
// Line 109-114
const combinedScore = finalScore * 0.8 + pageRank * 0.2;
```

| Weight | Signal       | Rationale           |
| ------ | ------------ | ------------------- |
| 80%    | Hybrid score | Relevance + context |
| 20%    | PageRank     | Tool importance     |

**⚠️ Note:** Ces poids sont arbitraires, pas empiriquement validés.

#### 2.2 Confidence Calculation (Adaptive Weights)

```typescript
// Line 269-285: getAdaptiveWeights()
if (density < 0.01) {
  // Cold start: trust semantic
  return { hybrid: 0.85, pageRank: 0.05, path: 0.1 };
} else if (density < 0.1) {
  // Growing graph
  return { hybrid: 0.65, pageRank: 0.2, path: 0.15 };
} else {
  // Mature graph
  return { hybrid: 0.55, pageRank: 0.3, path: 0.15 };
}

const confidence =
  hybridScore * weights.hybrid +
  pageRankScore * weights.pageRank +
  pathStrength * weights.path;
```

| Density | Stage   | Hybrid | PageRank | Path |
| ------- | ------- | ------ | -------- | ---- |
| <0.01   | Cold    | 85%    | 5%       | 10%  |
| <0.10   | Growing | 65%    | 20%      | 15%  |
| ≥0.10   | Mature  | 55%    | 30%      | 15%  |

**Rationale:** En cold start, les métriques graph sont peu fiables.

#### 2.3 Path Confidence (par nombre de hops)

```typescript
// Line 243-248
if (hops === 1) return 0.95; // Direct dependency
if (hops === 2) return 0.8;
if (hops === 3) return 0.65;
return 0.5; // 4+ hops
```

---

### 3. Next Node Prediction (predictNextNodes) - Tools + Capabilities

**Location:** `src/graphrag/dag-suggester.ts:541-677`

**Post-7.4:** Prédit tools ET capabilities, mais avec des signaux différents.

```
After tool_A    → predict [tool_B, capability_X, tool_C]
After cap_X     → predict [tool_D, capability_Y, tool_E]
```

#### 3.0 Signaux différents selon le type

| Signal        | Pour Tools                    | Pour Capabilities                  |
| ------------- | ----------------------------- | ---------------------------------- |
| **Principal** | Co-occurrence (out-neighbors) | tools_used[] overlap avec contexte |
| **Qualité**   | PageRank                      | success_rate                       |
| **Contexte**  | Louvain community             | Hypergraph neighbors               |
| **Patterns**  | Adamic-Adar (2-hop)           | Semantic match (si intent dispo)   |

```typescript
// Prédire prochain TOOL (reviewé, basé sur code existant)
const toolScore =
  cooccurrenceConfidence * 0.5 + // Observé historiquement
  communityBoost * 0.25 + // Même domaine
  adamicAdar * 0.15 + // Patterns indirects
  pageRank * 0.1; // Importance
```

> ⚠️ **TODO: CAPABILITY PREDICTION - NEEDS DEEP REVIEW**
>
> La formule ci-dessous est un **placeholder non validé**. Questions ouvertes:
>
> 1. **Quels signaux sont pertinents?**
>
>    - toolsOverlap? Co-occurrence comme pour tools? Autre chose?
>    - Comment apprendre les patterns capability → tool et tool → capability?
>
> 2. **Hypergraph Spectral Clustering?**
>
>    - On avait discuté de spectral clustering sur le hypergraph
>    - Pourrait-il aider à identifier des clusters de capabilities liées?
>    - Serait-il meilleur que Louvain pour les capabilities?
>
> 3. **Faut-il apprendre des edges explicites?**
>
>    - Quand on exécute: `tool_A → capability_X → tool_B`
>    - Créer des edges: `tool_A → cap_X` et `cap_X → tool_B`?
>    - Permettrait de réutiliser les mêmes algos que pour tools
>
> 4. **Les poids ci-dessous sont arbitraires**, pas basés sur une réflexion approfondie.
>
> **Action:** Réfléchir à cette architecture avant implémentation de Story 7.4.

```typescript
// Prédire CAPABILITY (⚠️ PLACEHOLDER - NON VALIDÉ)
const capScore =
  toolsOverlapRatio * 0.4 + // cap.tools_used[] ∩ context
  successRate * 0.35 + // Fiabilité prouvée
  hypergraphPageRank * 0.15 + // Centralité bipartite
  semanticMatch * 0.1; // Si intent disponible
```

#### 3.1 Tool Prediction: Community Confidence

```typescript
// Line 923-947
let confidence = 0.4; // Base for community membership
confidence += Math.min(pageRank * 2, 0.2); // PageRank boost (cap 0.20)
confidence += Math.min(edgeWeight * 0.25, 0.25); // Direct edge boost (cap 0.25)
confidence += Math.min(adamicAdar * 0.1, 0.1); // 2-hop boost (cap 0.10)
return Math.min(confidence, 0.95); // Global cap
```

| Component     | Base/Multiplier | Cap  | Max Contribution |
| ------------- | --------------- | ---- | ---------------- |
| Base          | 0.40            | -    | 0.40             |
| PageRank      | ×2              | 0.20 | 0.20             |
| Edge weight   | ×0.25           | 0.25 | 0.25             |
| Adamic-Adar   | ×0.1            | 0.10 | 0.10             |
| **Total max** | -               | 0.95 | 0.95             |

#### 3.2 Co-occurrence Confidence

```typescript
// Line 955-969
let confidence = edgeData.weight; // Base = historical confidence

// Diminishing returns on observation count
const countBoost = Math.min(Math.log2(count + 1) * 0.05, 0.2);
confidence += countBoost;

return Math.min(confidence, 0.95);
```

**Log2 diminishing returns:**
| Observations | log2(n+1) | Boost |
|--------------|-----------|-------|
| 1 | 1.0 | 0.05 |
| 3 | 2.0 | 0.10 |
| 7 | 3.0 | 0.15 |
| 15 | 4.0 | 0.20 (cap) |

#### 3.3 Episodic Learning Adjustments

```typescript
// Line 858-913
const boost = Math.min(0.15, successRate * 0.2); // Max +0.15
const penalty = Math.min(0.15, failureRate * 0.25); // Max -0.15

// Exclusion threshold
if (failureRate > 0.5) return null; // Exclude entirely

const adjustedConfidence = baseConfidence + boost - penalty;
```

**Asymmetry:** Penalty multiplier (0.25) > Boost multiplier (0.20)

- Conservateur: éviter les mauvais patterns > embrasser les bons

---

### 4. Mixed DAG: Tools + Capabilities (Epic 7)

**Location:** `src/graphrag/dag-suggester.ts` (Story 7.4 - extension)

#### 4.1 Philosophie: Multiplicatif vs Additif (Revised)

Au lieu d'une somme pondérée statique (ex: `A*0.4 + B*0.3`), nous adoptons une approche **multiplicative** pour éviter la dilution des signaux forts et donner un rôle central à la structure du graphe.

```typescript
// Score = (Pertinence Contextuelle) × (Importance Structurelle) × (Facteur Fiabilité)
const finalScore = RelevanceScore * (1 + StructuralBoost) * ReliabilityFactor;
```

#### 4.2 Composants de la Formule

1.  **RelevanceScore (Le filtre)**

    - **Active Search:** `SemanticMatch` (Vector similarity).
    - **Passive Suggestion:** `ToolsOverlapRatio` (Jaccard index entre outils actifs et capability).
    - _Si ce score est 0, le résultat final est 0._

2.  **StructuralBoost (L'intelligence - Spectral Clustering)**

    - **Algorithme:** Spectral Clustering sur Hypergraphe Bipartite (Tools ↔ Capabilities).
    - **Principe:** Si une Capability appartient au _même cluster spectral_ que les outils actifs du workflow.
    - **Boost:** Multiplicateur significatif (ex: `+0.5` à `+1.0`) si cluster match.
    - _Sert d'amplificateur de signal pour la découverte._

3.  **ReliabilityFactor (Le garde-fou)**
    - Basé sur `success_rate` historique.
    - Si `success_rate < 0.5`, facteur `< 0.1` (pénalité sévère).
    - Si `success_rate > 0.9`, facteur `1.2` (bonus confiance).

#### 4.3 Architecture Hypergraphe & Spectral Clustering

**Pourquoi Spectral Clustering immédiat ?**
Louvain sur un graphe projeté (clique expansion) crée trop de bruit. Une capability liant 5 outils créerait une clique de 10 arêtes, faussant la détection de communauté.

**Implémentation:**

1.  **Matrice d'Adjacence Bipartite (H):** Lignes = Tools, Colonnes = Capabilities.
2.  **Spectral Decomposition:** Calcul des vecteurs propres sur la matrice Laplacienne de H.
3.  **Clustering:** K-Means sur les vecteurs propres pour grouper Tools et Capabilities dans un espace latent commun.

#### 4.4 Modes d'Exécution (Adaptive)

L'algorithme s'adapte automatiquement selon le contexte d'appel :

| Mode                   | Déclencheur   | Driver Principal (Relevance) | Rôle du Spectral Cluster                                                                     |
| :--------------------- | :------------ | :--------------------------- | :------------------------------------------------------------------------------------------- |
| **Active Search**      | User Query    | `Semantic`                   | **Discriminant:** Pousse les résultats sémantiques qui sont aussi structurellement logiques. |
| **Passive Suggestion** | Workflow Step | `ToolsOverlap`               | **Moteur:** Suggère les capacités du même cluster spectral que l'étape précédente.           |
| **Exploration**        | Empty State   | `PageRank`                   | **Filtre:** Propose les "Stars" (Hubs) de chaque cluster majeur.                             |

#### 4.5 Execution

```typescript
// Dans execute_dag
if (task.type === "tool") {
  result = await mcpBridge.call(task.tool, task.arguments);
} else if (task.type === "capability") {
  const cap = await capabilityStore.findById(task.capability_id);
  result = await executeCode({ code: cap.code, context: task.arguments });
}
```

---

### 5. Common Patterns

#### 5.1 Global Cap at 0.95

Toutes les confidences sont cappées à 0.95, jamais 1.0.

- **Rationale:** Laisser de la marge pour l'incertitude. Rien n'est sûr à 100%.

#### 5.2 Log2 Diminishing Returns

```typescript
const boost = Math.log2(count + 1) * multiplier;
```

Utilisé pour: observation counts, usage counts.

- **Rationale:** Les premières observations sont plus informatives que les suivantes.

#### 5.3 Exclusion Thresholds

| Metric       | Threshold | Action                         |
| ------------ | --------- | ------------------------------ |
| Failure rate | >50%      | Exclude from predictions       |
| Success rate | <50%      | Exclude from suggestions (7.4) |
| Confidence   | <0.50     | Return with warning            |

#### 5.4 Density-Based Adaptation

```typescript
const density = edges / (nodes * (nodes - 1));

if (density < 0.01) {
  /* cold start */
} else if (density < 0.1) {
  /* growing */
} else {
  /* mature */
}
```

---

## Magic Numbers Inventory

### Documented & Justified

| Value                | Location         | Justification                        |
| -------------------- | ---------------- | ------------------------------------ |
| 0.5 (alpha floor)    | Hybrid search    | Never trust graph more than semantic |
| 0.95 (cap)           | Everywhere       | Uncertainty margin                   |
| 50% (exclusion)      | Episodic         | Reasonable failure threshold         |
| 0.01, 0.10 (density) | Adaptive weights | Cold/growing/mature stages           |

### Arbitrary (Need Validation)

| Value            | Location               | Question                |
| ---------------- | ---------------------- | ----------------------- |
| 80/20            | PageRank boost         | Why not 70/30?          |
| 0.40 (base)      | Community confidence   | Why not 0.35?           |
| /2 normalization | Adamic-Adar            | Why divide by 2?        |
| 0.25 vs 0.20     | Episodic boost/penalty | Asymmetry justified?    |
| Individual caps  | Multiple               | 0.20, 0.25, 0.10 - why? |

---

## Future Improvements

1. **Empirical Validation:** A/B test different weight configurations
2. **Adaptive Weights:** Learn optimal weights from feedback (not just thresholds)
3. **Per-Domain Tuning:** Different weights for different MCP server types
4. **Unified Formula:** Reduce duplication between MCP and Capability scoring

---

## References

- [ADR-015: Adaptive Thresholds](./ADR-015-adaptive-thresholds.md)
- [ADR-022: Hybrid Search](./ADR-022-hybrid-search.md)
- [ADR-026: Cold Start Handling](./ADR-026-cold-start-handling.md)
- [ADR-028: Emergent Capabilities](./ADR-028-emergent-capabilities-system.md)
- `src/graphrag/graph-engine.ts` - Hybrid search implementation
- `src/graphrag/dag-suggester.ts` - DAG suggestion implementation
- `docs/epics.md` - Story 7.4 (Capability suggestions)
