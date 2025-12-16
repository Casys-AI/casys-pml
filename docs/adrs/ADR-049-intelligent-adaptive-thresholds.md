# ADR-049: Intelligent Adaptive Thresholds with Local Alpha Integration

**Status:** Proposed
**Date:** 2025-12-16
**Related:** ADR-008 (Episodic Memory), ADR-048 (Local Alpha), ADR-041 (Edge Tracking)

## Context

### Problème Identifié

Le système actuel d'**AdaptiveThresholdManager** (ADR-008) présente plusieurs limitations qui réduisent son intelligence :

```
┌───────────────────────────────────────────────────────────────────────┐
│                    ÉTAT ACTUEL - PROBLÈMES                            │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. THRESHOLD GLOBAL                                                  │
│     read_file → 0.70   ←─┐                                           │
│     delete_file → 0.70  ←┼── Même threshold pour tous !              │
│     git_commit → 0.70  ←─┘                                           │
│                                                                       │
│  2. PAS D'INTÉGRATION AVEC LOCAL ALPHA (ADR-048)                     │
│     Local Alpha dit: "graph fiable pour tool1" → ignoré              │
│                                                                       │
│  3. AJUSTEMENT LINÉAIRE SIMPLE                                       │
│     threshold += 0.05  (oscillation, convergence lente)              │
│                                                                       │
│  4. CONTEXTE TROP GROSSIER                                           │
│     Hash = workflowType|domain|complexity (3 dimensions seulement)   │
│                                                                       │
│  5. MÉMOIRE ÉPISODIQUE SOUS-UTILISÉE                                 │
│     On stocke: speculation_start, task_complete, decisions           │
│     On utilise: seulement taux succès/échec global                   │
│                                                                       │
│  6. SEUIL D'OBSERVATION FIXE POUR EDGES                              │
│     OBSERVED_THRESHOLD = 3 (constant, indépendant du contexte)       │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Recherche: Algorithmes Adaptatifs

#### Thompson Sampling (Bandits Multi-Bras)

[Thompson Sampling](https://en.wikipedia.org/wiki/Thompson_sampling) est un algorithme bayésien qui:
- Maintient une distribution de probabilité **par action** (ici: par tool)
- Balance exploration/exploitation naturellement
- Converge vers l'optimal avec peu d'échantillons
- S'adapte aux changements (non-stationnaire)

**Avantage pour notre cas:** Chaque tool a son propre historique, pas de "moyenne" globale.

#### UCB (Upper Confidence Bound)

[UCB](https://www.geeksforgeeks.org/machine-learning/upper-confidence-bound-algorithm-in-reinforcement-learning/) ajoute un bonus d'incertitude:
- Favorise les actions peu explorées
- Réduire l'incertitude progressivement
- Convergence garantie vers l'optimal

**Avantage pour notre cas:** Cold start tools reçoivent plus d'exploration.

#### Contextual Bandits

[Contextual Bandits](https://arxiv.org/abs/2312.14037) étendent les bandits avec du contexte:
- Le reward dépend du contexte (workflow type, tool utilisé, etc.)
- LinUCB: Linear UCB avec features contextuelles
- Personnalisation par situation

**Avantage pour notre cas:** Le threshold dépend du contexte local + alpha.

#### Adaptive Edge Weighting (GNN)

[HU-GNN](https://arxiv.org/html/2504.19820v2) propose:
- Uncertainty estimation multi-échelle (local, community, global)
- Down-weighting des edges à haute incertitude
- Propagation adaptative basée sur la confiance

**Avantage pour notre cas:** Les edges avec peu d'observations sont pondérés moins fortement.

---

## Decision

Implémenter un système de thresholds intelligent à **3 niveaux** :

### Architecture Proposée

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   INTELLIGENT ADAPTIVE THRESHOLDS                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  NIVEAU 1        │    │  NIVEAU 2        │    │  NIVEAU 3        │  │
│  │  Edge Creation   │    │  Execution       │    │  Episodic        │  │
│  │  Threshold       │    │  Threshold       │    │  Memory Boost    │  │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘  │
│           │                       │                       │             │
│           ▼                       ▼                       ▼             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      LOCAL ALPHA (ADR-048)                        │  │
│  │  - Embeddings Hybrides (Active Search)                           │  │
│  │  - Heat Diffusion (Passive Suggestion)                           │  │
│  │  - Bayesian Cold Start                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      PER-TOOL THOMPSON SAMPLING                   │  │
│  │  tool1: Beta(α=8, β=2)  → 80% success → threshold: 0.62          │  │
│  │  tool2: Beta(α=3, β=7)  → 30% success → threshold: 0.85          │  │
│  │  tool3: Beta(α=1, β=1)  → unknown     → threshold: 0.75 (prior)  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Niveau 1: Adaptive Edge Creation Threshold

### Problème Actuel

```typescript
// Actuellement: seuil FIXE pour passer de inferred → observed
private static readonly OBSERVED_THRESHOLD = 3;
```

**Problème:** Un tool isolé (cold start, alpha=1.0) a le même seuil qu'un tool dans une zone dense (alpha=0.5).

### Solution: Seuil Dynamique basé sur Local Alpha

```typescript
/**
 * Calculate adaptive observation threshold based on local alpha
 *
 * High alpha (sparse neighborhood) → need MORE observations to trust
 * Low alpha (dense neighborhood) → fewer observations sufficient
 *
 * Formula: threshold = 2 + ceil((alpha - 0.5) * 6)
 * - alpha=0.5 → 2 observations (dense, trustworthy)
 * - alpha=0.75 → 4 observations (medium)
 * - alpha=1.0 → 5 observations (sparse, need more proof)
 */
function getAdaptiveObservationThreshold(
  fromToolId: string,
  toToolId: string,
  localAlphaCalculator: LocalAlphaCalculator
): number {
  const fromAlpha = localAlphaCalculator.getLocalAlpha('passive', fromToolId, 'tool', []);
  const toAlpha = localAlphaCalculator.getLocalAlpha('passive', toToolId, 'tool', []);
  const avgAlpha = (fromAlpha + toAlpha) / 2;

  // Dynamic threshold: 2-5 based on alpha
  return 2 + Math.ceil((avgAlpha - 0.5) * 6);
}
```

### Modification de GraphRAGEngine

```typescript
// src/graphrag/graph-engine.ts

private async createOrUpdateEdge(
  fromId: string,
  toId: string,
  edgeType: "contains" | "sequence" | "dependency",
): Promise<"created" | "updated" | "none"> {
  // NEW: Dynamic observation threshold
  const observationThreshold = this.localAlphaCalculator
    ? this.getAdaptiveObservationThreshold(fromId, toId)
    : GraphRAGEngine.OBSERVED_THRESHOLD; // Fallback to static

  if (this.graph.hasEdge(fromId, toId)) {
    const edge = this.graph.getEdgeAttributes(fromId, toId);
    const newCount = (edge.count as number) + 1;

    // Use dynamic threshold instead of static
    let newSource = edge.edge_source as string || "inferred";
    if (newCount >= observationThreshold && newSource === "inferred") {
      newSource = "observed";
    }
    // ...
  }
}
```

---

## Niveau 2: Per-Tool Thompson Sampling Threshold

### Problème Actuel

```typescript
// Actuellement: threshold GLOBAL avec EMA
if (falsePositiveRate > 0.2) {
  threshold += this.config.learningRate;  // +0.05 pour TOUS les tools
}
```

### Solution: Distribution Beta par Tool

Chaque tool maintient une distribution Beta(α, β) de succès:
- **α** = nombre de succès + 1 (prior)
- **β** = nombre d'échecs + 1 (prior)

```typescript
/**
 * Per-tool threshold using Thompson Sampling
 *
 * References:
 * - https://en.wikipedia.org/wiki/Thompson_sampling
 * - https://arxiv.org/abs/2312.14037 (Neural Contextual Bandits)
 */
interface ToolThompsonState {
  toolId: string;
  alpha: number;      // Successes + 1
  beta: number;       // Failures + 1
  lastUpdated: Date;
}

class ThompsonThresholdManager {
  private toolStates: Map<string, ToolThompsonState> = new Map();

  // Prior: Beta(1, 1) = uniform distribution
  private readonly PRIOR_ALPHA = 1;
  private readonly PRIOR_BETA = 1;

  /**
   * Get execution threshold for a tool using Thompson Sampling
   *
   * @param toolId - Tool identifier
   * @param localAlpha - Local alpha from ADR-048 (0.5-1.0)
   * @param riskCategory - Tool risk level
   * @returns Threshold in [0.4, 0.9]
   */
  getThreshold(
    toolId: string,
    localAlpha: number,
    riskCategory: 'safe' | 'moderate' | 'dangerous'
  ): number {
    const state = this.getOrCreateState(toolId);

    // Sample from Beta distribution
    const successRate = this.sampleBeta(state.alpha, state.beta);

    // Base threshold by risk category
    const riskThresholds = {
      safe: 0.55,       // read_file, list_dir
      moderate: 0.70,   // write_file, git_commit
      dangerous: 0.85,  // delete_file, rm -rf
    };
    const baseThreshold = riskThresholds[riskCategory];

    // Adjust based on sampled success rate
    // High success rate → lower threshold (more confident)
    // Low success rate → higher threshold (need more caution)
    const successAdjustment = (0.75 - successRate) * 0.15;  // ±0.075

    // Adjust based on local alpha
    // High alpha → graph unreliable → higher threshold
    // Low alpha → graph reliable → lower threshold
    const alphaAdjustment = (localAlpha - 0.75) * 0.10;  // ±0.025

    const finalThreshold = Math.max(0.40, Math.min(0.90,
      baseThreshold + successAdjustment + alphaAdjustment
    ));

    return finalThreshold;
  }

  /**
   * Update tool state after execution
   */
  recordOutcome(toolId: string, success: boolean): void {
    const state = this.getOrCreateState(toolId);

    if (success) {
      state.alpha += 1;
    } else {
      state.beta += 1;
    }
    state.lastUpdated = new Date();

    // Decay old observations (non-stationary)
    this.applyDecay(state);

    this.toolStates.set(toolId, state);
  }

  /**
   * Sample from Beta distribution (Thompson Sampling core)
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Use approximation: mean with noise based on variance
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const stdDev = Math.sqrt(variance);

    // Sample from normal approximation (good enough for alpha+beta > 10)
    const sample = mean + this.gaussianRandom() * stdDev;
    return Math.max(0, Math.min(1, sample));
  }

  /**
   * Apply decay to handle non-stationary environments
   * (tool behavior may change over time)
   */
  private applyDecay(state: ToolThompsonState): void {
    const DECAY_FACTOR = 0.99;  // 1% decay per observation

    // Keep prior contribution
    state.alpha = Math.max(this.PRIOR_ALPHA, state.alpha * DECAY_FACTOR);
    state.beta = Math.max(this.PRIOR_BETA, state.beta * DECAY_FACTOR);
  }

  private gaussianRandom(): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private getOrCreateState(toolId: string): ToolThompsonState {
    if (!this.toolStates.has(toolId)) {
      this.toolStates.set(toolId, {
        toolId,
        alpha: this.PRIOR_ALPHA,
        beta: this.PRIOR_BETA,
        lastUpdated: new Date(),
      });
    }
    return this.toolStates.get(toolId)!;
  }
}
```

### Visualisation Thompson Sampling

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   THOMPSON SAMPLING PER TOOL                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  read_file: Beta(45, 5)                                                 │
│  ├── Mean: 90% success                                                  │
│  ├── Sampled: 0.88                                                      │
│  ├── Base threshold (safe): 0.55                                        │
│  ├── Success adjustment: -0.02                                          │
│  ├── Alpha adjustment: 0.00                                             │
│  └── Final threshold: 0.53  ✓ Speculate often                           │
│                                                                          │
│  delete_file: Beta(3, 7)                                                │
│  ├── Mean: 30% success                                                  │
│  ├── Sampled: 0.35                                                      │
│  ├── Base threshold (dangerous): 0.85                                   │
│  ├── Success adjustment: +0.06                                          │
│  ├── Alpha adjustment: +0.02                                            │
│  └── Final threshold: 0.90  ✗ Always ask human                          │
│                                                                          │
│  new_tool_xyz: Beta(1, 1)  [Cold Start]                                 │
│  ├── Mean: 50% (unknown)                                                │
│  ├── Sampled: 0.60 (high variance)                                      │
│  ├── Base threshold (moderate): 0.70                                    │
│  ├── Success adjustment: +0.02                                          │
│  ├── Alpha adjustment: +0.03 (cold start alpha=1.0)                     │
│  └── Final threshold: 0.75  △ Explore cautiously                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Niveau 3: Episodic Memory-Enhanced Boost

### Problème Actuel

La mémoire épisodique stocke des événements mais ne les utilise que pour calculer un taux de succès global.

### Solution: Similar Situation Retrieval

```typescript
/**
 * Enhanced episodic boost using similar situations
 *
 * Queries episodic memory for situations similar to current context,
 * then adjusts confidence based on historical outcomes.
 */
class EpisodicBoostCalculator {
  constructor(
    private episodicMemory: EpisodicMemoryStore,
    private db: PGliteClient
  ) {}

  /**
   * Calculate episodic boost for a prediction
   *
   * @param toolId - Tool being considered
   * @param context - Current workflow context
   * @param localAlpha - Local alpha from ADR-048
   * @returns Boost value in [-0.10, +0.15]
   */
  async calculateBoost(
    toolId: string,
    context: ThresholdContext,
    localAlpha: number
  ): Promise<{
    boost: number;
    confidence: number;
    matchedSituations: number;
    reasoning: string;
  }> {
    // 1. Query similar situations from algorithm_traces
    const similarTraces = await this.findSimilarTraces(toolId, context, localAlpha);

    if (similarTraces.length < 3) {
      return {
        boost: 0,
        confidence: 0,
        matchedSituations: 0,
        reasoning: 'Insufficient historical data'
      };
    }

    // 2. Calculate success rate in similar situations
    const successCount = similarTraces.filter(t =>
      t.decision === 'accepted' && t.final_score > 0.7
    ).length;
    const successRate = successCount / similarTraces.length;

    // 3. Calculate confidence based on sample size
    const sampleConfidence = Math.min(1.0, similarTraces.length / 20);

    // 4. Calculate boost
    // Success rate > 70% → positive boost
    // Success rate < 50% → negative boost
    let boost = 0;
    if (successRate > 0.70) {
      boost = (successRate - 0.70) * 0.5 * sampleConfidence;  // Max +0.15
    } else if (successRate < 0.50) {
      boost = (successRate - 0.50) * 0.4 * sampleConfidence;  // Max -0.10
    }

    return {
      boost,
      confidence: sampleConfidence,
      matchedSituations: similarTraces.length,
      reasoning: `Found ${similarTraces.length} similar situations with ${(successRate * 100).toFixed(0)}% success rate`
    };
  }

  /**
   * Find similar historical traces using multiple dimensions
   */
  private async findSimilarTraces(
    toolId: string,
    context: ThresholdContext,
    localAlpha: number
  ): Promise<AlgorithmTrace[]> {
    // Multi-dimensional similarity search
    const result = await this.db.query(`
      SELECT *
      FROM algorithm_traces
      WHERE
        -- Same tool or similar tools in same community
        (
          (signals->>'targetToolId')::text = $1
          OR (signals->>'community')::text = (
            SELECT (signals->>'community')::text
            FROM algorithm_traces
            WHERE (signals->>'targetToolId')::text = $1
            LIMIT 1
          )
        )
        -- Similar alpha (within 0.1)
        AND ABS((params->>'alpha')::float - $2) < 0.1
        -- Same workflow type if specified
        AND ($3 IS NULL OR (signals->>'workflowType')::text = $3)
        -- Recent (last 30 days)
        AND timestamp > NOW() - INTERVAL '30 days'
      ORDER BY
        -- Prioritize exact tool matches
        CASE WHEN (signals->>'targetToolId')::text = $1 THEN 0 ELSE 1 END,
        -- Then by alpha similarity
        ABS((params->>'alpha')::float - $2),
        -- Then by recency
        timestamp DESC
      LIMIT 50
    `, [toolId, localAlpha, context.workflowType || null]);

    return result;
  }
}
```

---

## Integration: Combined Threshold Calculation

```typescript
/**
 * Intelligent Adaptive Threshold Manager
 *
 * Combines all three levels:
 * 1. Per-tool Thompson Sampling
 * 2. Local Alpha adjustment
 * 3. Episodic memory boost
 */
class IntelligentThresholdManager {
  constructor(
    private thompsonManager: ThompsonThresholdManager,
    private localAlphaCalculator: LocalAlphaCalculator,
    private episodicBoost: EpisodicBoostCalculator,
    private toolRiskRegistry: ToolRiskRegistry
  ) {}

  /**
   * Get intelligent threshold for tool execution
   */
  async getThreshold(
    toolId: string,
    contextTools: string[],
    workflowContext: ThresholdContext
  ): Promise<{
    threshold: number;
    breakdown: ThresholdBreakdown;
  }> {
    // 1. Get local alpha for this tool
    const alphaResult = this.localAlphaCalculator.getLocalAlphaWithBreakdown(
      'passive',
      toolId,
      'tool',
      contextTools
    );

    // 2. Get tool risk category
    const riskCategory = this.toolRiskRegistry.getRiskCategory(toolId);

    // 3. Get Thompson-based threshold
    const thompsonThreshold = this.thompsonManager.getThreshold(
      toolId,
      alphaResult.alpha,
      riskCategory
    );

    // 4. Get episodic boost
    const episodicResult = await this.episodicBoost.calculateBoost(
      toolId,
      workflowContext,
      alphaResult.alpha
    );

    // 5. Combine: threshold - boost (boost lowers threshold if positive)
    const finalThreshold = Math.max(0.40, Math.min(0.90,
      thompsonThreshold - episodicResult.boost
    ));

    return {
      threshold: finalThreshold,
      breakdown: {
        baseThreshold: this.getRiskBaseThreshold(riskCategory),
        thompsonAdjustment: thompsonThreshold - this.getRiskBaseThreshold(riskCategory),
        localAlpha: alphaResult.alpha,
        alphaAlgorithm: alphaResult.algorithm,
        coldStart: alphaResult.coldStart,
        episodicBoost: episodicResult.boost,
        episodicConfidence: episodicResult.confidence,
        episodicMatches: episodicResult.matchedSituations,
        finalThreshold,
      }
    };
  }

  /**
   * Record execution outcome for learning
   */
  async recordOutcome(
    toolId: string,
    success: boolean,
    confidence: number,
    context: ThresholdContext
  ): Promise<void> {
    // Update Thompson state
    this.thompsonManager.recordOutcome(toolId, success);

    // The episodic memory is already captured via algorithm_traces
    // (fire-and-forget in DAGSuggester)
  }

  private getRiskBaseThreshold(risk: 'safe' | 'moderate' | 'dangerous'): number {
    const thresholds = { safe: 0.55, moderate: 0.70, dangerous: 0.85 };
    return thresholds[risk];
  }
}
```

---

## Tool Risk Registry

```typescript
/**
 * Registry of tool risk categories
 *
 * Risk determines base threshold:
 * - safe: Low impact, reversible (read_file, list_dir)
 * - moderate: Medium impact (write_file, git_commit)
 * - dangerous: High impact, irreversible (delete_file, rm, DROP TABLE)
 */
interface ToolRiskRegistry {
  getRiskCategory(toolId: string): 'safe' | 'moderate' | 'dangerous';
}

const RISK_PATTERNS: Record<string, 'safe' | 'moderate' | 'dangerous'> = {
  // Safe operations (read-only, reversible)
  'read': 'safe',
  'list': 'safe',
  'search': 'safe',
  'get': 'safe',
  'fetch': 'safe',
  'query': 'safe',

  // Moderate operations (writes, but recoverable)
  'write': 'moderate',
  'create': 'moderate',
  'update': 'moderate',
  'commit': 'moderate',
  'push': 'moderate',
  'insert': 'moderate',

  // Dangerous operations (destructive, irreversible)
  'delete': 'dangerous',
  'remove': 'dangerous',
  'drop': 'dangerous',
  'truncate': 'dangerous',
  'format': 'dangerous',
  'reset': 'dangerous',
};

function classifyToolRisk(toolId: string): 'safe' | 'moderate' | 'dangerous' {
  const lowerToolId = toolId.toLowerCase();

  for (const [pattern, risk] of Object.entries(RISK_PATTERNS)) {
    if (lowerToolId.includes(pattern)) {
      return risk;
    }
  }

  // Default: moderate (cautious)
  return 'moderate';
}
```

---

## Database Schema Changes

### New Table: tool_thompson_states

```sql
-- Migration: 016_tool_thompson_states.sql

CREATE TABLE tool_thompson_states (
  tool_id TEXT PRIMARY KEY,
  alpha REAL NOT NULL DEFAULT 1.0,      -- Successes + prior
  beta REAL NOT NULL DEFAULT 1.0,       -- Failures + prior
  total_executions INTEGER DEFAULT 0,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_alpha CHECK (alpha >= 1.0),
  CONSTRAINT valid_beta CHECK (beta >= 1.0)
);

CREATE INDEX idx_thompson_updated ON tool_thompson_states(updated_at DESC);

-- Tool risk overrides (for explicit categorization)
CREATE TABLE tool_risk_overrides (
  tool_id TEXT PRIMARY KEY,
  risk_category TEXT NOT NULL CHECK (risk_category IN ('safe', 'moderate', 'dangerous')),
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Implementation Plan

### Phase 1: Per-Tool Thompson Sampling (Priority: High)

| Task | Effort | Files |
|------|--------|-------|
| Create `ThompsonThresholdManager` class | 3h | `src/learning/thompson-threshold.ts` |
| Add migration for `tool_thompson_states` | 0.5h | `src/db/migrations/016_*.ts` |
| Integrate into `AdaptiveThresholdManager` | 2h | `src/mcp/adaptive-threshold.ts` |
| Unit tests for Thompson sampling | 2h | `tests/unit/learning/thompson_test.ts` |
| **Total Phase 1** | **7.5h** | |

### Phase 2: Local Alpha Integration (Priority: High)

| Task | Effort | Files |
|------|--------|-------|
| Connect `LocalAlphaCalculator` to threshold | 1h | `src/mcp/adaptive-threshold.ts` |
| Add `ToolRiskRegistry` | 1h | `src/learning/tool-risk.ts` |
| Update threshold calculation formula | 1h | `src/mcp/adaptive-threshold.ts` |
| Integration tests | 1.5h | `tests/integration/threshold_test.ts` |
| **Total Phase 2** | **4.5h** | |

### Phase 3: Episodic Memory Enhancement (Priority: Medium)

| Task | Effort | Files |
|------|--------|-------|
| Create `EpisodicBoostCalculator` | 2h | `src/learning/episodic-boost.ts` |
| Add similarity query to `algorithm_traces` | 1h | `src/graphrag/algorithm-tracer.ts` |
| Integrate boost into threshold | 1h | `src/mcp/adaptive-threshold.ts` |
| Tests for episodic boost | 1.5h | `tests/unit/learning/episodic_boost_test.ts` |
| **Total Phase 3** | **5.5h** | |

### Phase 4: Adaptive Edge Threshold (Priority: Low)

| Task | Effort | Files |
|------|--------|-------|
| Add `getAdaptiveObservationThreshold()` | 1h | `src/graphrag/graph-engine.ts` |
| Modify `createOrUpdateEdge()` | 0.5h | `src/graphrag/graph-engine.ts` |
| Tests for dynamic edge threshold | 1h | `tests/unit/graphrag/edge_threshold_test.ts` |
| **Total Phase 4** | **2.5h** | |

### Total Estimated Effort

```
Phase 1 (Thompson):    7.5h
Phase 2 (Alpha):       4.5h
Phase 3 (Episodic):    5.5h
Phase 4 (Edges):       2.5h
─────────────────────────────
Total:                20.0h (~3 days)
```

---

## Consequences

### Positives

- ✅ **Per-tool learning**: Each tool converges to its optimal threshold
- ✅ **Local Alpha integrated**: Graph reliability affects threshold
- ✅ **Risk-aware**: Dangerous operations require higher confidence
- ✅ **Cold start handled**: Thompson prior + Bayesian alpha
- ✅ **Episodic boost**: Similar past situations inform decisions
- ✅ **Non-stationary**: Decay factor adapts to changing tool behavior
- ✅ **Observable**: Full breakdown of threshold calculation

### Negatives

- ⚠️ **Complexity increase**: 3 layers vs 1 (EMA only)
- ⚠️ **More state to persist**: Per-tool Thompson states
- ⚠️ **Tuning required**: Risk categories, decay factor, boost weights

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Thompson divergence | Low | Medium | Decay factor, bounds |
| Episodic query slow | Medium | Low | Index, limit, cache |
| Risk misclassification | Medium | High | Override table, review |

---

## Success Metrics

### Must-Have

- ✅ Per-tool thresholds converge within 20 executions
- ✅ Dangerous tools always have threshold ≥ 0.80
- ✅ Safe tools can have threshold as low as 0.45
- ✅ Cold start tools start at 0.75 (moderate)

### Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Speculation success rate | 70% | 85% |
| False positive rate | 20% | 10% |
| Convergence time (per tool) | N/A | 20 executions |
| Threshold calculation latency | N/A | <5ms |

### Learning Quality

| Metric | Target |
|--------|--------|
| Thompson variance after 50 executions | <0.05 |
| Episodic boost hit rate | >40% |
| Risk classification accuracy | >95% |

---

## References

### Academic / Industry

- [Thompson Sampling](https://en.wikipedia.org/wiki/Thompson_sampling) - Wikipedia
- [UCB Algorithm](https://www.geeksforgeeks.org/machine-learning/upper-confidence-bound-algorithm-in-reinforcement-learning/) - GeeksforGeeks
- [Neural Contextual Bandits](https://arxiv.org/abs/2312.14037) - arXiv 2023
- [Contextual Bandits for Personalization](https://arxiv.org/abs/2003.00359) - arXiv 2020
- [Adaptive Edge Weighting](https://link.springer.com/article/10.1007/s10994-016-5607-3) - Machine Learning Journal
- [HU-GNN: Hierarchical Uncertainty-Aware GNN](https://arxiv.org/html/2504.19820v2) - arXiv 2025

### Internal ADRs

- ADR-008: Episodic Memory & Adaptive Thresholds
- ADR-041: Hierarchical Trace Tracking
- ADR-048: Local Adaptive Alpha

---

## Appendix: Mathematical Formulas

### Thompson Sampling Posterior

Given:
- α = successes + 1 (prior)
- β = failures + 1 (prior)

Success rate estimate:
```
E[θ] = α / (α + β)
Var[θ] = αβ / ((α + β)² (α + β + 1))
```

### Threshold Formula

```
threshold = base(risk) + thompson_adj + alpha_adj - episodic_boost

Where:
  base(risk) ∈ {0.55, 0.70, 0.85}
  thompson_adj = (0.75 - sampled_rate) × 0.15
  alpha_adj = (local_alpha - 0.75) × 0.10
  episodic_boost ∈ [-0.10, +0.15]
```

### Adaptive Edge Threshold

```
observation_threshold = 2 + ceil((avg_alpha - 0.5) × 6)

Where:
  avg_alpha = (alpha_from + alpha_to) / 2
  Result ∈ [2, 5]
```
