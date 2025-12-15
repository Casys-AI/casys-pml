# MCP Protocol

> The communication standard between AI agents and external tools

## What is MCP?

**MCP (Model Context Protocol)** is an open standard created by Anthropic that allows AI agents to interact with external tools and services in a structured way.

Think of MCP as a universal language that lets an AI agent:
- Discover what tools are available
- Understand how to use each tool
- Send requests and receive responses

```
┌──────────────┐      MCP Protocol      ┌──────────────┐
│   AI Agent   │ ◀────────────────────▶ │  MCP Server  │
│  (Claude)    │    JSON-RPC 2.0        │  (Tools)     │
└──────────────┘                        └──────────────┘
```

## Key Components

### Servers

An **MCP Server** is a program that exposes tools to AI agents. Each server can provide multiple tools.

Examples of MCP servers:
- **filesystem** - Read/write files, list directories
- **github** - Create issues, manage PRs, search repos
- **postgres** - Query databases
- **fetch** - Make HTTP requests

### Tools

A **Tool** is a single operation that an MCP server provides. Each tool has:
- A unique **name** (e.g., `filesystem:read_file`)
- A **description** explaining what it does
- An **input schema** defining required parameters
- An **output format** for results

### Schemas

The **input schema** describes what parameters a tool accepts. It uses JSON Schema format.

Example for a file reading tool:
```
Tool: filesystem:read_file
Parameters:
  - path (string, required): The file path to read
  - encoding (string, optional): File encoding (default: utf-8)
```

## How PML Uses MCP

PML acts as an intelligent **MCP Gateway** between agents and servers:

```
┌──────────┐     ┌─────────────────────────────────────┐     ┌──────────────┐
│  Agent   │────▶│              PML                    │────▶│ filesystem   │
│          │     │                                     │────▶│ github       │
│          │◀────│  • Discovers tools automatically    │────▶│ postgres     │
│          │     │  • Routes to the right server       │◀────│ ...          │
└──────────┘     │  • Learns from usage patterns       │     └──────────────┘
                 └─────────────────────────────────────┘
```

Instead of the agent connecting directly to each MCP server, PML:

1. **Aggregates** all tools from multiple servers
2. **Indexes** them for semantic search
3. **Routes** requests to the correct server
4. **Learns** which tools work well together

## Tool Discovery

When PML starts, it connects to all configured MCP servers and:

1. Calls `tools/list` on each server
2. Receives the list of available tools with schemas
3. Generates embeddings for semantic search
4. Stores everything in its database

This happens automatically - the agent sees one unified list of all available tools.

## Next

- [Gateway](./02-gateway.md) - How PML routes requests
- [Database](./03-database.md) - How tools are stored and indexed
