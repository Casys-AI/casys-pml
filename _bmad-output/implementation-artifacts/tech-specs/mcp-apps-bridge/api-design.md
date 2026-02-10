---
title: 'API Design'
parent: mcp-apps-bridge
---

# API Design

## Package Structure

```
@casys/mcp-apps-bridge/
  core/           # JSON-RPC protocol, transport abstraction
  adapters/       # Platform adapters (telegram, line)
  server/         # Resource server
  cli/            # CLI scaffold tool
```

## Core Module (`@casys/mcp-apps-bridge/core`)

### JSON-RPC Types

> **Decision H2 (2026-02-09):** The code uses separate `McpAppsResponse` and
> `McpAppsErrorResponse` types instead of the spec's original single-union
> approach. This is **adopted as the canonical design** because it is more
> type-safe — consumers can discriminate success vs error at the type level
> without runtime checks on `result` vs `error` fields. All fields are `readonly`.

```typescript
// core/types.ts

/** A JSON-RPC 2.0 request sent between host and MCP App. */
export interface McpAppsRequest {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** A JSON-RPC 2.0 success response. */
export interface McpAppsResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result: unknown;
}

/** A JSON-RPC 2.0 error response. */
export interface McpAppsErrorResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

/** A JSON-RPC 2.0 notification (no id, no response expected). */
export interface McpAppsNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** Union of all JSON-RPC message shapes. */
export type McpAppsMessage =
  | McpAppsRequest
  | McpAppsResponse
  | McpAppsErrorResponse
  | McpAppsNotification;

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
```

### Transport Interface

```typescript
// core/transport.ts

export interface BridgeTransport {
  /** Send a JSON-RPC message to the resource server. */
  send(message: McpAppsMessage): void;

  /** Register a handler for incoming messages from the resource server. */
  onMessage(handler: (message: McpAppsMessage) => void): void;

  /** Register a handler for connection state changes. */
  onStateChange(handler: (connected: boolean) => void): void;

  /** Connect to the resource server at the given URL. */
  connect(url: string): Promise<void>;

  /** Disconnect from the resource server. */
  disconnect(): void;

  /** Whether the transport is currently connected. */
  readonly connected: boolean;
}
```

The `WebSocketTransport` class implements this interface using browser WebSocket APIs.
It fails fast on send if not connected, and on connect if the WebSocket API is unavailable.

### Message Router

```typescript
// core/message-router.ts

/**
 * Routes incoming JSON-RPC messages to registered method handlers.
 * Also tracks outgoing requests for response matching with timeout.
 */
export class MessageRouter {
  /** Register a handler for a JSON-RPC request method. */
  onRequest(method: string, handler: RequestHandler): void;

  /** Register a handler for a JSON-RPC notification method. */
  onNotification(method: string, handler: NotificationHandler): void;

  /** Track an outgoing request by id. Returns a Promise that resolves when matched. */
  trackRequest(id: string | number, method: string, timeoutMs?: number): Promise<unknown>;

  /** Route a message to the appropriate handler. */
  handleMessage(message: McpAppsMessage): Promise<McpAppsResponse | McpAppsErrorResponse | null>;

  /** Reject all pending requests and clear handlers. */
  destroy(): void;
}
```

### Bridge Client (Injected into MCP App HTML)

> **Decision M5 (2026-02-09):** BridgeClient is part of Phase 1 (Core Protocol
> Layer). It was implemented by dev-core as `core/bridge-client.ts`. It is the
> central orchestrator that wires Transport + MessageRouter + PlatformAdapter.

```typescript
// core/bridge-client.ts

export interface BridgeClientOptions {
  /** WebSocket URL of the resource server bridge endpoint. */
  readonly serverUrl: string;
  /** Platform adapter instance (Telegram, LINE, etc.). */
  readonly platform: PlatformAdapter;
  /** Transport implementation. */
  readonly transport: BridgeTransport;
  /** Session ID assigned by the resource server. */
  readonly sessionId: string;
  /** Bridge name/version reported in ui/initialize. */
  readonly bridgeInfo?: { readonly name: string; readonly version: string };
  /** Request timeout in ms. Defaults to 30_000. */
  readonly requestTimeoutMs?: number;
}

export class BridgeClient {
  /**
   * Start the bridge:
   * 1. Initialize PlatformAdapter -> get HostContext
   * 2. Connect BridgeTransport to resource server
   * 3. Register ui/initialize + ui/open-link handlers on MessageRouter
   * 4. Monkey-patch window.parent.postMessage to intercept App class calls
   * 5. Subscribe to PlatformAdapter lifecycle events
   */
  async start(): Promise<void>;

  /** Stop the bridge, restore postMessage, disconnect transport. */
  destroy(): void;

  /** Whether the bridge is currently running. */
  get isStarted(): boolean;

  /** The current host context (null before start). */
  get currentHostContext(): HostContext | null;
}
```

**Key behaviors:**
- `ui/initialize` and `ui/open-link` are handled **locally** by BridgeClient (not forwarded to resource server)
- All other requests (`tools/call`, `resources/read`, etc.) are forwarded via transport
- Outgoing requests are tracked by MessageRouter with timeout (fail-fast, no silent hang)
- Platform lifecycle events are translated to `ui/notifications/host-context-changed`
- `teardown` event triggers `ui/resource-teardown` notification then `destroy()`

## Adapter Module (`@casys/mcp-apps-bridge/adapters`)

> **Decision H3 (2026-02-09):** Two adapter levels coexist. They serve different
> purposes and MUST NOT be merged:
>
> - **`McpAppsAdapter`** (low-level): Transport replacement. Raw JSON-RPC message
>   routing via `sendToHost()` / `onMessageFromHost()`. Used internally by
>   BridgeClient when alternative transports are needed (e.g., native bridge
>   without WebSocket).
>
> - **`PlatformAdapter`** (high-level): Platform SDK abstraction. Theme, viewport,
>   auth, native UI. Used by BridgeClient to build HostContext and translate
>   platform events to MCP notifications.
>
> The typical flow is: BridgeClient uses `PlatformAdapter` for platform features
> and `BridgeTransport` (not `McpAppsAdapter`) for message transport. The
> `McpAppsAdapter` exists for edge cases where the transport IS the platform
> bridge itself (e.g., a platform that provides its own message channel).

### McpAppsAdapter (Low-Level Transport)

```typescript
// core/adapter.ts

/**
 * Low-level transport adapter. Replaces the iframe postMessage channel
 * with a platform-specific communication mechanism.
 */
export interface McpAppsAdapter {
  /** Platform identifier (e.g. "telegram", "line"). */
  readonly platform: string;

  /** Initialize with platform config. Must be called first. */
  init(config: AdapterConfig): Promise<void>;

  /** Send a JSON-RPC message from the MCP App to the host. */
  sendToHost(message: McpAppsMessage): void;

  /** Register handler for messages from the host to the MCP App. */
  onMessageFromHost(handler: (message: McpAppsMessage) => void): void;

  /** Tear down the adapter. After this, the adapter must not be reused. */
  destroy(): void;
}
```

### PlatformAdapter (High-Level Platform Features)

```typescript
// core/adapter.ts

/**
 * High-level platform adapter. Abstracts platform SDK features (theme,
 * viewport, auth, native UI) into a uniform interface for BridgeClient.
 */
export interface PlatformAdapter {
  readonly name: string;

  /** Initialize the platform SDK and return initial HostContext. */
  initialize(): Promise<HostContext>;

  /** Get current theme from platform. */
  getTheme(): 'light' | 'dark';

  /** Get current container dimensions from platform. */
  getContainerDimensions(): ContainerDimensions;

  /** Subscribe to platform lifecycle events. */
  onLifecycleEvent(handler: (event: LifecycleEvent) => void): void;

  /** Open an external link using platform's native method. */
  openLink(url: string): Promise<void>;

  /** Send a message via platform's native messaging (optional). */
  sendMessage?(text: string): Promise<void>;

  /** Get platform-specific auth data for forwarding (optional). */
  getAuthData?(): Record<string, unknown>;
}
```

### When to Use Which

| Scenario | Use | Why |
|----------|-----|-----|
| Build HostContext for ui/initialize | `PlatformAdapter` | Theme, viewport, locale, safe areas |
| Forward tool calls to resource server | `BridgeTransport` | Standard WebSocket transport |
| Open external link from MCP App | `PlatformAdapter` | `Telegram.WebApp.openLink()` |
| Platform without WebSocket but with native bridge | `McpAppsAdapter` | Transport IS the platform SDK |
| Translate platform events to MCP notifications | `PlatformAdapter` | Lifecycle events |

### Telegram Adapter

```typescript
// adapters/telegram/adapter.ts
// Implements BOTH McpAppsAdapter and PlatformAdapter
export class TelegramAdapter implements PlatformAdapter { ... }
```

### LINE LIFF Adapter

```typescript
// adapters/line/adapter.ts
export class LineLiffAdapter implements PlatformAdapter { ... }
```

## Server Module (`@casys/mcp-apps-bridge/server`)

### Resource Server

```typescript
// server/resource-server.ts

export interface ResourceServerOptions {
  /** MCP server connection URL */
  mcpServerUrl: string;

  /** Platform to serve for */
  platform: 'telegram' | 'line';

  /** Port to listen on */
  port?: number;

  /** Platform-specific config */
  platformConfig?: Record<string, unknown>;
}

export class ResourceServer {
  constructor(private options: ResourceServerOptions) {}

  /** Start the HTTP server */
  async start(): Promise<void> { ... }

  /** Stop the server */
  async stop(): Promise<void> { ... }
}
```

### Usage Example

```typescript
import { ResourceServer } from '@casys/mcp-apps-bridge/server';

const server = new ResourceServer({
  mcpServerUrl: 'http://localhost:3001/mcp',
  platform: 'telegram',
  port: 3002,
  platformConfig: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
  },
});

await server.start();
// Now Telegram Mini App can load http://localhost:3002/app/get-time/mcp-app.html
```

## CLI Module (`@casys/mcp-apps-bridge/cli`)

### Commands

```bash
# Scaffold a new bridge project
npx @casys/mcp-apps-bridge init --platform telegram --mcp-server ./my-mcp-server

# Serve an existing MCP server with bridge
npx @casys/mcp-apps-bridge serve --mcp http://localhost:3001/mcp --platform telegram --port 3002

# Validate bridge configuration
npx @casys/mcp-apps-bridge validate --config bridge.config.ts
```

### Configuration File

```typescript
// bridge.config.ts
import { defineConfig } from '@casys/mcp-apps-bridge';

export default defineConfig({
  mcpServer: {
    url: 'http://localhost:3001/mcp',
    // OR
    command: 'node server.js',
    transport: 'http',  // 'http' | 'stdio'
  },
  platform: 'telegram',
  platformConfig: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
  },
  server: {
    port: 3002,
    host: '0.0.0.0',
  },
});
```

## Export Map

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./core": "./src/core/index.ts",
    "./adapters/telegram": "./src/adapters/telegram.ts",
    "./adapters/line": "./src/adapters/line.ts",
    "./server": "./src/server/index.ts",
    "./cli": "./src/cli/index.ts"
  }
}
```
