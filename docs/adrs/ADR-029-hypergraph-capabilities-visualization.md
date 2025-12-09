# ADR-029: Hypergraph Capabilities Visualization

**Status:** 📝 Draft
**Date:** 2025-12-04

## Context

Avec Epic 7 (Emergent Capabilities System), Casys Intelligence stocke des **capabilities** qui sont des
patterns de code réutilisables connectant **N tools** ensemble. Une capability n'est pas une
relation binaire (A → B) mais une relation N-aire (A, B, C, D utilisés ensemble).

### Le Problème

Un graphe classique représente des relations binaires:

```
A ←→ B ←→ C
```

Mais une capability est une **hyperedge** qui connecte N nodes simultanément:

```
┌─────────────────────────────────┐
│  Capability "Create Issue"      │
│  Connecte: fs, json, github     │
│  Code: await mcp.github...      │
└─────────────────────────────────┘
```

### État Actuel

- **Graph (Graphology):** Nodes = tools, Edges = co-occurrences binaires
- **Louvain:** Détecte des communautés (clusters de tools)
- **workflow_pattern:** Stocke capabilities avec `code_snippet` (ADR-028)
- **Visualisation (Epic 6):** Graph classique avec Cytoscape.js

### Questions à Résoudre

1. Comment représenter visuellement les capabilities (hyperedges)?
2. Comment afficher le `code_snippet` dans le dashboard?
3. Comment montrer la relation capability ↔ tools?
4. Faut-il une structure de données hypergraph dédiée?

## Decision Drivers

- **DX:** Visualisation claire des capabilities et leur code
- **Performance:** Pas de surcharge pour le graph existant
- **Simplicité:** Réutiliser l'infrastructure existante (Cytoscape.js)
- **Évolutivité:** Permettre des visualisations plus riches à l'avenir
- **Intégration:** Le mode hypergraph DOIT s'intégrer dans le dashboard EXISTANT (Epic 6), pas une
  nouvelle page

> **CONSTRAINT:** L'implémentation doit ajouter un toggle de vue au dashboard existant, pas créer
> une interface séparée. Consultation avec UX Designer requise avant implémentation pour valider
> l'intégration UI.

## Options Considered

### Option A: Cytoscape.js Compound Graphs

Utiliser la fonctionnalité native "compound nodes" de Cytoscape.js où un node peut contenir d'autres
nodes.

```javascript
// Capability = parent node
{
  data: {
    id: 'cap-uuid-1',
    type: 'capability',
    label: 'Create Issue from File',
    code_snippet: 'await mcp.github.createIssue(...)',
    success_rate: 0.95,
    usage_count: 12
  }
},
// Tools = children nodes
{
  data: {
    id: 'filesystem:read',
    parent: 'cap-uuid-1',
    type: 'tool'
  }
},
{
  data: {
    id: 'github:create_issue',
    parent: 'cap-uuid-1',
    type: 'tool'
  }
}
```

**Visualisation:**

```
┌─────────────────────────────────────────┐
│  Capability: "Create Issue from File"  │
│  success: 95% | usage: 12              │
│                                         │
│  ┌──────────┐  ┌──────────┐            │
│  │ fs:read  │  │ gh:issue │            │
│  └──────────┘  └──────────┘            │
│                                         │
│  [Click to view code]                   │
└─────────────────────────────────────────┘
```

**Pros:**

- On utilise déjà Cytoscape.js (pas de nouvelle dépendance)
- Compound graphs = fonctionnalité native
- Visualisation "containment" intuitive
- Compatible avec les layouts existants

**Cons:**

- Un tool peut appartenir à plusieurs capabilities (duplication visuelle)
- Compound layout peut devenir complexe avec beaucoup de capabilities

### Option B: Bipartite Graph

Deux types de nodes (tools et capabilities) avec des edges entre eux.

```javascript
// Tool nodes (bleu)
{ data: { id: 'fs:read', type: 'tool' } },
{ data: { id: 'gh:issue', type: 'tool' } },

// Capability nodes (violet)
{ data: { id: 'cap-1', type: 'capability', code_snippet: '...' } },

// Edges capability → tool
{ data: { source: 'cap-1', target: 'fs:read', relation: 'uses' } },
{ data: { source: 'cap-1', target: 'gh:issue', relation: 'uses' } }
```

**Visualisation:**

```
[fs:read]───────┐
                ├───[Cap: Create Issue]───code_snippet
[gh:issue]──────┘
```

**Pros:**

- Pas de duplication de nodes
- Chaque tool reste unique
- Edges explicites "uses"

**Cons:**

- Graph plus dense (plus d'edges)
- Moins intuitif que "containment"
- Besoin de styling différent pour les deux types

### Option C: Overlay Mode (Toggle)

Le graph principal reste tools-only. Un mode "overlay" affiche les capabilities comme des groupes
visuels (convex hulls) sans modifier la structure du graph.

```javascript
// Graph normal: tools + edges
// Overlay: capability = convex hull autour des tools membres
```

**Visualisation:**

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│   Capability 1   │  ← convex hull (dashed)
│ ┌───┐     ┌───┐ │
  │ A │ ←→  │ B │
│ └───┘     └───┘ │
└ ─ ─ ─ ─ ─ ─ ─ ─ ┘
       ↕
     ┌───┐
     │ C │  (pas dans capability)
     └───┘
```

**Pros:**

- Graph principal non modifié
- Toggle on/off
- Visualise les groupements sans changer la structure

**Cons:**

- Overlaps si un tool est dans plusieurs capabilities
- Moins interactif (pas de "click on capability")

### Option D: Hypergraph Library Dédiée

Utiliser ou créer une bibliothèque hypergraph dédiée.

- [hypergraphs-plot](https://github.com/isislab-unisa/hypergraphs-plot): Petit projet académique
- Custom: Créer notre propre représentation

**Pros:**

- Représentation mathématiquement correcte
- Visualisations spécialisées (Venn, Euler)

**Cons:**

- Nouvelle dépendance ou dev custom significatif
- Intégration avec dashboard existant complexe
- hypergraphs-plot = projet petit, pas très maintenu

## Decision

**Option A: Cytoscape.js Compound Graphs** pour le MVP, avec évolution possible vers Option C
(Overlay) pour les cas où un tool appartient à plusieurs capabilities.

### Rationale

1. **Réutilisation:** Cytoscape.js déjà intégré (Epic 6)
2. **Natif:** Compound graphs = feature built-in, pas de hack
3. **Intuitif:** "Containment" facile à comprendre visuellement
4. **Code visible:** Click sur capability → panel avec code_snippet
5. **Incrémental:** On peut ajouter Overlay mode plus tard

### Gestion des Multi-Membership

Un tool peut appartenir à plusieurs capabilities. Solutions:

1. **Vue par capability:** Afficher une capability à la fois (dropdown selector)
2. **Duplication visuelle:** Tool apparaît dans chaque capability (avec indicateur)
3. **Mode hybride:** Click sur tool → liste ses capabilities

**Choix:** Option 1 (Vue par capability) pour le MVP, Option 3 (hybride) en v2.

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  PGlite                                                         │
│  ┌─────────────────┐      ┌─────────────────────┐              │
│  │ workflow_pattern│      │  tool_schemas       │              │
│  │ - code_snippet  │      │  - tool_id          │              │
│  │ - tools_used[]  │      │  - server           │              │
│  │ - intent_embed  │      │                     │              │
│  └────────┬────────┘      └──────────┬──────────┘              │
└───────────┼─────────────────────────┼───────────────────────────┘
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  HypergraphBuilder                                              │
│  - buildCompoundGraph(capabilities, tools)                      │
│  - Returns Cytoscape elements with parent relationships         │
└────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cytoscape.js (existing dashboard)                              │
│  - Compound layout (cola, dagre, or fcose)                     │
│  - Capability nodes: violet, expandable                        │
│  - Tool nodes: colored by server (existing)                    │
│  - Click capability → CodePanel with syntax highlighting       │
└─────────────────────────────────────────────────────────────────┘
```

### API Additions

```typescript
// GET /api/capabilities
interface CapabilityResponse {
  id: string;
  name: string | null;
  description: string | null;
  code_snippet: string;
  tools_used: string[];
  success_rate: number;
  usage_count: number;
  community_id: number | null;
  intent_preview: string; // First 100 chars of intent
}

// GET /api/graph/hypergraph
interface HypergraphResponse {
  nodes: CytoscapeNode[]; // Tools + Capabilities
  edges: CytoscapeEdge[]; // Tool-Tool + Capability-Tool
  capabilities_count: number;
  tools_count: number;
}
```

### UI Components

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard Header                                               │
│  [Tools] [Capabilities] [Hypergraph]  ← View mode toggle       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Graph Area                             │  │
│  │                                                           │  │
│  │   ┌─────────────────────────┐                            │  │
│  │   │  Cap: Create Issue      │ ← Compound node            │  │
│  │   │  ┌─────┐  ┌─────┐      │                            │  │
│  │   │  │ fs  │  │ gh  │      │                            │  │
│  │   │  └─────┘  └─────┘      │                            │  │
│  │   └─────────────────────────┘                            │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Code Panel (on capability click)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  // Create Issue from File                                │  │
│  │  const content = await mcp.filesystem.read("config.json");│  │
│  │  const data = JSON.parse(content);                        │  │
│  │  await mcp.github.createIssue({                           │  │
│  │    title: data.title,                                     │  │
│  │    body: data.description                                 │  │
│  │  });                                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Success: 95% | Usage: 12 | Last used: 2h ago                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Epic 8: Hypergraph Capabilities Visualization

**Story 8.1: Capability Data API**

- GET /api/capabilities endpoint
- GET /api/graph/hypergraph endpoint
- Filter by community, success_rate, usage

**Story 8.2: Compound Graph Builder**

- HypergraphBuilder class
- Convert capabilities → Cytoscape compound nodes
- Handle tools_used[] → parent relationships

**Story 8.3: Hypergraph View Mode**

- Toggle button in dashboard header
- Compound layout (fcose or cola)
- Styling: capabilities = violet rounded rectangles

**Story 8.4: Code Panel Integration**

- Click capability → show code_snippet
- Syntax highlighting (Prism.js or highlight.js)
- Copy to clipboard button
- Stats display (success_rate, usage_count)

**Story 8.5: Capability Explorer**

- Search capabilities by intent
- Filter by success_rate threshold
- Sort by usage_count
- "Try this capability" action

## Consequences

### Positive

- Visualisation claire de ce que le système a appris
- Debug facile: "pourquoi cette capability a été suggérée?"
- Code réutilisable visible et copiable
- Builds on existing infrastructure

### Negative

- Compound layouts can be slower with many capabilities
- Multi-membership needs careful UX design
- Additional API endpoints to maintain

### Risks

- Performance with 100+ capabilities: mitigate with pagination/filtering
- Code snippet security: ensure no secrets in displayed code

## References

- [ADR-027: Execute Code Graph Learning](./ADR-027-execute-code-graph-learning.md)
- [ADR-028: Emergent Capabilities System](./ADR-028-emergent-capabilities-system.md)
- [Cytoscape.js Compound Graphs](https://js.cytoscape.org/#notation/compound-nodes)
- [hypergraphs-plot](https://github.com/isislab-unisa/hypergraphs-plot) - Reference implementation
- [IEEE VIS 2024: Structure-Aware Simplification for Hypergraph Visualization](https://ieeevis.org/year/2024/program/paper_v-full-1746.html)
