# Code Execution

Secure sandbox for running generated code.

---

## Topics

| Document                               | Description                        |
| -------------------------------------- | ---------------------------------- |
| [Sandbox](./01-sandbox.md)             | Deno isolation and permissions     |
| [Worker Bridge](./02-worker-bridge.md) | RPC communication between contexts |
| [Tracing](./03-tracing.md)             | Call hierarchy and observability   |

---

## Overview

PML can execute agent-generated code safely:

- **Sandbox** - Deno workers with restricted permissions
- **Worker Bridge** - RPC protocol for tool injection
- **Tracing** - Full observability of execution flow

This enables behavioral emergence - agents can write code that combines MCP tools in novel ways.
