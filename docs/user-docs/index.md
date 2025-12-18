# PML Documentation

> Procedural Memory Layer - Intelligent MCP Gateway with Learning

---

## Getting Started

| # | Document | Description |
|---|----------|-------------|
| 1 | [Installation](./getting-started/01-installation.md) | Prerequisites and setup |
| 2 | [Quickstart](./getting-started/02-quickstart.md) | First workflow in 5 minutes |

---

## Concepts

Understand how PML works. → [Concepts Overview](./concepts/index.md)

### 1. Foundations

| # | Concept | Description |
|---|---------|-------------|
| 1 | [MCP Protocol](./concepts/01-foundations/01-mcp-protocol.md) | Servers, tools, schemas |
| 2 | [Gateway](./concepts/01-foundations/02-gateway.md) | Routing, multiplexing |
| 3 | [Database](./concepts/01-foundations/03-database.md) | PGlite, embeddings, KV |

### 2. Search & Discovery

| # | Concept | Description |
|---|---------|-------------|
| 1 | [Semantic Search](./concepts/02-discovery/01-semantic-search.md) | Embeddings, vector similarity |
| 2 | [Hybrid Search](./concepts/02-discovery/02-hybrid-search.md) | Semantic + graph combination |
| 3 | [Proactive Suggestions](./concepts/02-discovery/03-proactive-suggestions.md) | Automatic recommendations |

### 3. Learning

| # | Concept | Description |
|---|---------|-------------|
| 1 | [GraphRAG](./concepts/03-learning/01-graphrag.md) | Knowledge graph, algorithms |
| 2 | [Dependencies](./concepts/03-learning/02-dependencies.md) | Tool and capability relations |
| 3 | [Confidence Levels](./concepts/03-learning/03-confidence-levels.md) | template → inferred → observed |
| 4 | [Feedback Loop](./concepts/03-learning/04-feedback-loop.md) | How the system learns |

### 4. Capabilities

| # | Concept | Description |
|---|---------|-------------|
| 1 | [What is a Capability](./concepts/04-capabilities/01-what-is-capability.md) | Definition, lifecycle |
| 2 | [Eager Learning](./concepts/04-capabilities/02-eager-learning.md) | Storage on first execution |
| 3 | [Schema Inference](./concepts/04-capabilities/03-schema-inference.md) | Auto-detected parameters |

### 5. DAG & Execution

| # | Concept | Description |
|---|---------|-------------|
| 1 | [DAG Structure](./concepts/05-dag-execution/01-dag-structure.md) | Tasks, dependsOn, workflows |
| 2 | [DAG Suggester](./concepts/05-dag-execution/02-dag-suggester.md) | Automatic construction |
| 3 | [Parallelization](./concepts/05-dag-execution/03-parallelization.md) | Topological sort, layers |
| 4 | [Checkpoints](./concepts/05-dag-execution/04-checkpoints.md) | HIL/AIL, human validation |

### 6. Code Execution

| # | Concept | Description |
|---|---------|-------------|
| 1 | [Sandbox](./concepts/06-code-execution/01-sandbox.md) | Deno isolation, permissions |
| 2 | [Worker Bridge](./concepts/06-code-execution/02-worker-bridge.md) | RPC communication |
| 3 | [Tracing](./concepts/06-code-execution/03-tracing.md) | Call hierarchy |

### 7. Real-time

| # | Concept | Description |
|---|---------|-------------|
| 1 | [Events](./concepts/07-realtime/01-events.md) | SSE, EventBus |
| 2 | [Visualization](./concepts/07-realtime/02-visualization.md) | SuperHyperGraph, D3.js |

---

## Guides

| Guide | Description |
|-------|-------------|
| [Overview](./guides/overview.md) | General usage guide |

---

## Reference

| # | Document | Description |
|---|----------|-------------|
| 1 | [MCP Tools](./reference/01-mcp-tools.md) | PML tools API |
| 2 | [Configuration](./reference/02-configuration.md) | Config files |
| 3 | [CLI](./reference/03-cli.md) | Available commands |

---

*PML Documentation v1.0*
