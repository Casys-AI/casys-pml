# PML Concepts

This section explains the core concepts of PML (Procedural Memory Layer).

## Overview

PML is an **intelligent MCP gateway** that:
1. **Routes** requests to the right MCP tools
2. **Learns** from usage patterns
3. **Suggests** optimized workflows
4. **Executes** workflows with 0ms perceived latency via speculative execution

### Key Metrics

| Metric | Value | Impact |
|--------|-------|--------|
| **Context usage** | <5% | 90% de context window recuperee pour vos conversations |
| **Latence workflows** | 5x → 1x | Parallelisation intelligente via DAG |
| **MCP servers** | 15+ simultanes | Sans degradation de performance |
| **Latence percue** | 0ms | Execution speculative pour les actions previsibles |

### Architecture 3 Couches

```
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 1: ORCHESTRATION (Claude/LLM)                           │
│  • Recoit l'intent utilisateur                                  │
│  • Query: "Capability existante?" → OUI: execute cached         │
│  • NON: genere code → execute → apprend                         │
└─────────────────────────────────────────────────────────────────┘
                          ▲ Resultats + Suggestions
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 2: CAPABILITY ENGINE (PML Gateway)                      │
│  • CapabilityMatcher: intent → capability matching              │
│  • WorkerBridge: route les appels MCP                           │
│  • SuggestionEngine: PageRank, Louvain, Adamic-Adar            │
│  • GraphRAG: apprentissage continu                              │
└─────────────────────────────────────────────────────────────────┘
                          ▲ RPC (appels outils)
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 3: EXECUTION (Deno Worker Sandbox)                      │
│  • Isolation complete (permissions: "none")                     │
│  • Tool proxies: mcp.server.tool() → appel securise            │
│  • Capabilities: fonctions inline (zero overhead)               │
└─────────────────────────────────────────────────────────────────┘
```

### Vue simplifiee

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Agent/LLM     │────▶│      PML        │────▶│  MCP Servers    │
│                 │◀────│   (Gateway)     │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌───────────┐
                        │  Memory   │
                        │  GraphRAG │
                        └───────────┘
```

## Reading Path

### 01 - Foundations
- [01 - MCP Protocol](./01-foundations/01-mcp-protocol.md)
- [02 - Gateway](./01-foundations/02-gateway.md)
- [03 - Database](./01-foundations/03-database.md)

### 02 - Discovery
- [01 - Semantic Search](./02-discovery/01-semantic-search.md)
- [02 - Hybrid Search](./02-discovery/02-hybrid-search.md)
- [03 - Proactive Suggestions](./02-discovery/03-proactive-suggestions.md)

### 03 - Learning
- [01 - GraphRAG](./03-learning/01-graphrag.md)
- [02 - Dependencies](./03-learning/02-dependencies.md)
- [03 - Confidence Levels](./03-learning/03-confidence-levels.md)
- [04 - Feedback Loop](./03-learning/04-feedback-loop.md)

### 04 - Capabilities
- [01 - What is a Capability](./04-capabilities/01-what-is-capability.md)
- [02 - Eager Learning](./04-capabilities/02-eager-learning.md)
- [03 - Schema Inference](./04-capabilities/03-schema-inference.md)

### 05 - DAG Execution
- [01 - DAG Structure](./05-dag-execution/01-dag-structure.md)
- [02 - DAG Suggester](./05-dag-execution/02-dag-suggester.md)
- [03 - Parallelization](./05-dag-execution/03-parallelization.md)
- [04 - Checkpoints](./05-dag-execution/04-checkpoints.md)
- [05 - Speculative Execution](./05-dag-execution/05-speculative-execution.md)

### 06 - Code Execution
- [01 - Sandbox](./06-code-execution/01-sandbox.md)
- [02 - Worker Bridge](./06-code-execution/02-worker-bridge.md)
- [03 - Tracing](./06-code-execution/03-tracing.md)

### 07 - Real-time
- [01 - Events](./07-realtime/01-events.md)
- [02 - Visualization](./07-realtime/02-visualization.md)
