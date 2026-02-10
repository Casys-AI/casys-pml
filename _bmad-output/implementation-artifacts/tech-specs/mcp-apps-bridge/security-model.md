---
title: 'Security Model'
parent: mcp-apps-bridge
---

# Security Model

## Trust Boundaries

```
┌──────────────────────────────────────────────────────────┐
│ Trust Zone 1: Platform (Telegram/LINE)                    │
│                                                           │
│  The messaging platform controls:                         │
│  - Webview container sandbox                              │
│  - User authentication (initData, LIFF token)            │
│  - Network access from webview                            │
│  - Native UI controls                                     │
│                                                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Trust Zone 2: MCP App (HTML in webview)             │   │
│  │                                                     │   │
│  │  The MCP App can:                                   │   │
│  │  - Call tools via bridge (controlled by server)     │   │
│  │  - Access platform SDK (limited by platform)        │   │
│  │  - Load external resources (limited by CSP)         │   │
│  │                                                     │   │
│  │  The MCP App CANNOT:                                │   │
│  │  - Access other webviews or tabs                    │   │
│  │  - Bypass CSP restrictions                          │   │
│  │  - Call tools not exposed by the MCP server         │   │
│  │  - Access platform auth tokens directly             │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
└────────────────────────────────┬──────────────────────────┘
                                 │ HTTPS/WSS
┌────────────────────────────────┼──────────────────────────┐
│ Trust Zone 3: Resource Server                             │
│                                                           │
│  The resource server:                                     │
│  - Validates all incoming JSON-RPC messages               │
│  - Enforces tool call allowlists                          │
│  - Sets CSP headers on served HTML                        │
│  - Manages sessions with timeout                          │
│  - Logs all tool calls for audit                          │
│                                                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Trust Zone 4: MCP Server                            │   │
│  │                                                     │   │
│  │  Standard MCP server, no changes needed.            │   │
│  │  Trusted by the resource server.                    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

## CSP Enforcement

### Standard MCP Apps CSP

The MCP Apps spec defines CSP metadata on resources:

```typescript
interface McpUiResourceCsp {
  connectDomains?: string[];    // Network requests
  resourceDomains?: string[];   // Static assets (scripts, images)
  frameDomains?: string[];      // Nested iframes
  baseUriDomains?: string[];    // Base URI
}
```

### Bridge CSP Implementation

The resource server translates `_meta.ui.csp` to HTTP `Content-Security-Policy` headers:

```typescript
function buildCsp(meta: McpUiResourceCsp | undefined, serverOrigin: string): string {
  const connectSrc = meta?.connectDomains?.length
    ? `connect-src 'self' ${serverOrigin} ${meta.connectDomains.join(' ')}`
    : `connect-src 'self' ${serverOrigin}`;

  const resourceSrc = meta?.resourceDomains?.length
    ? `script-src 'self' 'unsafe-inline' ${meta.resourceDomains.join(' ')}; style-src 'self' 'unsafe-inline' ${meta.resourceDomains.join(' ')}; img-src 'self' data: ${meta.resourceDomains.join(' ')}; media-src 'self' data: ${meta.resourceDomains.join(' ')}`
    : `script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:`;

  const frameSrc = meta?.frameDomains?.length
    ? `frame-src ${meta.frameDomains.join(' ')}`
    : `frame-src 'none'`;

  return [
    `default-src 'none'`,
    resourceSrc,
    connectSrc,
    frameSrc,
    `object-src 'none'`,
  ].join('; ');
}
```

**Important:** The resource server MUST add its own origin to `connect-src` so the bridge WebSocket works.

### Default CSP (No Metadata)

When `_meta.ui.csp` is omitted:

```
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
media-src 'self' data:;
connect-src 'self' <resource-server-origin>;
object-src 'none';
frame-src 'none';
```

## Authentication Flow

### Telegram

```
1. User opens Mini App in Telegram
2. Telegram injects initData (HMAC-SHA256 signed)
3. Bridge adapter reads Telegram.WebApp.initData
4. Bridge sends initData to resource server on connect
5. Resource server validates HMAC:
   secret_key = HMAC_SHA256(bot_token, "WebAppData")
   expected = HMAC_SHA256(data_check_string, secret_key)
   Compare with hash from initData
6. If valid, session is authenticated
7. Resource server can pass user info to MCP server as tool call metadata
```

### LINE LIFF

```
1. User opens LIFF app in LINE
2. LIFF SDK auto-authenticates (in-app browser)
3. Bridge reads liff.getAccessToken()
4. Bridge sends access token to resource server
5. Resource server validates token via LINE API
6. Session is authenticated
```

### Security Principle: Auth Data Never Reaches MCP App

The MCP App HTML never sees raw auth tokens. The bridge adapter sends auth data directly to the resource server over WebSocket. The MCP App only interacts through the JSON-RPC protocol — it calls tools and receives results. Auth is handled at the transport layer, invisible to the app.

## Tool Call Authorization

The resource server can restrict which tools the MCP App can call:

```typescript
interface BridgeSecurityPolicy {
  /** Allowlist of tool names the app can call. Empty = all allowed. */
  allowedTools?: string[];

  /** Maximum tool calls per session */
  maxToolCallsPerSession?: number;

  /** Maximum concurrent tool calls */
  maxConcurrentToolCalls?: number;

  /** Session timeout in milliseconds */
  sessionTimeout?: number;
}
```

### Fail-Fast on Unauthorized Tool Calls

```typescript
function validateToolCall(toolName: string, policy: BridgeSecurityPolicy): void {
  if (policy.allowedTools && policy.allowedTools.length > 0) {
    if (!policy.allowedTools.includes(toolName)) {
      throw new Error(
        `[ResourceServer] Tool "${toolName}" is not in the allowed list. ` +
        `Allowed tools: ${policy.allowedTools.join(', ')}. ` +
        `Add it to BridgeSecurityPolicy.allowedTools to permit access.`
      );
    }
  }
}
```

## Audit Logging

All JSON-RPC messages between the bridge and resource server are logged:

```typescript
interface AuditLogEntry {
  timestamp: string;
  sessionId: string;
  platform: string;
  direction: 'app->server' | 'server->app';
  method: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: JsonRpcError;
  userId?: string;  // From platform auth
}
```

This matches the MCP Apps spec requirement: "All View-host interaction via JSON-RPC messages in logs."

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Malicious MCP App calling unauthorized tools | Tool call allowlist on resource server |
| MCP App exfiltrating data via network | CSP restricts `connect-src` to declared domains |
| Session hijacking | Session IDs are per-WebSocket, expire on disconnect |
| Replay attacks on auth | Telegram: validate `auth_date` freshness. LINE: token expiry. |
| XSS in MCP App affecting platform | Platform webview sandbox isolates from Telegram/LINE UI |
| Resource server impersonation | HTTPS/WSS only in production |
| Denial of service via tool calls | `maxToolCallsPerSession` and `maxConcurrentToolCalls` limits |
