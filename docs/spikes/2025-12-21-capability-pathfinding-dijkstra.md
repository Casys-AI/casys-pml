# Spike: Dijkstra avec Capabilities comme noeuds intermédiaires

## Status

**Draft** - Investigation needed

## Contexte

### Architecture actuelle

Le DAG Suggester utilise Dijkstra pour trouver les chemins entre tools candidats :

```typescript
// dag/builder.ts:48-49
const path = findShortestPath(graph, candidateTools[j], candidateTools[i]);
```

Le graphe contient :
- **Nodes Tools** : `serena__list_dir`, `git__commit`, etc.
- **Nodes Capabilities** : `capability:{uuid}` (chargés depuis `capability_dependency`)
- **Edges Tool→Tool** : depuis `tool_dependency`
- **Edges Capability→Capability** : depuis `capability_dependency`

### Problème identifié

**Pas d'edges Tool↔Capability dans le graphe principal.**

Dijkstra ne peut pas découvrir un chemin comme :
```
tool_A → capability:file_backup → tool_B
```

Les capabilities sont **injectées après** la construction du DAG (`injectMatchingCapabilities`), pas découvertes comme noeuds intermédiaires du chemin.

### Impact

- Les capabilities ne peuvent pas servir de "ponts" entre tools
- Un workflow pourrait bénéficier de passer par une capability connue plutôt que de reconstruire les étapes individuelles
- L'abstraction "capability" n'est pas exploitée dans le pathfinding

## Questions de recherche

1. **Sémantique** : Que signifie un chemin `tool → capability → tool` ?
   - "Ces tools sont liés via cette capability" ?
   - "Utiliser la capability au lieu des tools individuels" ?

2. **Performance** : Quel impact sur le nombre d'edges ?
   - 200 tools × 50 capabilities × 2 directions = 20,000 edges potentiels

3. **Architecture** : Comment préserver la séparation bipartite (ADR-042) ?

## Options à explorer

### Option A : Cross-edges Tool↔Capability

Ajouter des edges bidirectionnels entre tools et leurs capabilities parentes.

```typescript
// Dans db-sync.ts
const capTools = await db.query(`
  SELECT capability_id, tool_id FROM capability_tools
`);

for (const ct of capTools) {
  graph.addEdge(ct.tool_id, `capability:${ct.capability_id}`, {
    edge_type: "member_of",
    weight: 0.7
  });
  graph.addEdge(`capability:${ct.capability_id}`, ct.tool_id, {
    edge_type: "provides",
    weight: 0.7
  });
}
```

**Avantages** : Simple, Dijkstra fonctionne tel quel
**Inconvénients** : Graphe pollué, sémantique confuse, explosion d'edges

### Option B : Graphe multi-layer avec pathfinding dédié

Maintenir deux graphes séparés, avec un algorithme de pathfinding qui peut "sauter" entre layers.

```typescript
interface MultiLayerPath {
  segments: Array<{
    layer: "tools" | "capabilities";
    path: string[];
  }>;
}

function findMultiLayerPath(
  toolsGraph: Graph,
  capGraph: Graph,
  from: string,
  to: string
): MultiLayerPath;
```

**Avantages** : Séparation claire, sémantique explicite
**Inconvénients** : Complexité ++, maintenance de 2 graphes

### Option C : Post-processing intelligent

Après Dijkstra, analyser le chemin pour détecter si une capability "couvre" plusieurs nodes consécutifs.

```typescript
// Après buildDAG
const path = [tool_A, tool_B, tool_C];
const coveringCap = findCapabilityCovering(path); // capability qui contient A, B, C
if (coveringCap) {
  // Remplacer [A, B, C] par [capability_X]
}
```

**Avantages** : Pas de changement au graphe, découverte post-hoc
**Inconvénients** : Pas de vraie découverte via Dijkstra

### Option D : Hypergraph pathfinding natif

Utiliser un algorithme de pathfinding spécifique aux hypergraphes (ex: hyperedge traversal).

**Avantages** : Sémantiquement correct pour les hypergraphes
**Inconvénients** : Changement d'architecture majeur, pas de lib existante

## Critères de décision

| Critère | Poids | Option A | Option B | Option C | Option D |
|---------|-------|----------|----------|----------|----------|
| Simplicité d'implémentation | 30% | ++ | - | + | -- |
| Performance | 20% | - | + | ++ | ? |
| Sémantique claire | 25% | - | ++ | + | ++ |
| Compatibilité ADR-042 | 25% | - | ++ | ++ | + |

## Prochaines étapes

1. [ ] Quantifier le nombre d'edges avec Option A (benchmark)
2. [ ] Prototyper Option C (post-processing) - plus simple
3. [ ] Évaluer si le use case justifie la complexité
4. [ ] Consulter ADR-042, ADR-048 pour contraintes existantes

## Références

- ADR-042: Capability-to-Capability Hyperedges
- ADR-048: Local Alpha (Heat Diffusion)
- `src/graphrag/dag/builder.ts` - buildDAG avec Dijkstra
- `src/graphrag/algorithms/pathfinding.ts` - findShortestPath
- `src/graphrag/sync/db-sync.ts` - chargement du graphe
- `src/graphrag/prediction/capabilities.ts` - injectMatchingCapabilities

## Notes de discussion

- 2025-12-21: Identifié lors de l'analyse du flux de suggestion DAG. Dijkstra ne traverse que les tools, les capabilities sont un layer séparé.
