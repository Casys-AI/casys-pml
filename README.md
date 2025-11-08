# AgentCards 🃏

[![CI](https://github.com/YOUR_USERNAME/agentcards/workflows/CI/badge.svg)](https://github.com/YOUR_USERNAME/agentcards/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Deno Version](https://img.shields.io/badge/deno-2.5.x-blue.svg)](https://deno.land)

**MCP Server Context Optimization Engine** - Intelligent gateway for Model Context Protocol servers with semantic context loading, workflow orchestration, and local embeddings.

AgentCards acts as a **transparent MCP gateway** that consolidates all your MCP servers into a single entry point, using semantic search and AI-powered workflow execution to optimize context and enable parallel tool execution.

---

## 🎯 Features

- **🔍 Semantic Vector Search** - Fast, local context retrieval using PGLite + pgvector
- **🧠 Local Embeddings** - BGE-Large-EN-v1.5 model for privacy-first embedding generation
- **📊 MCP Schema Discovery** - Automatic extraction and indexing of MCP server capabilities
- **⚡ On-Demand Loading** - Smart context optimization to stay within token budgets
- **🔄 Parallel Execution** - DAG-based orchestration for multi-server workflows
- **🚀 Workflow Automation** - Intent-based or explicit multi-tool execution
- **🔌 Transparent Proxying** - Single MCP server exposing all your tools
- **💾 Embedded Database** - Zero-config PostgreSQL with WASM (PGlite)

---

## 🚀 Quick Start

### Prerequisites

- [Deno](https://deno.land/) 2.5.x or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/agentcards.git
cd agentcards

# Build the CLI binary
deno task build

# Initialize from your Claude Desktop config
./agentcards init
```

That's it! AgentCards will discover your MCP servers, extract schemas, and generate embeddings.

---

## 🔌 Usage with Claude Code

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

### Step 4: Enjoy Unified Tool Access

Once configured, Claude Code sees AgentCards as a **single MCP server** with all your tools:

**🔧 All your tools from all servers (transparent proxying):**
```
filesystem:read_file
filesystem:write_file
github:create_issue
github:search_repos
database:query
slack:send_message
... (all your configured MCP tools)
```

**🚀 Special workflow execution tool:**
```
agentcards:execute_workflow
```

### Example Usage

**Single tool execution (transparent proxy):**
```typescript
await callTool("filesystem:read_file", {
  path: "/config.json"
});
```

**Intent-based workflow execution:**
```typescript
await callTool("agentcards:execute_workflow", {
  intent: "Read the config file, parse it, and create a GitHub issue with the settings"
});
```

**Explicit DAG workflow with parallelization:**
```typescript
await callTool("agentcards:execute_workflow", {
  workflow: {
    tasks: [
      {
        id: "t1",
        tool: "filesystem:read_file",
        arguments: { path: "/config.json" },
        depends_on: []
      },
      {
        id: "t2",
        tool: "json:parse",
        arguments: { json: "$OUTPUT[t1]" },
        depends_on: ["t1"]
      },
      {
        id: "t3",
        tool: "github:create_issue",
        arguments: {
          title: "Config Update",
          body: "$OUTPUT[t2]"
        },
        depends_on: ["t2"]
      }
    ]
  }
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

### Troubleshooting

**Gateway won't start:**
- Check that MCP servers are properly configured in `~/.agentcards/config.yaml`
- Verify all MCP server commands are in your PATH
- Check logs for connection errors

**Claude Code can't connect:**
- Ensure the path in `claude_desktop_config.json` is **absolute**
- Restart Claude Desktop after configuration changes
- Check that `agentcards` binary has execute permissions: `chmod +x agentcards`

**Tools not appearing:**
- Run `agentcards init` again to refresh the tool catalog
- Check that underlying MCP servers are running correctly
- Verify embeddings were generated: `ls ~/.agentcards/db`

---

## 🛠️ Development

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

## 🧪 Testing

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

## 📁 Project Structure

```
agentcards/
├── src/
│   ├── main.ts              # Entry point
│   ├── cli/                 # CLI commands (init, serve)
│   ├── db/                  # Database modules (PGlite + pgvector)
│   ├── mcp/                 # MCP client/server logic
│   │   ├── gateway-server.ts   # MCP gateway server
│   │   ├── client.ts           # MCP client wrapper
│   │   └── discovery.ts        # Server discovery
│   ├── vector/              # Embedding & semantic search
│   │   ├── embeddings.ts       # BGE-Large-EN-v1.5
│   │   └── search.ts           # Vector search
│   ├── dag/                 # DAG execution engine
│   │   └── executor.ts         # Parallel executor
│   ├── graphrag/            # Graph algorithms & RAG
│   │   ├── graph-engine.ts     # Graphology integration
│   │   └── dag-suggester.ts    # Workflow suggestions
│   └── telemetry/           # Logging & metrics
├── tests/
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── benchmark/           # Performance benchmarks
├── docs/                    # Documentation
│   ├── PRD.md                  # Product requirements
│   ├── architecture.md         # Architecture decisions
│   └── stories/                # User stories
├── .github/workflows/       # CI/CD pipelines
└── deno.json                # Deno configuration
```

---

## 📚 Documentation

- **[Product Requirements Document](docs/PRD.md)** - Product vision and requirements
- **[Architecture Decisions](docs/architecture.md)** - Technical architecture and decisions
- **[Epic Breakdown](docs/epics.md)** - Feature epics and implementation plan
- **[Sprint Status](docs/sprint-status.yaml)** - Current development progress

---

## 🔒 Security

AgentCards runs **locally** with explicit Deno permissions:
- No cloud dependencies for embeddings (100% local)
- All data stored in local PGlite database (`~/.agentcards/db`)
- MCP server communication via stdio (no network)
- Review permission flags in `deno.json` tasks before running

---

## 🤝 Contributing

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
git clone https://github.com/YOUR_USERNAME/agentcards.git
cd agentcards

# Install dependencies (Deno manages this automatically)
deno cache src/main.ts

# Run tests
deno task test

# Start development
deno task dev
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **[Deno](https://deno.land/)** - Modern JavaScript/TypeScript runtime
- **[PGlite](https://github.com/electric-sql/pglite)** - Lightweight PostgreSQL WASM
- **[Transformers.js](https://github.com/xenova/transformers.js)** - Local ML model inference
- **[MCP SDK](https://github.com/modelcontextprotocol)** - Model Context Protocol by Anthropic
- **[Graphology](https://graphology.github.io/)** - Graph data structure and algorithms

---

<div align="center">

**Built with ❤️ using Deno and the Model Context Protocol**

[Report Bug](https://github.com/YOUR_USERNAME/agentcards/issues) · [Request Feature](https://github.com/YOUR_USERNAME/agentcards/issues) · [Documentation](docs/)

</div>
