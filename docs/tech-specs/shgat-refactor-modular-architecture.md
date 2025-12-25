# SHGAT Refactor: Modular Architecture for Multi-Level Message Passing

**Status**: Draft
**Author**: Architecture Team
**Date**: 2025-01-XX
**Related Specs**: shgat-v1-nsuperhypergraph-refactor.md
**Related ADRs**: ADR-050 (SHGAT v2), ADR-051 (DR-DSP)

---

## 1. Executive Summary

Current `shgat.ts` is a monolithic 30,000+ token file mixing v1/v2/v3 logic, training, math utils, and incidence matrix building. This refactor splits it into modular components to enable multi-level message passing implementation.

**Key Goals**:
- Extract message passing into pluggable phases (V→E, E→E', etc.)
- Separate scoring logic per version (v1, v2, v3)
- Isolate math utilities and parameter initialization
- Enable multi-level extension without modifying core logic
- **Zero functional changes** - pure structural refactor

**Success Criteria**:
- All existing tests pass without modification
- shgat.ts becomes a thin facade (<500 LOC)
- Multi-level message passing can be added in <200 LOC

---

## 2. Problem Analysis

### 2.1 Current Structure

```
src/graphrag/algorithms/shgat.ts (30,822 tokens)
├─ class SHGAT
│  ├─ Data structures (toolNodes, capabilityNodes, incidenceMatrix)
│  ├─ Parameters (layerParams, headParams, fusionWeights, etc.)
│  ├─ Message passing (forward, vertexToEdgePhase, edgeToVertexPhase)
│  ├─ v1 scoring (scoreAllCapabilities, scoreAllTools)
│  ├─ v2 scoring (scoreAllCapabilitiesV2)
│  ├─ v3 scoring (scoreAllCapabilitiesV3)
│  ├─ Training (trainBatch, backward passes)
│  ├─ Math utils (matmul, softmax, elu, cosineSimilarity, etc.)
│  ├─ Incidence matrix (rebuildIndices, collectTransitiveTools)
│  └─ 50+ helper methods
```

### 2.2 Issues

**1. Tight coupling**: V→E→V message passing hardcoded in `forward()`. Cannot extend to V→E^0→E^1→...→V without major surgery.

**2. Mixed responsibilities**: Scoring, training, math, and graph structure all in one class.

**3. Version confusion**: v1, v2, v3 logic interleaved. Hard to understand which params/methods are used by which version.

**4. Testability**: Cannot unit test message passing phases independently.

**5. Extensibility**: Adding multi-level requires modifying `forward()`, `vertexToEdgePhase()`, `edgeToVertexPhase()`, incidence building, AND scoring logic.

### 2.3 Design Principle

**Strategy Pattern** for message passing phases:
- Each phase (V→E, E→E') implements `MessagePassingPhase` interface
- `MultiLevelForward` orchestrates N phases
- Adding new levels = adding new phase instances (no code modification)

---

## 3. Target Architecture

### 3.1 Directory Structure

```
src/graphrag/algorithms/shgat/
├─ index.ts                          # Re-exports public API
│
├─ core/
│  ├─ shgat.ts                       # Main facade class (public API)
│  ├─ types.ts                       # Shared types (moved from shgat-types.ts)
│  ├─ config.ts                      # Config and defaults
│  └─ node-storage.ts                # ToolNode/CapabilityNode storage
│
├─ incidence/
│  ├─ incidence-builder.ts           # Build incidence matrices
│  ├─ hierarchy-levels.ts            # Compute topological levels
│  └─ types.ts                       # Incidence-related types
│
├─ message-passing/
│  ├─ phase-interface.ts             # MessagePassingPhase interface
│  ├─ tool-to-cap-phase.ts           # V → E^0 (tools → level-0 caps)
│  ├─ cap-to-cap-phase.ts            # E^k → E^(k+1) (caps → parent caps)
│  ├─ multi-level-forward.ts         # Orchestrate upward + downward passes
│  └─ types.ts                       # Message passing types
│
├─ parameters/
│  ├─ parameter-manager.ts           # Initialize and manage params
│  ├─ xavier-init.ts                 # Xavier/Glorot initialization
│  └─ types.ts                       # Parameter types
│
├─ scoring/
│  ├─ scorer-interface.ts            # SHGATScorer interface
│  ├─ v1-scorer.ts                   # v1: message passing + 3 heads
│  ├─ v2-scorer.ts                   # v2: direct embeddings + K heads + MLP
│  ├─ v3-scorer.ts                   # v3: HYBRID
│  └─ types.ts                       # Scoring types
│
├─ training/
│  ├─ trainer.ts                     # trainBatch, backward pass
│  ├─ gradient-cache.ts              # ForwardCache, intermediate activations
│  └─ types.ts                       # Training types
│
└─ utils/
   ├─ math.ts                        # matmul, softmax, elu, etc.
   └─ vector-ops.ts                  # dot, normalize, cosineSimilarity
```

### 3.2 Key Interfaces

#### 3.2.1 Message Passing Phase

```typescript
/**
 * Strategy pattern for message passing phases
 *
 * Each phase aggregates from child level to parent level (upward)
 * and propagates from parent level to child level (downward).
 */
export interface MessagePassingPhase {
  /**
   * Level this phase operates at
   * - 0: Tools → Level-0 Capabilities
   * - k>0: Level-(k-1) Capabilities → Level-k Capabilities
   */
  readonly level: number;

  /**
   * Upward aggregation: child → parent
   *
   * @param childEmbeddings - Embeddings from level k-1 (or tools if k=0)
   * @param parentEmbeddings - Current embeddings at level k
   * @param incidence - Incidence map: child → parents
   * @param params - Level-specific learnable parameters
   * @returns Updated parent embeddings + attention weights
   */
  aggregate(
    childEmbeddings: number[][],
    parentEmbeddings: number[][],
    incidence: IncidenceMap,
    params: LevelParams,
  ): AggregationResult;

  /**
   * Downward propagation: parent → child (residual connections)
   *
   * @param parentEmbeddings - Embeddings from level k+1
   * @param childEmbeddings - Current embeddings at level k
   * @param incidence - Reverse incidence map: parent → children
   * @param params - Level-specific learnable parameters
   * @returns Updated child embeddings + attention weights
   */
  propagate(
    parentEmbeddings: number[][],
    childEmbeddings: number[][],
    reverseIncidence: IncidenceMap,
    params: LevelParams,
  ): PropagationResult;
}

export interface AggregationResult {
  /** Updated parent embeddings after aggregation */
  parentEmbeddings: number[][];
  /** Attention weights [head][child][parent] */
  attention: number[][][];
}

export interface PropagationResult {
  /** Updated child embeddings after propagation (with residual) */
  childEmbeddings: number[][];
  /** Attention weights [head][parent][child] */
  attention: number[][][];
}
```

#### 3.2.2 Multi-Level Forward

```typescript
/**
 * Orchestrates multi-level message passing
 *
 * Executes upward aggregation (V → E^0 → ... → E^L_max)
 * followed by downward propagation (E^L_max → ... → E^0 → V).
 */
export class MultiLevelForward {
  constructor(
    private phases: Map<number, MessagePassingPhase>,
    private incidence: MultiLevelIncidence,
    private params: ParameterManager,
    private config: SHGATConfig,
  ) {}

  /**
   * Run full multi-level forward pass
   *
   * @param H - Tool embeddings (level -1)
   * @param E - Capability embeddings by level (E^0, E^1, ..., E^L_max)
   * @returns Updated embeddings + attention cache
   */
  forward(
    H: number[][],
    E: Map<number, number[][]>,
  ): ForwardResult {
    const maxLevel = Math.max(...E.keys());
    const attentionUpward = new Map<number, number[][][]>();
    const attentionDownward = new Map<number, number[][][]>();

    // Upward pass: V → E^0 → E^1 → ... → E^L_max
    for (let level = 0; level <= maxLevel; level++) {
      const phase = this.phases.get(level)!;
      const childEmb = level === 0 ? H : E.get(level - 1)!;
      const parentEmb = E.get(level)!;
      const incidence = this.incidence.get(level);
      const levelParams = this.params.getLevel(level);

      const result = phase.aggregate(childEmb, parentEmb, incidence, levelParams);
      E.set(level, result.parentEmbeddings);
      attentionUpward.set(level, result.attention);
    }

    // Downward pass: E^L_max → ... → E^1 → E^0 → V
    for (let level = maxLevel - 1; level >= 0; level--) {
      const phase = this.phases.get(level)!;
      const parentEmb = E.get(level + 1)!;
      const childEmb = level === 0 ? H : E.get(level)!;
      const reverseIncidence = this.incidence.getReverse(level + 1);
      const levelParams = this.params.getLevel(level);

      const result = phase.propagate(parentEmb, childEmb, reverseIncidence, levelParams);

      if (level === 0) {
        H = result.childEmbeddings;
      } else {
        E.set(level, result.childEmbeddings);
      }
      attentionDownward.set(level, result.attention);
    }

    return { H, E, attentionUpward, attentionDownward };
  }
}
```

#### 3.2.3 Scorer Interface

```typescript
/**
 * Strategy pattern for scoring different SHGAT versions
 */
export interface SHGATScorer {
  /**
   * Score all capabilities given user intent
   *
   * @param intentEmbedding - User intent (1024-dim BGE-M3)
   * @param forwardResult - Result from multi-level forward pass
   * @param targetLevel - Optional level filter
   * @returns Sorted capability scores
   */
  scoreCapabilities(
    intentEmbedding: number[],
    forwardResult: ForwardResult,
    targetLevel?: number,
  ): AttentionResult[];

  /**
   * Score all tools given user intent (v1 only)
   */
  scoreTools?(
    intentEmbedding: number[],
    forwardResult: ForwardResult,
  ): ToolScore[];
}
```

---

## 4. Migration Strategy

### 4.1 Phase 1: Extract Math Utils (LOW RISK)

**Goal**: Move pure functions to utils/

**Files created**:
- `src/graphrag/algorithms/shgat/utils/math.ts`
- `src/graphrag/algorithms/shgat/utils/vector-ops.ts`

**Changes**:
1. Extract methods from SHGAT class:
   - `matmul()`, `matmulTranspose()`, `dot()`
   - `softmax()`, `elu()`, `leakyRelu()`, `sigmoid()`
   - `meanPool()`, `normalize()`, `cosineSimilarity()`
2. Make them standalone functions
3. Update SHGAT to import and use

**Validation**:
```bash
deno test tests/unit/graphrag/algorithms/shgat_test.ts
```

All tests must pass unchanged.

### 4.2 Phase 2: Extract Parameter Management (LOW RISK)

**Goal**: Isolate parameter initialization logic

**Files created**:
- `src/graphrag/algorithms/shgat/parameters/parameter-manager.ts`
- `src/graphrag/algorithms/shgat/parameters/xavier-init.ts`

**Changes**:
1. Extract `initializeParameters()` logic into `ParameterManager`
2. Extract Xavier/Glorot init into `initXavier()`
3. Keep params storage in SHGAT, delegate init

**Example**:
```typescript
// parameter-manager.ts
export class ParameterManager {
  private levelParams: Map<number, LevelParams> = new Map();

  initializeLevels(
    maxLevel: number,
    numHeads: number,
    hiddenDim: number,
    embeddingDim: number,
  ): void {
    for (let level = 0; level <= maxLevel; level++) {
      this.levelParams.set(level, this.initLevel(level, numHeads, hiddenDim, embeddingDim));
    }
  }

  private initLevel(...): LevelParams {
    // Xavier init logic
  }

  getLevel(level: number): LevelParams {
    return this.levelParams.get(level)!;
  }
}

// shgat.ts
class SHGAT {
  private paramManager = new ParameterManager();

  constructor(config: SHGATConfig) {
    this.paramManager.initializeLevels(
      this.maxHierarchyLevel,
      config.numHeads,
      config.hiddenDim,
      config.embeddingDim
    );
  }
}
```

### 4.3 Phase 3: Extract Message Passing (CRITICAL - Enables Multi-Level)

**Goal**: Decouple message passing phases from SHGAT class

**Files created**:
- `src/graphrag/algorithms/shgat/message-passing/phase-interface.ts`
- `src/graphrag/algorithms/shgat/message-passing/tool-to-cap-phase.ts`
- `src/graphrag/algorithms/shgat/message-passing/cap-to-cap-phase.ts`
- `src/graphrag/algorithms/shgat/message-passing/multi-level-forward.ts`

**Changes**:

1. **Create phase implementations**:

```typescript
// tool-to-cap-phase.ts
export class ToolToCapPhase implements MessagePassingPhase {
  readonly level = 0;

  constructor(
    private math: MathUtils,
    private config: SHGATConfig,
  ) {}

  aggregate(
    toolEmbeddings: number[][],
    capEmbeddings: number[][],
    incidence: IncidenceMap,
    params: LevelParams,
  ): AggregationResult {
    // Extract current vertexToEdgePhase() logic
    const numTools = toolEmbeddings.length;
    const numCaps = capEmbeddings.length;
    const numHeads = this.config.numHeads;

    const updatedCaps: number[][] = [];
    const attention: number[][][] = [];

    for (let head = 0; head < numHeads; head++) {
      const headAttention: number[][] = [];

      for (let c = 0; c < numCaps; c++) {
        const capId = /* get from incidence */;
        const toolIndices = incidence.getChildren(capId);

        // Compute attention scores
        const scores = this.computeAttentionScores(
          toolIndices,
          toolEmbeddings,
          capEmbeddings[c],
          params.W_child[head],
          params.W_parent[head],
          params.a_upward[head]
        );

        const attentionWeights = this.math.softmax(scores);
        headAttention.push(attentionWeights);

        // Aggregate
        const aggregated = this.aggregateWithAttention(
          toolIndices,
          toolEmbeddings,
          attentionWeights,
          params.W_child[head]
        );

        updatedCaps[c] = aggregated;
      }

      attention.push(headAttention);
    }

    return { parentEmbeddings: updatedCaps, attention };
  }

  propagate(...): PropagationResult {
    // Extract current edgeToVertexPhase() logic
  }

  private computeAttentionScores(...): number[] {
    // Attention score calculation
  }

  private aggregateWithAttention(...): number[] {
    // Weighted aggregation
  }
}
```

2. **Create CapToCapPhase** (similar, but for E^k → E^(k+1))

3. **Create MultiLevelForward orchestrator** (see section 3.2.2)

4. **Update SHGAT.forward()**:

```typescript
// BEFORE (current)
class SHGAT {
  forward(): { H: number[][]; E: number[][] } {
    // Hardcoded 2-phase logic
    let H = this.getToolEmbeddings();
    let E = this.getCapabilityEmbeddings();

    for (let l = 0; l < this.config.numLayers; l++) {
      // V→E phase
      const { E_new } = this.vertexToEdgePhase(H, E, ...);
      // E→V phase
      const { H_new } = this.edgeToVertexPhase(H, E_new, ...);
      H = H_new;
      E = E_new;
    }

    return { H, E };
  }
}

// AFTER (refactored)
class SHGAT {
  private multiLevelForward: MultiLevelForward;

  constructor(config: SHGATConfig) {
    // Initialize phases
    const phases = new Map<number, MessagePassingPhase>();
    phases.set(0, new ToolToCapPhase(this.math, config));
    // Add CapToCapPhase for each level if needed

    this.multiLevelForward = new MultiLevelForward(
      phases,
      this.incidence,
      this.paramManager,
      config
    );
  }

  forward(): ForwardResult {
    const H = this.getToolEmbeddings();
    const E = this.getCapabilityEmbeddingsByLevel();

    return this.multiLevelForward.forward(H, E);
  }
}
```

**Validation**:
- All existing tests pass
- Forward pass produces identical embeddings (within floating point precision)

### 4.4 Phase 4: Extract Incidence Building (MEDIUM RISK)

**Goal**: Separate incidence matrix logic from SHGAT

**Files created**:
- `src/graphrag/algorithms/shgat/incidence/incidence-builder.ts`
- `src/graphrag/algorithms/shgat/incidence/hierarchy-levels.ts`

**Changes**:
1. Extract `rebuildIndices()` → `IncidenceBuilder.build()`
2. Extract `collectTransitiveTools()` → keep as deprecated (will be removed in multi-level spec)
3. Extract hierarchy level computation → `HierarchyLevelComputer.compute()`

**Example**:
```typescript
// incidence-builder.ts
export class IncidenceBuilder {
  static build(
    toolNodes: Map<string, ToolNode>,
    capabilityNodes: Map<string, CapabilityNode>,
    useFlatten: boolean = true  // Deprecated, for backward compat
  ): MultiLevelIncidence {
    if (useFlatten) {
      return this.buildFlattened(toolNodes, capabilityNodes);
    } else {
      return this.buildMultiLevel(toolNodes, capabilityNodes);
    }
  }

  private static buildFlattened(...): MultiLevelIncidence {
    // Current collectTransitiveTools() approach
  }

  private static buildMultiLevel(...): MultiLevelIncidence {
    // New hierarchical approach (from multi-level spec)
  }
}
```

### 4.5 Phase 5: Extract Scorers (LOW PRIORITY)

**Goal**: One file per SHGAT version

**Files created**:
- `src/graphrag/algorithms/shgat/scoring/v1-scorer.ts`
- `src/graphrag/algorithms/shgat/scoring/v2-scorer.ts`
- `src/graphrag/algorithms/shgat/scoring/v3-scorer.ts`

**Changes**:
1. Extract `scoreAllCapabilities()` → `V1Scorer.scoreCapabilities()`
2. Extract `scoreAllCapabilitiesV2()` → `V2Scorer.scoreCapabilities()`
3. Extract `scoreAllCapabilitiesV3()` → `V3Scorer.scoreCapabilities()`

**SHGAT becomes a facade**:
```typescript
class SHGAT {
  private v1Scorer: V1Scorer;
  private v2Scorer: V2Scorer;
  private v3Scorer: V3Scorer;

  scoreAllCapabilities(intentEmbedding: number[]): AttentionResult[] {
    const forwardResult = this.forward();
    return this.v1Scorer.scoreCapabilities(intentEmbedding, forwardResult);
  }

  scoreAllCapabilitiesV2(...): AttentionResult[] {
    // No forward pass for v2
    return this.v2Scorer.scoreCapabilities(...);
  }

  scoreAllCapabilitiesV3(...): AttentionResult[] {
    const forwardResult = this.forward();
    return this.v3Scorer.scoreCapabilities(...);
  }
}
```

---

## 5. Testing Strategy

### 5.1 Non-Regression Tests

**Critical**: All existing tests must pass after each phase.

```bash
# After each phase, run:
deno test tests/unit/graphrag/algorithms/shgat_test.ts
deno test tests/integration/graphrag/shgat_integration_test.ts
deno bench tests/benchmarks/strategic/shgat-v1-v2-v3-comparison.bench.ts
```

### 5.2 Equivalence Tests

After refactoring, verify outputs are identical:

```typescript
// tests/unit/graphrag/algorithms/shgat/refactor-equivalence_test.ts
Deno.test("Phase 3: forward() produces identical embeddings", () => {
  const shgatOld = createOldSHGAT();
  const shgatNew = createNewSHGAT();

  const intentEmbedding = generateMockEmbedding(42);

  const resultOld = shgatOld.forward();
  const resultNew = shgatNew.forward();

  // Compare embeddings within floating point precision
  assertEmbeddingsEqual(resultOld.H, resultNew.H, 1e-6);
  assertEmbeddingsEqual(resultOld.E, resultNew.E, 1e-6);
});

Deno.test("Phase 5: v1 scoring produces identical results", () => {
  const shgatOld = createOldSHGAT();
  const shgatNew = createNewSHGAT();

  const intent = generateMockEmbedding(99);

  const scoresOld = shgatOld.scoreAllCapabilities(intent);
  const scoresNew = shgatNew.scoreAllCapabilities(intent);

  assertEquals(scoresOld.length, scoresNew.length);
  for (let i = 0; i < scoresOld.length; i++) {
    assertEquals(scoresOld[i].capabilityId, scoresNew[i].capabilityId);
    assertAlmostEqual(scoresOld[i].score, scoresNew[i].score, 1e-6);
  }
});
```

### 5.3 Unit Tests for New Components

```typescript
// tests/unit/graphrag/algorithms/shgat/message-passing/tool-to-cap-phase_test.ts
Deno.test("ToolToCapPhase: aggregates tool embeddings correctly", () => {
  const phase = new ToolToCapPhase(mathUtils, config);

  const toolEmbeddings = [
    [1, 0, 0],
    [0, 1, 0],
  ];

  const capEmbeddings = [
    [0.5, 0.5, 0],
  ];

  const incidence = new IncidenceMap();
  incidence.addEdge("tool1", "cap1");
  incidence.addEdge("tool2", "cap1");

  const result = phase.aggregate(toolEmbeddings, capEmbeddings, incidence, params);

  assertExists(result.parentEmbeddings);
  assertEquals(result.parentEmbeddings.length, 1);
  assertExists(result.attention);
});
```

---

## 6. Implementation Order

### Week 1: Phase 1 + Phase 2
- Extract math utils
- Extract parameter management
- Run non-regression tests

### Week 2: Phase 3 (CRITICAL)
- Implement `MessagePassingPhase` interface
- Create `ToolToCapPhase`
- Create `MultiLevelForward` orchestrator
- Update `SHGAT.forward()`
- **Extensive testing**: Verify identical outputs

### Week 3: Phase 4 + Phase 5
- Extract incidence builder
- Extract scorers (optional, can defer)
- Final integration testing

---

## 7. Post-Refactor: Multi-Level Extension

After refactor, adding multi-level becomes trivial:

```typescript
// NEW: Create CapToCapPhase for level 1
const capToCapPhase1 = new CapToCapPhase(mathUtils, config, 1);

// Add to phases map
phases.set(0, new ToolToCapPhase(mathUtils, config));
phases.set(1, capToCapPhase1);  // ← NEW: Level 1

// MultiLevelForward automatically handles N levels
const multiLevelForward = new MultiLevelForward(phases, incidence, params, config);

// forward() now does V → E^0 → E^1 → E^0 → V
const result = multiLevelForward.forward(H, E);
```

**No changes to existing code** - just add new phase instances.

---

## 8. Backward Compatibility

### 8.1 Public API Unchanged

```typescript
// All existing methods remain
class SHGAT {
  addTool(id: string, embedding: number[]): void { /* unchanged */ }
  addCapability(...): void { /* unchanged */ }
  scoreAllCapabilities(...): AttentionResult[] { /* unchanged */ }
  scoreAllCapabilitiesV2(...): AttentionResult[] { /* unchanged */ }
  scoreAllCapabilitiesV3(...): AttentionResult[] { /* unchanged */ }
  trainBatch(...): TrainingResult { /* unchanged */ }
}
```

### 8.2 Internal API Compatibility

Existing code importing from `shgat.ts` continues to work:

```typescript
// BEFORE
import { SHGAT, type SHGATConfig } from "./shgat.ts";

// AFTER (still works)
import { SHGAT, type SHGATConfig } from "./shgat/index.ts";
// OR
import { SHGAT, type SHGATConfig } from "./shgat/core/shgat.ts";
```

Use barrel export in `shgat/index.ts`:
```typescript
// src/graphrag/algorithms/shgat/index.ts
export { SHGAT } from "./core/shgat.ts";
export * from "./core/types.ts";
export * from "./core/config.ts";
```

---

## 9. Metrics and Success Criteria

### 9.1 Code Metrics

**Target**:
- `shgat.ts` (facade): <500 LOC (down from 3000+)
- Average file size: <300 LOC
- Max file size: <500 LOC
- Test coverage: ≥ 90% for new components

**Measure**:
```bash
# Before refactor
wc -l src/graphrag/algorithms/shgat.ts
# 3000+ lines

# After refactor
wc -l src/graphrag/algorithms/shgat/core/shgat.ts
# <500 lines
```

### 9.2 Performance

**No regression**:
- Forward pass: ± 5% latency (acceptable variation due to function call overhead)
- Scoring: ± 2% latency
- Training: ± 5% latency

**Measure**:
```bash
deno bench tests/benchmarks/strategic/shgat-v1-v2-v3-comparison.bench.ts
```

Compare before/after results.

### 9.3 Extensibility

**Multi-level implementation effort**:
- BEFORE refactor: ~1000 LOC changes across monolithic file
- AFTER refactor: ~200 LOC (create new CapToCapPhase + update config)

---

## 10. Risks and Mitigation

### 10.1 Risk: Floating Point Divergence

**Issue**: Refactored code produces slightly different results due to operation reordering.

**Mitigation**:
- Use tolerance-based assertions (1e-6)
- Run equivalence tests on large datasets
- Compare attention weights, not just final scores

### 10.2 Risk: Performance Regression

**Issue**: Additional function calls add overhead.

**Mitigation**:
- Benchmark after each phase
- Inline hot paths if needed (e.g., `matmul` in tight loops)
- Accept ≤5% regression for maintainability gain

### 10.3 Risk: Breaking Changes

**Issue**: External code depends on internal SHGAT methods.

**Mitigation**:
- Keep all public methods unchanged
- Use `@deprecated` for internal methods before removing
- Provide migration guide for advanced users

---

## 11. Rollout Plan

### 11.1 Feature Flag

Add config flag to toggle between old/new implementation during transition:

```typescript
export interface SHGATConfig {
  // ... existing fields

  /** @internal Use refactored modular architecture (experimental) */
  useModularArchitecture?: boolean;
}

class SHGAT {
  constructor(config: SHGATConfig) {
    if (config.useModularArchitecture) {
      this.forward = this.forwardModular.bind(this);
    } else {
      this.forward = this.forwardLegacy.bind(this);
    }
  }
}
```

### 11.2 Gradual Adoption

**Week 1-2**: Refactor with flag OFF by default
**Week 3**: Enable for internal tests
**Week 4**: Enable for dev environment
**Week 5**: Enable for production (if all tests pass)
**Week 6**: Remove old code, make modular architecture default

---

## 12. Acceptance Criteria

✅ **Refactoring Complete**:
- [ ] All components extracted per section 3.1
- [ ] `shgat.ts` is <500 LOC facade
- [ ] All interfaces defined (MessagePassingPhase, SHGATScorer, etc.)

✅ **Testing**:
- [ ] All existing unit tests pass unchanged
- [ ] All existing integration tests pass unchanged
- [ ] Equivalence tests pass (embeddings within 1e-6)
- [ ] Benchmarks show <5% performance regression

✅ **Documentation**:
- [ ] Each new file has module-level JSDoc
- [ ] Interfaces have usage examples
- [ ] Migration guide for multi-level extension

✅ **Multi-Level Ready**:
- [ ] CapToCapPhase can be added in <50 LOC
- [ ] MultiLevelForward handles N levels automatically
- [ ] Example multi-level test demonstrates extension

---

## 13. Future Work

### 13.1 Training Refactor (Deferred)

`trainBatch()` is complex and tightly coupled to forward pass. Defer extraction until after multi-level is proven.

**Proposed** (future):
- `src/graphrag/algorithms/shgat/training/backward-pass.ts`
- `src/graphrag/algorithms/shgat/training/gradient-accumulator.ts`

### 13.2 Graph Structure Abstraction (Deferred)

Currently `ToolNode` and `CapabilityNode` are tightly coupled to SHGAT. Could abstract into generic graph storage.

**Proposed** (future):
- `src/graphrag/algorithms/shgat/core/graph-storage.ts` (generic)
- `src/graphrag/algorithms/shgat/core/shgat-graph.ts` (SHGAT-specific)

---

## Appendix A: File Size Estimate

**Before**:
```
shgat.ts: 3000 LOC
shgat-types.ts: 450 LOC
Total: 3450 LOC
```

**After**:
```
core/
  shgat.ts: 400 LOC (facade)
  types.ts: 200 LOC
  config.ts: 100 LOC
  node-storage.ts: 150 LOC

incidence/
  incidence-builder.ts: 250 LOC
  hierarchy-levels.ts: 150 LOC

message-passing/
  phase-interface.ts: 100 LOC
  tool-to-cap-phase.ts: 300 LOC
  cap-to-cap-phase.ts: 300 LOC
  multi-level-forward.ts: 200 LOC

parameters/
  parameter-manager.ts: 200 LOC
  xavier-init.ts: 100 LOC

scoring/
  v1-scorer.ts: 250 LOC
  v2-scorer.ts: 200 LOC
  v3-scorer.ts: 200 LOC

utils/
  math.ts: 300 LOC
  vector-ops.ts: 150 LOC

Total: ~3350 LOC (similar total, better organized)
```

---

## Appendix B: Example Migration for Multi-Level

**After refactor, adding level 2 support**:

```typescript
// 1. Create phase instance (reuse CapToCapPhase)
const capToCapPhase2 = new CapToCapPhase(mathUtils, config, 2);

// 2. Add to phases map
phases.set(0, new ToolToCapPhase(mathUtils, config));
phases.set(1, capToCapPhase1);
phases.set(2, capToCapPhase2);  // ← NEW

// 3. Initialize level-2 embeddings
E.set(2, this.initializeLevel2Embeddings());

// 4. Build level-2 incidence
incidenceBuilder.addLevel(2, capabilityNodes);

// DONE - MultiLevelForward handles the rest
```

**Estimated effort**: ~50 LOC + config changes.

Compare to current approach: ~500+ LOC modifying monolithic `forward()`.

---

## References

1. **shgat-v1-nsuperhypergraph-refactor.md**: Multi-level message passing spec
2. **ADR-050**: SHGAT v2 architecture decisions
3. **Gang of Four - Strategy Pattern**: Design pattern reference
4. **Clean Architecture (Robert Martin)**: Separation of concerns principles
