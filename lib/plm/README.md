# lib/plm — PLM (Product Lifecycle Management) MCP Server

MCP server exposing BOM generation, flattening, costing and comparison tools.
Reads live SysML v2 models from SysON via `lib/syson`.

## Tools

| Tool | Description |
|------|-------------|
| `plm_bom_generate` | Hierarchical BOM from SysON model tree |
| `plm_bom_flatten` | Aggregate parts list with totals |
| `plm_bom_cost` | Cost analysis (raw_material / should_cost / parametric) |
| `plm_bom_compare` | Diff two BOM revisions |

## Modes

### stdio (via PML)

Configured in `.pml.json`:
```json
{
  "mcpServers": {
    "plm": {
      "type": "stdio",
      "command": "deno",
      "args": ["run", "-A", "lib/plm/server.ts"],
      "env": { "SYSON_URL": "http://localhost:8180" }
    }
  }
}
```

### HTTP + Live Feed

```bash
deno run -A lib/plm/server.ts --http
```

Starts two servers:
- **:3010** — MCP HTTP server (tools, resources, sampling)
- **:3011** — SSE feed server + demo page

Open `http://localhost:3011` in a browser to see a passive live feed.
Every tool call broadcasts its result via SSE — the page renders BOM trees,
flat tables, cost breakdowns automatically as they arrive.

Options:
```
--http              Enable HTTP mode (default: stdio)
--port=3010         MCP server port
--feed-port=3011    SSE feed server port
--hostname=0.0.0.0  Bind address
--categories=a,b    Filter tool categories
```

### Cross-process broadcast (stdio → feed)

When PLM runs as stdio child process (spawned by PML), tool results are
POSTed to `http://localhost:3011/broadcast`. Start the HTTP server separately
to receive them:

```bash
# Terminal 1: feed server (HTTP mode, serves demo page + SSE)
deno run -A lib/plm/server.ts --http

# Terminal 2: PML connects to PLM via stdio, results broadcast to :3011
pml  # then call mcp.plm.plm_bom_generate(...) from chat
```

## Prerequisites

- SysON running on `$SYSON_URL` (default: `http://localhost:8180`)
- `docker compose -f docker-compose.syson.yml up` to start SysON
