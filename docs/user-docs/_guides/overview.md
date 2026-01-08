# PML User Guide

## Overview

PML (Procedural Memory Layer) is an intelligent MCP gateway designed for coding agents (Claude Code,
Cursor, etc.). It acts as a single entry point to all your MCP servers, optimizing LLM context usage
and parallelizing workflow execution.

**Key benefits:**

- **Optimized context:** Reduced from 30-50% → <5% through on-demand loading
- **Parallel execution:** Workflows 5x faster via DAG
- **Intelligent discovery:** Semantic search + graph-based recommendations
- **Continuous learning:** The system improves with usage

### Key Concepts

| Term                             | Definition                                                          |
| -------------------------------- | ------------------------------------------------------------------- |
| **MCP (Model Context Protocol)** | Anthropic's standard protocol for connecting LLMs to external tools |
| **Gateway**                      | Single entry point that aggregates and proxies all your MCP servers |
| **DAG (Directed Acyclic Graph)** | Structure representing task dependencies for parallelization        |
| **GraphRAG**                     | Learning knowledge base that improves tool suggestions              |
| **Sandbox**                      | Isolated environment for executing TypeScript code securely         |
| **AIL (Agent-in-the-Loop)**      | Automatic agent decisions during execution                          |
| **HIL (Human-in-the-Loop)**      | Human approval checkpoints for critical operations                  |

---

## Main Features

### 1. Semantic Tool Search

Find relevant tools by natural intent, not by exact name.

**How to use:**

1. Describe what you want to accomplish in natural language
2. PML uses embeddings (BGE-M3) to find similar tools
3. GraphRAG boosts tools frequently used together

**Example:**

```typescript
// Via MCP tool
await callTool("pml:search_tools", {
  query: "read and parse configuration files",
  limit: 5,
  include_related: true  // Include graph recommendations
});

// Result
{
  "tools": [
    { "name": "filesystem:read_file", "score": 0.92 },
    { "name": "filesystem:read_directory", "score": 0.85 },
    { "name": "memory:search_nodes", "score": 0.78, "related": true }
  ]
}
```

**Tips:**

- Use `include_related: true` to discover related tools via the graph
- The more the graph learns, the better the recommendations

---

### 2. DAG Workflow Execution

Orchestrate multi-tool workflows with automatic parallelization.

**How to use:**

1. **Intent mode:** Describe your goal, PML suggests the optimal DAG
2. **Explicit mode:** Define the workflow structure yourself
3. PML detects dependencies and parallelizes independent tasks

**Example - Intent Mode:**

```typescript
await callTool("pml:execute_dag", {
  intent: "Read the 3 files config.json, package.json, README.md and summarize their content",
});

// PML:
// 1. Identifies the 3 reads as independent
// 2. Executes them in parallel (Promise.all)
// 3. Aggregates results
// Time: 1.8s instead of 5.4s (3x improvement)
```

**Example - Explicit Mode with dependencies:**

```typescript
await callTool("pml:execute_dag", {
  workflow: {
    tasks: [
      { id: "t1", tool: "filesystem:read_file", arguments: { path: "config.json" } },
      { id: "t2", tool: "filesystem:read_file", arguments: { path: "schema.json" } },
      {
        id: "t3",
        tool: "memory:create_entities",
        arguments: { entities: [{ name: "config", content: "$t1.result" }] },
        dependsOn: ["t1"],
      }, // Waits for t1, but t1 and t2 are parallel
    ],
  },
});
```

**Tips:**

- Intent mode is ideal for discovering patterns
- Explicit mode offers total control over structure
- Use `$taskId.result` to reference results from previous tasks

---

### 3. Sandbox Code Execution

Execute TypeScript in an isolated environment with access to MCP tools.

**How to use:**

1. Write TypeScript code to process data
2. Optional: specify an `intent` to automatically discover relevant tools
3. Code executes in an isolated Deno subprocess

**Example - Local processing of large datasets:**

```typescript
await callTool("pml:execute_code", {
  intent: "Analyze GitHub commits",
  code: `
    // 'github' injected automatically thanks to intent
    const commits = await github.listCommits({ repo: "anthropics/claude", limit: 1000 });

    // Local filtering (no context cost)
    const lastWeek = commits.filter(c =>
      new Date(c.date) > Date.now() - 7 * 24 * 3600 * 1000
    );

    // Local aggregation
    const byAuthor = lastWeek.reduce((acc, c) => {
      acc[c.author] = (acc[c.author] || 0) + 1;
      return acc;
    }, {});

    // Return compact summary
    return Object.entries(byAuthor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  `,
});

// Result: [["alice", 42], ["bob", 28], ...] (500 bytes)
// Instead of 1000 raw commits (1.2MB)
// Context savings: 99.96%
```

**REPL style:**

- Simple expressions: auto-return (`2 + 2` → `4`)
- Multi-statements: explicit `return` required

**Tips:**

- Ideal for filtering/aggregating large datasets before injecting into LLM context
- Cache avoids re-executing identical code
- PII protection automatically tokenizes sensitive data

---

### 4. Workflow Control (AIL/HIL)

Manage execution with agent and human decision points.

**Agent-in-the-Loop (AIL):**

- Automatic decisions based on confidence
- Dynamic re-planning if new needs are discovered

**Human-in-the-Loop (HIL):**

- Approval checkpoints for critical operations
- Ability to modify the plan before continuing

**Example - Workflow with validation:**

```typescript
// Execution with per-layer validation
const result = await callTool("pml:execute_dag", {
  intent: "Deploy the new version",
  per_layer_validation: true, // Pause between each layer
});

// If workflow pauses for approval:
await callTool("pml:approval_response", {
  workflow_id: result.workflow_id,
  checkpoint_id: result.checkpoint_id,
  approved: true,
  feedback: "Continue with deployment",
});
```

**Control commands:**

| Tool                    | Usage                            |
| ----------------------- | -------------------------------- |
| `pml:continue`          | Resume a paused workflow         |
| `pml:abort`             | Stop a running workflow          |
| `pml:replan`            | Modify DAG with new requirements |
| `pml:approval_response` | Respond to an HIL checkpoint     |

---

## Configuration

### Command Line Options

| Option                | Type   | Default    | Description                            |
| --------------------- | ------ | ---------- | -------------------------------------- |
| `--config <path>`     | string | (required) | Path to MCP config file                |
| `--port <number>`     | number | stdio      | HTTP port for SSE transport (optional) |
| `--no-speculative`    | flag   | false      | Disable speculative execution          |
| `--no-pii-protection` | flag   | false      | Disable sensitive data protection      |
| `--no-cache`          | flag   | false      | Disable code execution cache           |

### Environment Variables

| Variable                | Description                                 |
| ----------------------- | ------------------------------------------- |
| `PML_DB_PATH`           | Custom path for PGlite database             |
| `PML_WORKFLOW_PATH`     | Path to workflow templates                  |
| `PML_NO_PII_PROTECTION` | `1` to disable PII protection               |
| `PML_NO_CACHE`          | `1` to disable cache                        |
| `SENTRY_DSN`            | Sentry DSN for error tracking (optional)    |
| `LOG_LEVEL`             | Log level: `debug`, `info`, `warn`, `error` |

### MCP Configuration Example

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/home/user/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-memory"]
    }
  }
}
```

---

## Common Workflows

### Workflow 1: Codebase Analysis

**Goal:** Analyze project structure and create documentation

1. **Discover files**

   Use semantic search to find relevant tools:

   ```typescript
   await callTool("pml:search_tools", {
     query: "list and read source files",
   });
   ```

2. **Execute the workflow**

   Create a DAG to parallelize reading:

   ```typescript
   await callTool("pml:execute_dag", {
     intent: "Read all TypeScript files in src/ and generate a summary",
   });
   ```

3. **Process locally**

   Use the sandbox to aggregate results:

   ```typescript
   await callTool("pml:execute_code", {
     code: `
       const files = context.files;
       return {
         total: files.length,
         byType: groupBy(files, f => f.extension),
         linesOfCode: sum(files.map(f => f.lines))
       };
     `,
     context: { files: previousResults },
   });
   ```

**Result:** Documentation generated with statistics, all in seconds thanks to parallelization.

---

### Workflow 2: Data Migration

**Goal:** Transform and migrate data between formats

1. Read source data (parallel if multiple files)
2. Transform via sandbox code (filtering, mapping)
3. Write to destination

```typescript
await callTool("pml:execute_dag", {
  workflow: {
    tasks: [
      // Parallel reading
      { id: "read1", tool: "filesystem:read_file", arguments: { path: "data1.json" } },
      { id: "read2", tool: "filesystem:read_file", arguments: { path: "data2.json" } },
      // Transformation (waits for reads)
      {
        id: "transform",
        type: "code_execution",
        code: `return [...deps.read1, ...deps.read2].filter(x => x.active)`,
        dependsOn: ["read1", "read2"],
      },
      // Writing
      {
        id: "write",
        tool: "filesystem:write_file",
        arguments: { path: "output.json", content: "$transform.result" },
        dependsOn: ["transform"],
      },
    ],
  },
});
```

---

## Best Practices

### Performance

- **Use Intent mode** for new workflows - GraphRAG learns optimal patterns
- **Parallelize reads** - read operations are generally independent
- **Process locally** - sandbox avoids injecting large data into context
- **Enable cache** - avoids re-executing identical code

### Security

- **Keep PII protection enabled** except in trusted environments
- **Use absolute paths** in configurations
- **Limit permissions** for MCP servers (allowed directories, scoped tokens)
- **Review workflows** before approving HIL checkpoints

### Organization

- **One config file per environment** (dev, staging, prod)
- **Name your MCP servers clearly** (`github-prod`, `filesystem-local`)
- **Document explicit workflows** for reuse

---

## Observability

PML offers several monitoring options:

| Tool                 | stdio | Streamable HTTP | Description                          |
| -------------------- | :---: | :-------------: | ------------------------------------ |
| **Grafana/Loki**     |  ✅   |       ✅        | Logs via Promtail (reads files)      |
| **Sentry**           |  ✅   |       ✅        | Error tracking (own HTTP connection) |
| **Fresh Dashboard**  |  ❌   |       ✅        | Real-time UI on port 8080            |
| **Console (stderr)** |  ✅   |       ✅        | Console logs via stderr              |

### Grafana/Loki/Promtail Stack

Monitoring works **independently of transport mode** because Promtail reads log files:

```bash
# Start monitoring stack
cd monitoring && docker-compose up -d

# Access Grafana
open http://localhost:3000  # admin/admin
```

**Aggregated logs:**

- `~/.pml/logs/pml.log` (structured JSON)
- LogQL queries: `{job="pml"}`, `{job="pml", level="ERROR"}`

### Sentry (Error Tracking)

Sentry uses its own HTTP connection, works in both stdio and HTTP:

```bash
# .env
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=production
```

---

## Transport Modes

PML supports two MCP transport modes:

| Mode                | Command                              | Dashboard | Use Case                          |
| ------------------- | ------------------------------------ | --------- | --------------------------------- |
| **stdio**           | `pml serve --config ...`             | No        | Claude Code, direct integration   |
| **Streamable HTTP** | `pml serve --config ... --port 3001` | Yes       | Development, debugging, dashboard |

**stdio (default):**

- Communication via stdin/stdout
- Optimal for Claude Code integration
- No Fresh dashboard available
- No HTTP API

**Streamable HTTP:**

- MCP transport on `/mcp` (MCP spec 2025-03-26)
- Fresh dashboard accessible (`deno task dev:fresh` on port 8080)
- Real-time graph events via SSE on `/events/stream`
- REST APIs for snapshots and metrics
- Ideal for development and monitoring

> **Recommendation:** Use stdio for production with Claude Code, Streamable HTTP for development and
> debugging.

---

## Known Limitations

- **No multi-tenant support** - Designed for individual developer use
- **Local embeddings only** - No cloud option for embeddings (by design, for privacy)
- **Sandbox read-only by default** - File writing requires explicit permissions
- **Fresh Dashboard** - Requires Streamable HTTP mode (`--port`), unavailable in stdio

---

## See Also

- [Installation](../getting-started/01-installation.md) - Installation and setup
- [Quickstart](../getting-started/02-quickstart.md) - Your first workflow
- [Concepts](../concepts/index.md) - Deep dive into PML architecture
- [MCP Tools Reference](../reference/01-mcp-tools.md) - Technical API documentation
