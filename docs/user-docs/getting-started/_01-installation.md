# Installation

> **Estimated time:** ~10 minutes

## What is PML?

PML (Procedural Memory Layer) is an intelligent MCP gateway that consolidates all your MCP servers
into a single entry point with semantic search, DAG workflow orchestration, and self-improving tool
discovery.

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
git clone https://github.com/casys-ai/casys-pml.git
cd casys-pml
```

### Step 2: Build the CLI

```bash
deno task build
```

You should see:

```
Compile file:///.../src/main.ts to pml
```

### Step 3: Verify installation

```bash
./pml --help
```

Expected output:

```
Usage: pml [options] [command]

Commands:
  init    Initialize PML from MCP config
  serve   Start PML MCP gateway server
  status  Show gateway status and health
```

## Tutorial: Your First Workflow with Claude Code

Let's configure PML as an MCP gateway for Claude Code in a few steps.

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
> `./pml init --config ~/.config/Claude/claude_desktop_config.json`

### 2. Initialize PML

```bash
./pml init --config config/mcp-servers.json
```

This command:

- Discovers all your configured MCP servers
- Extracts tool schemas via MCP protocol
- Generates embeddings for semantic search
- Stores everything in a local PGlite database (`~/.pml/db`)

Expected output:

```
🚀 Initializing PML...
✓ Found 2 MCP server(s)
✓ Extracted 15 tool schemas
✓ Generated embeddings (BGE-M3)
✓ Stored in ~/.pml/db

PML is ready!
```

### 3. Configure Claude Code

Add PML to your Claude Code MCP configuration:

**Linux/macOS:** `~/.config/Claude/claude_desktop_config.json` **Windows:**
`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pml": {
      "command": "/absolute/path/to/pml",
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
./pml serve --config config/mcp-servers.json
```

**HTTP mode (with Fresh dashboard):**

```bash
./pml serve --config config/mcp-servers.json --port 3001
```

> **Note:** The Fresh dashboard (`deno task dev:fresh`) requires HTTP mode (`--port`). In stdio
> mode, only the MCP interface is available.

You should see:

```
🚀 Starting PML MCP Gateway...

Step 1/6: Loading configuration...
✓ Found MCP config: config/mcp-servers.json
Step 2/6: Initializing database...
Step 3/6: Connecting to MCP servers...
  ✓ Connected: filesystem
  ✓ Connected: memory
Step 4/6: Loading AI models...
Step 5/6: Starting MCP gateway...
Step 6/6: Listening for MCP requests...

PML gateway running on port 3001
```

**Congratulations!** You have configured PML as an intelligent MCP gateway.

## First Steps with Meta-Tools

Once connected, test these tools in Claude Code:

### Semantic tool search

```
Use pml:search_tools to find tools related to "read JSON files"
```

### DAG workflow execution

```
Use pml:execute_dag with intent "Read config.json and create a memory entity"
```

### Sandbox code execution

```
Use pml:execute_code to filter and aggregate data locally
```

## Monitoring (optional)

PML includes a Grafana/Loki/Promtail stack for log monitoring:

```bash
# Start the monitoring stack
cd monitoring && docker-compose up -d

# Access Grafana (admin/admin)
open http://localhost:3000
```

> **Note:** Monitoring works in both stdio AND Streamable HTTP modes because Promtail reads log
> files (`~/.pml/logs/`).

---

## Next Steps

Now that you're up and running:

- **[Quickstart](./02-quickstart.md)** - Your first workflow in 5 minutes
- **[Concepts](../concepts/index.md)** - Understand how PML works
- **[MCP Tools Reference](../reference/01-mcp-tools.md)** - Technical API documentation
