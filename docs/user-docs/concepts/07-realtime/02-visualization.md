# Visualization

> Hypergraph rendering with D3.js

## The Hypergraph View

PML provides a visual representation of its knowledge graph—a **hypergraph** showing tools, capabilities, and their relationships.

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

The graph uses force-directed layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  Force Simulation                                                │
│                                                                  │
│  Forces applied:                                                │
│    • Repulsion: Nodes push away from each other                │
│    • Attraction: Connected nodes pull together                  │
│    • Centering: Graph stays centered in view                   │
│    • Collision: Nodes don't overlap                            │
│    • Clustering: Same-server tools group together              │
│                                                                  │
│  Result: Natural, readable layout that reflects structure       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Filtering and Search

### Filter by Server

```
Show only: [x] filesystem  [x] github  [ ] fetch  [ ] database
```

### Filter by Activity

```
Show: [x] Recently used  [ ] All tools  [ ] Orphaned only
Time: [Last hour ▼]
```

### Search

```
Search: "file"

Highlights:
  • read_file ✓
  • write_file ✓
  • list_files ✓
  • file_to_issue ✓ (capability)
```

## Export

The visualization can be exported:

| Format | Use Case |
|--------|----------|
| **PNG** | Documentation, presentations |
| **SVG** | Scalable graphics, editing |
| **JSON** | Data backup, analysis |

## Next

- [Events](./01-events.md) - Real-time event streaming
- [GraphRAG](../03-learning/01-graphrag.md) - The underlying knowledge graph
