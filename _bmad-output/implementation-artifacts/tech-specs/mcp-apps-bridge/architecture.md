---
title: 'Architecture'
parent: mcp-apps-bridge
---

# Architecture

## Overview

The bridge has 3 layers:

```
┌─────────────────────────────────────────────────────────┐
│                 Messaging Platform                       │
│  (Telegram, LINE, etc.)                                  │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Platform Webview                        │ │
│  │                                                      │ │
│  │  ┌───────────────┐   ┌───────────────────────────┐  │ │
│  │  │  MCP App HTML │   │  Bridge Adapter (injected) │  │ │
│  │  │  (unmodified)  │   │  - JSON-RPC <-> SDK        │  │ │
│  │  │               │<->│  - Platform native UI       │  │ │
│  │  │  Uses App     │   │  - Theme mapping            │  │ │
│  │  │  class from   │   │  - Lifecycle management     │  │ │
│  │  │  ext-apps SDK │   │                             │  │ │
│  │  └───────────────┘   └──────────┬────────────────┘  │ │
│  │                                  │ HTTP/WS            │ │
│  └──────────────────────────────────┼──────────────────┘ │
│                                     │                     │
└─────────────────────────────────────┼─────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────────┐
                    │         Resource Server                │
                    │                                        │
                    │  - Serves ui:// resources as HTTP      │
                    │  - Injects bridge.js into HTML         │
                    │  - Forwards tools/call to MCP server   │
                    │  - Manages sessions                    │
                    │  - Sets CSP headers                    │
                    │                                        │
                    └─────────────────┬─────────────────────┘
                                      │ MCP (stdio/HTTP)
                    ┌─────────────────┼─────────────────────┐
                    │           MCP Server                   │
                    │  (existing, unmodified)                 │
                    │                                        │
                    │  - Tools with _meta.ui.resourceUri     │
                    │  - Resources with ui:// scheme         │
                    │                                        │
                    └───────────────────────────────────────┘
```

## Layer 1: Bridge Adapter (Client-Side JS)

**Location:** Injected into the MCP App HTML by the resource server.

**Responsibility:** Intercept postMessage calls from the MCP App's `App` class and route them through the platform adapter instead.

### How It Works

The standard MCP Apps `App` class calls `window.parent.postMessage()` to communicate with the host. In a messaging platform webview, there IS no parent iframe — the webview is the top-level container.

The bridge adapter:

1. **Monkey-patches `window.parent.postMessage`** to intercept JSON-RPC messages
2. **Routes messages** to the resource server via HTTP or WebSocket
3. **Receives responses** from the resource server and dispatches them as `MessageEvent` to the App class
4. **Calls platform SDK** (e.g., `Telegram.WebApp`) for native capabilities (theme, buttons, viewport)

```typescript
// Simplified bridge adapter concept
class BridgeAdapter {
  private ws: WebSocket;
  private platformAdapter: PlatformAdapter;

  constructor(serverUrl: string, platform: PlatformAdapter) {
    this.ws = new WebSocket(`${serverUrl}/bridge`);
    this.platformAdapter = platform;

    // Intercept postMessage from App class
    const originalPostMessage = window.parent.postMessage.bind(window.parent);
    window.parent.postMessage = (message: unknown, targetOrigin: string) => {
      this.handleOutgoing(message);
    };

    // Forward incoming messages to App class
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      window.dispatchEvent(new MessageEvent('message', { data }));
    };
  }

  private handleOutgoing(message: unknown) {
    // Send JSON-RPC to resource server via WS
    this.ws.send(JSON.stringify(message));
  }
}
```

### Platform Adapter Interface

Each platform implements:

```typescript
interface PlatformAdapter {
  /** Platform name */
  readonly name: string;

  /** Initialize platform SDK, return host context */
  initialize(): Promise<HostContext>;

  /** Map platform theme to MCP theme */
  getTheme(): 'light' | 'dark';

  /** Map platform viewport to MCP container dimensions */
  getContainerDimensions(): ContainerDimensions;

  /** Subscribe to platform lifecycle events */
  onLifecycleEvent(handler: (event: LifecycleEvent) => void): void;

  /** Open external link via platform */
  openLink(url: string): Promise<void>;

  /** Send message via platform (if supported) */
  sendMessage?(text: string): Promise<void>;

  /** Get platform auth data (for forwarding to MCP server) */
  getAuthData?(): Record<string, unknown>;
}
```

## Layer 2: Resource Server

**Location:** Server-side process, co-located with or proxying to the MCP server.

**Responsibility:** Serve MCP App HTML via HTTP, inject the bridge adapter, forward MCP protocol messages.

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/app/:resourceUri` | GET | Serve MCP App HTML with injected bridge.js |
| `/bridge` | WS | WebSocket for bidirectional JSON-RPC messaging |
| `/api/tools/call` | POST | HTTP fallback for tool calls (if WS unavailable) |
| `/health` | GET | Health check |

### HTML Injection

When serving a `ui://` resource:

1. Fetch HTML from MCP server via `resources/read`
2. Parse HTML
3. Inject `<script src="/bridge.js?platform=telegram"></script>` before `</body>`
4. Set CSP headers from resource `_meta.ui.csp`
5. Return modified HTML

### Session Management

Each connected webview gets a session:

```typescript
interface BridgeSession {
  id: string;
  platform: string;
  mcpClient: MCPClient;        // Connection to MCP server
  ws: WebSocket;               // Connection to webview
  toolContext?: ToolContext;    // Current tool call context
  createdAt: number;
  lastActivity: number;
}
```

## Layer 3: MCP Server (Unmodified)

The existing MCP server is used as-is. The resource server connects to it using the standard MCP TypeScript SDK (`@modelcontextprotocol/sdk`).

The resource server acts as an MCP **client** — it:
1. Calls `tools/list` to discover tools with `_meta.ui.resourceUri`
2. Calls `resources/read` to fetch `ui://` resources
3. Forwards `tools/call` from the webview to the MCP server
4. Returns tool results to the webview

## Data Flow: Tool Call

```
1. User clicks button in MCP App (Telegram webview)
2. App class calls app.callServerTool({ name: "get-time", arguments: {} })
3. App class internally does postMessage({ jsonrpc: "2.0", method: "tools/call", ... })
4. Bridge adapter intercepts postMessage
5. Bridge sends JSON-RPC over WebSocket to resource server
6. Resource server forwards tools/call to MCP server
7. MCP server executes tool, returns result
8. Resource server sends result over WebSocket
9. Bridge adapter dispatches MessageEvent to App class
10. App class fires ontoolresult callback
11. UI updates
```

Total added latency vs. standard MCP: 1 WebSocket hop (negligible if co-located).

## Key Design Decisions

### D1: Monkey-patch postMessage vs. Custom App Class

**Decision:** Monkey-patch `window.parent.postMessage`.

**Rationale:** This allows the original MCP App code to work unmodified. The `App` class from `@modelcontextprotocol/ext-apps` calls `postMessage` internally — by intercepting that, we avoid forking or wrapping the SDK.

### D2: WebSocket vs. HTTP Polling

**Decision:** WebSocket primary, HTTP fallback.

**Rationale:** MCP Apps have bidirectional communication (host pushes tool results, context changes). WebSocket is the natural fit. HTTP polling would add latency and complexity for server-initiated messages.

### D3: Co-Located vs. Separate Resource Server

**Decision:** Resource server is a separate process that connects to the MCP server as a client.

**Rationale:** This keeps the MCP server unmodified. The resource server is a thin proxy that adds platform-specific serving logic. It can be deployed alongside the MCP server or separately.

### D4: PML Integration for Tool Discovery (Optional)

**Decision:** Support PML (Procedural Memory Layer) as an optional tool discovery backend.

**Rationale:** When deployed alongside a Casys PML server (120+ tools including `mcp.std.*`, `mcp.filesystem.*`, etc.), the resource server can use `pml_discover` to find tools by intent rather than requiring explicit `tools/list` enumeration. This enables:

1. **Intent-based tool routing** — the bridge can resolve `tools/call` to the best matching tool via `pml_discover({ intent })` instead of exact name matching
2. **Multi-server aggregation** — PML already aggregates tools from multiple MCP servers, so the resource server doesn't need to manage multiple MCP client connections
3. **Code execution** — `pml_execute` enables ad-hoc code execution with MCP tool access, which the bridge could expose as a capability

This is NOT required for the MVP. Standard MCP SDK client connection is the default. PML integration is an enhancement for Casys deployments.

```typescript
interface ResourceServerOptions {
  // Standard: connect to one MCP server
  mcpServerUrl?: string;

  // Enhanced: connect via PML for multi-server discovery
  pmlServerUrl?: string;
}
```
