---
title: "Why MCP Protocol: The Universal Language for AI Tools"
slug: why-mcp-protocol
date: 2025-12-18
category: architecture
tags:
  - mcp
  - protocol
  - interoperability
  - tools
snippet: "Function calling is proprietary. MCP is universal. Here's why we chose an open standard for tool integration—and why it matters for the AI ecosystem."
format: article
language: en
author: Erwan Lee Pesle
---

# Why MCP Protocol: The Universal Language for AI Tools

> From vendor lock-in to universal interoperability

## The Problem With Function Calling

TODO: Explain the fragmentation
- OpenAI has function calling
- Anthropic has tool use
- Google has function declarations
- Each slightly different, all proprietary

```mermaid
graph TD
    subgraph "Without MCP"
        T1[Your Tool] --> A1[OpenAI Adapter]
        T1 --> A2[Anthropic Adapter]
        T1 --> A3[Google Adapter]
        A1 --> M1[OpenAI]
        A2 --> M2[Claude]
        A3 --> M3[Gemini]
    end
```

## What Is MCP?

TODO: Explain Model Context Protocol
- Open standard by Anthropic
- JSON-RPC based
- Tools, Resources, Prompts

```mermaid
graph TD
    subgraph "With MCP"
        T1[Your Tool] --> MCP[MCP Protocol]
        MCP --> M1[Any LLM]
        MCP --> M2[Any Agent]
        MCP --> M3[Any Client]
    end
```

## Why We Chose MCP

TODO: Our reasoning
- Vendor independence
- Growing ecosystem
- Clean separation of concerns
- Stdio transport = works everywhere

| Approach | Pros | Cons |
|----------|------|------|
| Native function calling | Tight integration | Vendor lock-in |
| Custom adapters | Full control | Maintenance burden |
| **MCP** | Universal, growing ecosystem | Newer, evolving |

## The MCP Architecture

TODO: How it works
- Server exposes tools
- Client discovers and calls
- Transport agnostic (stdio, HTTP, WebSocket)

```mermaid
sequenceDiagram
    Client->>Server: initialize
    Server-->>Client: capabilities
    Client->>Server: tools/list
    Server-->>Client: available tools
    Client->>Server: tools/call
    Server-->>Client: result
```

## Practical Benefits

TODO: What we get
- Swap LLMs without rewriting tools
- Share tools across projects
- Community tool ecosystem

---

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- Internal: Our MCP server implementation

#MCP #Protocol #Interoperability #AITools
