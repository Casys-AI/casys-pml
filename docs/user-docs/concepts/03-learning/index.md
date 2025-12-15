# Learning

How PML learns from agent workflows.

---

## Topics

| Document | Description |
|----------|-------------|
| [GraphRAG](./01-graphrag.md) | Knowledge graph structure and algorithms |
| [Dependencies](./02-dependencies.md) | Tool and capability relationships |
| [Confidence Levels](./03-confidence-levels.md) | template → inferred → observed |
| [Feedback Loop](./04-feedback-loop.md) | How the system improves over time |

---

## Overview

PML learns in three ways:

1. **GraphRAG** - Stores relationships between tools, patterns, and capabilities in a hypergraph
2. **Dependency Tracking** - Learns which tools work well together
3. **Confidence Evolution** - Patterns gain confidence as they're validated through execution
