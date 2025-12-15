# GraphRAG

> The knowledge graph powering PML's intelligence

## What is GraphRAG?

**GraphRAG** (Graph Retrieval-Augmented Generation) combines graph databases with AI to enhance tool discovery and workflow suggestion.

PML builds a **knowledge graph** of:
- Tools (nodes)
- Relationships between tools (edges)
- Capabilities (compound nodes)
- Usage patterns (edge weights)

```
                    ┌───────────────────────────────────────┐
                    │          PML Knowledge Graph          │
                    │                                       │
                    │    [read_file] ──────▶ [parse_json]  │
                    │         │                    │        │
                    │         ▼                    ▼        │
                    │    [write_file]       [validate]      │
                    │         │                    │        │
                    │         └────────┬───────────┘        │
                    │                  ▼                    │
                    │           [create_issue]              │
                    │                                       │
                    └───────────────────────────────────────┘
```

## Nodes and Edges

### Nodes

Nodes represent entities:

| Node Type | Description | Example |
|-----------|-------------|---------|
| **Tool** | An MCP tool | `filesystem:read_file` |
| **Capability** | A learned pattern | `cap:file_to_issue` |
| **Server** | An MCP server | `filesystem`, `github` |

### Edges

Edges represent relationships:

| Edge Type | Meaning | Example |
|-----------|---------|---------|
| **sequence** | A then B | read → write |
| **contains** | A includes B | capability → tool |
| **dependency** | B needs A | parse → read |
| **alternative** | A or B | save_json ↔ write_file |

Each edge has:
- **Weight** - Strength of relationship (0.0 to 1.0)
- **Count** - How many times observed
- **Source** - Where it came from (template, inferred, observed)

## Algorithms

PML uses graph algorithms to extract intelligence:

### PageRank

**PageRank** identifies the most important tools based on how many other tools connect to them.

```
High PageRank = Many tools depend on this one

         ┌────▶ [Tool A] ◀────┐
         │                    │
    [Tool B]              [Tool C]
         │                    │
         └────▶ [Tool D] ◀────┘

Tool A and D have high PageRank (many incoming edges)
```

Use: Boost important tools in search results.

### Louvain (Community Detection)

**Louvain** groups tools that frequently work together into communities.

```
┌─────────────────────┐     ┌─────────────────────┐
│  Community: Files   │     │  Community: GitHub  │
│                     │     │                     │
│  read    write      │     │  issue    pr        │
│     └──┬──┘         │     │     └──┬──┘         │
│      list           │     │      comment        │
└─────────────────────┘     └─────────────────────┘
```

Use: Suggest related tools from the same community.

### Dijkstra (Shortest Path)

**Dijkstra** finds the optimal path between two tools.

```
Question: "How to get from read_file to create_issue?"

Answer: read_file → parse → extract_error → create_issue
        (shortest path weighted by edge confidence)
```

Use: Build optimal workflows between start and end tools.

## Graph Updates

The graph is not static - it grows and adapts:

1. **New tools** → New nodes added
2. **Executions** → Edges strengthened
3. **New patterns** → New edges created
4. **Unused paths** → Edges weakened over time

## Benefits of GraphRAG

| Without Graph | With GraphRAG |
|---------------|---------------|
| Search by text only | Search by text + relationships |
| Static suggestions | Adaptive suggestions |
| No context awareness | Understands tool ecosystems |
| Manual workflow building | Automatic workflow suggestion |

## Next

- [Dependencies](./02-dependencies.md) - Types of relationships
- [Confidence Levels](./03-confidence-levels.md) - How reliability is tracked
