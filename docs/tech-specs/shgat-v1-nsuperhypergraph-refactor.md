# SHGAT v1 Refactor: n-SuperHyperGraph Multi-Level Message Passing

**Status**: Draft
**Author**: Architecture Team
**Date**: 2025-01-XX
**Related ADRs**: ADR-050 (SHGAT v2), ADR-051 (DR-DSP)

---

## 1. Executive Summary

Current SHGAT implementation flattens hierarchical capabilities via `collectTransitiveTools()`, losing n-SuperHyperGraph structure. This refactor implements true multi-level message passing: **V → E^0 → E^1 → ... → E^n → ... → E^1 → E^0 → V** where capabilities can contain other capabilities as members, preserving recursive hierarchy.

**Key Changes**:
- Unified `Member` type (tools OR capabilities)
- Multi-level incidence structure replacing single flattened matrix
- N-phase message passing (upward aggregation + downward propagation)
- Hierarchy level computation via topological ordering
- Backward compatibility with legacy API

---

## 2. Mathematical Foundation

### 2.1 n-SuperHyperGraph Definition (Smarandache)

Given base vertex set V₀:
- **P^0(V₀) = V₀**: Tools (vertices)
- **P^1(V₀) = P(V₀)**: Level-0 Capabilities (hyperedges over V₀)
- **P^2(V₀) = P(P(V₀))**: Level-1 Meta-Capabilities (hyperedges over P^1)
- **P^n(V₀)**: Level-(n-1) capabilities (hyperedges over P^(n-1))

### 2.2 Hierarchy Levels

For capability c ∈ P^k(V₀):
```
level(c) = 0    if c contains only tools (c ⊆ V₀)
level(c) = 1 + max{level(c') | c' ∈ c}    otherwise
```

**Topological Property** (from Fujita DASH): In acyclic n-SuperHyperGraph, capabilities can be totally ordered such that all containment edges are forward edges.

### 2.3 Multi-Level Incidence

Instead of single matrix A[tool][cap], we have:
- **I₀**: Tools → Level-0 Capabilities (binary)
- **I_k**: Level-(k-1) Caps → Level-k Caps (binary, k ≥ 1)

For capability c at level k:
- If k = 0: I₀[t][c] = 1 iff tool t ∈ c.members
- If k > 0: I_k[c'][c] = 1 iff capability c' ∈ c.members

**NO TRANSITIVE CLOSURE**: Each I_k captures DIRECT membership only.

### 2.4 Message Passing Phases

#### Upward Aggregation (V → E^0 → E^1 → ... → E^L_max)

For each level k from 0 to L_max:

**Phase k=0 (Tools → Level-0 Caps)**:
```
E^0 = σ(I₀^T · (H^V ⊙ α₀))
```
Where α₀ are attention weights computed via multi-head attention.

**Phase k>0 (Level-(k-1) → Level-k Caps)**:
```
E^k = σ(I_k^T · (E^(k-1) ⊙ α_k))
```

#### Downward Propagation (E^L_max → ... → E^1 → E^0 → V)

For each level k from L_max-1 down to 0:

**Phase k≥0 (Level-(k+1) → Level-k Caps)**:
```
E^k ← E^k + σ(I_{k+1} · (E^(k+1) ⊙ β_k))
```

**Phase k=-1 (Level-0 → Tools)**:
```
H^V ← H^V + σ(I₀ · (E^0 ⊙ β_{-1}))
```

**Attention Weights**:
```
α_k[i][j] = softmax_j(LeakyReLU(a_k^T · [W_k^child · e_i || W_k^parent · e_j]))
β_k[i][j] = softmax_j(LeakyReLU(b_k^T · [W_k^parent · e_i || W_k^child · e_j]))
```

Where:
- `e_i`: Child embedding (from level k-1)
- `e_j`: Parent embedding (from level k)
- `||`: Concatenation
- `W_k^child`, `W_k^parent`, `a_k`, `b_k`: Learnable parameters per level k

---

## 3. Data Model

### 3.1 New Types

```typescript
/**
 * Member of a capability (tool OR capability)
 *
 * This enables P^n(V₀) structure where capabilities at level k
 * can contain capabilities from level k-1 OR tools from V₀.
 */
export type Member =
  | { type: 'tool'; id: string }
  | { type: 'capability'; id: string };

/**
 * Capability node in n-SuperHyperGraph
 */
export interface CapabilityNode {
  id: string;

  /** Intrinsic embedding (from description or cold start) */
  embedding: number[];

  /** Members: tools (V₀) OR capabilities (P^k, k < level) */
  members: Member[];

  /** Hierarchy level (computed via topological sort) */
  hierarchyLevel: number;

  /** Historical success rate */
  successRate: number;

  /** Hypergraph features for scoring */
  hypergraphFeatures?: HypergraphFeatures;
}

/**
 * Tool node (vertex V₀)
 */
export interface ToolNode {
  id: string;
  embedding: number[];
  toolFeatures?: ToolGraphFeatures;
}
```

### 3.2 Removed/Deprecated Fields

```typescript
// REMOVED from CapabilityNode:
// - toolsUsed: string[]   // Use members.filter(m => m.type === 'tool')
// - children: string[]    // Use members.filter(m => m.type === 'capability')
// - parents: string[]     // Reconstruct via reverse incidence if needed
```

### 3.3 Backward Compatibility Helpers

```typescript
class SHGAT {
  /** Get direct tools only (no transitive) */
  getDirectTools(capId: string): string[] {
    const cap = this.capabilityNodes.get(capId);
    return cap?.members
      .filter(m => m.type === 'tool')
      .map(m => m.id) ?? [];
  }

  /** Get direct child capabilities only */
  getDirectCapabilities(capId: string): string[] {
    const cap = this.capabilityNodes.get(capId);
    return cap?.members
      .filter(m => m.type === 'capability')
      .map(m => m.id) ?? [];
  }

  /** Get ALL transitive tools (for legacy API only) */
  @deprecated("Use hierarchical message passing instead")
  collectTransitiveTools(capId: string): Set<string> {
    // Keep old implementation for backward compat
    // but mark as deprecated
  }
}
```

---

## 4. Incidence Structure

### 4.1 Data Structures

```typescript
class SHGAT {
  // === Multi-level incidence ===

  /** Tools → Level-0 Capabilities (I₀) */
  private toolToCapIncidence: Map<string, Set<string>>;

  /** Level-k Caps → Level-(k+1) Caps (I_k, k ≥ 1) */
  private capToCapIncidence: Map<number, Map<string, Set<string>>>;

  /** Reverse mapping: parent → children at each level */
  private parentToChildIncidence: Map<number, Map<string, Set<string>>>;

  /** Hierarchy levels: level → set of capability IDs at that level */
  private hierarchyLevels: Map<number, Set<string>>;

  /** Max hierarchy level (L_max) */
  private maxHierarchyLevel: number;
}
```

### 4.2 Build Algorithm

```typescript
private buildMultiLevelIncidence(): void {
  // Step 1: Compute hierarchy levels via topological sort
  this.computeHierarchyLevels();

  // Step 2: Build I₀ (Tools → Level-0 Caps)
  this.toolToCapIncidence = new Map();
  const level0Caps = this.hierarchyLevels.get(0) ?? new Set();

  for (const capId of level0Caps) {
    const cap = this.capabilityNodes.get(capId)!;
    for (const m of cap.members) {
      if (m.type === 'tool') {
        const set = this.toolToCapIncidence.get(m.id) ?? new Set();
        set.add(capId);
        this.toolToCapIncidence.set(m.id, set);
      }
    }
  }

  // Step 3: Build I_k for k ≥ 1 (Cap → Parent Cap)
  this.capToCapIncidence = new Map();
  this.parentToChildIncidence = new Map();

  for (let level = 1; level <= this.maxHierarchyLevel; level++) {
    const capsAtLevel = this.hierarchyLevels.get(level) ?? new Set();
    const childToParent = new Map<string, Set<string>>();
    const parentToChild = new Map<string, Set<string>>();

    for (const parentId of capsAtLevel) {
      const parent = this.capabilityNodes.get(parentId)!;

      for (const m of parent.members) {
        if (m.type === 'capability') {
          // Forward: child → parent
          const parents = childToParent.get(m.id) ?? new Set();
          parents.add(parentId);
          childToParent.set(m.id, parents);

          // Reverse: parent → child
          const children = parentToChild.get(parentId) ?? new Set();
          children.add(m.id);
          parentToChild.set(parentId, children);
        }
      }
    }

    this.capToCapIncidence.set(level, childToParent);
    this.parentToChildIncidence.set(level, parentToChild);
  }
}
```

### 4.3 Hierarchy Level Computation

```typescript
private computeHierarchyLevels(): void {
  this.hierarchyLevels = new Map();
  this.maxHierarchyLevel = 0;

  const visited = new Set<string>();
  const levelCache = new Map<string, number>();

  const computeLevel = (capId: string): number => {
    // Cached?
    if (levelCache.has(capId)) {
      return levelCache.get(capId)!;
    }

    // Cycle detection (should not happen in acyclic graph)
    if (visited.has(capId)) {
      throw new Error(`Cycle detected at capability ${capId}`);
    }
    visited.add(capId);

    const cap = this.capabilityNodes.get(capId);
    if (!cap) {
      throw new Error(`Unknown capability ${capId}`);
    }

    // Get child capabilities
    const childCaps = cap.members.filter(m => m.type === 'capability');

    let level: number;
    if (childCaps.length === 0) {
      // Leaf: contains only tools (or nothing)
      level = 0;
    } else {
      // level(c) = 1 + max{level(c') | c' ∈ c}
      const childLevels = childCaps.map(m => computeLevel(m.id));
      level = 1 + Math.max(...childLevels);
    }

    // Cache and track
    levelCache.set(capId, level);
    cap.hierarchyLevel = level;

    const capsAtLevel = this.hierarchyLevels.get(level) ?? new Set();
    capsAtLevel.add(capId);
    this.hierarchyLevels.set(level, capsAtLevel);

    this.maxHierarchyLevel = Math.max(this.maxHierarchyLevel, level);

    visited.delete(capId);
    return level;
  };

  // Compute for all capabilities
  for (const [capId] of this.capabilityNodes) {
    computeLevel(capId);
  }
}
```

---

## 5. Multi-Level Message Passing

### 5.1 Forward Pass

```typescript
interface MultiLevelEmbeddings {
  /** Tool embeddings (level -1) */
  H: number[][];

  /** Capability embeddings by level (E^0, E^1, ..., E^L_max) */
  E: Map<number, number[][]>;

  /** Attention weights for interpretability */
  attentionUpward: Map<number, number[][][]>;   // [level][head][child][parent]
  attentionDownward: Map<number, number[][][]>; // [level][head][parent][child]
}

forward(): MultiLevelEmbeddings {
  const E = new Map<number, number[][]>();
  const attentionUpward = new Map<number, number[][][]>();
  const attentionDownward = new Map<number, number[][][]>();

  // Initialize tools (level -1)
  let H = this.getToolEmbeddings();

  // Initialize capabilities at each level with intrinsic embeddings
  for (let level = 0; level <= this.maxHierarchyLevel; level++) {
    const capsAtLevel = Array.from(this.hierarchyLevels.get(level) ?? []);
    E.set(level, capsAtLevel.map(id => {
      const cap = this.capabilityNodes.get(id)!;
      return [...cap.embedding]; // Copy
    }));
  }

  // ========================================================================
  // UPWARD PASS: V → E^0 → E^1 → ... → E^L_max
  // ========================================================================

  for (let level = 0; level <= this.maxHierarchyLevel; level++) {
    const capsAtLevel = Array.from(this.hierarchyLevels.get(level) ?? []);
    const numCaps = capsAtLevel.length;

    if (level === 0) {
      // Phase: Tools (V) → Level-0 Capabilities (E^0)
      const { E_new, attention } = this.aggregateToolsToCapabilities(
        H,
        E.get(0)!,
        capsAtLevel,
        level
      );
      E.set(0, E_new);
      attentionUpward.set(0, attention);

    } else {
      // Phase: Level-(k-1) → Level-k Capabilities
      const { E_new, attention } = this.aggregateCapabilitiesToCapabilities(
        E.get(level - 1)!,
        E.get(level)!,
        level - 1,
        level
      );
      E.set(level, E_new);
      attentionUpward.set(level, attention);
    }
  }

  // ========================================================================
  // DOWNWARD PASS: E^L_max → ... → E^1 → E^0 → V
  // ========================================================================

  for (let level = this.maxHierarchyLevel - 1; level >= 0; level--) {
    // Phase: Level-(k+1) → Level-k (downward propagation)
    const { E_new, attention } = this.propagateCapabilitiesToCapabilities(
      E.get(level + 1)!,
      E.get(level)!,
      level + 1,
      level
    );
    E.set(level, E_new);
    attentionDownward.set(level, attention);
  }

  // Final phase: Level-0 → Tools
  const { H_new, attention } = this.propagateCapabilitiesToTools(
    E.get(0)!,
    H,
    0
  );
  H = H_new;
  attentionDownward.set(-1, attention);

  return { H, E, attentionUpward, attentionDownward };
}
```

### 5.2 Upward Aggregation: Tools → Level-0 Capabilities

```typescript
/**
 * Aggregate tool embeddings to level-0 capabilities
 *
 * E^0 = σ(I₀^T · (H ⊙ α₀))
 */
private aggregateToolsToCapabilities(
  H: number[][],              // Tool embeddings [numTools][embDim]
  E_current: number[][],      // Current cap embeddings [numCaps][embDim]
  capsAtLevel: string[],      // Capability IDs at this level
  level: number
): { E_new: number[][]; attention: number[][][] } {
  const numCaps = capsAtLevel.length;
  const numHeads = this.config.numHeads;
  const headDim = this.config.headDim;

  const E_new: number[][] = [];
  const attention: number[][][] = []; // [head][tool][cap]

  // Get level parameters
  const params = this.getLevelParams(level);

  for (let head = 0; head < numHeads; head++) {
    const headAttention: number[][] = [];

    for (let c = 0; c < numCaps; c++) {
      const capId = capsAtLevel[c];
      const cap = this.capabilityNodes.get(capId)!;

      // Get direct tools for this capability
      const toolMembers = cap.members.filter(m => m.type === 'tool');
      const toolIndices = toolMembers.map(m =>
        this.toolIndex.get(m.id)
      ).filter(idx => idx !== undefined) as number[];

      if (toolIndices.length === 0) {
        // No tools: keep intrinsic embedding
        if (head === 0) {
          E_new[c] = [...E_current[c]];
        }
        headAttention[c] = [];
        continue;
      }

      // Compute attention scores
      const scores: number[] = [];
      for (const tIdx of toolIndices) {
        const toolEmb = H[tIdx];
        const capEmb = E_current[c];

        // Project and compute attention score
        const toolProj = this.matmul([toolEmb], params.W_child[head])[0];
        const capProj = this.matmul([capEmb], params.W_parent[head])[0];
        const concat = [...toolProj, ...capProj];
        const activated = concat.map(x => this.leakyRelu(x));
        const score = this.dot(params.a_upward[head], activated);
        scores.push(score);
      }

      // Softmax attention
      const attentionWeights = this.softmax(scores);
      headAttention[c] = attentionWeights;

      // Weighted aggregation
      const aggregated = new Array(headDim).fill(0);
      for (let i = 0; i < toolIndices.length; i++) {
        const tIdx = toolIndices[i];
        const toolProj = this.matmul([H[tIdx]], params.W_child[head])[0];
        const weight = attentionWeights[i];

        for (let d = 0; d < headDim; d++) {
          aggregated[d] += weight * toolProj[d];
        }
      }

      // Apply activation
      const activated = aggregated.map(x => this.elu(x));

      // Multi-head: concatenate or average at the end
      if (head === 0) {
        E_new[c] = activated;
      } else {
        for (let d = 0; d < headDim; d++) {
          E_new[c][head * headDim + d] = activated[d];
        }
      }
    }

    attention.push(headAttention);
  }

  return { E_new, attention };
}
```

### 5.3 Upward Aggregation: Capability → Parent Capability

```typescript
/**
 * Aggregate level-(k-1) capabilities to level-k capabilities
 *
 * E^k = σ(I_k^T · (E^(k-1) ⊙ α_k))
 */
private aggregateCapabilitiesToCapabilities(
  E_child: number[][],        // Child cap embeddings [numChildCaps][embDim]
  E_parent: number[][],       // Parent cap embeddings [numParentCaps][embDim]
  childLevel: number,
  parentLevel: number
): { E_new: number[][]; attention: number[][][] } {
  const parentCaps = Array.from(this.hierarchyLevels.get(parentLevel) ?? []);
  const childCaps = Array.from(this.hierarchyLevels.get(childLevel) ?? []);
  const numParents = parentCaps.length;
  const numHeads = this.config.numHeads;
  const headDim = this.config.headDim;

  const E_new: number[][] = [];
  const attention: number[][][] = []; // [head][child][parent]

  const params = this.getLevelParams(parentLevel);
  const childIndexMap = new Map<string, number>();
  childCaps.forEach((id, idx) => childIndexMap.set(id, idx));

  for (let head = 0; head < numHeads; head++) {
    const headAttention: number[][] = [];

    for (let p = 0; p < numParents; p++) {
      const parentId = parentCaps[p];
      const parent = this.capabilityNodes.get(parentId)!;

      // Get child capabilities
      const capMembers = parent.members.filter(m => m.type === 'capability');
      const childIndices = capMembers.map(m =>
        childIndexMap.get(m.id)
      ).filter(idx => idx !== undefined) as number[];

      if (childIndices.length === 0) {
        // No children: keep intrinsic embedding
        if (head === 0) {
          E_new[p] = [...E_parent[p]];
        }
        headAttention[p] = [];
        continue;
      }

      // Compute attention scores
      const scores: number[] = [];
      for (const cIdx of childIndices) {
        const childEmb = E_child[cIdx];
        const parentEmb = E_parent[p];

        const childProj = this.matmul([childEmb], params.W_child[head])[0];
        const parentProj = this.matmul([parentEmb], params.W_parent[head])[0];
        const concat = [...childProj, ...parentProj];
        const activated = concat.map(x => this.leakyRelu(x));
        const score = this.dot(params.a_upward[head], activated);
        scores.push(score);
      }

      const attentionWeights = this.softmax(scores);
      headAttention[p] = attentionWeights;

      // Weighted aggregation
      const aggregated = new Array(headDim).fill(0);
      for (let i = 0; i < childIndices.length; i++) {
        const cIdx = childIndices[i];
        const childProj = this.matmul([E_child[cIdx]], params.W_child[head])[0];
        const weight = attentionWeights[i];

        for (let d = 0; d < headDim; d++) {
          aggregated[d] += weight * childProj[d];
        }
      }

      const activated = aggregated.map(x => this.elu(x));

      if (head === 0) {
        E_new[p] = activated;
      } else {
        for (let d = 0; d < headDim; d++) {
          E_new[p][head * headDim + d] = activated[d];
        }
      }
    }

    attention.push(headAttention);
  }

  return { E_new, attention };
}
```

### 5.4 Downward Propagation: Parent Capability → Child Capability

```typescript
/**
 * Propagate parent embeddings down to children
 *
 * E^k ← E^k + σ(I_{k+1} · (E^(k+1) ⊙ β_{k+1}))
 */
private propagateCapabilitiesToCapabilities(
  E_parent: number[][],       // Parent embeddings (level k+1)
  E_child: number[][],        // Child embeddings (level k)
  parentLevel: number,
  childLevel: number
): { E_new: number[][]; attention: number[][][] } {
  const parentCaps = Array.from(this.hierarchyLevels.get(parentLevel) ?? []);
  const childCaps = Array.from(this.hierarchyLevels.get(childLevel) ?? []);
  const numChildren = childCaps.length;
  const numHeads = this.config.numHeads;
  const headDim = this.config.headDim;

  const E_new: number[][] = E_child.map(e => [...e]); // Copy
  const attention: number[][][] = []; // [head][parent][child]

  const params = this.getLevelParams(parentLevel);
  const parentIndexMap = new Map<string, number>();
  parentCaps.forEach((id, idx) => parentIndexMap.set(id, idx));

  // Build reverse mapping: child → parents
  const childToParents = new Map<string, string[]>();
  for (const parentId of parentCaps) {
    const parent = this.capabilityNodes.get(parentId)!;
    for (const m of parent.members) {
      if (m.type === 'capability') {
        const parents = childToParents.get(m.id) ?? [];
        parents.push(parentId);
        childToParents.set(m.id, parents);
      }
    }
  }

  for (let head = 0; head < numHeads; head++) {
    const headAttention: number[][] = [];

    for (let c = 0; c < numChildren; c++) {
      const childId = childCaps[c];
      const parentIds = childToParents.get(childId) ?? [];

      if (parentIds.length === 0) {
        headAttention[c] = [];
        continue;
      }

      const parentIndices = parentIds.map(id =>
        parentIndexMap.get(id)!
      );

      // Compute attention scores (child attends to parents)
      const scores: number[] = [];
      for (const pIdx of parentIndices) {
        const parentEmb = E_parent[pIdx];
        const childEmb = E_child[c];

        const parentProj = this.matmul([parentEmb], params.W_parent[head])[0];
        const childProj = this.matmul([childEmb], params.W_child[head])[0];
        const concat = [...parentProj, ...childProj];
        const activated = concat.map(x => this.leakyRelu(x));
        const score = this.dot(params.a_downward[head], activated);
        scores.push(score);
      }

      const attentionWeights = this.softmax(scores);
      headAttention[c] = attentionWeights;

      // Weighted aggregation from parents
      const propagated = new Array(headDim).fill(0);
      for (let i = 0; i < parentIndices.length; i++) {
        const pIdx = parentIndices[i];
        const parentProj = this.matmul([E_parent[pIdx]], params.W_parent[head])[0];
        const weight = attentionWeights[i];

        for (let d = 0; d < headDim; d++) {
          propagated[d] += weight * parentProj[d];
        }
      }

      const activated = propagated.map(x => this.elu(x));

      // Residual connection: add to current embedding
      for (let d = 0; d < headDim; d++) {
        E_new[c][head * headDim + d] += activated[d];
      }
    }

    attention.push(headAttention);
  }

  return { E_new, attention };
}
```

### 5.5 Downward Propagation: Level-0 Capabilities → Tools

```typescript
/**
 * Propagate level-0 capability embeddings to tools
 *
 * H ← H + σ(I₀ · (E^0 ⊙ β₀))
 */
private propagateCapabilitiesToTools(
  E_caps: number[][],         // Level-0 capability embeddings
  H: number[][],              // Tool embeddings
  level: number
): { H_new: number[][]; attention: number[][][] } {
  const caps = Array.from(this.hierarchyLevels.get(0) ?? []);
  const numTools = H.length;
  const numHeads = this.config.numHeads;
  const headDim = this.config.headDim;

  const H_new: number[][] = H.map(h => [...h]); // Copy
  const attention: number[][][] = []; // [head][cap][tool]

  const params = this.getLevelParams(level);

  // Build reverse mapping: tool → capabilities
  const toolToCaps = new Map<string, string[]>();
  for (const capId of caps) {
    const cap = this.capabilityNodes.get(capId)!;
    for (const m of cap.members) {
      if (m.type === 'tool') {
        const capIds = toolToCaps.get(m.id) ?? [];
        capIds.push(capId);
        toolToCaps.set(m.id, capIds);
      }
    }
  }

  for (let head = 0; head < numHeads; head++) {
    const headAttention: number[][] = [];

    for (let t = 0; t < numTools; t++) {
      const toolId = Array.from(this.toolNodes.keys())[t];
      const capIds = toolToCaps.get(toolId) ?? [];

      if (capIds.length === 0) {
        headAttention[t] = [];
        continue;
      }

      const capIndices = capIds.map(id =>
        caps.indexOf(id)
      ).filter(idx => idx >= 0);

      // Compute attention scores
      const scores: number[] = [];
      for (const cIdx of capIndices) {
        const capEmb = E_caps[cIdx];
        const toolEmb = H[t];

        const capProj = this.matmul([capEmb], params.W_parent[head])[0];
        const toolProj = this.matmul([toolEmb], params.W_child[head])[0];
        const concat = [...capProj, ...toolProj];
        const activated = concat.map(x => this.leakyRelu(x));
        const score = this.dot(params.a_downward[head], activated);
        scores.push(score);
      }

      const attentionWeights = this.softmax(scores);
      headAttention[t] = attentionWeights;

      // Weighted aggregation
      const propagated = new Array(headDim).fill(0);
      for (let i = 0; i < capIndices.length; i++) {
        const cIdx = capIndices[i];
        const capProj = this.matmul([E_caps[cIdx]], params.W_parent[head])[0];
        const weight = attentionWeights[i];

        for (let d = 0; d < headDim; d++) {
          propagated[d] += weight * capProj[d];
        }
      }

      const activated = propagated.map(x => this.elu(x));

      // Residual connection
      for (let d = 0; d < headDim; d++) {
        H_new[t][head * headDim + d] += activated[d];
      }
    }

    attention.push(headAttention);
  }

  return { H_new, attention };
}
```

---

## 6. Learnable Parameters

### 6.1 Parameter Structure

For each hierarchy level k ∈ [0, L_max]:

```typescript
interface LevelParams {
  /** Projection matrices per head */
  W_child: number[][][];    // [head][headDim][inputDim]
  W_parent: number[][][];   // [head][headDim][inputDim]

  /** Attention vectors per head */
  a_upward: number[][];     // [head][2*headDim] for upward pass
  a_downward: number[][];   // [head][2*headDim] for downward pass
}

class SHGAT {
  /** Parameters indexed by hierarchy level */
  private levelParams: Map<number, LevelParams>;

  private initializeLevelParameters(): void {
    this.levelParams = new Map();

    for (let level = 0; level <= this.maxHierarchyLevel; level++) {
      const params: LevelParams = {
        W_child: [],
        W_parent: [],
        a_upward: [],
        a_downward: [],
      };

      for (let head = 0; head < this.config.numHeads; head++) {
        // Xavier initialization
        params.W_child.push(
          this.initXavier(this.config.headDim, this.config.embeddingDim)
        );
        params.W_parent.push(
          this.initXavier(this.config.headDim, this.config.embeddingDim)
        );
        params.a_upward.push(
          this.initXavier(1, 2 * this.config.headDim)[0]
        );
        params.a_downward.push(
          this.initXavier(1, 2 * this.config.headDim)[0]
        );
      }

      this.levelParams.set(level, params);
    }
  }

  private getLevelParams(level: number): LevelParams {
    return this.levelParams.get(level)!;
  }
}
```

### 6.2 Total Parameter Count

For L_max hierarchy levels and K heads:

```
Per level k:
- W_child: K × headDim × embDim
- W_parent: K × headDim × embDim
- a_upward: K × 2·headDim
- a_downward: K × 2·headDim

Total per level: K × (2·headDim·embDim + 4·headDim)
Total all levels: (L_max + 1) × K × (2·headDim·embDim + 4·headDim)

Example (L_max=2, K=4, headDim=16, embDim=1024):
= 3 × 4 × (2·16·1024 + 4·16)
= 12 × (32768 + 64)
= 393,984 parameters
```

---

## 7. Scoring API Changes

### 7.1 Modified `scoreAllCapabilities()`

```typescript
scoreAllCapabilities(
  intentEmbedding: number[],
  targetLevel?: number  // NEW: optional level filter
): AttentionResult[] {
  // Run multi-level forward pass
  const { H, E } = this.forward();

  const results: AttentionResult[] = [];
  const groupWeights = this.computeFusionWeights();
  const intentProjected = this.projectIntent(intentEmbedding);

  // Score capabilities at ALL levels (or filtered level)
  const levelsToScore = targetLevel !== undefined
    ? [targetLevel]
    : Array.from(this.hierarchyLevels.keys());

  for (const level of levelsToScore) {
    const capsAtLevel = Array.from(this.hierarchyLevels.get(level) ?? []);
    const E_level = E.get(level)!;

    capsAtLevel.forEach((capId, idx) => {
      const cap = this.capabilityNodes.get(capId)!;
      const capPropagatedEmb = E_level[idx];

      // Use PROPAGATED embedding (includes hierarchy context)
      const intentSim = this.cosineSimilarity(intentProjected, capPropagatedEmb);
      const features = cap.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;

      // 3-head scoring (unchanged)
      const semanticScore = intentSim * this.featureWeights.semantic;
      const structureScore =
        (features.hypergraphPageRank + (features.adamicAdar ?? 0)) *
        this.featureWeights.structure;
      const temporalScore =
        (features.recency + (features.heatDiffusion ?? 0)) *
        this.featureWeights.temporal;

      const finalScore =
        groupWeights.semantic * semanticScore +
        groupWeights.structure * structureScore +
        groupWeights.temporal * temporalScore;

      results.push({
        capabilityId: capId,
        score: Math.max(0, Math.min(finalScore, 0.95)),
        headWeights: [groupWeights.semantic, groupWeights.structure, groupWeights.temporal],
        headScores: [semanticScore, structureScore, temporalScore],
        recursiveContribution: 0, // TODO: compute from attention weights
        hierarchyLevel: level,  // NEW field
      });
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
```

### 7.2 v2 and v3 Compatibility

**v2** (Direct embeddings + TraceFeatures):
- No changes required
- `scoreAllCapabilitiesV2()` bypasses message passing
- Can optionally add `hierarchyLevel` as a TraceStats feature

**v3** (Hybrid):
- Use `E_level[idx]` from multi-level forward pass instead of `E[idx]`
- Benefits from hierarchical propagation + TraceFeatures

```typescript
scoreAllCapabilitiesV3(
  intentEmbedding: number[],
  traceFeaturesMap: Map<string, TraceFeatures>,
  contextToolIds: string[] = [],
): AttentionResult[] {
  // Multi-level forward pass
  const { H, E } = this.forward();

  // ... rest unchanged, but use E.get(cap.hierarchyLevel)[idx] for propagated embedding
}
```

---

## 8. Training Changes

### 8.1 Gradient Computation

Backpropagation through multi-level message passing requires caching:

```typescript
interface ForwardCache {
  H: number[][];                           // Final tool embeddings
  E: Map<number, number[][]>;             // Cap embeddings per level
  attentionUpward: Map<number, number[][][]>;
  attentionDownward: Map<number, number[][][]>;

  // Intermediate activations for gradient computation
  intermediateUpward: Map<number, {
    childProj: number[][][];   // [cap][head][dim]
    parentProj: number[][][];
    scores: number[][][];
  }>;
  intermediateDownward: Map<number, {
    parentProj: number[][][];
    childProj: number[][][];
    scores: number[][][];
  }>;
}
```

### 8.2 Gradient Flow

For loss L at capability c ∈ E^k:

**Upward gradients**:
```
∂L/∂E^k[c] → ∂L/∂α_k → ∂L/∂W_k^child, ∂L/∂W_k^parent, ∂L/∂a_k
           → ∂L/∂E^(k-1)[children of c]
```

**Downward gradients**:
```
∂L/∂E^k[c] → ∂L/∂β_k → ∂L/∂W_k^parent, ∂L/∂W_k^child, ∂L/∂b_k
           → ∂L/∂E^(k+1)[parents of c]
```

Implementation deferred to separate training refactor spec.

---

## 9. Migration Strategy

### 9.1 Automatic Data Migration

```typescript
/**
 * Convert legacy CapabilityNode to new format
 */
function migrateCapabilityNode(
  legacy: {
    id: string;
    toolsUsed: string[];
    children: string[];
    embedding: number[];
    successRate: number;
  }
): CapabilityNode {
  return {
    id: legacy.id,
    embedding: legacy.embedding,
    members: [
      ...legacy.toolsUsed.map(id => ({ type: 'tool' as const, id })),
      ...legacy.children.map(id => ({ type: 'capability' as const, id })),
    ],
    hierarchyLevel: 0, // Will be recomputed
    successRate: legacy.successRate,
  };
}
```

### 9.2 API Compatibility Layer

```typescript
class SHGAT {
  /**
   * Legacy API: accepts old format, converts internally
   * @deprecated Use addCapability() with new format
   */
  addCapabilityLegacy(
    id: string,
    embedding: number[],
    toolsUsed: string[],
    children: string[] = []
  ): void {
    const members: Member[] = [
      ...toolsUsed.map(tid => ({ type: 'tool' as const, id: tid })),
      ...children.map(cid => ({ type: 'capability' as const, id: cid })),
    ];

    this.addCapability(id, embedding, members);
  }

  /**
   * New API: unified members
   */
  addCapability(
    id: string,
    embedding: number[],
    members: Member[],
    successRate: number = 0.5
  ): void {
    this.capabilityNodes.set(id, {
      id,
      embedding,
      members,
      hierarchyLevel: 0, // Computed during rebuild
      successRate,
    });

    this.dirty = true; // Mark for rebuild
  }
}
```

### 9.3 Execution Trace Format Changes

**IMPORTANT**: Execution traces remain **critical** for v2 (TraceFeatures) and v3 (Hybrid). The multi-level message passing enriches the graph structure but does NOT replace trace-based learning.

#### 9.3.1 Path Format Extension

**Current format**:
```typescript
interface ExecutionTrace {
  path: string[];  // Tool IDs only
  outcome: 'success' | 'failure';
  // ... other fields
}
```

**New format (backward compatible)**:
```typescript
interface ExecutionTrace {
  /** Execution path - can contain tool IDs AND capability IDs */
  path: string[];

  /** Node types for each path element (optional, for analytics) */
  nodeTypes?: Map<string, 'tool' | 'capability'>;

  /** Hierarchy levels for capability nodes (optional, for analytics) */
  hierarchyLevels?: Map<string, number>;

  outcome: 'success' | 'failure';
  // ... other fields unchanged
}
```

**Backward Compatibility**:
- Old traces (tool IDs only): Continue to work without modification
- New traces: Can include capability IDs in path (e.g., `["tool1", "cap-A", "meta-cap-B", "tool5"]`)
- Detection: Check if node exists in `toolNodes` or `capabilityNodes`

#### 9.3.2 Enriched Co-occurrence Patterns

With hierarchical paths, TraceFeatures can now capture:

**Tool-level patterns** (existing):
- "tool1 frequently followed by tool2" → `cooccurrenceWithContext`

**Capability-level patterns** (new):
- "cap-A frequently followed by meta-cap-B" → Higher-order workflow patterns
- "meta-cap-X succeeds 80% when used after tool5" → Cross-level dependencies

**Implementation**:
```typescript
function computeCooccurrence(traces: ExecutionTrace[]): Map<string, number> {
  const cooccurrence = new Map<string, number>();

  for (const trace of traces) {
    for (let i = 0; i < trace.path.length - 1; i++) {
      const current = trace.path[i];
      const next = trace.path[i + 1];

      // Co-occurrence key: "current→next"
      const key = `${current}→${next}`;
      cooccurrence.set(key, (cooccurrence.get(key) ?? 0) + 1);
    }
  }

  // Normalize by total occurrences per node
  // ... normalization logic
  return cooccurrence;
}
```

#### 9.3.3 Episodic Events for Capabilities

Training examples can now target capabilities at ANY hierarchy level:

**Level-0 capability**:
```typescript
{
  intentEmbedding: [...],
  contextTools: ["tool1", "tool2"],
  candidateId: "capability-setup",  // Level 0
  outcome: 1
}
```

**Meta-capability** (new):
```typescript
{
  intentEmbedding: [...],
  contextTools: ["tool1", "tool2"],
  candidateId: "meta-workflow-deploy",  // Level 1
  outcome: 1
}
```

**Super-capability** (new):
```typescript
{
  intentEmbedding: [...],
  contextTools: [],
  candidateId: "super-release-pipeline",  // Level 2
  outcome: 1
}
```

**Training impact**:
- v1: Learns attention weights for ALL hierarchy levels
- v2: TraceFeatures now include hierarchical success patterns
- v3: Benefits from BOTH message passing AND hierarchical trace patterns

#### 9.3.4 Database Schema (Optional Extension)

If `execution_trace` table needs schema updates:

```sql
-- Add optional columns (nullable for backward compat)
ALTER TABLE execution_trace ADD COLUMN node_types JSONB;
ALTER TABLE execution_trace ADD COLUMN hierarchy_levels JSONB;

-- Example values:
-- node_types: {"tool1": "tool", "cap-A": "capability", "meta-B": "capability"}
-- hierarchy_levels: {"cap-A": 0, "meta-B": 1}
```

**Migration**: Existing traces without these fields continue to work (NULL values ignored).

#### 9.3.5 Key Insight

The hierarchical message passing **complements** trace-based learning:

- **Message passing**: Captures structural relationships (tool→cap→meta-cap)
- **Trace features**: Captures behavioral patterns (success rates, co-occurrence, recency)

**Both are necessary**:
- Structure alone (v1) lacks historical context
- Traces alone (v2) lack compositional understanding
- Hybrid (v3) combines both for optimal performance

---

## 10. Validation & Testing

### 10.1 Unit Tests

```typescript
describe("Multi-Level Message Passing", () => {
  it("should compute hierarchy levels correctly", () => {
    // Level 0: cap-a (tools: t1, t2)
    // Level 0: cap-b (tools: t3)
    // Level 1: meta-c (caps: cap-a, cap-b)
    // Level 2: super-d (caps: meta-c)

    // Expected:
    // level(cap-a) = 0, level(cap-b) = 0
    // level(meta-c) = 1
    // level(super-d) = 2
  });

  it("should prevent cycles in hierarchy", () => {
    // cap-a contains cap-b
    // cap-b contains cap-a  ← cycle
    // Should throw error
  });

  it("should propagate embeddings upward through all levels", () => {
    // Verify E^k depends on E^(k-1) after upward pass
  });

  it("should propagate embeddings downward with residual connections", () => {
    // Verify E^k after downward ≠ E^k after upward (updated)
  });

  it("should maintain backward compatibility with legacy API", () => {
    // Old code using toolsUsed/children should still work
  });
});
```

### 10.2 Integration Tests

```typescript
describe("End-to-End Scoring", () => {
  it("should score meta-capabilities higher when all children match intent", () => {
    // meta-cap contains cap-a, cap-b
    // cap-a, cap-b both semantically match intent
    // meta-cap should score high (aggregated signal)
  });

  it("should score leaf capabilities correctly", () => {
    // cap-a at level 0 contains tools t1, t2
    // Should match v1 behavior for level-0 caps
  });
});
```

### 10.3 Benchmark

Create new benchmark comparing:
- v1 (old): Flattened incidence matrix
- v1 (new): Multi-level message passing
- v2: Direct embeddings (unchanged)
- v3 (old): Hybrid with flattened
- v3 (new): Hybrid with multi-level

```bash
deno bench tests/benchmarks/strategic/shgat-hierarchy-comparison.bench.ts
```

---

## 11. Performance Considerations

### 11.1 Computational Complexity

**Old (flattened)**:
- Incidence build: O(C × D_max) where D_max = max transitive depth
- Forward pass: O(2 × L × K × (T×C + C×T)) = O(L × K × T × C)

**New (multi-level)**:
- Incidence build: O(C) (single pass, no recursion)
- Hierarchy level computation: O(C) (topological sort)
- Forward pass: O(L_max × K × M_avg × P_avg)
  - L_max: max hierarchy level (typically 2-3)
  - M_avg: avg members per capability (typically 3-5)
  - P_avg: avg parents per capability (typically 1-2)

**Expected**: Similar or faster for L_max ≤ 3, slower for very deep hierarchies (L_max > 5).

### 11.2 Memory Usage

**Old**: O(T × C) for flattened incidence matrix

**New**:
- O(T × C₀) for tool→cap incidence (C₀ = level-0 caps only)
- O(∑_{k=1}^{L_max} C_k × C_{k-1}) for cap→cap incidence
- Typically **less memory** since C₀ + C₁ + ... < C and sparse

### 11.3 Caching Strategy

```typescript
class SHGAT {
  private dirty: boolean = false;
  private cachedForward?: MultiLevelEmbeddings;

  forward(): MultiLevelEmbeddings {
    // Cache if graph hasn't changed
    if (!this.dirty && this.cachedForward) {
      return this.cachedForward;
    }

    const result = this.computeForward();
    this.cachedForward = result;
    this.dirty = false;
    return result;
  }

  addCapability(...) {
    // Invalidate cache
    this.dirty = true;
    this.cachedForward = undefined;
  }
}
```

---

## 12. Open Questions & Future Work

### 12.1 Optimal Depth Decay

Should deep hierarchy levels be penalized?

**Option A**: Equal weight for all levels (current spec)
**Option B**: Decay factor 0.8^k for level k (controlled by config.depthDecay)

**Decision**: Start with Option A, add Option B if evaluation shows over-fitting to deep hierarchies.

### 12.2 Cross-Level Attention

Should capabilities at level k attend to ALL ancestor levels, not just k+1?

**Example**: Level-0 capability directly attends to level-2 super-parent.

**Decision**: Deferred to v1.1. Current spec uses strictly adjacent levels only.

### 12.3 Dynamic Level Computation

Should hierarchy levels be recomputed on every graph change or cached?

**Current**: Recomputed during `rebuildIndices()` (called on graph modifications).

---

## 13. Acceptance Criteria

✅ **Data Model**:
- [ ] `CapabilityNode` has `members: Member[]` field
- [ ] `Member` type supports both tools and capabilities
- [ ] Backward compat helpers (`getDirectTools()`, `collectTransitiveTools()`) work

✅ **Incidence**:
- [ ] Multi-level incidence structure built correctly
- [ ] Hierarchy levels computed via topological sort
- [ ] Cycle detection throws error

✅ **Message Passing**:
- [ ] Upward pass: V → E^0 → ... → E^L_max
- [ ] Downward pass: E^L_max → ... → E^0 → V
- [ ] Attention weights cached for interpretability

✅ **Scoring**:
- [ ] `scoreAllCapabilities()` uses propagated embeddings from correct level
- [ ] v2 and v3 APIs unchanged (or minimally changed)
- [ ] Results include `hierarchyLevel` field

✅ **Testing**:
- [ ] Unit tests for hierarchy level computation
- [ ] Unit tests for upward/downward aggregation
- [ ] Integration test for end-to-end scoring
- [ ] Benchmark comparing old vs new implementation

✅ **Performance**:
- [ ] Forward pass completes in ≤ 2× old implementation time
- [ ] Memory usage ≤ old implementation (for typical L_max ≤ 3)

---

## 14. References

1. **Smarandache, F.** (1998). "n-SuperHyperGraph and Plithogenic n-SuperHyperGraph"
2. **Fujita, Y.** (2025). "DASH: Directed Acyclic SuperHyperGraphs" - Topological ordering theorem
3. **Böhmová et al.** "Sequence Hypergraphs: Paths, Flows, and Cuts" - Sequential structure preservation
4. **ADR-050**: SHGAT v2 TraceFeatures integration
5. **ADR-051**: DR-DSP pathfinding with SHGAT scoring

---

## Appendix A: Example Hierarchy

```
Tools (V₀):
  t1: git-clone
  t2: npm-install
  t3: npm-test
  t4: docker-build
  t5: kubectl-apply

Level 0 Capabilities (E^0):
  cap-setup: [t1, t2]                    # Clone + install
  cap-test: [t3]                         # Run tests
  cap-deploy: [t4, t5]                   # Build + deploy

Level 1 Meta-Capabilities (E^1):
  meta-ci: [cap-setup, cap-test]         # CI pipeline
  meta-cd: [cap-deploy]                  # CD pipeline

Level 2 Super-Capabilities (E^2):
  super-release: [meta-ci, meta-cd]      # Full release workflow

Incidence Matrices:
  I₀: t1→cap-setup, t2→cap-setup, t3→cap-test, t4→cap-deploy, t5→cap-deploy
  I₁: cap-setup→meta-ci, cap-test→meta-ci, cap-deploy→meta-cd
  I₂: meta-ci→super-release, meta-cd→super-release

Message Flow:
  Upward:  [t1,t2,t3,t4,t5] → [cap-setup, cap-test, cap-deploy]
           → [meta-ci, meta-cd] → [super-release]

  Downward: [super-release] → [meta-ci, meta-cd]
            → [cap-setup, cap-test, cap-deploy] → [t1,t2,t3,t4,t5]
```

Final tool embeddings H contain context from ALL hierarchy levels.
Final capability embeddings E^k contain context from children AND parents.
