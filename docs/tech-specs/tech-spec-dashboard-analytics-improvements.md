# Tech-Spec: Dashboard Analytics Improvements

**Created:** 2025-12-12
**Status:** Completed
**ADR Reference:** ADR-039 (Algorithm Observability & Adaptive Weight Preparation)

## Overview

### Problem Statement

Le dashboard actuel (`MetricsPanel`) affiche des métriques basiques (nodes, edges, acceptance rate) mais ne fournit pas les insights nécessaires pour valider et tuner les algorithmes de scoring selon ADR-039 :

1. **Pas de Spectral Relevance** - Impossible de savoir si le clustering spectral améliore les suggestions
2. **Pas de Threshold Efficiency** - Impossible de savoir si les seuils filtrent trop/pas assez
3. **Pas d'histogramme de scores** - Distribution des scores invisible
4. **Données algorithm limitées** - Juste des moyennes, pas de breakdown détaillé
5. **Pas de séparation Graph vs Hypergraph** - Les métriques des algos graph simples (PageRank, Adamic-Adar) sont mélangées avec celles des algos hypergraph (Spectral Clustering, capability matching)

### Solution

Enrichir l'API `/api/metrics` et le `MetricsPanel` (mode dashboard) avec les métriques ADR-039 manquantes, tout en gardant le `TracingPanel` intact (journal temps réel).

### Scope

**In Scope:**
- Étendre `getAlgorithmStats()` dans `graph-engine.ts` avec métriques ADR-039
- Ajouter section "Algorithm Insights" dans le dashboard mode de `MetricsPanel`
- Nouveaux graphiques : score histogram, spectral relevance gauge, threshold efficiency

**Out of Scope:**
- Modifications au `TracingPanel` (reste un journal SSE)
- Nouvelle route `/analytics` séparée
- Export CSV/JSON

## Context for Development

### Codebase Patterns

**API Pattern:**
```typescript
// gateway-server.ts:2920 - route existante
if (url.pathname === "/api/metrics" && req.method === "GET") {
  const metrics = await this.graphEngine.getMetrics(range);
  return new Response(JSON.stringify(metrics), { ... });
}
```

**Component Pattern (Preact Islands):**
```typescript
// MetricsPanel.tsx - structure existante
export default function MetricsPanel({ apiBase }: MetricsPanelProps) {
  const [metrics, setMetrics] = useState<GraphMetricsResponse | null>(null);
  // ... fetch from /api/metrics
  // ... render with Chart.js
}
```

**Atom Components disponibles:**
- `MetricCard` - affichage métrique compact/full
- `ProgressBar` - barre de progression avec label
- `SectionCard` - section collapsible
- `RankItem` - item de classement

### Files to Reference

| Fichier | Rôle | Modifications |
|---------|------|---------------|
| `src/graphrag/graph-engine.ts` | `getAlgorithmStats()` L1738 | Étendre avec métriques ADR-039 |
| `src/web/islands/MetricsPanel.tsx` | Dashboard UI | Ajouter section Algorithm Insights |
| `src/graphrag/types.ts` | Types GraphMetricsResponse | Étendre interface algorithm |
| `src/telemetry/algorithm-tracer.ts` | Référence queries | Pattern SQL à réutiliser |

### Technical Decisions

1. **Pattern BFF respecté** - Fresh (MetricsPanel) n'accède JAMAIS à la DB directement
   - Toutes les queries SQL restent dans le Gateway (`graph-engine.ts`)
   - Le frontend consomme uniquement l'API `/api/metrics` existante (enrichie)
   - Réf: `docs/tech-specs/tech-spec-fresh-bff-refactoring.md`

2. **Pas de nouvelle route API** - Enrichir `/api/metrics` existante
   - Le MetricsPanel appelle déjà `${apiBase}/api/metrics`
   - On ajoute juste de nouvelles données dans la réponse

3. **Chart.js pour les nouveaux graphiques** - Déjà utilisé dans MetricsPanel

4. **Calculs côté serveur (Gateway)** - Éviter de surcharger le client avec des données brutes

```
┌─────────────────────────────────────────────────────────────┐
│  MetricsPanel (Fresh Island)                                │
│  ❌ NO direct DB access                                     │
│  ✅ fetch(`${apiBase}/api/metrics`)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP GET /api/metrics?range=24h
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Gateway API (graph-engine.ts)                              │
│  ✅ getMetrics() → getAlgorithmStats()                      │
│  ✅ Queries SQL sur algorithm_traces                        │
│  ✅ Retourne GraphMetricsResponse enrichi                   │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Tasks

- [x] **Task 1: Étendre types GraphMetricsResponse**
  - Fichier: `src/graphrag/types.ts`
  - Ajouter à l'interface `algorithm`:
    ```typescript
    // Séparation Graph vs Hypergraph
    byGraphType: {
      graph: {
        // Algos simples: PageRank, Adamic-Adar, co-occurrence
        count: number;
        avgScore: number;
        acceptanceRate: number;
        topSignals: { pagerank: number; adamicAdar: number; cooccurrence: number };
      };
      hypergraph: {
        // Algos avancés: Spectral Clustering, capability matching
        count: number;
        avgScore: number;
        acceptanceRate: number;
        spectralRelevance: {
          withClusterMatch: { count: number; avgScore: number; selectedRate: number };
          withoutClusterMatch: { count: number; avgScore: number; selectedRate: number };
        };
      };
    };
    thresholdEfficiency: {
      rejectedByThreshold: number;
      totalEvaluated: number;
      rejectionRate: number;
    };
    scoreDistribution: {
      graph: Array<{ bucket: string; count: number }>;
      hypergraph: Array<{ bucket: string; count: number }>;
    };
    byMode: {
      activeSearch: { count: number; avgScore: number; acceptanceRate: number };
      passiveSuggestion: { count: number; avgScore: number; acceptanceRate: number };
    };
    ```

  - **Logique de classification Graph vs Hypergraph:**
    - `hypergraph` si `target_type = 'capability'` OU `signals.spectralClusterMatch IS NOT NULL`
    - `graph` sinon (tool lookups simples basés sur PageRank/Adamic-Adar)

- [x] **Task 2: Implémenter queries SQL dans getAlgorithmStats() (GATEWAY ONLY)**
  - Fichier: `src/graphrag/graph-engine.ts:1738`
  - ⚠️ **Pattern BFF:** Toutes les queries SQL ici, JAMAIS dans Fresh/islands

  - **Query graph vs hypergraph stats:**
    ```sql
    SELECT
      CASE
        WHEN target_type = 'capability' OR signals->>'spectralClusterMatch' IS NOT NULL
        THEN 'hypergraph'
        ELSE 'graph'
      END as graph_type,
      COUNT(*) as count,
      AVG(final_score) as avg_score,
      COUNT(*) FILTER (WHERE decision = 'accepted')::float / NULLIF(COUNT(*), 0) as acceptance_rate,
      AVG((signals->>'pagerank')::float) as avg_pagerank,
      AVG((signals->>'adamicAdar')::float) as avg_adamic_adar,
      AVG((signals->>'cooccurrence')::float) as avg_cooccurrence
    FROM algorithm_traces
    WHERE timestamp >= $1
    GROUP BY graph_type
    ```

  - **Query spectral relevance (hypergraph only):**
    ```sql
    SELECT
      (signals->>'spectralClusterMatch')::boolean as cluster_match,
      COUNT(*) as count,
      AVG(final_score) as avg_score,
      COUNT(*) FILTER (WHERE outcome->>'userAction' = 'selected')::float / NULLIF(COUNT(*), 0) as selected_rate
    FROM algorithm_traces
    WHERE timestamp >= $1
      AND (target_type = 'capability' OR signals->>'spectralClusterMatch' IS NOT NULL)
    GROUP BY cluster_match
    ```

  - **Query score distribution par graph_type:**
    ```sql
    SELECT
      CASE
        WHEN target_type = 'capability' OR signals->>'spectralClusterMatch' IS NOT NULL
        THEN 'hypergraph'
        ELSE 'graph'
      END as graph_type,
      FLOOR(final_score * 10) / 10 as bucket,
      COUNT(*) as count
    FROM algorithm_traces
    WHERE timestamp >= $1
    GROUP BY graph_type, bucket
    ORDER BY graph_type, bucket
    ```

  - **Query by mode:**
    ```sql
    SELECT
      algorithm_mode,
      COUNT(*) as count,
      AVG(final_score) as avg_score,
      COUNT(*) FILTER (WHERE decision = 'accepted')::float / NULLIF(COUNT(*), 0) as acceptance_rate
    FROM algorithm_traces
    WHERE timestamp >= $1
    GROUP BY algorithm_mode
    ```

- [x] **Task 3: Ajouter section "Algorithm Insights" au dashboard mode (UI ONLY)**
  - Fichier: `src/web/islands/MetricsPanel.tsx`
  - Position: après la section "Algorithm Section" existante (L421)
  - ⚠️ **Pattern BFF:** Consommer uniquement `metrics.algorithm` depuis l'API, pas d'accès DB

  - **Layout avec tabs Graph / Hypergraph:**
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │  Algorithm Insights    [Graph] [Hypergraph]  ← Tab switcher │
    ├─────────────────────────────────────────────────────────────┤
    │                                                             │
    │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
    │  │ Count       │ │ Avg Score   │ │ Accept Rate │           │
    │  │ 1,234       │ │ 0.72        │ │ 68%         │           │
    │  └─────────────┘ └─────────────┘ └─────────────┘           │
    │                                                             │
    │  Score Distribution                                         │
    │  ████████░░░░ 0.7-0.8: 234                                  │
    │  ██████░░░░░░ 0.6-0.7: 156                                  │
    │  ████░░░░░░░░ 0.5-0.6: 89                                   │
    │                                                             │
    │  [Si Hypergraph tab:]                                       │
    │  ┌─────────────────────────────────────────────┐           │
    │  │ Spectral Relevance                          │           │
    │  │ With cluster:    0.82 avg, 72% selected    │           │
    │  │ Without cluster: 0.61 avg, 45% selected    │           │
    │  └─────────────────────────────────────────────┘           │
    │                                                             │
    │  [Si Graph tab:]                                            │
    │  ┌─────────────────────────────────────────────┐           │
    │  │ Top Signals                                  │           │
    │  │ PageRank: 0.34  Adamic-Adar: 0.21          │           │
    │  └─────────────────────────────────────────────┘           │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────┐
    │  Threshold & Mode (commun aux deux)                        │
    ├─────────────────────────────────────────────────────────────┤
    │  Rejection Rate: ████████░░ 23%                            │
    │                                                             │
    │  By Mode:                                                   │
    │  ┌──────────────────┐ ┌──────────────────┐                 │
    │  │ Active Search    │ │ Passive Suggest  │                 │
    │  │ 0.78 avg (85%)   │ │ 0.65 avg (62%)   │                 │
    │  └──────────────────┘ └──────────────────┘                 │
    └─────────────────────────────────────────────────────────────┘
    ```

  - Composants à implémenter:
    1. **Tab switcher** - Toggle state `graphType: 'graph' | 'hypergraph'`
    2. **Stats row** - 3 MetricCards (count, avg score, acceptance rate) - données filtrées par tab
    3. **Score Distribution Histogram** - Bar chart horizontal filtré par graph_type
    4. **Spectral Relevance** (hypergraph only) - 2 MetricCards comparison
    5. **Top Signals** (graph only) - 3 MetricCards pour pagerank/adamicAdar/cooccurrence
    6. **Threshold Efficiency** - ProgressBar avec rejection rate (global)
    7. **Mode Comparison** - 2 cards active_search vs passive_suggestion (global)

- [x] **Task 4: Ajouter charts refs et configuration**
  - Fichier: `src/web/islands/MetricsPanel.tsx`
  - Nouveau ref: `chartRefs.scoreDistribution`
  - Config Chart.js pour histogram horizontal

- [x] **Task 5: Tests et validation**
  - Vérifier que les données s'affichent correctement
  - Tester avec différentes plages (1h, 24h, 7d)
  - Vérifier le rendu responsive

### Acceptance Criteria

- [x] **AC 1:** Given le dashboard mode ouvert, When des traces existent dans algorithm_traces, Then la section "Algorithm Insights" affiche:
  - Tab switcher [Graph] / [Hypergraph]
  - Stats row (count, avg score, acceptance rate) filtrées par tab sélectionné
  - Score distribution histogram filtré par graph type
  - Threshold efficiency percentage (global)
  - Breakdown par mode active/passive (global)

- [x] **AC 2:** Given le tab "Graph" sélectionné, When l'utilisateur consulte les insights, Then il voit:
  - Les métriques des algos simples (PageRank, Adamic-Adar, co-occurrence)
  - L'histogramme des scores graph uniquement
  - Les signaux moyens (avg pagerank, avg adamicAdar)

- [x] **AC 3:** Given le tab "Hypergraph" sélectionné, When l'utilisateur consulte les insights, Then il voit:
  - Les métriques des algos avancés (Spectral Clustering, capability matching)
  - L'histogramme des scores hypergraph uniquement
  - La comparaison Spectral Relevance (with/without cluster match)

- [x] **AC 4:** Given des traces avec spectral_cluster_match=true, When on compare avec celles sans cluster match, Then le ratio selected/total est visible pour valider l'efficacité du clustering spectral

- [x] **AC 5:** Given le time range selector (1h/24h/7d), When l'utilisateur change la période, Then toutes les métriques (graph et hypergraph) se mettent à jour

- [x] **AC 6:** Given aucune trace dans la période sélectionnée, When l'utilisateur ouvre le dashboard, Then la section Algorithm Insights affiche "No algorithm traces for this period"

## Additional Context

### Dependencies

- `Chart.js` (déjà chargé via CDN dans dashboard.tsx)
- Table `algorithm_traces` (migration existante Story 7.6)
- Types PGlite queries (pattern existant)

### Testing Strategy

1. **Unit test** pour les nouvelles queries SQL (mock db)
2. **Integration test** pour `/api/metrics` endpoint avec données de test
3. **Visual test** via Playwright snapshot du dashboard mode

### Notes

- Les données `outcome` peuvent être nulles si l'utilisateur n'a pas encore interagi - gérer ce cas
- Le score distribution doit gérer les buckets vides (afficher 0)
- Performance: les queries doivent rester < 100ms même avec 10k traces
