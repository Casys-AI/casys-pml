# Semantic Search

> Finding tools by meaning, not keywords

## The Problem with Keyword Search

Traditional search requires knowing exact names:
- "filesystem:read_file" ✓
- "read file" ✗
- "get contents" ✗

**Semantic search** understands meaning, so all of these work:
- "read a file"
- "get file contents"
- "load data from disk"

## How it Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  "read a file"  │────▶│ Embedding Model │────▶│  Query Vector   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌───────────────┐
                                                │   Compare to  │
                                                │  all tool     │
                                                │  vectors      │
                                                └───────────────┘
                                                        │
                                                        ▼
                                                ┌───────────────┐
                                                │ Ranked Results│
                                                │ by similarity │
                                                └───────────────┘
```

1. Your query is converted to a vector (list of numbers)
2. This vector is compared to all stored tool vectors
3. Tools with similar vectors are returned, ranked by similarity

## Embeddings

An **embedding** is a numerical representation of text that captures its meaning.

| Text | Embedding (simplified) |
|------|----------------------|
| "read file" | [0.8, 0.2, 0.1, ...] |
| "get contents" | [0.7, 0.3, 0.1, ...] |
| "create issue" | [0.1, 0.1, 0.9, ...] |

Similar meanings → similar numbers → found together.

### Embedding Model

PML uses the BGE-M3 embedding model that runs locally:
- **1024 dimensions** per vector
- **Fast** - milliseconds per embedding
- **No API calls** - works offline

## Similarity Scoring

Similarity is measured using **cosine similarity**:
- **1.0** = identical meaning
- **0.7+** = very similar
- **0.5+** = somewhat related
- **< 0.3** = unrelated

### Example Search

Query: "upload to github"

| Tool | Similarity |
|------|------------|
| github:create_issue | 0.82 |
| github:push | 0.78 |
| github:create_pr | 0.71 |
| filesystem:write_file | 0.31 |

The top results are GitHub tools because they're semantically closest to "upload to github".

## When to Use

Semantic search is ideal when:
- You don't know the exact tool name
- You want to explore available tools
- You're describing what you want to do, not how

## Next

- [Hybrid Search](./02-hybrid-search.md) - Combining semantic with graph signals
- [Proactive Suggestions](./03-proactive-suggestions.md) - Automatic recommendations
