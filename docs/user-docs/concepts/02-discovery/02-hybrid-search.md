# Hybrid Search

> Combining semantic and graph-based search

## Why Hybrid?

Semantic search finds tools by meaning. But meaning alone misses important signals:

- Which tools are **frequently used together**?
- Which tools have **high success rates**?
- Which tools are **central** to common workflows?

**Hybrid search** combines semantic similarity with graph-based signals for better results.

```
┌─────────────────┐         ┌─────────────────┐
│ Semantic Score  │         │  Graph Score    │
│                 │         │                 │
│ "How similar    │         │ "How important  │
│  is the meaning │    +    │  is this tool   │
│  to my query?"  │         │  in workflows?" │
└────────┬────────┘         └────────┬────────┘
         │                           │
         └─────────┬─────────────────┘
                   ▼
           ┌──────────────┐
           │ Final Score  │
           │ (weighted)   │
           └──────────────┘
```

## Semantic Component

The semantic score comes from embedding similarity (see [Semantic Search](./01-semantic-search.md)):

- Query and tool descriptions are embedded
- Cosine similarity measures closeness
- Score range: 0.0 to 1.0

## Graph Component

The graph score comes from PML's knowledge graph:

### PageRank

Tools that are referenced by many other tools get higher PageRank:

```
                    ┌──────────────┐
         ┌────────▶│  read_file   │◀────────┐
         │         │  PageRank:   │         │
         │         │    0.85      │         │
         │         └──────────────┘         │
         │                                  │
┌────────┴───┐                      ┌───────┴────┐
│ process_   │                      │ analyze_   │
│ data       │                      │ content    │
└────────────┘                      └────────────┘
```

`read_file` has high PageRank because many tools depend on it.

### Community Membership

Tools in the same community (cluster) are more likely to work together:

```
┌─────────────────────────────────────────┐
│        Community: File Operations       │
│                                         │
│   read_file    write_file    list_dir   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│        Community: GitHub                │
│                                         │
│  create_issue   create_pr   push        │
└─────────────────────────────────────────┘
```

If you're using `read_file`, other file tools get a boost.

### Usage Frequency

Tools that are used more often get a small boost:
- Frequently used = likely useful
- Never used = might be less relevant

## Score Fusion

The final score combines both components:

```
Final Score = (α × Semantic Score) + (β × Graph Score)

Where:
  α = 0.7 (semantic weight)
  β = 0.3 (graph weight)
```

This means semantic similarity matters most, but graph signals can boost or demote results.

### Example

Query: "save data"

| Tool | Semantic | Graph | Final |
|------|----------|-------|-------|
| write_file | 0.75 | 0.80 | 0.77 |
| save_json | 0.80 | 0.40 | 0.68 |
| create_backup | 0.60 | 0.90 | 0.69 |

`write_file` wins because it's both semantically relevant AND important in the graph.

## Benefits

| Pure Semantic | Hybrid |
|---------------|--------|
| Finds relevant tools | Finds relevant AND proven tools |
| No learning | Improves with usage |
| Static results | Dynamic, personalized |

## Next

- [Proactive Suggestions](./03-proactive-suggestions.md) - Automatic recommendations
- [GraphRAG](../03-learning/01-graphrag.md) - How the graph is built
