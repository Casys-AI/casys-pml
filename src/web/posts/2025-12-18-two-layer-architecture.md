---
title: "Two-Layer Architecture: Separating Tactical and Strategic Intelligence"
slug: two-layer-architecture
date: 2025-12-18
category: architecture
tags:
  - architecture
  - two-layer
  - tactical
  - strategic
snippet: "One layer thinks about tools. Another thinks about skills. Separating tactical from strategic intelligence is how we scaled AI agent capabilities."
format: article
language: en
author: Erwan Lee Pesle
---

# Two-Layer Architecture: Separating Tactical and Strategic Intelligence

> Different questions need different data structures

## The Problem With Single-Layer Approaches

TODO: Why one graph isn't enough
- Tool-level decisions need different data than capability-level
- Mixing concerns creates complexity
- Different update frequencies

## The Two Layers

```mermaid
graph TD
    subgraph "Strategic Layer"
        S1[Capabilities]
        S2[Meta-Capabilities]
        S1 --> S2
    end

    subgraph "Tactical Layer"
        T1[Tool A]
        T2[Tool B]
        T3[Tool C]
        T1 --> T2
        T2 --> T3
    end

    S1 -.->|contains| T1
    S1 -.->|contains| T2
```

### Tactical Layer (Tools)

TODO: Describe tactical layer
- Simple graph structure
- Tool-to-tool relationships
- Fast, real-time decisions
- Algorithms: Semantic similarity, Adamic-Adar, Louvain clustering

| Aspect | Details |
|--------|---------|
| Nodes | Individual tools |
| Edges | Co-occurrence, dependency |
| Query | "What tool next?" |
| Speed | Milliseconds |

### Strategic Layer (Capabilities)

TODO: Describe strategic layer
- SuperHyperGraph structure
- Capability-to-capability relationships
- Slower, deliberate decisions
- Algorithms: PageRank, Spectral clustering, SHGAT (future)

| Aspect | Details |
|--------|---------|
| Nodes | Capabilities, Meta-capabilities |
| Edges | Contains, provides, sequence |
| Query | "What skill applies?" |
| Speed | Seconds |

## How They Interact

TODO: Cross-layer communication
- Strategic suggests capability
- Tactical executes tools within capability
- Results bubble up to strategic

```mermaid
sequenceDiagram
    User->>Strategic: "Deploy to prod"
    Strategic->>Strategic: Find matching capability
    Strategic->>Tactical: Execute "Deploy" tools
    Tactical->>Tactical: Suggest tool sequence
    Tactical-->>Strategic: Execution results
    Strategic-->>User: Workflow complete
```

## Why This Matters

TODO: Benefits of separation
- Cleaner code
- Independent optimization
- Different caching strategies
- Easier testing

## Implementation Details

TODO: Link to ADR-038, code structure

---

## References

- Internal: ADR-038 - Two-Layer Discovery Architecture
- See also: [n-SuperHyperGraph](/blog/why-n-superhypergraph)

#Architecture #TwoLayer #SystemDesign #AIAgents
