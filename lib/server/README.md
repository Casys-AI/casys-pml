# @casys/mcp-server

Production-grade MCP server framework for Deno. The **"Hono for MCP"** -- composable middleware, OAuth2 auth, dual transport, and everything you need to ship reliable MCP servers.

Built on the official [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk).

## Installation

```bash
# Deno
deno add jsr:@casys/mcp-server

# npm (via JSR)
npx jsr add @casys/mcp-server
```

## Features

| Feature | Description |
|---------|-------------|
| **Dual Transport** | STDIO + Streamable HTTP (SSE, sessions) |
| **Middleware Pipeline** | Composable onion model (like Hono/Koa) |
| **OAuth2 Auth** | JWT/Bearer validation, RFC 9728 metadata |
| **OIDC Presets** | GitHub Actions, Google, Auth0, generic OIDC |
| **YAML + Env Config** | File-based config with env var overrides |
| **Concurrency Control** | RequestQueue with 3 backpressure strategies |
| **Rate Limiting** | Sliding window, per-client, with timeout |
| **Schema Validation** | JSON Schema (ajv), compiled at registration |
| **MCP Apps** | Resources with `ui://` scheme (SEP-1865) |
| **Sampling Bridge** | Bidirectional LLM delegation (SEP-1577) |

## Quick Start

### Basic Server (STDIO)

```typescript
import { ConcurrentMCPServer } from "@casys/mcp-server";

const server = new ConcurrentMCPServer({
  name: "my-server",
  version: "1.0.0",
});

server.registerTool(
  {
    name: "greet",
    description: "Greet a user",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  ({ name }) => `Hello, ${name}!`,
);

await server.start(); // STDIO transport
```

### HTTP Server with Auth

```typescript
import {
  ConcurrentMCPServer,
  createGoogleAuthProvider,
} from "@casys/mcp-server";

const server = new ConcurrentMCPServer({
  name: "my-api",
  version: "1.0.0",
  maxConcurrent: 10,
  backpressureStrategy: "queue",
  validateSchema: true,
  rateLimit: { maxRequests: 100, windowMs: 60_000 },
  auth: {
    provider: createGoogleAuthProvider({
      audience: "https://my-mcp.example.com",
      resource: "https://my-mcp.example.com",
    }),
  },
});

server.registerTool(
  {
    name: "query",
    description: "Query the database",
    inputSchema: { type: "object", properties: { sql: { type: "string" } } },
    requiredScopes: ["db:read"], // Scope enforcement
  },
  async ({ sql }) => ({ rows: [] }),
);

await server.startHttp({ port: 3000 });
```

### YAML Config (Binary Distribution)

When distributing as a compiled binary, users configure auth via `mcp-server.yaml`:

```yaml
# mcp-server.yaml
auth:
  provider: auth0
  audience: https://my-mcp.example.com
  resource: https://my-mcp.example.com
  domain: my-tenant.auth0.com
  scopesSupported:
    - read
    - write
    - admin
```

Env vars override YAML values for deployment flexibility:

```bash
MCP_AUTH_AUDIENCE=https://prod.example.com ./my-server --http --port 3000
```

Priority: `programmatic > env vars > YAML > no auth`

### Custom Middleware

```typescript
import { ConcurrentMCPServer } from "@casys/mcp-server";
import type { Middleware } from "@casys/mcp-server";

const logging: Middleware = async (ctx, next) => {
  const start = performance.now();
  console.log(`-> ${ctx.toolName}`);
  const result = await next();
  console.log(`<- ${ctx.toolName} (${(performance.now() - start).toFixed(0)}ms)`);
  return result;
};

const server = new ConcurrentMCPServer({ name: "my-server", version: "1.0.0" });

server.use(logging);       // Custom middlewares run between rate-limit and validation
server.registerTool(/* ... */);
await server.startHttp({ port: 3000 });
```

Pipeline order: `rate-limit -> auth -> custom middlewares -> scope-check -> validation -> backpressure -> handler`

### MCP Apps (UI Resources)

```typescript
import { ConcurrentMCPServer, MCP_APP_MIME_TYPE } from "@casys/mcp-server";

const server = new ConcurrentMCPServer({ name: "my-server", version: "1.0.0" });

server.registerResource(
  { uri: "ui://my-server/viewer", name: "Data Viewer", description: "Interactive data viewer" },
  async (uri) => ({
    uri: uri.toString(),
    mimeType: MCP_APP_MIME_TYPE,
    text: "<html><body>...</body></html>",
  }),
);
```

## API Reference

### ConcurrentMCPServer

```typescript
const server = new ConcurrentMCPServer(options: ConcurrentServerOptions);

// Registration (must be called before start)
server.registerTool(tool: MCPTool, handler: ToolHandler): void;
server.registerTools(tools: MCPTool[], handlers: Map<string, ToolHandler>): void;
server.registerResource(resource: MCPResource, handler: ResourceHandler): void;
server.registerResources(resources: MCPResource[], handlers: Map<string, ResourceHandler>): void;
server.use(middleware: Middleware): this;

// Transport
await server.start();                              // STDIO
await server.startHttp(options: HttpServerOptions); // HTTP
await server.stop();                                // Graceful shutdown

// Monitoring
server.getMetrics(): QueueMetrics;                 // { inFlight, queued }
server.getRateLimitMetrics(): { keys, totalRequests } | null;
server.getToolCount(): number;
server.getToolNames(): string[];
server.getResourceCount(): number;
server.getResourceUris(): string[];

// SSE (Streamable HTTP)
server.sendToSession(sessionId: string, message: Record<string, unknown>): void;
server.broadcastNotification(method: string, params?: Record<string, unknown>): void;
server.getSSEClientCount(): number;
```

### ConcurrentServerOptions

```typescript
interface ConcurrentServerOptions {
  name: string;
  version: string;
  maxConcurrent?: number;            // Default: 10
  backpressureStrategy?: "sleep" | "queue" | "reject";
  backpressureSleepMs?: number;      // Default: 10
  rateLimit?: RateLimitOptions;
  validateSchema?: boolean;          // Default: false
  enableSampling?: boolean;
  samplingClient?: SamplingClient;
  logger?: (msg: string) => void;    // Default: console.error
  auth?: AuthOptions;                // OAuth2/Bearer config
}
```

### Auth Presets

```typescript
import {
  createGitHubAuthProvider,  // GitHub Actions OIDC
  createGoogleAuthProvider,  // Google OIDC
  createAuth0AuthProvider,   // Auth0 (requires domain)
  createOIDCAuthProvider,    // Generic OIDC
} from "@casys/mcp-server";

// Google
const google = createGoogleAuthProvider({
  audience: "https://my-mcp.example.com",
  resource: "https://my-mcp.example.com",
});

// Auth0
const auth0 = createAuth0AuthProvider({
  domain: "my-tenant.auth0.com",
  audience: "https://my-mcp.example.com",
  resource: "https://my-mcp.example.com",
  scopesSupported: ["read", "write"],
});

// Custom OIDC
const custom = createOIDCAuthProvider({
  issuer: "https://my-idp.example.com",
  audience: "https://my-mcp.example.com",
  resource: "https://my-mcp.example.com",
  authorizationServers: ["https://my-idp.example.com"],
});
```

### JwtAuthProvider

For advanced use cases, use `JwtAuthProvider` directly:

```typescript
import { JwtAuthProvider } from "@casys/mcp-server";

const provider = new JwtAuthProvider({
  issuer: "https://accounts.google.com",
  audience: "https://my-mcp.example.com",
  resource: "https://my-mcp.example.com",
  authorizationServers: ["https://accounts.google.com"],
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs", // Optional, derived from issuer
  scopesSupported: ["read", "write"],
});

const authInfo = await provider.verifyToken(token);
// { subject, clientId, scopes, claims, expiresAt } | null
```

### Config Loader

```typescript
import { loadAuthConfig, createAuthProviderFromConfig } from "@casys/mcp-server";

// Auto-loads from mcp-server.yaml + MCP_AUTH_* env vars
const config = await loadAuthConfig();
if (config) {
  const provider = createAuthProviderFromConfig(config);
}
```

Env variables: `MCP_AUTH_PROVIDER`, `MCP_AUTH_AUDIENCE`, `MCP_AUTH_RESOURCE`, `MCP_AUTH_DOMAIN`, `MCP_AUTH_ISSUER`, `MCP_AUTH_JWKS_URI`, `MCP_AUTH_SCOPES` (space-separated).

### RFC 9728 (Protected Resource Metadata)

When auth is configured on an HTTP server, the framework automatically exposes:

```
GET /.well-known/oauth-protected-resource
```

Returns JSON metadata per [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728):

```json
{
  "resource": "https://my-mcp.example.com",
  "authorization_servers": ["https://accounts.google.com"],
  "scopes_supported": ["read", "write"],
  "bearer_methods_supported": ["header"]
}
```

## Standalone Components

### RateLimiter

```typescript
import { RateLimiter } from "@casys/mcp-server";

const limiter = new RateLimiter({ maxRequests: 10, windowMs: 1000 });

if (limiter.checkLimit("client-123")) {
  // Proceed
}

// Or wait (with timeout = windowMs)
await limiter.waitForSlot("client-123");
```

### RequestQueue

```typescript
import { RequestQueue } from "@casys/mcp-server";

const queue = new RequestQueue({ maxConcurrent: 5, strategy: "queue", sleepMs: 10 });

await queue.acquire();
try {
  // Process request
} finally {
  queue.release();
}
```

### SchemaValidator

```typescript
import { SchemaValidator } from "@casys/mcp-server";

const validator = new SchemaValidator();
validator.addSchema("my_tool", {
  type: "object",
  properties: { count: { type: "number" } },
  required: ["count"],
});

const result = validator.validate("my_tool", { count: 5 });
// { valid: true, errors: [] }
```

## Metrics

```typescript
server.getMetrics();          // { inFlight: 3, queued: 2 }
server.getRateLimitMetrics(); // { keys: 5, totalRequests: 42 }
server.getSSEClientCount();   // 3
```

## License

MIT
