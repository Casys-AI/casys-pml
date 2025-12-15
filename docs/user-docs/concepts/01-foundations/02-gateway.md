# Gateway

> How PML routes requests to MCP servers

## Role of the Gateway

The **Gateway** is the central component of PML. It sits between AI agents and MCP servers, acting as an intelligent proxy.

```
                         ┌─────────────────────────────────┐
                         │           PML Gateway           │
                         │                                 │
┌──────────┐             │  ┌───────────┐  ┌───────────┐  │             ┌──────────────┐
│  Agent   │────────────▶│  │  Router   │  │  Memory   │  │────────────▶│  filesystem  │
│          │             │  └───────────┘  └───────────┘  │────────────▶│  github      │
│          │◀────────────│                                │────────────▶│  postgres    │
└──────────┘             │  ┌───────────┐  ┌───────────┐  │◀────────────│  fetch       │
                         │  │  Search   │  │  Learning │  │             └──────────────┘
                         │  └───────────┘  └───────────┘  │
                         └─────────────────────────────────┘
```

**Without PML**, an agent would need to:
- Connect to each MCP server separately
- Know which server has which tool
- Manage multiple connections

**With PML**, the agent:
- Connects to a single endpoint
- Searches tools by intent (not by name)
- Gets intelligent suggestions

## Multiplexing

**Multiplexing** means PML manages multiple MCP server connections through a single interface.

When PML starts:
1. Reads the server configuration
2. Spawns each MCP server as a subprocess
3. Maintains a connection pool
4. Handles reconnection if a server crashes

The agent sees **one unified API** regardless of how many servers are behind it.

## Request Routing

When an agent calls a tool, PML routes the request to the correct server:

```
Agent calls: filesystem:read_file

PML Gateway:
  1. Parse tool name → server: "filesystem", tool: "read_file"
  2. Find the connection to "filesystem" server
  3. Forward the request via JSON-RPC
  4. Wait for response
  5. Return result to agent
```

This routing is transparent - the agent doesn't need to know which server handles which tool.

## Gateway Modes

PML can run in different modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Local** | All servers run locally | Development, single user |
| **Cloud** | Shared server, multi-tenant | Production, multiple users |
| **Hybrid** | Mix of local and remote | Enterprise deployment |

## Connection Management

PML handles:
- **Startup** - Launch configured MCP servers
- **Health checks** - Monitor server availability
- **Reconnection** - Auto-restart crashed servers
- **Shutdown** - Graceful cleanup of all connections

## Next

- [Database](./03-database.md) - How PML stores tool information
- [Semantic Search](../02-discovery/01-semantic-search.md) - Finding tools by intent
