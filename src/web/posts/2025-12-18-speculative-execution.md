---
title: "Speculative Execution: Running Tasks Before You Know You Need Them"
slug: speculative-execution
date: 2025-12-18
category: engineering
tags:
  - performance
  - speculation
  - optimization
  - parallelism
snippet: "What if you could predict the future? Speculative execution runs likely-needed tasks before confirmation, then discards wrong predictions. The result: dramatically faster workflows."
format: article
language: en
author: Erwan Lee Pesle
---

# Speculative Execution: Running Tasks Before You Know You Need Them

> Betting on the future to win time in the present

## The Waiting Problem

TODO: Explain the latency issue
- Sequential execution: wait for each step
- LLM calls are slow (~500ms-2s each)
- Most time spent waiting, not working

```mermaid
graph LR
    subgraph "Sequential (Slow)"
        A[Task A] --> W1[Wait] --> B[Task B] --> W2[Wait] --> C[Task C]
    end
```

## The Speculation Idea

TODO: Core concept
- Predict what's likely needed next
- Start those tasks before confirmation
- If prediction correct: time saved
- If wrong: discard and continue

```mermaid
graph TD
    subgraph "Speculative (Fast)"
        A[Task A] --> B[Task B]
        A --> S1[Speculative C]
        A --> S2[Speculative D]
        B --> C[Confirm C ✓]
        S1 -.->|discard if wrong| X[Discard]
    end
```

## When To Speculate

TODO: Prediction confidence
- High confidence (>90%): Speculate immediately
- Medium (70-90%): Speculate if resources available
- Low (<70%): Wait for confirmation

| Confidence | Action | Risk |
|------------|--------|------|
| >90% | Speculate | Low waste |
| 70-90% | Conditional | Moderate |
| <70% | Wait | None |

## The GraphRAG Advantage

TODO: Why our approach works well
- Graph knows likely sequences
- PageRank indicates importance
- Historical patterns guide predictions

```mermaid
graph LR
    Current[Current Task] --> G[GraphRAG Query]
    G --> P1[Prediction 1: 95%]
    G --> P2[Prediction 2: 78%]
    G --> P3[Prediction 3: 45%]
    P1 --> S1[Speculate ✓]
    P2 --> S2[Speculate ✓]
    P3 --> W[Wait]
```

## Handling Wrong Predictions

TODO: Rollback strategy
- Sandbox execution
- No side effects until confirmed
- Clean discard on misprediction

## Performance Impact

TODO: Real numbers

| Metric | Without Speculation | With Speculation |
|--------|--------------------|--------------------|
| Average workflow time | 12s | 4s |
| Wasted computation | 0% | ~15% |
| Net time saved | - | 67% |

The trade-off: spend 15% more compute to save 67% time.

---

## References

- CPU speculation (branch prediction) as inspiration
- Internal: ADR on speculative execution

#Performance #Speculation #Optimization #Parallelism
