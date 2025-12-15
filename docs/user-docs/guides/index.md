# Guides

Practical guides for working with PML. These guides provide hands-on examples and best practices for common workflows.

---

## Available Guides

### [Overview Guide](./overview.md)

A comprehensive guide covering all major features of PML. This guide walks through practical examples and real-world usage patterns.

**Topics Covered:**

#### Getting Started (Beginner)
- **Key Concepts** - Understanding MCP, Gateway, DAG, GraphRAG, Sandbox, AIL/HIL
- **Configuration** - Command line options, environment variables, and MCP server setup
- **Transport Modes** - stdio vs Streamable HTTP, choosing the right mode for your use case

#### Core Features (Beginner to Intermediate)
- **Semantic Tool Search** - Find tools by natural intent using embeddings and GraphRAG
  - Related concepts: [Semantic Search](../concepts/02-discovery/01-semantic-search.md), [GraphRAG](../concepts/03-learning/01-graphrag.md)
- **DAG Workflow Execution** - Orchestrate multi-tool workflows with automatic parallelization
  - Intent mode for discovery, explicit mode for control
  - Related concepts: [DAG Structure](../concepts/05-dag-execution/01-dag-structure.md), [Parallelization](../concepts/05-dag-execution/03-parallelization.md)
- **Workflow Control** - Manage execution with Agent-in-the-Loop (AIL) and Human-in-the-Loop (HIL)
  - Related concepts: [Checkpoints](../concepts/05-dag-execution/04-checkpoints.md)

#### Advanced Features (Intermediate to Advanced)
- **Sandbox Code Execution** - Execute TypeScript in isolated environments with MCP tool access
  - Local data processing to minimize context usage
  - REPL-style execution with automatic tool injection
  - Related concepts: [Sandbox](../concepts/06-code-execution/01-sandbox.md), [Worker Bridge](../concepts/06-code-execution/02-worker-bridge.md)

#### Practical Workflows (All Levels)
- **Codebase Analysis** - Parallel file reading, semantic search, and local aggregation
- **Data Migration** - Multi-step workflows with transformations and dependencies

#### Production & Monitoring (Advanced)
- **Best Practices** - Performance, security, and organization guidelines
- **Observability** - Grafana/Loki monitoring, Sentry error tracking, Fresh Dashboard
  - Related concepts: [Events](../concepts/07-realtime/01-events.md), [Visualization](../concepts/07-realtime/02-visualization.md)

**See also:**
- [Installation](../getting-started/01-installation.md) - Setup and prerequisites
- [Quickstart](../getting-started/02-quickstart.md) - Your first workflow
- [MCP Tools Reference](../reference/01-mcp-tools.md) - Complete API documentation
- [Configuration Reference](../reference/02-configuration.md) - All configuration options
- [CLI Reference](../reference/03-cli.md) - Command line interface

---

## Coming Soon

- Building custom capabilities
- Integrating with Claude Code
- Advanced DAG patterns
- Performance optimization
- Multi-server orchestration strategies
- Custom workflow templates
