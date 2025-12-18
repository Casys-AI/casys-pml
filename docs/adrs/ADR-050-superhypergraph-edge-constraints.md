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

## References

- [DASH - Fujita 2025](https://www.researchgate.net/publication/392710720) - Directed Acyclic SuperHypergraphs
- [n-SuperHyperGraph - Smarandache 2019](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4317064)
- ADR-038: Scoring Algorithms Reference
- ADR-042: Capability Hyperedges
- Spike: `2025-12-17-superhypergraph-hierarchical-structures.md`
