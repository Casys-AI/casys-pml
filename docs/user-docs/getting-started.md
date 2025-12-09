# Getting Started with Casys Intelligence

> **Estimated time:** ~10 minutes

## What is Casys Intelligence?

Casys Intelligence is an intelligent MCP gateway that consolidates all your MCP servers into a single
entry point with semantic search, DAG workflow orchestration, and self-improving tool discovery.

**Problems solved:**

- **Context saturation** - Tool schemas consume 30-50% of LLM window → reduced to <5%
- **Sequential latency** - Multi-tool workflows run serially → parallelized via DAG

## Prerequisites

Before starting, make sure you have:

- [ ] **Deno 2.x or higher** - [Deno Installation](https://deno.land/)
- [ ] **Git** - To clone the repository
- [ ] **A coding agent** - Claude Code, Cursor, or another MCP client

### Verify Deno

```bash
deno --version
```

You should see:

```
deno 2.x.x (...)
```

## Installation

### Step 1: Clone the repository

```bash
git clone https://github.com/casys-ai/casys-intelligence.git
cd casys-intelligence
```

### Step 2: Build the CLI

```bash
deno task build
```

You should see:

```
Compile file:///.../src/main.ts to cai
```

### Step 3: Verify installation

```bash
./cai --help
```

Expected output:

```
Usage: cai [options] [command]

Commands:
  init    Initialize Casys Intelligence from MCP config
  serve   Start Casys Intelligence MCP gateway server
  status  Show gateway status and health
```

## Tutorial: Your First Workflow with Claude Code

Let's configure Casys Intelligence as an MCP gateway for Claude Code in a few steps.

### 1. Prepare your MCP configuration

Create a configuration file for your MCP servers:

```bash
mkdir -p config
cat > config/mcp-servers.json << 'EOF'
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/allowed/dir"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-memory"]
    }
  }
}
EOF
```

> **Tip:** You can also migrate your existing Claude Desktop config with
> `./cai init --config ~/.config/Claude/claude_desktop_config.json`

### 2. Initialize Casys Intelligence

```bash
./cai init --config config/mcp-servers.json
```

This command:

- Discovers all your configured MCP servers
- Extracts tool schemas via MCP protocol
- Generates embeddings for semantic search
- Stores everything in a local PGlite database (`~/.cai/db`)

Expected output:

```
🚀 Initializing Casys Intelligence...
✓ Found 2 MCP server(s)
✓ Extracted 15 tool schemas
✓ Generated embeddings (BGE-Large-EN-v1.5)
✓ Stored in ~/.cai/db

Casys Intelligence is ready!
```

### 3. Configure Claude Code

Add Casys Intelligence to your Claude Code MCP configuration:

**Linux/macOS:** `~/.config/Claude/claude_desktop_config.json` **Windows:**
`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cai": {
      "command": "/absolute/path/to/cai",
      "args": ["serve", "--config", "/absolute/path/to/config/mcp-servers.json"]
    }
  }
}
```

> **Important:** Use **absolute** paths for `command` and `--config`.

### 4. Launch and test

Restart Claude Code. The gateway starts automatically.

To test manually:

**stdio mode (default - recommended for Claude Code):**

```bash
./cai serve --config config/mcp-servers.json
```

**HTTP mode (with Fresh dashboard):**

```bash
./cai serve --config config/mcp-servers.json --port 3001
```

> **Note:** The Fresh dashboard (`deno task dev:fresh`) requires HTTP mode (`--port`). In stdio
> mode, only the MCP interface is available.

You should see:

```
🚀 Starting Casys Intelligence MCP Gateway...

Step 1/6: Loading configuration...
✓ Found MCP config: config/mcp-servers.json
Step 2/6: Initializing database...
Step 3/6: Connecting to MCP servers...
  ✓ Connected: filesystem
  ✓ Connected: memory
Step 4/6: Loading AI models...
Step 5/6: Starting MCP gateway...
Step 6/6: Listening for MCP requests...

Casys Intelligence gateway running on port 3001
```

**Congratulations!** You have configured Casys Intelligence as an intelligent MCP gateway.

## First Steps with Meta-Tools

Once connected, test these tools in Claude Code:

### Semantic tool search

```
Use cai:search_tools to find tools related to "read JSON files"
```

### DAG workflow execution

```
Use cai:execute_dag with intent "Read config.json and create a memory entity"
```

### Sandbox code execution

```
Use cai:execute_code to filter and aggregate data locally
```

## Monitoring (optional)

Casys Intelligence includes a Grafana/Loki/Promtail stack for log monitoring:

```bash
# Start the monitoring stack
cd monitoring && docker-compose up -d

# Access Grafana (admin/admin)
open http://localhost:3000
```

> **Note:** Monitoring works in both stdio AND Streamable HTTP modes because Promtail reads log
> files (`~/.cai/logs/`).

---

## Next Steps

Now that you're up and running:

- **[User Guide](./user-guide.md)** - Discover all features
- **[API Reference](./api-reference.md)** - Technical MCP tools documentation

## Need Help?

- **GitHub Issues:** [casys-ai/casys-intelligence/issues](https://github.com/casys-ai/casys-intelligence/issues)
- **Documentation:** [docs/](https://github.com/casys-ai/casys-intelligence/tree/main/docs)

---

_Generated on 2025-12-03 by BMAD user-docs workflow_
