# PML CLI

Lightweight CLI for [PML (Procedural Memory Layer)](https://pml.casys.ai) -
intelligent MCP orchestration with learning capabilities.

## Installation

### Quick Install (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/Casys-AI/casys-pml/main/scripts/install.sh | sh
```

### Manual Download

Download the binary for your platform from [Releases](https://github.com/Casys-AI/casys-pml/releases):

- **Linux x64**: `pml-linux-x64`
- **macOS Intel**: `pml-macos-x64`
- **macOS Apple Silicon**: `pml-macos-arm64`
- **Windows**: `pml-windows-x64.exe`

### From Source (Deno)

```bash
deno install -A -n pml jsr:@casys/pml/cli
```

> **Note**: `jsr:@casys/pml` exports the library modules. Use `jsr:@casys/pml/cli` for the CLI entrypoint.

## Quick Start

```bash
# Initialize PML in your project
pml init

# Start the MCP server
pml serve
```

## Commands

### `pml init`

Initialize PML configuration in the current directory.

```bash
pml init                    # Interactive setup
pml init --yes              # Use defaults, skip prompts
pml init --port 3003        # Custom port
pml init --api-key <key>    # Set PML API key
```

Creates two configuration files:

- `.mcp.json` - MCP server configuration for Claude Code
- `.pml.json` - PML workspace settings

### `pml serve`

Start the PML MCP HTTP server.

```bash
pml serve                   # Start with config defaults
pml serve --port 3003       # Custom port
```

### `pml upgrade`

Self-update PML to the latest version.

```bash
pml upgrade                 # Upgrade to latest
pml upgrade --check         # Check for updates without installing
pml upgrade --force         # Force reinstall current version
```

### `pml --version`

Display the package version.

## Configuration

### `.mcp.json`

```json
{
  "pml": {
    "type": "http",
    "url": "http://localhost:3003/mcp",
    "env": {
      "PML_API_KEY": "${PML_API_KEY}",
      "TAVILY_API_KEY": "${TAVILY_API_KEY}"
    }
  }
}
```

### `.pml.json`

```json
{
  "version": "0.1.0",
  "workspace": ".",
  "cloud": {
    "url": "https://pml.casys.ai"
  },
  "permissions": {
    "allow": [],
    "deny": [],
    "ask": []
  },
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "exa": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": {
        "EXA_API_KEY": "${EXA_API_KEY}"
      }
    }
  }
}
```

## MCP Tool Discovery

PML automatically discovers tools from your configured MCP servers and syncs them to the cloud for config-aware suggestions.

### How It Works

1. At startup (`pml serve` or `pml stdio`), PML reads `mcpServers` from `.pml.json`
2. Spawns each MCP server and calls `tools/list` to discover available tools
3. Validates tool schemas (supports JSON Schema draft-07 and draft-2020-12)
4. Syncs discovered tools to PML cloud (only tool metadata - no secrets or paths)

### Configuration

Add MCP servers to your `.pml.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "my-mcp-server"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    },
    "http-server": {
      "type": "http",
      "url": "https://api.example.com/mcp"
    }
  }
}
```

- `type`: `"stdio"` (default) or `"http"`
- `command`: Command to run (stdio only)
- `args`: Command arguments (stdio only)
- `env`: Environment variables with `${VAR}` substitution
- `url`: Server URL (http only)

### What Gets Synced

Only public tool metadata is synced to the cloud:

- Server name (e.g., "filesystem")
- Tool name, description, and input schema

**Not synced**: workspace paths, commands, args, env vars, API keys

## Environment Variables

PML uses BYOK (Bring Your Own Keys) for API integrations:

| Variable           | Description                  |
| ------------------ | ---------------------------- |
| `PML_API_KEY`      | PML Cloud API key (optional) |
| `TAVILY_API_KEY`   | Tavily search API key        |
| `AIRTABLE_API_KEY` | Airtable API key             |
| `EXA_API_KEY`      | Exa search API key           |

## License

MIT

