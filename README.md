# AgentCards

[![CI](https://github.com/Casys-AI/AgentCards/workflows/CI/badge.svg)](https://github.com/Casys-AI/AgentCards/actions)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Deno Version](https://img.shields.io/badge/deno-2.x-blue.svg)](https://deno.land)

**Intelligent MCP Gateway with GraphRAG Learning** - Consolidates all your MCP servers into a single entry point with semantic search, DAG workflow orchestration, and self-improving tool discovery.

AgentCards solves two critical problems with MCP ecosystems:
1. **Context Saturation** - Tool schemas consume 30-50% of LLM context window → reduced to <5%
2. **Sequential Latency** - Multi-tool workflows run serially → parallelized via DAG execution

---

## Key Features

### Core Gateway
- **Transparent Proxying** - Single MCP server exposing all your tools (`filesystem:read_file`, `github:create_issue`, etc.)
- **Semantic Tool Search** - Find relevant tools via natural language intent, not just keywords
- **DAG Workflow Execution** - Parallel execution of independent tasks with dependency resolution
- **On-Demand Schema Loading** - Only load tools needed for current task (<5% context usage)

### Intelligent Discovery (GraphRAG)
- **Hybrid Search** - Combines semantic similarity + graph-based relatedness (Adamic-Adar algorithm)
- **Adaptive Learning** - Graph learns from execution patterns, improving suggestions over time
- **Workflow Templates** - Bootstrap with predefined patterns, evolve from usage

### Execution Control
- **Agent-in-the-Loop (AIL)** - Automatic decisions with per-layer validation
- **Human-in-the-Loop (HIL)** - Approval checkpoints for critical operations
- **Checkpoint/Resume** - Interruptible workflows with state persistence
- **Speculative Execution** - Predict and pre-execute likely next steps (confidence-based)

### Sandbox Execution
- **Secure Code Execution** - Run TypeScript in isolated Deno sandbox
- **MCP Tool Injection** - Access MCP tools from sandbox code via intent-based discovery
- **PII Protection** - Automatic detection and tokenization of sensitive data
- **Execution Caching** - Avoid re-running identical code

### Observability (Dashboard)
- **Real-time SSE Events** - Live graph updates, edge creation, metrics streaming
- **Interactive Graph Visualization** - Cytoscape.js force-directed graph with PageRank sizing
- **Live Metrics Panel** - Success rate, latency, edge count, graph density
- **Server Filtering** - Toggle visibility by MCP server

### Developer Experience
- **Zero-Config Setup** - Auto-discovers MCP servers, generates embeddings
- **Local-First** - All data in PGlite, no cloud dependencies
- **100% Local Embeddings** - BGE-Large-EN-v1.5 via Transformers.js

---

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) 2.x or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/Casys-AI/AgentCards.git
cd AgentCards

# Start the gateway (auto-init on first run)
deno task serve:playground
```

The gateway will:
1. Discover configured MCP servers
2. Extract tool schemas via MCP protocol
3. Generate embeddings (BGE-Large-EN-v1.5)
4. Start listening on port 3001

### Dashboard

Access the real-time monitoring dashboard:

```bash
# Start Fresh dashboard (requires gateway running)
deno task dev:fresh
```

Open http://localhost:8080/dashboard to see:
- Live graph visualization with PageRank-sized nodes
- Edge creation in real-time via SSE
- Metrics panel (success rate, latency, density)

### Playground (Work in Progress)

The Jupyter notebook playground is under development. Current notebooks explore:
- Sandbox execution basics
- DAG workflow construction
- MCP tool injection

```bash
# Open in GitHub Codespaces (recommended)
```
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Casys-AI/AgentCards?devcontainer_path=.devcontainer/playground/devcontainer.json)

### Optional: Error Tracking with Sentry

AgentCards supports [Sentry](https://sentry.io) for production error tracking and performance monitoring (see [ADR-011](docs/adrs/ADR-011-sentry-integration.md)).

To enable Sentry, create a `.env` file in your project root:

```bash
# Copy the example file
cp .env.example .env

# Edit with your Sentry credentials
nano .env
```

Configure the following environment variables:

```bash
SENTRY_DSN=https://your-dsn@your-org.ingest.sentry.io/your-project-id
SENTRY_ENVIRONMENT=production  # or development, staging
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% sampling in production, 1.0 for dev
```

If `SENTRY_DSN` is not set, Sentry is disabled and AgentCards will run normally.

**What gets tracked:**
- Error tracking: MCPServerError, DAGExecutionError, SandboxExecutionError
- Performance: `mcp.tools.list`, `mcp.tools.call`, workflow execution latency
- Breadcrumbs: MCP operations, cache hits/misses, tool discovery

---

## Usage with Claude Code

AgentCards integrates seamlessly with Claude Code as an intelligent MCP gateway.

### Step 1: Initialize AgentCards

First, migrate your existing Claude Desktop MCP configuration:

```bash
# Build the CLI binary
deno task build

# Initialize from Claude config (auto-detects ~/.config/Claude/claude_desktop_config.json)
./agentcards init

# Or specify a custom config path
./agentcards init --config /path/to/mcp-config.json
```

This will:
- ✅ Discover all your configured MCP servers
- ✅ Extract tool schemas via MCP protocol
- ✅ Generate embeddings for semantic search
- ✅ Store everything in a local PGlite database (`~/.agentcards/db`)

### Step 2: Configure Claude Desktop

Add AgentCards to your Claude Desktop configuration as a single MCP server:

**`~/.config/Claude/claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "agentcards": {
      "command": "/absolute/path/to/agentcards",
      "args": ["serve"]
    }
  }
}
```

> **💡 Tip:** Use the absolute path to your built binary. Find it with `which agentcards` or `pwd` in your project directory.

### Step 3: Start Using AgentCards

The gateway starts automatically when Claude Code connects. You can also run it manually:

```bash
# Start MCP gateway server (stdio mode)
./agentcards serve

# Or with Deno (development)
deno run --allow-all src/main.ts serve
```

The gateway will:
- ✅ Connect to all your configured MCP servers
- ✅ Load AI models (BGE-Large-EN-v1.5 for embeddings)
- ✅ Start listening for MCP requests from Claude Code
- ✅ Provide intelligent tool discovery via semantic search

### Step 4: Available MCP Tools

Once configured, AgentCards exposes these tools:

**Proxied Tools** - All your configured MCP tools with `server:tool` naming:
```
filesystem:read_file, filesystem:write_file
github:create_issue, github:search_repos
memory:create_entities, memory:search_nodes
... (all your configured MCP tools)
```

**AgentCards Meta-Tools:**
| Tool | Description |
|------|-------------|
| `agentcards:search_tools` | Semantic + graph hybrid tool search |
| `agentcards:execute_dag` | Execute DAG workflows (intent or explicit) |
| `agentcards:execute_code` | Run TypeScript in sandbox with MCP tools |
| `agentcards:continue` | Continue paused workflow execution |
| `agentcards:abort` | Abort running workflow |
| `agentcards:replan` | Replan DAG with new requirements |
| `agentcards:approval_response` | Respond to HIL approval checkpoints |

### Example Usage

**Search for relevant tools:**
```typescript
await callTool("agentcards:search_tools", {
  query: "read and parse configuration files",
  include_related: true  // Include graph-recommended tools
});
```

**Intent-based DAG execution:**
```typescript
await callTool("agentcards:execute_dag", {
  intent: "Read the config file and create a memory entity with its contents"
});
// AgentCards suggests DAG, executes if confidence > threshold
```

**Explicit DAG with parallel tasks:**
```typescript
await callTool("agentcards:execute_dag", {
  workflow: {
    tasks: [
      { id: "t1", tool: "filesystem:read_file", arguments: { path: "config.json" } },
      { id: "t2", tool: "filesystem:read_file", arguments: { path: "package.json" } },
      { id: "t3", tool: "memory:create_entities",
        arguments: { entities: [{ name: "config", content: "$t1.result" }] },
        depends_on: ["t1"] }
    ]
  }
});
// t1 and t2 execute in parallel, t3 waits for t1
```

**Sandbox code execution:**
```typescript
await callTool("agentcards:execute_code", {
  intent: "Process filesystem data",  // Discovers and injects relevant tools
  code: `
    const files = await filesystem.readDirectory({ path: "." });
    return files.filter(f => f.endsWith('.json')).length;
  `
});
```

### How It Works

1. **Semantic Tool Discovery**: When Claude Code requests tools, AgentCards uses semantic search to return only relevant tools based on the query context, preventing context saturation.

2. **Transparent Proxying**: Tool calls like `filesystem:read_file` are automatically routed to the underlying `filesystem` MCP server.

3. **Workflow Orchestration**: The special `execute_workflow` tool enables:
   - **Intent-based**: Describe what you want → AgentCards suggests optimal DAG
   - **Explicit DAG**: Provide workflow structure → Automatic parallelization
   - **$OUTPUT resolution**: Reference previous task outputs

4. **Context Optimization**: Instead of loading all 100+ tool schemas, AgentCards dynamically loads only what's needed.

### Code Execution Mode

AgentCards integrates code execution into DAG workflows, enabling hybrid orchestration that combines MCP tool calls with local data processing. This is the **primary delegation point** between workflow orchestration and sandbox execution.

#### When to Use Code Execution

**Use code_execution task type when:**
- Processing large datasets fetched from MCP tools (>100 items)
- Complex multi-step transformations across multiple tool results
- Local filtering/aggregation before returning to LLM context
- Idempotent operations safe for checkpoint/resume

**Use direct MCP tool calls when:**
- Single tool with small result (<10KB)
- No processing needed
- Stateful operations requiring immediate commit

#### REPL-Style Execution

Code execution supports REPL-style auto-return for simple expressions:

- **Simple expressions** auto-return: `2 + 2` → `4`
- **Multi-statement code** requires explicit `return`: `const x = 5; return x * 3` → `15`

See [ADR-016](docs/adrs/ADR-016-repl-style-auto-return.md) for details on supported patterns and edge cases.

#### Example: Hybrid DAG Workflow

```typescript
// ControlledExecutor builds this DAG
const dag = {
  tasks: [
    // Layer 0: Fetch via MCP (parallel)
    {
      id: "fetch_commits",
      tool: "github:list_commits",
      type: "mcp_tool",
      arguments: { repo: "anthropics/claude", limit: 1000 }
    },
    {
      id: "fetch_issues",
      tool: "github:list_issues",
      type: "mcp_tool",
      arguments: { state: "open" }
    },

    // Layer 1: Process locally (code execution)
    {
      id: "analyze",
      type: "code_execution",
      code: `
        const commits = deps.fetch_commits;
        const issues = deps.fetch_issues;

        const lastWeek = commits.filter(c => isLastWeek(c.date));
        const openIssues = issues.filter(i => i.state === "open");

        return {
          commits_last_week: lastWeek.length,
          open_issues: openIssues.length,
          top_contributors: getTopContributors(lastWeek)
        };
      `,
      depends_on: ["fetch_commits", "fetch_issues"]
    }
  ]
};

// Execute with automatic checkpointing
for await (const event of executor.executeStream(dag)) {
  if (event.type === "checkpoint") {
    console.log("State saved - can resume if crash");
  }
}
```

#### Intent-Based Tool Injection

Code execution tasks can optionally specify an `intent` to automatically discover and inject relevant MCP tools:

```typescript
// Claude calls tool directly (not via DAG)
await mcp.callTool("agentcards:execute_code", {
  intent: "Analyze GitHub commits from last week",
  code: `
    const commits = await github.listCommits({ repo: "anthropics/claude", limit: 1000 });
    const lastWeek = commits.filter(c => isLastWeek(c.date));
    return {
      total: lastWeek.length,
      authors: [...new Set(lastWeek.map(c => c.author))]
    };
  `
});

// AgentCards:
// 1. Vector search: "Analyze GitHub commits" → identifies "github" tools
// 2. Inject github client into sandbox
// 3. Execute code with tools available
// 4. Return result: { total: 42, authors: ["alice", "bob"] }
```

#### Safe-to-Fail Pattern

Code execution tasks are **idempotent** and **isolated**:
- Virtual filesystem (no permanent side-effects)
- Can be rolled back without corruption
- Safe for speculative execution
- Checkpoint-compatible (state in PGlite)

#### Performance Characteristics

| Metric | Target | Description |
|--------|--------|-------------|
| Sandbox startup | <100ms | Deno subprocess spawn |
| Tool discovery | <200ms | Vector search for intent |
| Execution timeout | 30s | Configurable via `sandbox_config.timeout` |
| Memory limit | 512MB | Configurable via `sandbox_config.memoryLimit` |
| Cache hit | <10ms | In-memory LRU lookup |

#### Caching

Code execution results are automatically cached to avoid re-executing identical code:

```typescript
// First execution: ~500ms (subprocess + execution)
await mcp.callTool("agentcards:execute_code", {
  code: `return data.filter(x => x > 5).length;`,
  context: { data: [1, 2, 6, 8, 10] }
});

// Second execution: <10ms (cache hit)
await mcp.callTool("agentcards:execute_code", {
  code: `return data.filter(x => x > 5).length;`,
  context: { data: [1, 2, 6, 8, 10] }  // Same code + context = cache hit
});
```

**Cache key:** `hash(code + context + tool_versions)`
- Different code → cache miss
- Different context → cache miss
- Tool schema changes → automatic invalidation

#### Security

**Sandbox Isolation:**
- Code runs in isolated Deno subprocess
- Limited permissions (only `~/.agentcards` read access)
- No network access from sandbox
- No subprocess spawning allowed

**Input Validation:**
- Code string validated (no empty, max 100KB)
- Context object validated (JSON-serializable only)
- Intent string sanitized (no code injection)

#### PII Protection

AgentCards automatically detects and tokenizes sensitive data before code execution:

```typescript
// Input with PII
const context = {
  users: [
    { name: "Alice", email: "alice@secret.com" },
    { name: "Bob", phone: "555-123-4567" }
  ]
};

// Code sees tokenized values
await mcp.callTool("agentcards:execute_code", {
  code: `
    // emails appear as [EMAIL_1], [EMAIL_2]
    // phones appear as [PHONE_1], etc.
    return context.users.map(u => u.email);
  `,
  context
});
```

**Detected PII types:**
- Email addresses
- Phone numbers (US/CA format)
- Credit card numbers
- Social Security Numbers
- API keys (common patterns)

**Disable PII protection:**
```typescript
await mcp.callTool("agentcards:execute_code", {
  code: "...",
  sandbox_config: { piiProtection: false }
});
```

### Troubleshooting

**Common Issues:**

| Problem | Solution |
|---------|----------|
| Gateway fails to start | Check MCP server configs, verify paths in config |
| Tools not appearing | Run `deno task serve:playground` to reinitialize |
| Slow tool discovery | Clear cache, regenerate embeddings |
| Memory issues | Reduce `maxConcurrency` in config |

**Debug Commands:**
```bash
# Enable verbose logging
LOG_LEVEL=debug deno task serve:playground

# Check database
ls -lh .agentcards.db

# Run tests
deno task test
```

**Getting Help:** [GitHub Issues](https://github.com/Casys-AI/AgentCards/issues)

---

## Development

### Deno Tasks

```bash
# Development mode with hot reload
deno task dev

# Run all tests
deno task test

# Run tests with coverage
deno test --allow-all --coverage=coverage
deno coverage coverage

# Run linter
deno task lint

# Format code
deno task fmt

# Type checking
deno task check

# Run benchmarks
deno task bench

# Build binary
deno task build
```

### CLI Commands

```bash
# Initialize AgentCards (migrate MCP config, extract schemas, generate embeddings)
./agentcards init [--config <path>] [--dry-run]

# Start MCP gateway server for Claude Code
./agentcards serve [--config <path>] [--no-speculative]

# Enable/disable telemetry
./agentcards --telemetry
./agentcards --no-telemetry
```

### Code Quality Standards

- **Linting**: Deno's built-in linter with recommended rules
- **Formatting**: 100-char line width, 2-space indentation, semicolons enforced
- **Type Safety**: Strict TypeScript with `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`
- **Testing**: >80% coverage target with Deno.test

---

## Testing

```bash
# Run all tests
deno task test

# Run unit tests only
deno task test:unit

# Run integration tests only
deno task test:integration

# Run with coverage
deno test --allow-all --coverage=coverage
deno coverage coverage

# Run benchmarks
deno task bench
```

Tests are organized in:
- `tests/unit/` - Unit tests for individual modules
- `tests/integration/` - E2E integration tests
- `tests/benchmark/` - Performance benchmarks

---

## Project Structure

```
AgentCards/
├── src/
│   ├── main.ts                 # Entry point
│   ├── cli/                    # CLI commands (init, serve)
│   ├── db/                     # Database (PGlite + pgvector + migrations)
│   ├── mcp/                    # MCP protocol
│   │   ├── gateway-server.ts   # MCP gateway with meta-tools
│   │   ├── gateway-handler.ts  # Request handlers
│   │   ├── client.ts           # MCP client wrapper
│   │   └── discovery.ts        # Server auto-discovery
│   ├── vector/                 # Embeddings & search
│   │   ├── embeddings.ts       # BGE-Large-EN-v1.5 via Transformers.js
│   │   └── search.ts           # Vector similarity search
│   ├── dag/                    # DAG execution
│   │   ├── executor.ts         # Parallel executor
│   │   └── controlled-executor.ts  # With AIL/HIL support
│   ├── graphrag/               # Graph learning
│   │   ├── graph-engine.ts     # Graphology + PageRank + Adamic-Adar
│   │   ├── dag-suggester.ts    # Intent → DAG suggestions
│   │   └── workflow-sync.ts    # Template bootstrapping
│   ├── sandbox/                # Code execution
│   │   ├── deno-executor.ts    # Isolated Deno subprocess
│   │   ├── context-builder.ts  # MCP tool injection
│   │   └── pii-detector.ts     # Sensitive data protection
│   ├── web/                    # Fresh dashboard
│   │   ├── routes/             # Pages and API routes
│   │   └── islands/            # Interactive components
│   └── telemetry/              # Logging & metrics
├── tests/                      # Unit, integration, benchmarks
├── docs/
│   ├── PRD.md                  # Product requirements
│   ├── adrs/                   # Architecture Decision Records
│   ├── stories/                # User stories
│   └── sprint-status.yaml      # Development progress
├── config/                     # MCP server configs
├── playground/                 # Jupyter notebooks (WIP)
└── deno.json                   # Tasks and dependencies
```

---

## Documentation

- **[Product Requirements](docs/PRD.md)** - Goals, features, user journeys
- **[Architecture Decisions](docs/adrs/)** - ADRs for technical decisions
- **[Sprint Status](docs/sprint-status.yaml)** - Current development progress
- **[Stories](docs/stories/)** - Detailed implementation stories

---

## Security

AgentCards is designed for local-first, privacy-respecting operation:

**Data Privacy:**
- All embeddings generated locally (BGE-Large-EN-v1.5 via Transformers.js)
- Data stored in local PGlite database (`.agentcards.db`)
- No cloud dependencies or external API calls for core functionality

**Sandbox Isolation:**
- Code execution runs in isolated Deno subprocess
- Limited permissions (configurable read paths only)
- No network access from sandbox by default
- PII detection and tokenization before execution

**MCP Communication:**
- Server communication via stdio (no network exposure)
- HTTP mode available for dashboard (configurable port)

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and ensure tests pass: `deno task test`
4. **Format and lint**: `deno task fmt && deno task lint`
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Setup

```bash
# Clone your fork
git clone https://github.com/Casys-AI/AgentCards.git
cd AgentCards

# Install dependencies (Deno manages this automatically)
deno cache src/main.ts

# Run tests
deno task test

# Start development
deno task dev
```

---

## License

This project is licensed under the **AGPL-3.0 License** - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **[Deno](https://deno.land/)** - Modern JavaScript/TypeScript runtime
- **[Fresh](https://fresh.deno.dev/)** - Next-gen web framework for Deno
- **[PGlite](https://github.com/electric-sql/pglite)** - Lightweight PostgreSQL WASM
- **[Transformers.js](https://github.com/xenova/transformers.js)** - Local ML model inference
- **[MCP SDK](https://github.com/modelcontextprotocol)** - Model Context Protocol by Anthropic
- **[Graphology](https://graphology.github.io/)** - Graph data structure and algorithms
- **[Cytoscape.js](https://js.cytoscape.org/)** - Graph visualization library

---

[Report Bug](https://github.com/Casys-AI/AgentCards/issues) | [Request Feature](https://github.com/Casys-AI/AgentCards/issues) | [Documentation](docs/)
