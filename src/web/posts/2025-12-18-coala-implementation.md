---
title: "Implementing CoALA: Cognitive Architecture for a Learning Agent"
slug: coala-implementation
date: 2025-12-18
category: engineering
tags:
  - coala
  - memory-architecture
  - learning
  - implementation
snippet: "How we implemented a cognitive architecture inspired by CoALA—with four memory types, five feedback loops, and reinforcement learning for continuous improvement."
format: article
language: en
author: Erwan Lee Pesle
---

# Implementing CoALA: Cognitive Architecture for a Learning Agent

> From academic paper to production system: building memory and learning loops

## What Is CoALA?

**CoALA** (Cognitive Architectures for Language Agents) is a framework from Stanford that structures
AI agents around three dimensions:

1. **Memory Modules** (Working + Long-term)
2. **Action Spaces** (External + Internal)
3. **Decision Procedures** (Planning → Execution)

We took this framework and built something more ambitious: **five feedback loops** instead of two,
and **system-wide learning** instead of single-agent memory.

## The Four Memory Types

Like human cognition, Casys PML maintains four distinct memory systems:

![Memory Types](excalidraw:src/web/assets/diagrams/coala-memory-types.excalidraw)

| Memory Type    | What It Stores               | Example Query              |
| -------------- | ---------------------------- | -------------------------- |
| **Working**    | Current state, pending tasks | "What's happening now?"    |
| **Episodic**   | Past experiences + outcomes  | "Did this work last time?" |
| **Semantic**   | Facts, constraints, rules    | "Tool X requires Y first"  |
| **Procedural** | Skills, capabilities         | "How do I deploy?"         |

## The Five Feedback Loops

Where CoALA has two loops, we have five—each operating at different timescales:

![Feedback Loops](excalidraw:src/web/assets/diagrams/coala-feedback-loops.excalidraw)

| Loop           | Timescale    | What Happens                          |
| -------------- | ------------ | ------------------------------------- |
| **Execution**  | Milliseconds | Task runs, event fires, state updates |
| **Adaptation** | Seconds      | Discovery triggers DAG replanning     |
| **Learning**   | Minutes      | Workflow patterns update the graph    |
| **Emergence**  | Hours        | Clustering detects new capabilities   |
| **Evolution**  | Days         | Meta-capabilities form hierarchies    |

## Learning Mechanisms

### Episodic Memory

Workflow outcomes are captured as episodic events:

| Event Type          | What It Captures                |
| ------------------- | ------------------------------- |
| `tool_execution`    | Tool used, success/failure      |
| `workflow_complete` | Full workflow pattern + outcome |
| `user_feedback`     | Explicit corrections            |

Events are buffered and written asynchronously (<1ms overhead).

**Future direction:** We're exploring prioritized sampling based on prediction error—surprising
failures teach more than predictable successes.

### Incremental Graph Updates

Instead of waiting for batch updates, the graph learns at each step:

![Incremental Updates](excalidraw:src/web/assets/diagrams/coala-incremental-updates.excalidraw)

Each step's outcome immediately influences the next suggestion.

### Adaptive Thresholds

Confidence thresholds self-adjust based on recent accuracy:

- High error rate → Be more conservative (raise threshold)
- Low error rate → Be more aggressive (lower threshold)

The system finds its own optimal operating point over time.

## System-Wide Meta-Learning

Unlike CoALA's single-agent focus, our learning is **cross-workflow and cross-user**:

![System-Wide Learning](excalidraw:src/web/assets/diagrams/coala-meta-learning.excalidraw)

When one user discovers a pattern, **everyone benefits**.

## What This Enables

| Feature                            | How It Works                         |
| ---------------------------------- | ------------------------------------ |
| **Personalized suggestions**       | Graph learns your patterns           |
| **Automatic capability discovery** | Clustering finds natural groupings   |
| **Cross-user learning**            | Shared graph means everyone benefits |
| **Graceful cold start**            | Templates + priors until enough data |

---

## References

- Sumita, M. et al. (2023). "CoALA: Cognitive Architectures for Language Agents." arXiv:2309.02427.
- Schaul, T. et al. (2015). "Prioritized Experience Replay." arXiv:1511.05952.
- Sutton, R. S. (1988). "Learning to Predict by Temporal Differences." _Machine Learning_, 3(1),
  9-44.

#CoALA #CognitiveArchitecture #MachineLearning #CasysPML
