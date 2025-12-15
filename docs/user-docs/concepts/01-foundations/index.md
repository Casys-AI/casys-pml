# Foundations

Core building blocks of the PML architecture.

---

## Topics

| Document | Description |
|----------|-------------|
| [MCP Protocol](./01-mcp-protocol.md) | Understanding MCP servers, tools, and schemas |
| [Gateway](./02-gateway.md) | How PML routes and multiplexes MCP calls |
| [Database](./03-database.md) | PGlite, embeddings, and key-value storage |

---

## Overview

PML is built on three foundational components:

1. **MCP Protocol** - The Model Context Protocol provides a standardized way for AI agents to interact with tools
2. **Gateway** - PML acts as an intelligent gateway, routing calls to the right MCP servers
3. **Database** - Local SQLite (via PGlite) stores tool metadata, embeddings, and learned patterns
