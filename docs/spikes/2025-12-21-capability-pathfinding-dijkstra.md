# Spike: Dijkstra avec Capabilities comme noeuds intermédiaires

## Status

**Draft** - Investigation en cours

## Contexte

### Distinction des deux modes de suggestion

| Mode | Fonction | Input | Output | Algorithme |
|------|----------|-------|--------|------------|
| **Suggestion DAG complet** | `suggest()` | Intent seul | DAG complet ordonné | Vector search → Dijkstra N×N |
| **Prediction passive** | `predictNextNode()` | Intent + Context (tools déjà exécutés) | Prochain tool/capability | Voisins du contexte + boost spectral |

**Point clé** : La prediction passive a le contexte des tasks précédentes, donc elle peut utiliser les edges directs depuis les tools du contexte. La suggestion DAG complète n'a que l'intent, donc Dijkstra doit découvrir les chemins entre tools non encore connectés.

**Note** : `suggestDAG()` utilise bien les historiques via les edges `tool_dependency` appris des traces passées (avec `observed_count` et `edge_source`). Le graphe Graphology est enrichi par les exécutions observées.

### Architecture actuelle

Le DAG Suggester utilise Dijkstra pour trouver les chemins entre tools candidats :

```typescript
// dag/builder.ts:48-49
const path = findShortestPath(graph, candidateTools[j], candidateTools[i]);
```

Le graphe Graphology contient :
- **Nodes Tools** : `serena__list_dir`, `git__commit`, etc.
- **Nodes Capabilities** : `capability:{uuid}` (chargés depuis `capability_dependency`)
- **Edges Tool→Tool** : depuis `tool_dependency`
- **Edges Capability→Capability** : depuis `capability_dependency` (avec `contains`, `sequence`)

### Ce qui existe déjà (mais n'est pas synchronisé)

Le **Spectral Clustering** (`spectral-clustering.ts:175-206`) construit déjà une matrice bipartite Tool↔Capability :

```typescript
// Utilise cap.toolsUsed pour créer les edges
for (const cap of capabilities) {
  for (const toolId of cap.toolsUsed) {
    data[toolIdx][capIdx] = 1;  // bidirectionnel
    data[capIdx][toolIdx] = 1;
  }
}
```

Cette donnée (`dag_structure.tools_used`) existe mais n'est **pas synchronisée vers le graphe Graphology** utilisé par Dijkstra.

### Problème réel identifié

**Ce n'est pas juste l'absence d'edges Tool↔Capability, c'est la sémantique des edge types :**

| Edge Type | Sémantique | Utilité pour Dijkstra |
|-----------|------------|----------------------|
| `dependency` | A doit s'exécuter avant B | ✅ Ordre causal explicite |
| `provides` | A fournit des données à B | ✅ **Data flow = vraie dépendance (dependsOn)** |
| `sequence` | A vient temporellement avant B dans une trace | ⚠️ Ordre observé, pas causal |
| `contains` | Tool A est dans Capability X | ❌ Juste appartenance |

**Seul `provides` définit une vraie relation `dependsOn`** : si A provides B, alors B dépend de A.

**Ajouter des edges `contains` bidirectionnels ne résout pas le problème** car `contains` ne dit rien sur l'ordre d'exécution.

### La vraie source de dépendances : `static_structure`

Les capabilities ont une `static_structure` (`capabilities/types.ts:477-479`) qui contient les **vraies dépendances** :

```typescript
interface StaticStructureEdge {
  from: string;
  to: string;
  type: "sequence" | "provides" | "conditional" | "contains";
}
```

Ces edges `provides`/`sequence` dans `static_structure.edges` représentent les dépendances réelles entre tools au sein d'une capability.

## Limitations connues

### Dijkstra et Hypergraph

**Dijkstra standard ne supporte PAS les hyperedges.** Il fonctionne sur un graphe classique (arêtes binaires).

| Structure | Type | Compatible Dijkstra |
|-----------|------|---------------------|
| **Graphe Graphology** | Arêtes binaires Tool→Tool | ✅ Oui |
| **Matrice Spectral Clustering** | Bipartite Tool↔Cap | ❌ Non (matrice séparée) |
| **Hyperedges (ADR-042)** | N-aires Cap→{Tools} | ❌ Non |

L'Option E ajoute des arêtes **Tool→Tool** (binaires depuis static_structure), donc compatible avec Dijkstra.

### Proposition de Capabilities vs Tools

**Problème** : L'Option E enrichit le graphe avec des arêtes Tool→Tool. Dijkstra trouve des chemins entre tools, pas des capabilities.

**Exemple** : Si capability "backup_workflow" contient [read_file, compress, upload] :
- Dijkstra trouve : `read_file → compress → upload`
- On propose : 3 tasks individuelles, pas la capability

**Solution** : Combiner Option E + Option C (post-processing)
1. Option E : Dijkstra découvre les chemins via les arêtes `provides`
2. Option C : Après buildDAG, détecter si une capability "couvre" le chemin trouvé et la proposer à la place

```typescript
// Post-processing après buildDAG
const dag = buildDAG(graph, candidateTools);
const coveredCapabilities = findCoveringCapabilities(dag.tasks, capabilityStore);
if (coveredCapabilities.length > 0) {
  // Proposer capability au lieu des tasks individuelles
  return { ...dag, suggestedCapabilities: coveredCapabilities };
}
```

### Dijkstra n'est peut-être pas le bon algorithme

**Problème fondamental** : Dijkstra ne comprend pas les "super edges" (capabilities) comme points d'arrivée.

**Exemple** :
```
Capability X = [A → B → C]
Tool D dépend de la Capability X (pas juste de C)

Dijkstra voit : A → B → C → D (chemin linéaire)
Sémantiquement : X → D (la capability entière est le prérequis)
```

Quand un tool D dépend d'une capability X, il ne dépend pas juste du dernier tool de X, mais de **l'exécution complète de X**.

### Algorithmes existants à explorer

| Algorithme | Concept | Applicable |
|------------|---------|------------|
| **[Contraction Hierarchies](https://en.wikipedia.org/wiki/Contraction_hierarchies)** | Préprocessing → shortcuts entre nœuds importants. 7 ordres de magnitude plus rapide que Dijkstra. | ✅ Capabilities = nœuds contractés |
| **[Dynamic Shortest Path for Hypergraphs](https://arxiv.org/abs/1202.0082)** | Premier algo pour shortest path sur hypergraphes dynamiques avec changements topologiques | ✅ Directement applicable |
| **[HPA* / HSP](https://www.cs.ubc.ca/~mack/Publications/FICCDAT07.pdf)** | Partition en clusters, pathfinding à 2 niveaux (inter-cluster puis intra-cluster) | ✅ Capabilities = clusters |

**Contraction Hierarchies** semble le plus prometteur :
1. **Preprocessing** : Contracter les capabilities en super-nœuds avec shortcuts
2. **Query** : Dijkstra bidirectionnel sur le graphe contracté (microseconds vs milliseconds)
3. **Expansion** : Déplier les capabilities sélectionnées en tasks

**Pistes à explorer** :

1. **Contracted Graph / Hierarchical Pathfinding**
   - Contracter les capabilities en "super-nœuds"
   - Dijkstra trouve des chemins entre super-nœuds
   - Expansion ensuite pour l'exécution

2. **Hypergraph Traversal dédié**
   - Algorithme qui comprend les hyperedges comme unités atomiques
   - Peut "sauter" directement à une capability comme destination

3. **Two-phase approach**
   - Phase 1 : Dijkstra sur le graphe contracté (capabilities comme nœuds)
   - Phase 2 : Expansion des capabilities sélectionnées en tasks

```typescript
// Contracted graph approach
interface ContractedNode {
  type: "tool" | "capability";
  id: string;
  // Si capability: tools contenus
  containedTools?: string[];
}

function buildContractedGraph(tools: Tool[], capabilities: Capability[]): Graph {
  // Ajouter capabilities comme super-nœuds
  for (const cap of capabilities) {
    graph.addNode(`cap:${cap.id}`, { type: "capability", containedTools: cap.toolsUsed });
  }

  // Edges: Tool → Capability (si tool est le dernier de la cap)
  // Edges: Capability → Tool (si tool dépend de la cap entière)
  // Edges: Capability → Capability (depuis capability_dependency)
}
```

**Question ouverte** : Comment savoir si D dépend de C (le tool) ou de X (la capability) ?
- Via `capability_dependency` table ?
- Via analyse des `provides` dans static_structure ?
- Via observation des exécutions passées ?

## Questions de recherche

1. ~~**Sémantique** : Que signifie un chemin `tool → capability → tool` ?~~
   - **Réponse** : `contains` = appartenance, pas d'ordre. Seul `provides` = vraie dépendance.

2. **Performance** : Quel impact sur le nombre d'edges si on extrait les static_structure ?
   - À mesurer : combien d'edges `provides` dans les capabilities existantes ?

3. ~~**Architecture** : Comment préserver la séparation bipartite (ADR-042) ?~~
   - **Réponse** : On n'ajoute pas des edges Tool↔Capability, on ajoute des edges Tool→Tool depuis les static_structures.

## Options à explorer

### Option A : Cross-edges Tool↔Capability (contains) ❌

Ajouter des edges bidirectionnels `contains` entre tools et leurs capabilities.

**Problème** : `contains` ne représente pas une dépendance d'exécution. Un chemin via `contains` ne garantit pas l'ordre.

### Option B : Graphe multi-layer ❌

Complexité excessive pour un gain incertain.

### Option C : Post-processing intelligent

Après Dijkstra, analyser le chemin pour détecter si une capability "couvre" plusieurs nodes consécutifs.

**Avantages** : Pas de changement au graphe
**Inconvénients** : Pas de vraie découverte de chemins, juste remplacement post-hoc

### Option D : Hypergraph pathfinding natif ❌

Changement d'architecture majeur, pas de lib existante.

### Option E : Extraire les edges `provides` depuis static_structure ✅ RECOMMANDÉE

Enrichir le graphe Graphology avec les vraies dépendances (`provides` = data flow) extraites des `static_structure` des capabilities.

**Note** : On n'extrait que `provides`, pas `sequence`. `sequence` représente l'ordre temporel observé dans une trace, pas une vraie dépendance causale.

```typescript
// Dans db-sync.ts - après le sync des capabilities
const caps = await db.query(`
  SELECT pattern_id, dag_structure->'static_structure' as static_structure
  FROM workflow_pattern
  WHERE dag_structure->'static_structure' IS NOT NULL
`);

for (const cap of caps) {
  const structure = JSON.parse(cap.static_structure);
  if (!structure?.edges) continue;

  // Map node IDs to tool IDs
  const nodeToTool = new Map<string, string>();
  for (const node of structure.nodes || []) {
    if (node.type === "task" && node.tool) {
      nodeToTool.set(node.id, node.tool);
    }
  }

  // Extract ONLY provides edges (data flow = real dependency)
  for (const edge of structure.edges) {
    if (edge.type !== "provides") continue;  // Only provides, not sequence

    const fromTool = nodeToTool.get(edge.from);
    const toTool = nodeToTool.get(edge.to);

    if (fromTool && toTool && graph.hasNode(fromTool) && graph.hasNode(toTool)) {
      if (!graph.hasEdge(fromTool, toTool)) {
        graph.addEdge(fromTool, toTool, {
          edge_type: "provides",
          edge_source: "template",  // vient d'une capability, pas encore observé
          weight: EDGE_TYPE_WEIGHTS["provides"] * EDGE_SOURCE_MODIFIERS["template"],
          // 0.7 * 0.5 = 0.35 (poids faible, sera renforcé si observé)
        });
      }
    }
  }
}
```

**Avantages** :
- Réutilise les données existantes (static_structure)
- Sémantique correcte (`provides` = data flow = `dependsOn`)
- Compatible avec le système de poids existant (edge_source = "template" → "observed")
- Dijkstra fonctionne tel quel

**Inconvénients** :
- Dépend de la qualité des static_structure existantes
- Les edges sont "template" (poids 0.35) jusqu'à observation (poids 0.7)

## Critères de décision

| Critère | Poids | Option C | Option E |
|---------|-------|----------|----------|
| Simplicité d'implémentation | 30% | + | ++ |
| Performance | 20% | ++ | + |
| Sémantique claire | 25% | + | ++ |
| Compatibilité existante | 25% | + | ++ |

**Recommandation** : Option E (extraction static_structure) avec fallback Option C (post-processing).

## Prochaines étapes

### Court terme (Option E + C)
1. [ ] Mesurer combien de capabilities ont des static_structure avec edges `provides`
2. [ ] Implémenter Option E dans db-sync.ts
3. [ ] Ajouter tests unitaires pour le nouveau sync
4. [ ] Benchmark performance avant/après (nombre d'edges, temps de sync)

### Moyen terme (Algorithme adapté aux hypergraphes)
5. [ ] Lire le paper [Dynamic Shortest Path for Hypergraphs](https://arxiv.org/abs/1202.0082)
6. [ ] Évaluer [Contraction Hierarchies](https://en.wikipedia.org/wiki/Contraction_hierarchies) pour les capabilities
7. [ ] Prototyper l'approche two-phase (Dijkstra sur super-nœuds → expansion)
8. [ ] Définir comment détecter si un tool dépend d'une capability (pas juste du dernier tool)

## Références

- ADR-042: Capability-to-Capability Hyperedges
- ADR-048: Local Alpha (Heat Diffusion)
- `src/graphrag/dag/builder.ts` - buildDAG avec Dijkstra
- `src/graphrag/algorithms/pathfinding.ts` - findShortestPath
- `src/graphrag/sync/db-sync.ts` - chargement du graphe
- `src/graphrag/prediction/capabilities.ts` - injectMatchingCapabilities

## Notes de discussion

- 2025-12-21: Identifié lors de l'analyse du flux de suggestion DAG. Dijkstra ne traverse que les tools, les capabilities sont un layer séparé.
- 2025-12-21: **Clarification importante** :
  - `suggest()` = intent seul → besoin de Dijkstra pour découvrir les chemins
  - `predictNextNode()` = intent + context → peut utiliser les edges directs depuis le contexte
  - Le spectral clustering (`spectral-clustering.ts:175-206`) construit déjà une matrice bipartite Tool↔Capability via `toolsUsed`, mais cette info n'est pas synchronisée vers Graphology
  - `contains` = appartenance, pas d'ordre → inutile pour Dijkstra
  - `sequence` = ordre temporel observé dans une trace → pas une vraie dépendance
  - **Seul `provides` = data flow = vraie relation `dependsOn`**
  - Solution recommandée : extraire les edges `provides` depuis `static_structure.edges` des capabilities
