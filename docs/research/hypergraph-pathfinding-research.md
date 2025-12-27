# Recherche : Algorithmes de Pathfinding pour Hypergraphes

## Contexte

Recherche d'algorithmes natifs pour le shortest path sur hypergraphes, dans le cadre du spike sur la
suggestion DAG via capabilities.

## Papers clés

### 1. Dynamic Shortest Path Algorithms for Hypergraphs (2012)

- **arXiv** : [1202.0082](https://arxiv.org/abs/1202.0082)
- **PDF** : https://arxiv.org/pdf/1202.0082.pdf
- **IEEE** : [ieeexplore.ieee.org/document/6260461](https://ieeexplore.ieee.org/document/6260461/)

**Résumé** : Premier algorithme pour le shortest path dynamique sur hypergraphes généraux. Deux
algorithmes proposés :

- **HE-DSP** : Efficace pour hypergraphes denses avec hyperedges de haute dimension
- **DR-DSP** : Meilleur quand les changements d'hyperedges impactent souvent les shortest paths

### 2. Higher-order shortest paths in hypergraphs (2025)

- **arXiv** : [2502.03020](https://arxiv.org/html/2502.03020)
- **Très récent** (février 2025)

### 3. Sequence Hypergraphs: Paths, Flows, and Cuts

- **Springer** :
  [link.springer.com/chapter/10.1007/978-3-319-98355-4_12](https://link.springer.com/chapter/10.1007/978-3-319-98355-4_12)

**Application** : Réseaux de transport public - les lignes de transport sont des hyperedges.

### 4. Computing Shortest Hyperpaths for Pathway Inference

- **Springer** :
  [link.springer.com/chapter/10.1007/978-3-031-29119-7_10](https://link.springer.com/chapter/10.1007/978-3-031-29119-7_10)

**Application** : Réseaux de réactions cellulaires - hypergraphes dirigés pour les voies
métaboliques.

## Concepts clés

### Hyperpath

> "A hyperpath between two vertices u and v is a sequence of hyperedges {e0, e1,...,em} such that
> u∈e0, v∈em, and ei∩ei+1 ≠∅ for i= 0, ..., m −1."

Traduction : Un hyperpath est une séquence d'hyperedges où chaque paire consécutive partage au moins
un nœud.

### B-Connectivity

Notion de connectivité pour hypergraphes dirigés. Plus expressive qu'une connectivité sur graphe
classique.

### Complexité

- **Général** : Shortest hyperpath est **NP-hard** à approximer (facteur (1-ε)ln n)
- **Acyclique** : Shortest hyperpath est **polynomial** si le hypergraphe est acyclique

**Important pour nous** : Nos capabilities forment un DAG (acyclique), donc l'algo polynomial
s'applique !

## Graph Attention Networks

### SPAGAN: Shortest Path Graph Attention Network

- **IJCAI 2019** :
  [ijcai.org/proceedings/2019/0569.pdf](https://www.ijcai.org/proceedings/2019/0569.pdf)
- **ResearchGate** :
  [researchgate.net/publication/334843787](https://www.researchgate.net/publication/334843787_SPAGAN_Shortest_Path_Graph_Attention_Network)

Utilise Dijkstra pour calculer les shortest paths, puis attention mechanism sur les features des
paths.

### HGAT-BR: Hyperedge-based Graph Attention Network

- **Springer** :
  [link.springer.com/article/10.1007/s10489-022-03575-4](https://link.springer.com/article/10.1007/s10489-022-03575-4)

Pour les recommandations, utilise les hyperedges comme unités d'attention.

## Pourquoi l'algo natif hypergraph > Contraction Hierarchies

| Critère                        | Contraction Hierarchies        | Algo Hypergraph Natif |
| ------------------------------ | ------------------------------ | --------------------- |
| Conçu pour                     | Graphes classiques (routes)    | Hypergraphes          |
| Hyperedges                     | ❌ Ne comprend pas             | ✅ Unité atomique     |
| Capabilities comme super-nœuds | Hack (contraction manuelle)    | Natif                 |
| Complexité pour DAG            | Overkill (preprocessing lourd) | Polynomial            |
| Sémantique                     | Perd l'info des hyperedges     | Préserve la structure |

**Conclusion** : Contraction Hierarchies est optimisé pour les graphes routiers (millions de nœuds,
queries ultra-rapides). Pour notre cas (hypergraphe de capabilities, quelques centaines de nœuds),
un algo natif hypergraph est plus approprié.

## Détails des algorithmes

### HE-DSP (HyperEdge-based Dynamic Shortest Path)

- Extension de l'algo de Gallo pour hypergraphes
- Complexité : O(|δ| log |δ| + |δΦ|) pour weight increase/decrease
- Optimisé pour hypergraphes denses avec hyperedges de haute dimension
- Meilleur quand les changements n'impactent pas les shortest paths courants

### DR-DSP (Directed Relationship Dynamic Shortest Path)

- Meilleur quand les hyperedges sur les shortest paths changent souvent
- Adapté aux réseaux avec changements ciblés (usage fréquent, maintenance)
- **Recommandé pour Casys PML** : nos edges `provides` changent quand on observe de nouvelles
  exécutions

## Prochaines étapes

1. [x] Rechercher les détails des algos HE-DSP et DR-DSP
2. [ ] Télécharger manuellement le PDF depuis
       [HAL Inria](https://inria.hal.science/hal-00763797/document/)
3. [ ] Vérifier si une lib JS/TS existe pour hypergraph pathfinding
4. [ ] Sinon, implémenter l'algo polynomial pour DAG hypergraphs (DR-DSP)
5. [ ] Comparer avec l'approche actuelle (Dijkstra sur graphe projeté)
