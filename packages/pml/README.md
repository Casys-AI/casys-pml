# @casys/pml

Lightweight CLI for [PML (Procedural Memory Layer)](https://pml.casys.ai) -
intelligent MCP orchestration with learning capabilities.

## Installation

```bash
deno install -A -n pml jsr:@casys/pml
```

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
  "workspace": "/path/to/project",
  "cloudUrl": "https://pml.casys.ai",
  "port": 3003,
  "mcpRegistry": "jsr:@casys/pml-mcp-{name}"
}
```

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
