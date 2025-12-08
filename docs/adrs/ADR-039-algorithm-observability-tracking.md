# ADR-039: Algorithm Observability & Adaptive Weight Preparation

**Status:** 📝 Proposed
**Date:** 2025-12-08
**Depends on:** ADR-038 (Scoring Algorithms Reference), ADR-008 (Adaptive Thresholds)

## Context

Nos algorithmes de scoring (ADR-038) utilisent désormais des formules multiplicatives et des méthodes avancées (Spectral Clustering). Bien que plus robustes théoriquement, ces choix introduisent de nouveaux hyper-paramètres (Bonus Reliability, Cluster Boost) qu'il faut valider empiriquement.

**Objectif:** Logger les signaux, les décisions et les outcomes pour:

1.  Valider la pertinence du Spectral Clustering (est-ce que le cluster boost aide vraiment ?).
2.  Ajuster les facteurs multiplicatifs (Reliability Factor).
3.  Entraîner de futurs modèles de régression (Learning to Rank).

## Decision

### 1. Structure de Logging Unifiée

Après chaque suggestion ou recherche, nous loguons un `AlgorithmTraceRecord` structuré pour capturer tout le contexte de décision.

```typescript
interface AlgorithmTraceRecord {
  // --- Contexte ---
  trace_id: string;
  timestamp: Date;
  intent?: string; // Si Active Search
  context_hash: string; // Lien vers AdaptiveThresholds

  // --- Mode & Cible ---
  algorithm_mode: "active_search" | "passive_suggestion";
  target_type: "tool" | "capability";

  // --- Signaux d'entrée (Raw Inputs) ---
  signals: {
    semantic_score?: number;
    tools_overlap?: number;
    success_rate?: number;
    pagerank?: number;
    cooccurrence?: number;

    // Graph Specifics
    graph_density: number;
    spectral_cluster_match: boolean; // Est-ce dans le même cluster ?
    adamic_adar?: number;
  };

  // --- Paramètres de l'Algo (Configuration) ---
  params: {
    alpha: number; // Semantic vs Graph balance
    reliability_factor: number; // Impact du success_rate
    structural_boost: number; // Impact du cluster match
  };

  // --- Résultat Calculé ---
  scores: {
    relevance_score: number; // Score de base
    final_score: number; // Score final après boosts
    threshold_used: number; // Seuil Adaptive utilisé
  };

  // --- Décision ---
  decision: "accepted" | "rejected_by_threshold" | "filtered_by_reliability";

  // --- Outcome (Asynchrone / Update plus tard) ---
  outcome?: {
    user_action: "selected" | "ignored" | "explicit_rejection";
    execution_success?: boolean;
    duration_ms?: number;
  };
}
```

### 2. Stockage

**Phase 1 (MVP):** Table `algorithm_traces` dans PGlite.

- Retention: 7 jours (c'est du debug/tuning, pas de l'audit log long terme).
- Colonnes clés typées, le reste en JSONB pour flexibilité.

```sql
CREATE TABLE algorithm_traces (
  trace_id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  mode TEXT, -- 'active_search', 'passive_suggestion'
  target_type TEXT, -- 'tool', 'capability'
  final_score REAL,
  threshold_used REAL,
  decision TEXT,
  outcome TEXT, -- 'selected', 'ignored'
  details JSONB -- Tout le reste (signals, params...)
);
```

### 3. Métriques Clés à Surveiller

Grâce à ces logs, nous pourrons monitorer via un dashboard (Epic 6):

1.  **Spectral Relevance:** `AVG(outcome.selected WHERE signals.spectral_cluster_match = TRUE)`
    - _Question:_ Est-ce que les suggestions basées sur le cluster sont plus cliquées ?
2.  **Reliability Impact:** `CORRELATION(signals.success_rate, outcome.execution_success)`

    - _Question:_ Est-ce que notre pénalité sur le success_rate protège vraiment l'utilisateur ?

3.  **Threshold Efficiency:** `COUNT(rejected_by_threshold)` vs `COUNT(ignored)`
    - _Question:_ Est-ce qu'on rejette trop de choses ? Ou est-ce qu'on laisse passer trop de bruit ?

## Implementation Plan

1.  Créer la migration `algorithm_traces`.
2.  Injecter un `AlgorithmTracer` dans `DAGSuggester` et `CapabilityMatcher`.
3.  Appeler `tracer.log(...)` à la fin de chaque calcul de score.
4.  Ajouter une route API pour que le frontend puisse marquer une suggestion comme "selected" / "ignored".
