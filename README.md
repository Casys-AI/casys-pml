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

- Sandbox startup: <100ms
- Intent-based tool discovery: <200ms
- Total execution timeout: 30s (configurable)
- Memory limit: 512MB (configurable)

#### Security

**Sandbox Isolation:**
- Code runs in isolated Deno subprocess
- Limited permissions (only `~/.agentcards` read access)
- No network access from sandbox

**Input Validation:**
- Code string validated (no empty, max 100KB)
- Context object validated (JSON-serializable only)
- Intent string sanitized (no code injection)

### Troubleshooting

#### MCP Server Not Connecting

**Symptoms:**
- Gateway fails to start
- "Connection refused" errors in logs
- Specific MCP server tools not appearing

**Solutions:**
1. **Check server configuration:**
   ```bash
   cat ~/.agentcards/config.json
   ```
   Verify all MCP server commands are correct and in your PATH.

2. **Test individual MCP servers:**
   ```bash
   # Test a server directly
   /path/to/mcp-server-command --help
   ```

3. **Check server health:**
   ```bash
   # Use the status command to check all servers
   ./agentcards status
   ```

4. **Review logs:**
   ```bash
   tail -f ~/.agentcards/logs/agentcards.log
   ```

5. **Restart with verbose logging:**
   ```bash
   LOG_LEVEL=debug ./agentcards serve
   ```

#### Vector Search Performance Issues

**Symptoms:**
- Slow tool discovery
- High latency when searching for tools
- Timeouts during semantic search

**Solutions:**
1. **Check database index:**
   ```bash
   # Verify HNSW index exists
   ./agentcards debug --check-index
   ```

2. **Regenerate embeddings:**
   ```bash
   # Force re-generation of embeddings
   ./agentcards init --force-embeddings
   ```

3. **Reduce tool count:**
   - Limit `context.topK` in config to reduce search scope
   - Disable unused MCP servers

4. **Clear cache:**
   ```bash
   rm -rf ~/.agentcards/cache
   ./agentcards init
   ```

#### Memory Issues

**Symptoms:**
- High memory usage
- Gradual memory growth
- Out of memory errors

**Solutions:**
1. **Clear cache:**
   ```bash
   ./agentcards cache clear
   ```

2. **Reduce concurrent tool limit:**
   Edit `~/.agentcards/config.json`:
   ```json
   {
     "execution": {
       "maxConcurrency": 5
     }
   }
   ```

3. **Restart the gateway periodically:**
   ```bash
   # Add to cron or systemd for automatic restart
   ./agentcards serve
   ```

4. **Monitor memory usage:**
   ```bash
   # Check current memory usage
   ./agentcards debug --memory
   ```

#### Claude Code Can't Connect

**Symptoms:**
- AgentCards not appearing in Claude Code
- "Server not responding" errors

**Solutions:**
1. **Verify absolute path:**
   ```bash
   # Find the absolute path
   which agentcards
   # or
   readlink -f ./agentcards
   ```

2. **Check execute permissions:**
   ```bash
   chmod +x /absolute/path/to/agentcards
   ```

3. **Test gateway manually:**
   ```bash
   # Run gateway in test mode
   ./agentcards serve --test
   ```

4. **Restart Claude Desktop:**
   - Close Claude Desktop completely
   - Wait 5 seconds
   - Restart Claude Desktop

5. **Verify configuration syntax:**
   ```bash
   # Validate JSON syntax
   cat ~/.config/Claude/claude_desktop_config.json | jq .
   ```

#### Tools Not Appearing

**Symptoms:**
- Some or all tools missing from Claude Code
- Expected tools not in tool list

**Solutions:**
1. **Refresh tool catalog:**
   ```bash
   ./agentcards init
   ```

2. **Verify underlying servers:**
   ```bash
   # Check each MCP server individually
   ./agentcards status
   ```

3. **Check embeddings:**
   ```bash
   # Verify embeddings were generated
   ls -lh ~/.agentcards/db
   # Should show database files
   ```

4. **Force full re-initialization:**
   ```bash
   # Backup and reset
   mv ~/.agentcards ~/.agentcards.backup
   ./agentcards init
   ```

#### Performance Degradation

**Symptoms:**
- Slow response times
- Increased latency over time

**Solutions:**
1. **Run performance diagnostics:**
   ```bash
   ./agentcards debug --performance
   ```

2. **Check database size:**
   ```bash
   du -h ~/.agentcards/db
   ```

3. **Compact database:**
   ```bash
   ./agentcards vacuum
   ```

4. **Review benchmark results:**
   ```bash
   deno bench --allow-all tests/benchmarks/
   ```

#### Getting Help

If you're still experiencing issues:

1. **Check existing issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/agentcards/issues)
2. **Enable debug logging:** `LOG_LEVEL=debug ./agentcards serve`
3. **Collect diagnostics:** `./agentcards debug --full`
4. **Report issue:** Include logs, config, and Deno version

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
