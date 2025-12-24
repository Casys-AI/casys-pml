# Tech Spec: SHGAT Multi-Head Attention sur Traces d'Exécution

**Status:** Complete (All 5 Phases Implemented)
**Date:** 2025-12-24
**Epic:** 11 - SHGAT Learning
**Related ADRs:** ADR-051 (Unified Search Simplification)
**Supersedes:** SHGAT 3-head architecture (semantic/structure/temporal)

## 1. Contexte et Motivation

### Problème actuel

Notre implémentation SHGAT utilise 3 têtes avec des signaux **manuellement séparés** :
- Head 0: Semantic (cosine similarity)
- Head 1: Structure (PageRank, AdamicAdar)
- Head 2: Temporal (recency, cooccurrence)

Les benchmarks d'ablation montrent que `semantic_only` performe mieux (MRR 0.364) que les configurations multi-head (MRR 0.320). Cela suggère que nos signaux structure/temporal sont du **bruit** plutôt que du signal utile.

### Insight clé

Dans GAT classique, les 8 têtes apprennent des **patterns différents** sur le **même signal riche**. Notre approche devrait faire pareil :

```
❌ Actuel: 3 signaux faibles → 3 têtes spécialisées manuellement
✅ Proposé: 1 signal riche (traces) → K têtes apprennent des patterns
```

### Données disponibles

Nous avons des données riches dans `execution_trace` et `episodic_events` :

```sql
-- execution_trace (source principale)
CREATE TABLE execution_trace (
  id UUID PRIMARY KEY,
  capability_id UUID REFERENCES workflow_pattern(pattern_id),
  intent_text TEXT,
  executed_at TIMESTAMPTZ,
  success BOOLEAN NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,
  executed_path TEXT[],        -- Capabilities + tools dans l'ordre (ex: ["cap_A", "fs:read", "github:create"])
  decisions JSONB,             -- Décisions prises pendant l'exécution
  task_results JSONB,          -- Résultats des tâches
  priority FLOAT DEFAULT 0.5   -- Pour PER sampling (|TD error|)
);

-- episodic_events (events fins)
CREATE TABLE episodic_events (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL,    -- 'speculation_start', 'task_complete', 'ail_decision', 'hil_decision'
  task_id TEXT,
  timestamp TIMESTAMPTZ,
  data JSONB NOT NULL          -- Données flexibles par type d'event
);
```

## 2. Ce qu'on GARDE vs REMPLACE (dans shgat.ts)

### ✅ GARDER tel quel (code existant)

| Méthode/Composant | Fichier | Raison |
|-------------------|---------|--------|
| `trainBatch()` | shgat.ts:1439 | Batch training avec backprop - garder la structure |
| `predictPathSuccess()` | shgat.ts:1252 | TD Learning - réutiliser |
| `registerTool()`, `registerCapability()` | shgat.ts:547,555 | Enregistrement nodes |
| `forward()` (V→E→V) | shgat.ts:724 | Two-phase message passing |
| `exportParams()`, `importParams()` | shgat.ts:1822,1832 | Serialization |
| `getStats()` | shgat.ts:1880 | Metrics |
| Utilities: `sigmoid`, `softmax`, `dot`, `cosineSimilarity` | shgat.ts:1790+ | Math helpers |
| Gradient infrastructure | shgat.ts:1570+ | Accumulators, apply |
| `execution_trace` table | DB | Source de traces |
| `episodic_events` table | DB | Events fins |
| PER sampling (`priority` column) | execute-handler.ts | Prioritized replay |

### 🔄 MODIFIER (refactorer)

| Méthode | Modification | Raison |
|---------|--------------|--------|
| `scoreAllCapabilities()` | Utiliser K têtes génériques au lieu de 3 spécialisées | Multi-head learned |
| `scoreAllTools()` | Idem | Multi-head learned |
| `SHGATConfig` | Ajouter `maxBufferSize`, `minTracesForTraining` | Scaling |
| `computeFusionWeights()` | K poids au lieu de 3 | Plus de têtes |

### ❌ SUPPRIMER

| Composant | Raison |
|-----------|--------|
| `applyHeadFeatures()` | Remplacé par attention learned |
| `HeadWeightConfig` interface | Plus de têtes spécialisées |
| `FusionWeights` (semantic/structure/temporal) | Remplacé par K poids génériques |
| `FeatureWeights` (semantic/structure/temporal) | Idem |
| `DEFAULT_HEAD_WEIGHTS`, `DEFAULT_FUSION_WEIGHTS` | Obsolètes |

### ➕ AJOUTER

| Composant | Description |
|-----------|-------------|
| `TraceFeatures` interface | Features riches extraites des traces |
| `extractTraceFeatures()` | Extraction depuis DB |
| `AttentionHead` class | Une tête d'attention générique (W_Q, W_K, W_V) |
| `getAdaptiveConfig()` | Scaling K selon volume traces |

## 3. Architecture Proposée

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHGAT Multi-Head v2                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input Layer                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ TraceFeatures (per candidate tool/capability)           │   │
│  │ - intentEmbedding: number[1024]     (BGE-M3)           │   │
│  │ - candidateEmbedding: number[1024]  (BGE-M3)           │   │
│  │ - contextEmbeddings: number[K][1024] (recent tools)    │   │
│  │ - traceStats: number[D]             (derived features) │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Feature Projection                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Project all features to hidden_dim (64)                 │   │
│  │ combined = [intent; candidate; context_agg; stats]      │   │
│  │ projected = W_proj * combined  → R^hidden_dim           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Multi-Head Attention (K=8 heads)                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Head 1-8 ──→ [learned patterns] ──→ score_1..8         │   │
│  │                                                         │   │
│  │ Chaque tête apprend des patterns différents sur les    │   │
│  │ mêmes TraceFeatures (semantic, usage, cooccurrence...) │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Fusion Layer                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ concat([score_1, ..., score_8])                        │   │
│  │ → MLP(hidden_dim, hidden_dim/2, 1)                     │   │
│  │ → sigmoid → final_score ∈ [0,1]                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 TraceFeatures Interface

> **Source of truth:** `src/graphrag/algorithms/shgat-types.ts`

```typescript
interface TraceFeatures {
  intentEmbedding: number[];      // User intent (BGE-M3, 1024D)
  candidateEmbedding: number[];   // Tool/capability being scored
  contextEmbeddings: number[][];  // Recent tools in session (max 5)
  contextAggregated: number[];    // Mean pooling of context
  traceStats: TraceStats;         // See TraceStats below
}

interface TraceStats {
  // Success patterns (3)
  historicalSuccessRate, contextualSuccessRate, intentSimilarSuccessRate: number;
  // Co-occurrence (2)
  cooccurrenceWithContext, sequencePosition: number;
  // Temporal (3)
  recencyScore, usageFrequency, avgExecutionTime: number;
  // Error patterns (1 + 6)
  errorRecoveryRate: number;
  errorTypeAffinity: number[];  // [TIMEOUT, PERMISSION, NOT_FOUND, VALIDATION, NETWORK, UNKNOWN]
  // Path patterns (2)
  avgPathLengthToSuccess, pathVariance: number;
}
// Total: 11 scalar + 6 errorTypeAffinity = 17 features (NUM_TRACE_STATS)
```

### 3.3 Multi-Head Attention

Chaque tête apprend une transformation différente des mêmes features :

```typescript
class AttentionHead {
  // Learnable parameters
  W_query: Matrix;   // [hidden_dim, head_dim]
  W_key: Matrix;     // [hidden_dim, head_dim]
  W_value: Matrix;   // [hidden_dim, head_dim]

  forward(projected: number[]): number {
    const Q = matmul(projected, this.W_query);
    const K = matmul(projected, this.W_key);
    const V = matmul(projected, this.W_value);

    // Self-attention score
    const attention = softmax(dot(Q, K) / sqrt(head_dim));
    const output = dot(attention, V);

    return sum(output); // Scalar score from this head
  }
}
```

### 3.4 Configuration

```typescript
interface SHGATv2Config {
  // Architecture
  embeddingDim: number;      // 1024 (BGE-M3)
  hiddenDim: number;         // 128 (projection size, increased for more heads)
  numHeads: number;          // 8 (K heads - standard GAT, scales with data)
  headDim: number;           // 16 (hidden_dim / num_heads)
  mlpHiddenDim: number;      // 64 (fusion MLP)

  // Training
  learningRate: number;      // 0.001
  batchSize: number;         // 32
  maxContextLength: number;  // 5 (max recent tools)

  // Buffer management (for large trace volumes)
  maxBufferSize: number;     // 50000 (PER buffer cap)
  minTracesForTraining: number; // 100 (cold start threshold)

  // Regularization
  dropout: number;           // 0.1
  l2Penalty: number;         // 0.0001
}

const DEFAULT_CONFIG: SHGATv2Config = {
  embeddingDim: 1024,
  hiddenDim: 128,
  numHeads: 8,
  headDim: 16,
  mlpHiddenDim: 64,
  learningRate: 0.001,
  batchSize: 32,
  maxContextLength: 5,
  maxBufferSize: 50_000,
  minTracesForTraining: 100,
  dropout: 0.1,
  l2Penalty: 0.0001,
};
```

## 4. Training Pipeline

### 4.1 PER (Prioritized Experience Replay)

```typescript
interface PERBuffer {
  traces: ExecutionTrace[];
  priorities: number[];      // TD errors
  alpha: number;             // Priority exponent (0.6)
  beta: number;              // IS weight exponent (0.4 → 1.0)
}

class PrioritizedReplayBuffer {
  sample(batchSize: number): { traces: ExecutionTrace[]; weights: number[] } {
    // Sample proportional to priority^alpha
    const probs = this.priorities.map(p => Math.pow(p + 1e-6, this.alpha));
    const indices = weightedSample(probs, batchSize);

    // Importance sampling weights
    const weights = indices.map(i =>
      Math.pow(this.traces.length * probs[i], -this.beta)
    );

    return {
      traces: indices.map(i => this.traces[i]),
      weights: normalize(weights)
    };
  }

  updatePriorities(indices: number[], tdErrors: number[]): void {
    for (let i = 0; i < indices.length; i++) {
      this.priorities[indices[i]] = Math.abs(tdErrors[i]);
    }
  }
}
```

### 4.2 TD Learning

```typescript
interface TrainingExample {
  features: TraceFeatures;
  actualOutcome: number;     // 1 = success, 0 = failure
  pathLength: number;        // Number of steps to outcome
}

function computeTDError(
  shgat: SHGATv2,
  example: TrainingExample
): number {
  const predicted = shgat.predictSuccess(example.features);
  const actual = example.actualOutcome;

  // Discount factor for path length
  const gamma = 0.99;
  const discount = Math.pow(gamma, example.pathLength);

  // TD Error = actual - predicted (with discount)
  return actual * discount - predicted;
}

async function trainBatch(
  shgat: SHGATv2,
  buffer: PrioritizedReplayBuffer,
  batchSize: number
): Promise<{ loss: number; avgTDError: number }> {
  const { traces, weights } = buffer.sample(batchSize);

  const examples = await Promise.all(
    traces.map(trace => buildTrainingExample(trace))
  );

  let totalLoss = 0;
  const tdErrors: number[] = [];

  for (let i = 0; i < examples.length; i++) {
    const tdError = computeTDError(shgat, examples[i]);
    tdErrors.push(tdError);

    // Weighted loss (IS weights from PER)
    const loss = weights[i] * Math.pow(tdError, 2);
    totalLoss += loss;

    // Backprop
    shgat.backward(examples[i].features, tdError);
  }

  // Update priorities in buffer
  buffer.updatePriorities(
    traces.map((_, i) => i),
    tdErrors
  );

  shgat.applyGradients();

  return {
    loss: totalLoss / batchSize,
    avgTDError: mean(tdErrors.map(Math.abs))
  };
}
```

### 4.3 Online Learning Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Online Learning Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. pml_execute(intent) triggered                           │
│     │                                                        │
│     ▼                                                        │
│  2. Execute workflow → collect trace                         │
│     │                                                        │
│     ▼                                                        │
│  3. Store trace in execution_trace table                     │
│     │                                                        │
│     ▼                                                        │
│  4. Build TraceFeatures for each tool in path               │
│     │                                                        │
│     ▼                                                        │
│  5. Compute TD errors for each step                          │
│     │                                                        │
│     ▼                                                        │
│  6. Add to PER buffer with priorities                        │
│     │                                                        │
│     ▼                                                        │
│  7. If buffer.size > minBufferSize:                          │
│        Sample batch with PER                                 │
│        Train SHGAT on batch                                  │
│        Update priorities                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 5. Feature Extraction

### 5.1 From Database

```typescript
async function extractTraceFeatures(
  db: Database,
  toolId: string,
  intentEmbedding: number[],
  contextToolIds: string[]
): Promise<TraceFeatures> {

  // Get tool embedding
  const candidateEmbedding = await getToolEmbedding(toolId);

  // Get context embeddings
  const contextEmbeddings = await Promise.all(
    contextToolIds.slice(-5).map(id => getToolEmbedding(id))
  );
  const contextAggregated = meanPool(contextEmbeddings);

  // === Trace Statistics ===

  // Historical success rate
  const historicalSuccessRate = await db.get<number>(`
    SELECT AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END)
    FROM execution_trace WHERE tool_id = ?
  `, [toolId]) ?? 0.5;

  // Contextual success rate
  const contextualSuccessRate = await db.get<number>(`
    SELECT AVG(CASE WHEN t2.success THEN 1.0 ELSE 0.0 END)
    FROM execution_trace t1
    JOIN execution_trace t2 ON t1.session_id = t2.session_id
      AND t2.created_at > t1.created_at
    WHERE t1.tool_id IN (${contextToolIds.map(() => '?').join(',')})
      AND t2.tool_id = ?
  `, [...contextToolIds, toolId]) ?? 0.5;

  // Co-occurrence with context
  const cooccurrenceWithContext = await db.get<number>(`
    SELECT COUNT(*) * 1.0 / (SELECT COUNT(*) FROM execution_trace WHERE tool_id = ?)
    FROM execution_trace t1
    JOIN execution_trace t2 ON t1.session_id = t2.session_id
    WHERE t1.tool_id IN (${contextToolIds.map(() => '?').join(',')})
      AND t2.tool_id = ?
  `, [toolId, ...contextToolIds, toolId]) ?? 0;

  // Sequence position (normalized 0-1)
  const sequencePosition = await db.get<number>(`
    SELECT AVG(step_index * 1.0 / total_steps)
    FROM (
      SELECT tool_id,
             ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as step_index,
             COUNT(*) OVER (PARTITION BY session_id) as total_steps
      FROM execution_trace
    ) WHERE tool_id = ?
  `, [toolId]) ?? 0.5;

  // Recency score
  const lastUsed = await db.get<string>(`
    SELECT MAX(created_at) FROM execution_trace WHERE tool_id = ?
  `, [toolId]);
  const recencyScore = lastUsed
    ? Math.exp(-(Date.now() - new Date(lastUsed).getTime()) / (24 * 60 * 60 * 1000))
    : 0.5;

  // Usage frequency (normalized)
  const usageFrequency = await db.get<number>(`
    SELECT COUNT(*) * 1.0 / (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM execution_trace GROUP BY tool_id))
    FROM execution_trace WHERE tool_id = ?
  `, [toolId]) ?? 0;

  // Avg execution time (normalized)
  const avgExecutionTime = await db.get<number>(`
    SELECT AVG(duration_ms) * 1.0 / (SELECT MAX(duration_ms) FROM execution_trace)
    FROM execution_trace WHERE tool_id = ?
  `, [toolId]) ?? 0.5;

  // Error recovery rate
  const errorRecoveryRate = await db.get<number>(`
    SELECT AVG(CASE WHEN t2.success THEN 1.0 ELSE 0.0 END)
    FROM execution_trace t1
    JOIN execution_trace t2 ON t1.session_id = t2.session_id
      AND t2.created_at > t1.created_at
    WHERE t1.success = 0 AND t2.tool_id = ?
  `, [toolId]) ?? 0.5;

  // Avg path length to success
  const avgPathLengthToSuccess = await db.get<number>(`
    SELECT AVG(steps_remaining)
    FROM (
      SELECT tool_id,
             COUNT(*) OVER (PARTITION BY session_id ORDER BY created_at DESC) as steps_remaining
      FROM execution_trace
      WHERE session_id IN (SELECT session_id FROM execution_trace WHERE success = 1)
    ) WHERE tool_id = ?
  `, [toolId]) ?? 3;

  return {
    intentEmbedding,
    candidateEmbedding,
    contextEmbeddings,
    contextAggregated,
    traceStats: {
      historicalSuccessRate,
      contextualSuccessRate,
      intentSimilarSuccessRate: 0.5, // Default; use getTraceStatsWithIntent() for computed value
      cooccurrenceWithContext,
      sequencePosition,
      recencyScore,
      usageFrequency,
      avgExecutionTime,
      errorRecoveryRate,
      errorTypeAffinity: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], // TIMEOUT, PERMISSION, NOT_FOUND, VALIDATION, NETWORK, UNKNOWN
      avgPathLengthToSuccess,
      pathVariance: 0, // TODO: Compute variance
    }
  };
}
```

## 6. Implementation Plan

### Phase 1: Core Architecture (Story 11.7) ✅ COMPLETE

```
✓ Create SHGATv2 class with multi-head attention
  - Added v2 params: W_proj, b_proj, fusionMLP, W_stats, b_stats, v2GradAccum
  - Added v2 methods: projectFeaturesV2, computeHeadScoreV2, fusionMLPForward
  - Backward compatible with v1 API
✓ Implement TraceFeatures interface
  - TraceStats: 11 features (success, cooccurrence, temporal, error, path patterns)
  - TraceFeatures: intentEmbedding, candidateEmbedding, contextEmbeddings, traceStats
  - createDefaultTraceFeatures() helper
✓ Implement feature projection layer
  - W_proj: [hiddenDim][3*embeddingDim + 11] projects combined features
  - ReLU activation
✓ Implement K attention heads (K=4 default, adaptive 4-16)
  - headParams: W_q, W_k, W_v per head
  - Scaled dot-product attention
  - getAdaptiveConfig() for scaling with trace volume
✓ Implement fusion MLP
  - Layer 1: numHeads → mlpHiddenDim (ReLU)
  - Layer 2: mlpHiddenDim → 1 (Sigmoid)
✓ Updated tests pass (persistence, benchmarks)
```

### Phase 2: Feature Extraction (Story 11.8) ✅ COMPLETE

```
✓ Implement extractTraceFeatures()
  - TraceFeatureExtractor class in src/graphrag/algorithms/trace-feature-extractor.ts
  - getTraceStats() with parallel SQL queries
  - extractTraceFeatures() builds complete TraceFeatures struct
  - batchExtractTraceStats() for efficient multi-tool extraction
✓ Add necessary SQL queries
  - queryBasicStats(): historical success rate, trace count
  - queryContextualStats(): contextual success, cooccurrence, error recovery
  - querySequenceStats(): average position in execution path
  - queryTemporalStats(): recency (exp decay), frequency, avg duration
  - queryPathStats(): avg path length to success, variance
  - ensureGlobalStats(): normalization values (max usage, max duration)
✓ Handle missing data gracefully (cold start)
  - Returns DEFAULT_TRACE_STATS when trace count < minTracesForStats
  - Graceful null handling for all computed metrics
  - minTracesForStats config (default: 5)
✓ Cache frequently accessed features
  - In-memory LRU cache with configurable TTL (default: 5 min)
  - maxCacheEntries config (default: 1000)
  - invalidateCache() for after new traces saved
  - Batch extraction uses cache for pre-computed entries
✓ Unit tests (14 tests passing)
  - tests/unit/graphrag/algorithms/trace_feature_extractor_test.ts
```

### Phase 3: Training Pipeline (Story 11.9) ✅ COMPLETE

```
✓ Implement PrioritizedReplayBuffer
  - IS weights computed in per-training.ts using PER formula (Schaul et al. 2015)
  - P(i) ∝ priority^alpha, weight = (N * P(i))^(-beta) / max_weight
  - Weights passed to trainBatch() for weighted loss and gradients
✓ Implement TD error computation
  - tdError = discountedTarget - predicted
  - discountedTarget = outcome * gamma^pathLength
  - gamma = 0.99 default discount factor
✓ Implement trainBatch with IS weights
  - shgat.trainBatch(examples, isWeights?, gamma?) signature
  - Loss weighted by IS weights for unbiased convergence
  - Returns {loss, accuracy, tdErrors} for priority updates
✓ Implement gradient descent (manual backprop)
  - All gradients (fusion, feature, layer, W_intent) weighted by IS
  - dLoss = (score - outcome) * isWeight
✓ Add training metrics logging
  - tdErrors array returned for priority updates
  - allTdErrors collected across batches in per-training.ts
```

### Phase 4: Integration (Story 11.10) ✅ COMPLETE

```
✓ Hook into pml_execute for online learning
  - runPERBatchTraining() already called in execute-handler.ts:559
  - trainSHGATOnPathTraces() uses IS weights and TD errors (Phase 3)

✓ Replace v1 scoring with v2 in execute-handler.ts
  - File: src/mcp/handlers/execute-handler.ts
  - Lines 1111-1139: scoreAllCapabilitiesV2/ToolsV2 now used
  - TraceFeatureExtractor builds traceStats map before scoring
  - SHGAT v2 methods merge provided traceStats with node embeddings

✓ Build TraceFeatures before scoring
  - TraceFeatureExtractor added to ExecuteDependencies
  - batchExtractTraceStats() called for all tool/capability IDs
  - getToolIds()/getCapabilityIds() added to SHGAT for ID retrieval

✓ SHGAT v2 scoring properly merges traceStats
  - scoreAllCapabilitiesV2/scoreAllToolsV2 always use node embeddings
  - traceStats from map merged with defaults if not provided
  - No breaking change - empty map falls back to hypergraph features

○ Migration path for existing weights (not needed)
  - v1 and v2 params already separate (no conflict)
  - Direct replacement, no feature flag required

○ A/B test old vs new (skipped)
  - Direct replacement approach chosen
  - v2 is drop-in compatible with v1 interface
```

### Phase 5: Benchmarks Update (Story 11.11) ✅ COMPLETE

```
✓ Head counts updated: {1, 3, 4, 6} → {4, 8, 12, 16}
  - heads4Shgat (hiddenDim=64), heads8Shgat (hiddenDim=128)
  - heads12Shgat (hiddenDim=192), heads16Shgat (hiddenDim=256)
  - Matches getAdaptiveConfig() scaling tiers

✓ SHGAT v1 vs v2 comparison benchmarks (shgat-v1-vs-v2 group)
  - scoreAllCapabilities v1 (hypergraph) vs v2 (trace features)
  - scoreAllTools v1 vs v2
  - TraceFeatures properly built with embeddings and traceStats

✓ MRR/Hit@1/Hit@3 accuracy benchmarks (shgat-accuracy group)
  - computeMRRForAttention() for AttentionResult type
  - computeHitAtKForAttention() for top-K evaluation
  - 20 queries per benchmark, accuracy reported in cleanup

✓ Adaptive config scaling benchmarks (shgat-adaptive group)
  - getAdaptiveConfig() for <1K, 1K-10K, 10K-100K, 100K+ traces
  - Verifies O(1) config lookup performance

✓ Memory usage profiling (shgat-memory group)
  - SHGAT creation time as proxy for memory allocation
  - 4/8/12/16 heads with corresponding hidden dims
  - Shows ~50K/200K/450K/800K params scaling

✓ trace-features.bench.ts updated for new API
  - createClient() + db.connect() instead of deprecated signature
  - MigrationRunner(db) + runUp(migrations)
  - SaveTraceInput now includes priority field

**Files modified:**
- tests/benchmarks/strategic/shgat.bench.ts
- tests/benchmarks/strategic/trace-features.bench.ts
```

## 7. Metrics et Évaluation

### 7.1 Offline Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| MRR | Mean Reciprocal Rank on test set | > 0.40 |
| Hit@1 | % correct tool at rank 1 | > 20% |
| Hit@3 | % correct tool in top 3 | > 50% |
| TD Error | Average |TD error| après convergence | < 0.15 |

### 7.2 Online Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Workflow Success Rate | % workflows completed successfully | > 80% |
| Avg Path Length | Average steps to success | < 4 |
| Learning Speed | Traces needed to improve 10% | < 100 |

### 7.3 Ablation Studies

```
□ Number of heads: K ∈ {4, 8, 12, 16}  (with sufficient traces)
□ Hidden dimension: hidden_dim ∈ {64, 128, 256}
□ PER alpha: α ∈ {0.0, 0.3, 0.6, 0.9}
□ Feature subsets: With/without each traceStats group
□ Head pruning: Identify and remove low-importance heads
```

### 7.4 Adaptive Head Scaling

Le nombre de têtes peut s'adapter au volume de traces :

```typescript
/**
 * Scale heads based on available training data
 * More data = more heads can learn useful patterns
 */
function getAdaptiveConfig(traceCount: number): Partial<SHGATv2Config> {
  if (traceCount < 1_000) {
    return { numHeads: 4, hiddenDim: 64 };   // Conservative
  }
  if (traceCount < 10_000) {
    return { numHeads: 8, hiddenDim: 128 };  // Default
  }
  if (traceCount < 100_000) {
    return { numHeads: 12, hiddenDim: 192 }; // Scale up
  }
  return { numHeads: 16, hiddenDim: 256 };   // Full capacity
}
```

| Traces | Heads | Hidden | Params (approx) |
|--------|-------|--------|-----------------|
| < 1K   | 4     | 64     | ~50K            |
| 1K-10K | 8     | 128    | ~200K           |
| 10K-100K | 12  | 192    | ~450K           |
| 100K+  | 16    | 256    | ~800K           |

## 8. Risques et Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Cold start (peu de traces) | Mauvaises prédictions | Fallback sur semantic similarity pure, adaptive heads (K=4) |
| Overfitting sur peu de données | Perte de généralisation | Regularization (dropout, L2), early stopping, adaptive heads |
| Latence feature extraction | Slow scoring | Caching, batch queries, async precompute |
| Training instability | Weights divergent | Gradient clipping, learning rate warmup |
| Buffer overflow (trop de traces) | Mémoire saturée | Reservoir sampling: garder N récentes + M par priorité |
| Inference latency (K=16) | Temps réel impacté | Cap K ≤ 12 en prod, ou batched inference |

## 9. Backward Compatibility

### 9.1 API Compatibility

```typescript
// Old API (preserved for compatibility)
shgat.scoreAllTools(intentEmbedding);
shgat.scoreAllCapabilities(intentEmbedding);

// New API (adds context)
shgatV2.scoreAllTools(intentEmbedding, contextToolIds);
shgatV2.scoreAllCapabilities(intentEmbedding, contextToolIds);
```

### 9.2 Migration

```typescript
// Gradual rollout via feature flag
const useV2 = await getFeatureFlag('shgat_v2_enabled');
const shgat = useV2 ? new SHGATv2(config) : new SHGAT(legacyConfig);
```

## 10. Open Questions

1. **Nombre de têtes optimal ?** - Commencer avec K=4, ajuster via ablation
2. **Quelles trace stats sont les plus utiles ?** - À découvrir via feature importance
3. **Faut-il des embeddings séparés pour outils vs capabilities ?** - Probablement oui
4. **Comment gérer les sessions multi-intent ?** - Segmentation par intent change

## 11. Références

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) - Transformer architecture
- [Graph Attention Networks](https://arxiv.org/abs/1710.10903) - GAT original paper
- [Prioritized Experience Replay](https://arxiv.org/abs/1511.05952) - PER paper
- ADR-051: Unified Search Simplification
- Spike: 2025-12-21-capability-pathfinding-dijkstra.md

## 12. Review Follow-ups (AI)

_Code review performed 2025-12-24 by Senior Developer AI_

### 🔴 HIGH Priority

- [x] [AI-Review][HIGH] ~~Remove `errorTypeAffinity` from tech-spec Section 3.2 OR implement in TraceStats interface~~ **IMPLEMENTED 2025-12-24**: Migration 024 adds `error_type` column, `classifyError()` function, TraceStats now has 17 features (11 scalar + 6 errorTypeAffinity)
- [x] [AI-Review][HIGH] ~~Implement `intentSimilarSuccessRate` extraction via embedding similarity search~~ **IMPLEMENTED 2025-12-24**: Migration 025 adds `intent_embedding vector(1024)` to execution_trace + HNSW index, SaveTraceInput & execute-handler pass embedding, `queryIntentSimilarSuccessRate()` uses vector similarity with topK=50, threshold=0.7. Added `getTraceStatsWithIntent()` convenience method.
- [x] [AI-Review][HIGH] ~~Add `sequencePosition` computation to `batchExtractTraceStats()`~~ **IMPLEMENTED 2025-12-24**: Added batch SQL query using `array_position()` with normalization. Uses UNNEST + GROUP BY for efficient multi-tool query. Respects `minTracesForStats` threshold. **FIX:** capability-store.ts now prepends capability ID to `executed_path` so `sequencePosition` works for capabilities too (not just tools). Ensures consistency between save-time and training-time flattening.

### 🟡 MEDIUM Priority

- [x] [AI-Review][MEDIUM] ~~Implement cache hit/miss tracking for observability~~ **IMPLEMENTED 2025-12-24**: Added `cacheHits`/`cacheMisses` counters, `getCacheStats()` returns actual hit rate, `resetCacheStats()` for benchmarking.
- [x] [AI-Review][MEDIUM] ~~Add `pathVariance` and `avgPathLengthToSuccess` to batch extraction~~ **IMPLEMENTED 2025-12-24**: Added batch SQL query computing `steps_to_end` per tool with VARIANCE aggregation.
- [x] [AI-Review][MEDIUM] ~~Complete Phase 5: Benchmarks Update~~ **IMPLEMENTED 2025-12-24**: Added MRR/Hit@1/Hit@3 accuracy benchmarks (shgat-accuracy group), extractTraceFeatures() latency (trace-features.bench.ts), memory usage profiling (shgat-memory group), adaptive config scaling benchmarks, v1 vs v2 comparison group. Fixed trace-features.bench.ts API compatibility.
- [x] [AI-Review][MEDIUM] ~~Add edge case tests~~ **IMPLEMENTED 2025-12-24**: Added 17 edge case tests covering cache hit/miss, intent similarity fallback, sequencePosition normalization, pathVariance, batch extraction, recency extremes, repeated tools in path.
- [x] [AI-Review][MEDIUM] ~~Implement v2 backward pass for W_proj and fusionMLP gradients~~ **IMPLEMENTED 2025-12-24**: Added `forwardV2WithCache()`, `backwardV2()`, `applyV2Gradients()`, and `trainBatchV2()` methods. Full backprop through fusionMLP (W1, b1, W2, b2), ReLU activations, and W_proj/b_proj.

### 🟢 LOW Priority

- [x] [AI-Review][LOW] ~~Extract `numTraceStats` to derived constant~~ **IMPLEMENTED 2025-12-24**: Added `NUM_TRACE_STATS` constant in shgat-types.ts, derived from `DEFAULT_TRACE_STATS`. Replaced magic number 17 in shgat.ts.
- [x] [AI-Review][LOW] ~~Deduplicate TraceStats documentation~~ **IMPLEMENTED 2025-12-24**: Simplified tech-spec Section 3.2 to reference `shgat-types.ts` as source of truth.
