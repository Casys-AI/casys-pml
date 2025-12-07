# ADR-034: Algorithm Observability & Adaptive Weight Preparation

**Status:** 📝 Proposed
**Date:** 2025-12-07
**Depends on:** ADR-033 (Scoring Algorithms Reference)

## Context

Nos algorithmes de scoring (ADR-033) utilisent des poids fixes:
- `0.8 / 0.2` pour PageRank boost
- `0.6 / 0.3 / 0.1` pour capability ranking
- Divers caps et seuils arbitraires

**Problème:** On ne sait pas si ces poids sont optimaux. On n'a aucune donnée pour les valider ou les ajuster.

**Objectif:** Logger les signaux et outcomes pour:
1. Comprendre comment les algorithmes performent
2. Préparer le terrain pour des poids adaptatifs (future)
3. Détecter les anomalies et dérives

## Decision

### 1. Structure de Logging

Après chaque suggestion/exécution, logger:

```typescript
interface AlgorithmTraceRecord {
  // Identifiants
  trace_id: string;
  timestamp: Date;
  intent: string;

  // Signaux d'entrée (ce qu'on a mesuré)
  signals: {
    semantic_score: number;
    graph_score: number;       // Adamic-Adar
    pagerank: number;
    success_rate?: number;     // Pour capabilities
    usage_count?: number;
    graph_density: number;
    alpha: number;             // Computed alpha
  };

  // Poids utilisés
  weights: {
    semantic: number;
    graph: number;
    pagerank: number;
    quality?: number;
  };

  // Score final calculé
  computed_score: number;

  // Outcome (rempli après exécution)
  outcome?: {
    selected: boolean;         // User a choisi cette suggestion?
    executed: boolean;         // A été exécuté?
    success: boolean;          // Exécution réussie?
    duration_ms: number;
    user_feedback?: "positive" | "negative" | "ignored";
  };

  // Metadata
  suggestion_type: "tool" | "capability";
  suggestion_id: string;
  context_tools: string[];
}
```

### 2. Points d'Instrumentation

```
┌─────────────────────────────────────────────────────────────────┐
│  DAGSuggester.suggestDAG()                                      │
│                                                                 │
│  1. AVANT ranking:                                              │
│     → Log: signals (semantic, graph, pagerank, density)         │
│     → Log: weights (alpha-based)                                │
│                                                                 │
│  2. APRÈS ranking:                                              │
│     → Log: computed_score pour chaque candidat                  │
│     → Log: position dans le ranking                             │
│                                                                 │
│  3. APRÈS exécution (callback):                                 │
│     → Log: outcome (selected, success, duration)                │
│     → Corrélation avec trace_id                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Table de Stockage

```sql
CREATE TABLE algorithm_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  intent TEXT,

  -- Signaux (JSONB pour flexibilité)
  signals JSONB NOT NULL,
  weights JSONB NOT NULL,
  computed_score REAL NOT NULL,

  -- Outcome (nullable, rempli après)
  outcome JSONB,

  -- Metadata
  suggestion_type TEXT NOT NULL,  -- 'tool' | 'capability'
  suggestion_id TEXT NOT NULL,
  context_tools TEXT[],

  -- Index pour analyse
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes analytiques
CREATE INDEX idx_algorithm_trace_type ON algorithm_trace(suggestion_type);
CREATE INDEX idx_algorithm_trace_date ON algorithm_trace(created_at);
CREATE INDEX idx_algorithm_trace_outcome ON algorithm_trace((outcome->>'success'));
```

### 4. Analyses Possibles

#### 4.1 Corrélation Signal → Succès

```sql
-- Quel signal prédit le mieux le succès?
SELECT
  CORR((signals->>'semantic_score')::float, (outcome->>'success')::int) as semantic_corr,
  CORR((signals->>'graph_score')::float, (outcome->>'success')::int) as graph_corr,
  CORR((signals->>'pagerank')::float, (outcome->>'success')::int) as pagerank_corr,
  CORR((signals->>'success_rate')::float, (outcome->>'success')::int) as quality_corr
FROM algorithm_trace
WHERE outcome IS NOT NULL;
```

#### 4.2 Performance par Density Tier

```sql
-- Les poids cold/growing/mature sont-ils bons?
SELECT
  CASE
    WHEN (signals->>'graph_density')::float < 0.01 THEN 'cold'
    WHEN (signals->>'graph_density')::float < 0.10 THEN 'growing'
    ELSE 'mature'
  END as tier,
  AVG((outcome->>'success')::int) as success_rate,
  COUNT(*) as total
FROM algorithm_trace
WHERE outcome IS NOT NULL
GROUP BY tier;
```

#### 4.3 Poids Optimaux (Régression)

```python
# Future: régression linéaire pour trouver poids optimaux
from sklearn.linear_model import LogisticRegression

X = traces[['semantic_score', 'graph_score', 'pagerank', 'success_rate']]
y = traces['outcome_success']

model = LogisticRegression()
model.fit(X, y)

print("Optimal weights:", model.coef_)
# Compare avec nos poids actuels (0.6, 0.3, 0.1, ...)
```

### 5. Métriques Dashboard (Story 6.3 extension)

```typescript
interface AlgorithmMetrics {
  // Par période
  period: "1h" | "24h" | "7d";

  // Success rates par tier
  success_by_tier: {
    cold: { rate: number; count: number };
    growing: { rate: number; count: number };
    mature: { rate: number; count: number };
  };

  // Corrélations actuelles
  signal_correlations: {
    semantic: number;
    graph: number;
    pagerank: number;
    quality: number;
  };

  // Drift detection
  weight_drift: {
    recommended_semantic: number;
    recommended_graph: number;
    current_semantic: number;
    current_graph: number;
    drift_magnitude: number;
  };
}
```

### 6. Implémentation Progressive

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 1** | Logger signals + computed_score | 0.5j |
| **Phase 2** | Logger outcomes (callback) | 0.5j |
| **Phase 3** | Queries SQL pour analyse | 0.5j |
| **Phase 4** | Dashboard metrics | 1j |
| **Phase 5** | Auto-tuning (future) | 2-3j |

## Consequences

### Positives

- **Visibilité:** On comprend comment les algos performent
- **Data-driven:** Décisions basées sur des données, pas des intuitions
- **Préparation:** Ready pour adaptive weights quand on aura assez de data
- **Debug:** Plus facile de diagnostiquer pourquoi une suggestion était mauvaise

### Negatives

- **Storage:** ~200 bytes/trace, potentiellement beaucoup de données
- **Performance:** Léger overhead pour le logging (mitigé par async)
- **Complexité:** Nouveau code à maintenir

### Mitigations

```typescript
// Sampling pour réduire volume
const TRACE_SAMPLE_RATE = 0.1; // 10% des requêtes

if (Math.random() < TRACE_SAMPLE_RATE) {
  await logAlgorithmTrace(trace);
}

// Retention policy
// DELETE FROM algorithm_trace WHERE created_at < NOW() - INTERVAL '30 days';
```

## Future: Adaptive Weights

Quand on aura assez de données (~1000 traces avec outcomes), on pourra:

```typescript
class AdaptiveWeightManager {
  private weights: Weights;

  async recalibrate(): Promise<void> {
    // 1. Fetch recent traces with outcomes
    const traces = await this.fetchRecentTraces(1000);

    // 2. Run regression to find optimal weights
    const optimal = this.computeOptimalWeights(traces);

    // 3. Smoothly transition (avoid sudden changes)
    this.weights = this.blend(this.weights, optimal, 0.1); // 10% move

    // 4. Log the change
    log.info(`Weights recalibrated: ${JSON.stringify(this.weights)}`);
  }
}
```

## References

- [ADR-033: Scoring Algorithms Reference](./ADR-033-scoring-algorithms-reference.md)
- [ADR-015: Adaptive Thresholds](./ADR-015-adaptive-thresholds.md)
- `src/graphrag/dag-suggester.ts`
- `src/graphrag/graph-engine.ts`
