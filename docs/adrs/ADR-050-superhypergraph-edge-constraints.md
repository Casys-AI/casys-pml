# ADR-050: SuperHyperGraph Edge Constraints

**Status:** Accepted
**Date:** 2025-12-17
**Relates to:** ADR-038 (Scoring Algorithms), ADR-042 (Capability Hyperedges), ADR-045 (Cap-to-Cap Dependencies)
**Research:** `spikes/2025-12-17-superhypergraph-hierarchical-structures.md`

---

## Context

Casys PML utilise un **n-SuperHyperGraph non-borné** pour représenter les relations entre tools, capabilities et meta-capabilities. Le système supporte 4 types d'edges avec des sémantiques différentes :

| Edge Type | Sémantique | Exemple |
|-----------|------------|---------|
| `contains` | Composition (meta-capability) | "deploy-full" contains "build", "test", "deploy" |
| `dependency` | Ordre d'exécution requis | "deploy" dependency "build" |
| `provides` | Flux de données (paramètres) | "read_file" provides output to "parse_json" |
| `sequence` | Co-occurrence temporelle observée | "read" souvent suivi de "write" |

La théorie **DASH (Directed Acyclic SuperHyperGraphs)** de Fujita 2025 formalise les propriétés nécessaires pour garantir un ordonnancement topologique et éviter les deadlocks.

**Question :** Quelles contraintes de cyclicité appliquer à chaque type d'edge ?

---

## Decision

### Contraintes par type d'edge

| Edge Type | Contrainte | Enforcement | Justification |
|-----------|-----------|-------------|---------------|
| `contains` | **DAG strict** | Block at insertion | Impossibilité logique (A ne peut contenir B qui contient A) |
| `dependency` | **DAG strict** | Block at insertion | Évite deadlocks à l'exécution |
| `provides` | **Cycles autorisés** | None | Interdépendances fonctionnelles valides |
| `sequence` | **Cycles autorisés** | None | Patterns temporels naturels (boucles d'usage) |

### Implémentation

#### 1. Validation DAG pour `contains` et `dependency`

```typescript
// src/graphrag/edge-validator.ts
export class DASHValidator {
  /**
   * Vérifie qu'ajouter un edge ne crée pas de cycle
   * Applicable à: contains, dependency
   */
  wouldCreateCycle(
    from: string,
    to: string,
    edgeType: 'contains' | 'dependency'
  ): boolean {
    // Si "to" peut atteindre "from" via des edges du même type → cycle
    return this.isReachable(to, from, edgeType);
  }

  private isReachable(
    source: string,
    target: string,
    edgeType: string
  ): boolean {
    const visited = new Set<string>();
    const stack = [source];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = this.getOutgoingNeighbors(current, edgeType);
      stack.push(...neighbors);
    }
    return false;
  }

  /**
   * Appelé avant insertion d'un edge contains ou dependency
   */
  validateEdgeInsertion(
    from: string,
    to: string,
    edgeType: EdgeType
  ): ValidationResult {
    if (edgeType === 'contains' || edgeType === 'dependency') {
      if (this.wouldCreateCycle(from, to, edgeType)) {
        return {
          valid: false,
          error: `Cycle detected: adding ${edgeType} edge ${from} → ${to} would violate DASH properties`,
          suggestion: edgeType === 'dependency'
            ? 'Consider using "provides" for bidirectional data flow'
            : 'Meta-capabilities cannot contain each other cyclically'
        };
      }
    }
    return { valid: true };
  }
}
```

#### 2. Topological Ordering (DASH Theorem 2.6)

```typescript
/**
 * Calcule l'ordre d'exécution pour un ensemble de capabilities
 * Garanti par la contrainte DAG sur contains/dependency
 */
export function topologicalSort(
  capabilities: Capability[],
  edgeType: 'contains' | 'dependency'
): Capability[] {
  const sorted: Capability[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(cap: Capability): void {
    if (inStack.has(cap.id)) {
      // Ne devrait jamais arriver si DASHValidator est utilisé
      throw new Error(`Unexpected cycle at ${cap.id}`);
    }
    if (visited.has(cap.id)) return;

    inStack.add(cap.id);

    const children = getEdgeTargets(cap.id, edgeType);
    for (const childId of children) {
      const child = capabilities.find(c => c.id === childId);
      if (child) visit(child);
    }

    inStack.delete(cap.id);
    visited.add(cap.id);
    sorted.push(cap);
  }

  for (const cap of capabilities) {
    visit(cap);
  }

  return sorted;
}
```

#### 3. Pas de validation pour `provides` et `sequence`

```typescript
// Ces edges peuvent avoir des cycles - pas de validation
async addProvidesEdge(from: string, to: string, params: string[]): Promise<void> {
  // Stockage direct, cycles autorisés
  await this.storeEdge(from, to, 'provides', { params });
}

async addSequenceEdge(from: string, to: string, weight: number): Promise<void> {
  // Stockage direct, cycles autorisés (patterns temporels)
  await this.storeEdge(from, to, 'sequence', { weight });
}
```

---

## Rationale

### Pourquoi DAG strict pour `contains` ?

C'est une **impossibilité logique** : si A contient B et B contient A, on a une récursion infinie. C'est comme une poupée russe qui se contiendrait elle-même.

```
❌ Invalid:
  meta-cap-A contains cap-B
  cap-B contains meta-cap-A  // Impossible

✅ Valid:
  meta-cap-A contains cap-B
  meta-cap-A contains cap-C
  cap-B (no children)
```

### Pourquoi DAG strict pour `dependency` ?

Pour l'**exécution**, un cycle de dépendances crée un deadlock :

```
❌ Deadlock:
  cap-A depends on cap-B
  cap-B depends on cap-A
  → Lequel exécuter en premier ?

✅ Valid:
  cap-A depends on cap-B
  cap-B depends on cap-C
  → Ordre: C → B → A
```

### Pourquoi autoriser les cycles pour `provides` ?

`provides` représente un **flux de données**, pas un ordre d'exécution. Deux tools peuvent se fournir mutuellement des données dans des contextes différents :

```
✅ Valid (contextes différents):
  read_file provides {content} to parse_json
  parse_json provides {structured_data} to write_file
  write_file provides {path} to read_file  // Pour vérification

Ce n'est pas un cycle d'exécution, c'est une description des flux de données possibles.
```

### Pourquoi autoriser les cycles pour `sequence` ?

`sequence` capture des **patterns temporels observés**. Les boucles sont naturelles dans l'usage réel :

```
✅ Natural pattern:
  read_file → process → validate → write_file → read_file (vérification)
           ↑__________________________________|

C'est un pattern d'usage, pas une contrainte d'exécution.
```

---

## Consequences

### Positives

1. **Garantie DASH** : Les propriétés prouvées (topological ordering, sources) sont garanties pour `contains`/`dependency`
2. **Pas de deadlocks** : L'exécution de DAGs est toujours possible
3. **Flexibilité** : `provides` et `sequence` capturent la richesse des patterns réels
4. **Messages d'erreur clairs** : Le système explique pourquoi un edge est rejeté

### Negatives

1. **Coût de validation** : O(V+E) à chaque insertion de `contains`/`dependency`
2. **Complexité** : 4 types d'edges avec des règles différentes

### Mitigations

- Cache des résultats de reachability pour edges fréquents
- Validation lazy (batch) pour imports en masse
- Documentation claire des règles par type d'edge

---

## Utility Functions (DASH Theorems)

### Find Root Capabilities (Theorem 2.5)

Tout DASH a au moins une "source" (vertex sans edges entrants). Utile pour trouver les points d'entrée.

```typescript
/**
 * DASH Theorem 2.5: Il existe toujours au moins une source
 * Retourne les capabilities qui ne dépendent de rien
 */
function findRootCapabilities(
  capabilities: Capability[],
  edgeType: 'contains' | 'dependency' = 'dependency'
): Capability[] {
  return capabilities.filter(cap =>
    !hasIncomingEdges(cap.id, edgeType)
  );
}

// Usage: points d'entrée pour exécution ou navigation UI
const entryPoints = findRootCapabilities(allCaps, 'dependency');
```

### Ancestry Queries (Theorem 2.8)

La relation de reachability forme un ordre partiel. Utile pour requêtes "qui utilise X" / "X utilise quoi".

```typescript
/**
 * DASH Theorem 2.8: Reachability = ordre partiel strict
 */
function getDescendants(capId: string, edgeType: EdgeType): string[] {
  const descendants: string[] = [];
  const stack = [capId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const children = getOutgoingNeighbors(current, edgeType);
    descendants.push(...children);
    stack.push(...children);
  }

  return descendants;
}

function getAncestors(capId: string, edgeType: EdgeType): string[] {
  const ancestors: string[] = [];
  const stack = [capId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const parents = getIncomingNeighbors(current, edgeType);
    ancestors.push(...parents);
    stack.push(...parents);
  }

  return ancestors;
}

// Usage: UI "Show all capabilities that use tool X"
const usedBy = getAncestors(toolId, 'contains');
```

---

## Implementation Notes

### Fichiers à modifier

| Fichier | Modification |
|---------|--------------|
| `src/graphrag/edge-validator.ts` | Nouveau - DASHValidator class |
| `src/graphrag/graph-engine.ts` | Appeler DASHValidator avant insertion |
| `src/capabilities/capability-store.ts` | Valider `contains` edges |
| `src/graphrag/types.ts` | Ajouter `ValidationResult` type |

### Tests requis

```typescript
describe('DASHValidator', () => {
  it('should reject cyclic contains edges', () => {
    validator.addEdge('A', 'B', 'contains');
    const result = validator.validateEdgeInsertion('B', 'A', 'contains');
    expect(result.valid).toBe(false);
  });

  it('should reject cyclic dependency edges', () => {
    validator.addEdge('A', 'B', 'dependency');
    const result = validator.validateEdgeInsertion('B', 'A', 'dependency');
    expect(result.valid).toBe(false);
  });

  it('should allow cyclic provides edges', () => {
    validator.addEdge('A', 'B', 'provides');
    const result = validator.validateEdgeInsertion('B', 'A', 'provides');
    expect(result.valid).toBe(true);
  });

  it('should allow cyclic sequence edges', () => {
    validator.addEdge('A', 'B', 'sequence');
    const result = validator.validateEdgeInsertion('B', 'A', 'sequence');
    expect(result.valid).toBe(true);
  });
});
```

---

## SHGAT Multi-Head Attention Architecture

### Context

SHGAT (SuperHyperGraph Attention Networks) implements learned attention for scoring capabilities and tools in the n-SuperHyperGraph. Initial implementation used 4 attention heads, but analysis revealed opportunities for:

1. Better separation of semantic, structural, and temporal features
2. Integration of AdamicAdar (graph similarity) and HeatDiffusion (propagation dynamics)
3. Learnable fusion weights to adapt scoring to episodic feedback

### 6-Head Architecture

The upgraded architecture uses 6 specialized heads organized in 3 categories:

| Category | Heads | Features Used | Purpose |
|----------|-------|---------------|---------|
| **Semantic** | 0, 1 | Cosine similarity (intent × capability) | Intent-capability alignment |
| **Structure** | 2, 3 | PageRank, Spectral clusters, AdamicAdar | Graph topology signals |
| **Temporal** | 4, 5 | Cooccurrence, Recency, HeatDiffusion | Usage patterns & dynamics |

#### Head Details

```
Head 0-1 (Semantic):
  - Input: cosine(intentEmbedding, capabilityEmbedding)
  - 2 heads for diverse semantic projections

Head 2 (Structure - PageRank):
  - Input: pageRank / hypergraphPageRank normalized score
  - Dedicated head for centrality

Head 3 (Structure - Spectral + AdamicAdar):
  - Input: spectralCluster membership + AdamicAdar similarity score
  - Captures community structure and link prediction

Head 4 (Temporal - Cooccurrence + Recency):
  - Input: contextual cooccurrence + time decay
  - Recent workflow patterns

Head 5 (Temporal - HeatDiffusion):
  - Input: heat propagation score
  - Dedicated head for diffusion dynamics
```

### Learnable Fusion Weights

The 6 heads output scores that are fused using learnable weights:

```typescript
interface FusionWeights {
  semantic: number;   // Weight for heads 0-1
  structure: number;  // Weight for heads 2-3
  temporal: number;   // Weight for heads 4-5
}

// Default initialization
const DEFAULT_FUSION_WEIGHTS = {
  semantic: 1.0,    // Highest priority to intent matching
  structure: 0.5,   // Graph structure secondary
  temporal: 0.5     // Usage patterns secondary
};
```

Fusion is normalized via softmax to ensure weights sum to 1:

```
finalScore = softmax(fusionWeights) · [semanticScore, structureScore, temporalScore]
```

Weights are updated during training via backpropagation through the softmax.

### HeatDiffusion for Tools vs Capabilities

**Design Decision:** HeatDiffusion is computed for BOTH tools and capabilities, but with different semantics:

| Entity | Heat Computation | Rationale |
|--------|------------------|-----------|
| **Tools** | Simple graph heat: degree-based intrinsic heat + neighbor propagation | Tools have local heat based on connectivity in the tool graph |
| **Capabilities** | Hierarchical heat: aggregated from constituent tools + capability neighbor propagation | Capabilities inherit heat from their tools, weighted by position |

```typescript
// Tool heat (simple)
toolHeat = intrinsicWeight * (degree / maxDegree) + neighborWeight * avgNeighborHeat

// Capability heat (hierarchical)
capHeat = Σ(toolHeat[i] * positionWeight[i]) / totalWeight
propagatedCapHeat = intrinsicWeight * capHeat + neighborWeight * neighborCapHeat * hierarchyDecay
```

This allows:
- Tools to have local connectivity signals (useful for tool graph navigation)
- Capabilities to aggregate tool-level heat with hierarchical propagation
- Different decay rates for tool vs capability heat propagation

### V→E→V Message Passing

**Core mechanism from n-SuHGAT (Fujita 2025):** Two-phase attention propagates information between tools (vertices) and capabilities (hyperedges).

#### Phase 1: Vertex → Hyperedge (V→E)

Tools contribute their embeddings to capabilities they belong to:

```
E^(l+1) = σ(A'^T · H^(l))

where A' = A ⊙ softmax(LeakyReLU(H·W_v · (E·W_e)^T))
```

- `A` is the incidence matrix (tool × capability membership)
- Attention weights learn which tools are most relevant for each capability
- Result: capability embeddings enriched with tool information

#### Phase 2: Hyperedge → Vertex (E→V)

Capabilities propagate back to their constituent tools:

```
H^(l+1) = σ(B'^T · E^(l))

where B' = A^T ⊙ softmax(LeakyReLU(E·W_e2 · (H·W_v2)^T))
```

- Tools receive aggregated signals from capabilities they participate in
- Result: tool embeddings enriched with capability context

#### Intent Projection

To compare intent (1024-dim BGE-M3) with propagated embeddings (384-dim):

```typescript
// W_intent: learnable projection matrix [384 × 1024]
intentProjected = W_intent @ intentEmbedding

// Semantic similarity in propagated space
score = cosineSimilarity(intentProjected, E[capIdx])
```

#### Scoring with Propagated Embeddings

```typescript
// Forward pass computes propagated embeddings
const { H, E } = this.forward();  // V→E→V message passing

// Project intent to same space
const intentProj = this.projectIntent(intentEmbedding);

// Score using enriched embeddings
const score = cosineSimilarity(intentProj, E[capIdx]);
```

**Key insight:** Propagated embeddings capture graph structure implicitly through learned attention. Pre-calculated features (PageRank, spectral, etc.) may be redundant—ablation studies pending to validate.

### Hierarchical Capabilities (n-SuperHyperGraph)

Per n-SuperHyperGraph theory (Smarandache 2019), hyperedges can contain other hyperedges recursively:

```
E ⊆ P(V) ∪ P(E)  // Hyperedges can contain vertices OR other hyperedges
```

This enables arbitrary nesting depth (n=∞):

```
Meta-Meta-Capability "release-cycle"
    └── Meta-Capability "deploy-full"
          └── Capability "build"
                └── Tools: [compiler, linker]
          └── Capability "test"
                └── Tools: [pytest]
    └── Meta-Capability "rollback-plan"
          └── Tools: [kubectl, rollback-script]
```

#### Transitive Flattening Strategy

Rather than adding explicit E→E message passing phases, we **flatten the hierarchy into the incidence matrix**:

```
Incidence Matrix A (with transitive closure):

                    build  test  deploy-full  rollback-plan  release-cycle
compiler              1      0        1            0              1
linker                1      0        1            0              1
pytest                0      1        1            0              1
kubectl               0      0        0            1              1
rollback-script       0      0        0            1              1
```

**Benefits:**
- No code change to V→E→V message passing
- Meta-capabilities receive embeddings from ALL descendant tools
- Attention learns which tools (at any depth) are most relevant
- Infinite nesting depth supported naturally

**Implementation:** When registering a capability with `contains` edges, compute transitive tool membership and populate the incidence matrix accordingly.

### Implementation Files

| File | Content |
|------|---------|
| `src/graphrag/algorithms/shgat.ts` | SHGAT class with 6-head scoring, V→E→V message passing, fusion weights, backprop |
| `src/graphrag/algorithms/shgat-features.ts` | AdamicAdar + HeatDiffusion integration |
| `tests/benchmarks/strategic/shgat.bench.ts` | Performance benchmarks for head configurations |

### Benchmarking

Available benchmarks to validate the architecture:

```bash
# Run SHGAT benchmarks
deno bench --allow-all tests/benchmarks/strategic/shgat.bench.ts

# Benchmark groups:
# - shgat-inference: Compare 1/4/6/8 head performance
# - shgat-context: Context size scaling (0, 3, 10 tools)
# - shgat-dim: Hidden dimension scaling (32, 64, 128)
# - shgat-training: Batch and epoch training performance
# - shgat-vs-spectral: Compare learned vs static scoring
```

---

## References

- [DASH - Fujita 2025](https://www.researchgate.net/publication/392710720) - Directed Acyclic SuperHypergraphs
- [n-SuperHyperGraph - Smarandache 2019](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4317064)
- ADR-038: Scoring Algorithms Reference
- ADR-042: Capability Hyperedges
- Spike: `2025-12-17-superhypergraph-hierarchical-structures.md`
