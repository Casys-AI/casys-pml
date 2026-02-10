---
title: '@casys/mcp-apps-bridge — MCP Apps to Messaging Platforms Bridge'
slug: mcp-apps-bridge
created: '2026-02-09'
updated: '2026-02-10'
status: mvp-complete
tech_stack: ['deno', 'typescript', 'node']
related: ['MCP Apps SEP-1865', 'Telegram Mini Apps', 'LINE LIFF']
---

# Tech-Spec: @casys/mcp-apps-bridge

## Table of Contents

### Pre-Analysis
- [Scope Analysis](./scope-analysis.md) - Feasibility, component breakdown, MVP definition, risks

### Specification
- [Problem Statement](./problem-statement.md) - Gap between MCP Apps and messaging platforms, market opportunity
- [Architecture](./architecture.md) - 3-layer architecture: adapter, resource server, bridge transport
- [Protocol Mapping](./protocol-mapping.md) - JSON-RPC MCP <-> platform SDK mapping tables
- [API Design](./api-design.md) - Public TypeScript API, interfaces, adapter contract
- [Security Model](./security-model.md) - Sandboxing, CSP, origin policies, trust model
- [Platform Adapters](./platform-adapters.md) - Telegram Mini Apps + LINE LIFF adapter details
- [Implementation Plan](./implementation-plan.md) - Phased development, priorities (Telegram first)
- [Testing Strategy](./testing-strategy.md) - Unit, integration, e2e with real clients
- [Distribution](./distribution.md) - Deno dev -> Node.js dist, npm publish strategy
