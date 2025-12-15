# CLI Reference

> PML command-line interface

## Commands

PML provides three main commands:

```
pml<command> [options]

Commands:
  init    Initialize PML from MCP configuration
  serve   Start the MCP gateway server
  status  Show gateway status and health
```

---

## pmlinit

Initialize PML by discovering MCP servers and indexing their tools.

```bash
pmlinit --config <path>
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--config` | string | Yes | Path to MCP servers configuration file |
| `--force` | flag | No | Re-initialize even if already initialized |

### What It Does

1. Reads MCP server configuration
2. Connects to each MCP server
3. Discovers available tools via `tools/list`
4. Generates embeddings for semantic search
5. Stores everything in the local database

### Example

```bash
# Initialize from config file
./pml init --config config/mcp-servers.json

# Re-initialize (refresh all tools)
./pml init --config config/mcp-servers.json --force
```

### Output

```
🚀 Initializing PML...
✓ Found 3 MCP server(s)
✓ Extracted 42 tool schemas
✓ Generated embeddings (BGE-Large-EN-v1.5)
✓ Stored in ~/.pml/db

PML is ready!
```

---

## pmlserve

Start the PML MCP gateway server.

```bash
pmlserve --config <path> [options]
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--config` | string | Yes | Path to MCP servers configuration file |
| `--port` | number | No | HTTP port for Streamable HTTP mode |
| `--no-speculative` | flag | No | Disable speculative execution |
| `--no-pii-protection` | flag | No | Disable PII data protection |
| `--no-cache` | flag | No | Disable execution cache |

### Transport Modes

**stdio mode (default):**
```bash
./pml serve --config config/mcp-servers.json
```
- Communication via stdin/stdout
- Recommended for Claude Code integration
- No dashboard available

**Streamable HTTP mode:**
```bash
./pml serve --config config/mcp-servers.json --port 3001
```
- MCP transport on `/mcp` endpoint
- Fresh dashboard available (port 8080)
- SSE events on `/events/stream`
- REST APIs for snapshots and metrics

### Example

```bash
# stdio mode for Claude Code
./pml serve --config config/mcp-servers.json

# HTTP mode for development
./pml serve --config config/mcp-servers.json --port 3001

# Disable cache for testing
./pml serve --config config/mcp-servers.json --no-cache
```

### Output

```
🚀 Starting PML MCP Gateway...

Step 1/6: Loading configuration...
✓ Found MCP config: config/mcp-servers.json
Step 2/6: Initializing database...
Step 3/6: Connecting to MCP servers...
  ✓ Connected: filesystem
  ✓ Connected: github
  ✓ Connected: memory
Step 4/6: Loading AI models...
Step 5/6: Starting MCP gateway...
Step 6/6: Listening for MCP requests...

PML gateway running on port 3001
```

---

## pmlstatus

Show the current status of the PML gateway.

```bash
pmlstatus
```

### Output

```
PML Status
──────────────────────────────
Gateway:     Running
Uptime:      2h 34m 12s
Mode:        stdio

MCP Servers:
  ✓ filesystem  (15 tools)
  ✓ github      (12 tools)
  ✓ memory      (8 tools)

Database:
  Path:        ~/.pml/db
  Size:        12.4 MB
  Tools:       35
  Capabilities: 12
  Edges:       156

Metrics:
  Requests:    1,234
  Avg latency: 45ms
  Cache hits:  78%
```

---

## Global Options

These options apply to all commands:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help for command |
| `--version`, `-v` | Show version number |
| `--quiet`, `-q` | Suppress non-error output |
| `--verbose` | Enable verbose logging |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Configuration error |
| `3` | Connection error (MCP server unreachable) |
| `4` | Database error |

---

## Environment Variables

CLI behavior can be modified via environment variables:

```bash
# Set log level
LOG_LEVEL=debug ./pml serve --config ...

# Custom database path
PML_DB_PATH=/custom/path ./pml init --config ...
```

See [Configuration](./02-configuration.md) for all environment variables.

---

## Examples

### Full Setup Workflow

```bash
# 1. Initialize
./pml init --config config/mcp-servers.json

# 2. Start server
./pml serve --config config/mcp-servers.json

# 3. Check status (in another terminal)
./pml status
```

### Claude Code Integration

```bash
# Build the CLI
deno task build

# Add to Claude config (use absolute paths)
# ~/.config/Claude/claude_desktop_config.json:
# {
#   "mcpServers": {
#     "pml": {
#       "command": "/home/user/pml",
#       "args": ["serve", "--config", "/home/user/config/mcp-servers.json"]
#     }
#   }
# }

# Restart Claude Code - PML starts automatically
```

### Development Mode

```bash
# Start with HTTP mode and dashboard
./pml serve --config config/mcp-servers.json --port 3001

# In another terminal, start the Fresh dashboard
deno task dev:fresh

# Open dashboard at http://localhost:8080
```

## See Also

- [Configuration](./02-configuration.md) - Configuration files
- [MCP Tools Reference](./01-mcp-tools.md) - API documentation
- [Installation](../getting-started/01-installation.md) - Setup guide
