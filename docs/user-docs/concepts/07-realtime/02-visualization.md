# Visualization

> SuperHyperGraph rendering with D3.js

## En bref

La visualisation dans PML, c'est comme le **tableau de bord de votre voiture** : un coup d'œil suffit pour comprendre ce qui se passe sans lire des pages de logs.

**Pourquoi c'est important ?**

- **Compréhension immédiate** : Voyez d'un coup d'œil comment les outils s'organisent et communiquent
- **Exploration intuitive** : Découvrez des capacités que vous ne soupçonniez pas
- **Debugging visuel** : Tracez le chemin d'exécution, identifiez les blocages
- **Apprentissage facilité** : Observez en temps réel comment PML apprend et crée des connections

**L'analogie du tableau de bord :**

- Les **jauges** (vitesse, carburant, température) = les métriques de vos outils (fréquence d'usage, taux de succès)
- Les **voyants lumineux** = les animations qui montrent l'activité en cours
- La **disposition** = le layout intelligent qui place les éléments liés ensemble
- Les **alertes** = les changements visuels quand quelque chose nécessite votre attention

Tout comme vous conduisez en regardant le tableau de bord plutôt qu'en ouvrant le capot, vous pilotez PML en regardant sa visualisation plutôt qu'en lisant les logs bruts.

## The SuperHyperGraph View

PML provides a visual representation of its knowledge graph—a **SuperHyperGraph** showing tools, capabilities, meta-capabilities, and their recursive relationships.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Knowledge Graph Visualization                │
│                                                                  │
│           ┌─────────┐                                           │
│           │ github  │ ← Server cluster                          │
│           └────┬────┘                                           │
│                │                                                 │
│    ┌───────────┼───────────┐                                    │
│    │           │           │                                    │
│    ▼           ▼           ▼                                    │
│  ┌───┐      ┌───┐      ┌───┐                                   │
│  │ A │ ───▶ │ B │ ───▶ │ C │  ← Tool nodes                     │
│  └───┘      └───┘      └───┘                                   │
│    │                     │                                      │
│    └─────────┬───────────┘                                      │
│              │                                                   │
│              ▼                                                   │
│     ╔═══════════════╗                                           │
│     ║  Capability   ║  ← Capability zone                        │
│     ║  file_to_pr   ║                                           │
│     ╚═══════════════╝                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why Visualize?

The visualization helps users:

| Purpose | Value |
|---------|-------|
| **Understand** | See how tools relate to each other |
| **Explore** | Discover available capabilities |
| **Debug** | Trace execution paths visually |
| **Monitor** | Watch learning happen in real-time |
| **Optimize** | Identify frequently used patterns |

### Cas d'usage concrets par profil

**Développeur débutant avec PML :**
> "J'ai configuré 3 serveurs MCP, mais je ne sais pas vraiment quels outils sont disponibles."

La visualisation vous montre tous les outils organisés par serveur. En cliquant sur un nœud, vous voyez immédiatement sa description, ses paramètres, et les outils avec lesquels il est souvent utilisé.

**Data scientist qui optimise un workflow :**
> "Mon pipeline de traitement de données est lent, je ne sais pas où est le goulot."

En regardant les edges (liens), vous identifiez visuellement quels outils sont appelés en séquence. Les nodes plus gros indiquent les outils fréquemment utilisés. Vous repérez facilement qu'un outil de parsing est appelé 10 fois alors qu'une fois suffirait.

**Architecte qui explore les capacités :**
> "Je veux savoir si PML a déjà appris à faire ce type de tâche."

Les capability zones vous montrent les patterns appris. Au lieu de fouiller dans les logs, vous voyez visuellement qu'une capability "file_to_github_issue" existe déjà avec un taux de succès de 94%.

**DevOps qui monitore la production :**
> "Je veux surveiller que le système fonctionne normalement."

Les animations en temps réel vous alertent : un nœud qui pulse montre une exécution en cours, une edge qui s'épaissit montre un pattern qui se renforce. Si quelque chose cloche, vous le voyez immédiatement.

## Nodes and Edges

### Node Types

The graph contains different types of nodes:

```
┌─────────────────────────────────────────────────────────────────┐
│  Node Types                                                      │
│                                                                  │
│  ┌─────┐                                                        │
│  │     │  Tool Node                                             │
│  │  ○  │  • MCP tool (read_file, create_issue)                 │
│  │     │  • Color indicates server                              │
│  └─────┘  • Size indicates usage frequency                      │
│                                                                  │
│  ╔═════╗                                                        │
│  ║     ║  Capability Node                                       │
│  ║  ◆  ║  • Learned pattern                                    │
│  ║     ║  • Contains multiple tools                            │
│  ╚═════╝  • Dashed border                                       │
│                                                                  │
│  ┌ ─ ─ ┐                                                        │
│  │     │  Server Node                                           │
│    ☐    • Groups tools by server                               │
│  │     │  • Collapsed by default                               │
│  └ ─ ─ ┘  • Click to expand                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Edge Types

Edges show relationships between nodes:

```
┌─────────────────────────────────────────────────────────────────┐
│  Edge Types                                                      │
│                                                                  │
│  A ────────▶ B   Sequence                                       │
│              Solid line: A typically followed by B              │
│              Thickness: frequency of pattern                    │
│                                                                  │
│  A ═════════▶ B   Dependency                                    │
│              Double line: B requires output from A              │
│              Arrow shows data flow direction                    │
│                                                                  │
│  A ◀─ ─ ─ ─▶ B   Alternative                                   │
│              Dashed bidirectional: A and B are interchangeable  │
│                                                                  │
│  ╔═══╗                                                          │
│  ║ C ║─ ─ ─▶ A   Contains                                       │
│  ╚═══╝           Dashed: Capability C contains tool A           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Visual Properties

| Property | Meaning |
|----------|---------|
| **Node size** | Usage frequency (bigger = more used) |
| **Node color** | Server/category |
| **Edge thickness** | Relationship strength |
| **Edge opacity** | Confidence level |
| **Animation** | Recent activity |

### Current Implementation

The visualization uses two main structures:

**Compound Nodes (Contains)**
Capabilities are rendered as compound nodes that visually contain their tools. This shows the "contains" relationship without explicit edges.

```
╔═══════════════════════════════════════╗
║  Capability: file_to_issue            ║
║  ┌──────────┐  ┌──────────┐          ║
║  │read_file │  │create_   │          ║
║  └──────────┘  │issue     │          ║
║                └──────────┘          ║
╚═══════════════════════════════════════╝
```

**Sequence Edges**
Edges between tools show temporal sequences (tool A followed by tool B):

| Visual | Meaning |
|--------|---------|
| **Thickness** | Frequency (thicker = more observed) |
| **Opacity** | Confidence level |
| **Direction** | Arrow shows execution order |

### Edge Styles by Source

Line style indicates how the relationship was learned:

| Source | Style | Opacity | Meaning |
|--------|-------|---------|---------|
| `observed` | Solid | 90% | Confirmed 3+ times |
| `inferred` | Dashed | 60% | Observed 1-2 times |
| `template` | Dotted | 40% | User-defined, not yet validated |

**Quick reading guide:**
- Solid thick line = frequently observed sequence (reliable)
- Dashed line = sequence seen a few times (promising)
- Dotted line = defined but not yet validated in practice

## Capability Zones

Capabilities are visualized as **zones** that group their component tools:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Capability Zone                             │
│                                                                  │
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║  capability: file_to_github_issue                          ║  │
│  ║                                                            ║  │
│  ║    ┌──────────┐     ┌──────────┐     ┌──────────┐        ║  │
│  ║    │read_file │────▶│parse_err │────▶│create_   │        ║  │
│  ║    └──────────┘     └──────────┘     │issue     │        ║  │
│  ║                                       └──────────┘        ║  │
│  ║                                                            ║  │
│  ║  Intent: "Create issue from error log"                    ║  │
│  ║  Success: 94%  |  Used: 23 times                         ║  │
│  ║                                                            ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Zone Features

| Feature | Description |
|---------|-------------|
| **Boundary** | Shows which tools belong together |
| **Label** | Intent description |
| **Stats** | Success rate, usage count |
| **Collapse** | Hide internal details |
| **Highlight** | Glow when recently used |

## Interactivity

The visualization is fully interactive:

### Navigation

```
Pan:       Click and drag on empty space
Zoom:      Scroll wheel or pinch
Reset:     Double-click on empty space
Focus:     Click on node to center it
```

### Node Interactions

```
┌─────────────────────────────────────────────────────────────────┐
│  Click on Node                                                   │
│                                                                  │
│  ┌──────────────────────────────────────────┐                   │
│  │  Tool: filesystem:read_file               │                   │
│  │                                           │                   │
│  │  Description: Read contents of a file    │                   │
│  │                                           │                   │
│  │  Parameters:                              │                   │
│  │    • path (string, required)             │                   │
│  │    • encoding (string, optional)         │                   │
│  │                                           │                   │
│  │  Stats:                                   │                   │
│  │    • Used: 156 times                     │                   │
│  │    • Success: 98%                        │                   │
│  │    • Avg duration: 23ms                  │                   │
│  │                                           │                   │
│  │  Related tools:                          │                   │
│  │    → write_file (78%)                    │                   │
│  │    → parse_json (65%)                    │                   │
│  │                                           │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Edge Interactions

```
Hover on Edge:
  • Show relationship type
  • Show confidence score
  • Highlight connected nodes

Click on Edge:
  • Show history of observations
  • Show when pattern was learned
  • Option to manually adjust
```

## Comment lire la visualisation : guide pratique

### Première visite du graphe

**Étape 1 : Vue d'ensemble**
- Zoomez pour voir tout le graphe
- Identifiez les clusters (groupes de nœuds proches) : ce sont les outils qui travaillent souvent ensemble
- Repérez les nœuds isolés : ce sont des outils peu utilisés ou récemment découverts

**Étape 2 : Identifier les hubs**
- Les gros nœuds = outils très utilisés, probablement critiques pour votre système
- Beaucoup de connections = outils polyvalents qui s'intègrent dans plusieurs workflows

**Étape 3 : Tracer un workflow**
- Suivez les flèches d'un nœud à l'autre
- Les liens épais = séquences fréquentes, patterns fiables
- Les capability zones montrent les workflows complets déjà appris

### Signaux à surveiller

**Bon signe :**
- Clusters bien formés : les outils sont organisés logiquement
- Edges épaisses entre outils liés : PML a confiance dans ces patterns
- Capability zones nombreuses : le système a beaucoup appris

**Attention :**
- Nœud isolé mais souvent utilisé : peut indiquer un outil qui échoue à se connecter
- Trop de connections sur un seul nœud : possible goulot d'étranglement
- Edge fine malgré usage répété : faible confiance, peut nécessiter investigation

## Real-Time Updates

The visualization updates live as PML learns:

### New Tool Discovered

```
Animation: Node fades in, ripple effect
Position: Near related tools (force simulation)
```

### Edge Strengthened

```
Animation: Edge glows briefly
Change: Thickness increases, opacity increases
```

### Capability Formed

```
Animation: Zone grows around tools
Effect: Tools move closer together
Label: Intent appears above zone
```

### Execution Flow

```
During DAG execution:
  • Current tool pulses
  • Completed tools check-marked
  • Edges light up as data flows
```

## Layout Algorithms

The graph uses **force-directed layout** with multiple forces applied simultaneously:
- **Repulsion**: Nodes push away from each other
- **Attraction**: Connected nodes pull together
- **Centering**: Graph stays centered in view
- **Collision**: Nodes don't overlap
- **Clustering**: Same-server tools group together

Result: Natural, readable layout that reflects the actual structure of relationships.

## Filtering and Search

```
Filter by Server: [x] filesystem  [x] github  [ ] fetch  [ ] database
Filter by Activity: [x] Recently used  [ ] All tools  [ ] Orphaned only
Search: "file" → Highlights: read_file, write_file, list_files, file_to_issue
```

## Export

Export formats: **PNG** (documentation), **SVG** (scalable graphics), **JSON** (data backup).

## Next

- [Events](./01-events.md) - Real-time event streaming
- [GraphRAG](../03-learning/01-graphrag.md) - The underlying knowledge graph
