## Pattern 7: SHGAT Modular Architecture & lib/shgat

> **Source:** `lib/shgat/` (standalone library, JSR: `@pml/shgat`)
>
> **Tech-Specs:**
> - [`shgat-learning-and-dag-edges.md`](../../tech-specs/modular-dag-execution/shgat-learning-and-dag-edges.md)
> - [`operation-embeddings.md`](../../tech-specs/modular-dag-execution/operation-embeddings.md)
>
> **Related:** ADR-053 (SHGAT Subprocess Training), ADR-055 (Preserve Dim), ADR-056 (InfoNCE), ADR-058 (BLAS FFI), ADR-060 (Curriculum Learning)
>
> **Updated:** 2026-01-14

---

### Overview

SHGAT (SuperHyperGraph Attention Network) is a K-head attention mechanism for scoring capabilities and tools based on intent embeddings. The implementation was extracted to `lib/shgat/` as a standalone TypeScript library with zero dependencies.

**Key Features:**
- 16 K-heads adaptive sizing (4-16 based on graph size)
- BLAS FFI acceleration for matrix operations
- PER (Prioritized Experience Replay) training
- V→V co-occurrence message passing
- InfoNCE contrastive loss with temperature annealing

---

### Modular Directory Structure

```
lib/shgat/
├── mod.ts                   # Public API exports (JSR entry point)
├── deno.json                # Package configuration
├── README.md                # Library documentation
│
├── src/
│   ├── core/                # Main SHGAT class and factory
│   │   ├── shgat.ts         # SHGAT class (training + inference)
│   │   ├── factory.ts       # createSHGATFromCapabilities()
│   │   ├── types.ts         # All types (CapabilityNode, ToolNode, etc.)
│   │   ├── logger.ts        # Logger adapter for external integration
│   │   ├── serialization.ts # Import/export params
│   │   ├── stats.ts         # Statistics utilities
│   │   ├── hierarchy-builder.ts
│   │   ├── forward-helpers.ts
│   │   └── scoring-helpers.ts
│   │
│   ├── graph/               # Graph construction
│   │   ├── mod.ts           # Exports
│   │   ├── graph-builder.ts # GraphBuilder class
│   │   ├── hierarchy.ts     # computeHierarchyLevels()
│   │   └── incidence.ts     # Multi-level incidence matrix
│   │
│   ├── initialization/      # Parameter initialization
│   │   ├── index.ts
│   │   └── parameters.ts    # Weight init, adaptive head sizing
│   │
│   ├── message-passing/     # n-SuperHyperGraph message passing
│   │   ├── index.ts
│   │   ├── phase-interface.ts    # Common phase interface
│   │   ├── vertex-to-vertex-phase.ts   # V→V (co-occurrence)
│   │   ├── vertex-to-edge-phase.ts     # V→E aggregation
│   │   ├── edge-to-edge-phase.ts       # E→E (hyperedge interaction)
│   │   ├── edge-to-vertex-phase.ts     # E→V distribution
│   │   └── multi-level-orchestrator.ts # Orchestrates all phases
│   │
│   ├── attention/           # K-head scoring implementations
│   │   ├── index.ts
│   │   ├── khead-scorer.ts       # K-head attention (PRODUCTION)
│   │   ├── multi-level-scorer.ts # Multi-level n-SuperHyperGraph
│   │   └── v1-scorer.ts          # DEPRECATED: Legacy 3-head
│   │
│   ├── training/            # Training implementations
│   │   ├── index.ts
│   │   ├── shgat-trainer.ts          # Main trainer interface
│   │   ├── batched-khead.ts          # Batched K-head training (PRODUCTION)
│   │   ├── multi-level-trainer-khead.ts # K-head with multi-level
│   │   ├── multi-level-trainer.ts    # Cosine-based (backup)
│   │   ├── per-buffer.ts             # Prioritized Experience Replay
│   │   └── v1-trainer.ts             # DEPRECATED: Legacy training
│   │
│   └── utils/
│       ├── math.ts          # Softmax, cosine similarity, etc.
│       └── blas-ffi.ts      # OpenBLAS FFI bindings
│
├── benchmarks/              # Performance benchmarks
├── examples/                # Usage examples
└── tests/                   # Unit tests
```

---

### Production Architecture (K-Head Attention)

**Capabilities & Tools/Operations**: Unified K-head attention scoring

```typescript
// Forward pass: multi-level message passing
V → V (co-occurrence) → V → E^0 → E^1 → ... → E^L_max

// K-head scoring (for BOTH capabilities AND tools)
Q = W_q @ intent_projected     // [hiddenDim]
K = W_k @ embedding_propagated // [hiddenDim]
score_h = sigmoid(Q·K / √dim)  // per head

// Fusion: average of K head scores
finalScore = Σ(score_h) / K
```

**Adaptive Head Count:**

| Graph Size | K-Heads | Hidden Dim | Head Dim |
|------------|---------|------------|----------|
| 0-20 nodes | 4 | 256 | 64 |
| 21-100 nodes | 8 | 512 | 64 |
| 101-500 nodes | 12 | 768 | 64 |
| 501-2000 nodes | 14 | 896 | 64 |
| 2000+ nodes | 16 | 1024 | 64 |

---

### Node Types in Graph

| Type | Prefix | Scoring | Example |
|------|--------|---------|---------|
| **capability** | - | K-head attention | `local.default.math.sum` |
| **tool** | `server:` | K-head attention | `filesystem:read_file` |
| **operation** | `code:` | K-head attention | `code:filter`, `code:map` |

---

### Message Passing Flow (n-SuperHyperGraph)

The full message passing includes V→V pre-phase for co-occurrence:

```
Phase 0: V→V (Co-occurrence Enrichment)
Tools (vertices)
     │
     │  Co-occurrence from n8n workflows
     ├─────────────────────────────►
     │  α_ij = softmax(sim(H_i, H_j) × cooc_weight)
     │  H'_i = H_i + β × Σ α_ij × H_j
     │
     ▼
Enriched Tool Embeddings

Phase 1-3: V→E→E→V (n-SuperHyperGraph)
Enriched Tools                    Capabilities (hyperedges)
     │                                      │
     │ Vertex-to-Edge Phase                 │
     └──────────────────────────────────────►│
                                            │
                                   Edge-to-Edge Phase
                                   (hyperedge interaction)
                                            │
     ◄──────────────────────────────────────┘
     │ Edge-to-Vertex Phase
     │
     ▼
Updated Tool Embeddings → K-Head Scoring
```

**V→V Phase (NEW - Jan 2026):**

Pre-enriches tool embeddings with co-occurrence patterns from scraped n8n workflows:

```typescript
// Algorithm (simplified, preserves 1024d):
// 1. Compute attention: score(i,j) = H_i · H_j (cosine similarity)
//    (masked by co-occurrence matrix)
// 2. Weight by frequency: score'(i,j) = score(i,j) × A_cooc[i][j]
// 3. Normalize: α_i = softmax({score'(i,j)})
// 4. Aggregate: H'_i = H_i + β × Σ_j α_ij × H_j
```

---

### K-Head Attention Details

```typescript
// K attention heads (configurable, default K=4-16 adaptive)
// Each head has learnable W_q and W_k matrices

for (head h in [0..K-1]):
  Q[h] = W_q[h] @ intent_projected   // Query
  K[h] = W_k[h] @ cap_embedding      // Key
  score[h] = sigmoid(dot(Q[h], K[h]) / √dim)

// Fusion: simple average (no learned fusion weights)
finalScore = mean(score[0..K-1])
```

**Note:** Le 3-head legacy (Semantic/Structure/Temporal avec PageRank, Adamic-Adar, HeatDiffusion) a
ete remplace par K-head unifie qui utilise **uniquement les embeddings propages** via message
passing.

Les features graph (PageRank, Adamic-Adar, etc.) sont toujours calculees mais utilisees par d'autres
modules (local-alpha, suggestions, clustering) — pas par SHGAT K-head scoring.

---

### BLAS Acceleration (ADR-058)

Matrix operations use OpenBLAS via Deno FFI for ~10x speedup:

```typescript
// Supported operations:
blasMatmul(A, B)           // C = A @ B
blasMatmulTranspose(A, B)  // C = A @ B^T
blasMatVec(A, x)           // y = A @ x
blasMatVecTranspose(A, x)  // y = A^T @ x
blasOuterProduct(A, x, y)  // A += α × x @ y^T (rank-1 update)

// Auto-detection with JS fallback:
if (!blasAvailable) {
  return jsMatmul(A, B);  // Pure TypeScript fallback
}
```

**Library paths searched:**
- `/lib/x86_64-linux-gnu/libopenblas.so.0`
- `/usr/lib/x86_64-linux-gnu/openblas-pthread/libblas.so.3`

---

### Prioritized Experience Replay (PER)

Based on Schaul et al. (2015), PER samples training examples proportionally to TD error:

```typescript
// Priority: p_i = |TD_error_i| + ε
// Sampling probability: P(i) = p_i^α / Σ p_j^α
// IS weight: w_i = (N × P(i))^(-β)

const buffer = new PERBuffer(examples, { alpha: 0.6, beta: 0.4 });
const { items, weights, indices } = buffer.sample(batchSize, beta);

const result = shgat.trainBatchV1KHeadBatched(items, weights);
buffer.updatePriorities(indices, result.tdErrors);
```

**PER Configuration:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| alpha | 0.6 | Priority exponent (0=uniform, 1=full) |
| beta | 0.4→1.0 | IS weight exponent (annealed) |
| epsilon | 0.01 | Minimum priority floor |
| maxPriority | 1.0 | Cap for new examples |

---

### InfoNCE Contrastive Loss (ADR-056)

Training uses InfoNCE with temperature annealing:

```typescript
// InfoNCE loss: -log(exp(sim(q,k+)/τ) / Σ exp(sim(q,k)/τ))

// Temperature annealing (cosine schedule):
// Start: τ=0.10 (soft, exploratory)
// End: τ=0.06 (sharp, discriminative)
for (let epoch = 0; epoch < 25; epoch++) {
  const temp = annealTemperature(epoch, 25, 0.10, 0.06);
  shgat.trainBatchV1KHeadBatched(examples, weights, false, temp);
}
```

---

### Curriculum Learning (ADR-060)

Hard negative mining with dynamic tier sampling:

```typescript
// allNegativesSorted: sorted by similarity (hardest first)
// Tier selection based on current accuracy:
// - accuracy < 0.35: easy tier (last third)
// - accuracy > 0.55: hard tier (first third)
// - else: medium tier (middle third)

const example = {
  ...baseExample,
  allNegativesSorted: sortedByCosineSimilarity,
  negativeCapIds: [], // Filled from selected tier
};
```

---

### Training Modes

| Mode | Epochs | Examples | Trigger | Use Case |
|------|--------|----------|---------|----------|
| **Batch** | 20-25 | Full buffer | Server startup | Initial training |
| **PER** | 1-3 | 50-100 | After execution | Incremental learning |

---

### Scorer Versions (Historical)

| Version | Architecture | Status |
|---------|--------------|--------|
| **K-head (current)** | 4-16 adaptive heads, InfoNCE | **Production** |
| v1-legacy | 3-head (Semantic/Structure/Temporal) | Deprecated |
| v2 | TraceFeatures-based | Experimental |

---

### Configuration

```typescript
import { SHGAT, DEFAULT_SHGAT_CONFIG } from "@pml/shgat";

const shgat = new SHGAT({
  ...DEFAULT_SHGAT_CONFIG,
  embeddingDim: 1024,      // BGE-M3 embeddings
  numHeads: 8,             // K-head attention (auto-adaptive)
  numLayers: 2,            // Message passing layers
  dropout: 0.1,            // Dropout rate
  learningRate: 0.05,      // SGD learning rate
  preserveDim: true,       // Keep 1024d throughout (ADR-055)
  preserveDimResidual: 0.3, // 30% original + 70% propagated
});
```

---

### API Reference

```typescript
class SHGAT {
  // Graph management
  registerCapability(cap: CapabilityNode): void;
  registerTool(tool: ToolNode): void;

  // Scoring
  scoreAllCapabilities(intent: number[], context: string[]): AttentionResult[];
  scoreCapability(intent: number[], capId: string, context: string[]): number;

  // Training
  trainBatchV1KHeadBatched(
    examples: TrainingExample[],
    weights?: number[],
    evaluateOnly?: boolean,
    temperature?: number,
  ): { loss: number; accuracy: number; tdErrors: number[]; gradNorm: number };

  // Persistence
  exportParams(): Record<string, unknown>;
  importParams(params: Record<string, unknown>): void;

  // Configuration
  setLearningRate(lr: number): void;
}

// Factory function (recommended)
function createSHGATFromCapabilities(capabilities: Array<{
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
}>): SHGAT;
```

---

### Related Patterns

- **Pattern 4**: 3-Loop Learning (AIL/HIL feedback)
- **Pattern 5**: Scoring Algorithms (integrates SHGAT)
- **Pattern 9**: Worker RPC Bridge (subprocess training)

---

_Updated: 2026-01-14_
