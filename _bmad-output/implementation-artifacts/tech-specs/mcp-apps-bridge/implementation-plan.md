---
title: 'Implementation Plan'
parent: mcp-apps-bridge
---

# Implementation Plan

## Phase 0: Project Setup (~0.5 day)

### Tasks

1. **Initialize project structure**
   ```
   lib/mcp-apps-bridge/
     src/
       core/
         types.ts          # JSON-RPC types
         transport.ts       # WebSocket transport
         bridge-client.ts   # Client-side bridge
         message-router.ts  # Message routing logic
         index.ts
       adapters/
         types.ts           # PlatformAdapter interface
         telegram.ts        # Telegram adapter
         index.ts
       server/
         resource-server.ts # HTTP + WS server
         session-manager.ts # Session lifecycle
         html-injector.ts   # Bridge script injection
         csp-builder.ts     # CSP header generation
         index.ts
       index.ts
     tests/
       core/
       adapters/
       server/
     deno.json
     package.json           # For npm distribution
     tsconfig.json
     README.md
   ```

2. **Configure Deno project**
   - `deno.json` with tasks (test, build, lint)
   - Import maps for dependencies
   - TypeScript strict mode

3. **Dependencies**
   - `@modelcontextprotocol/sdk` (MCP client for resource server)
   - `@anthropic-ai/sdk` types (optional, for type references)
   - Zero runtime dependencies for the client-side bridge

### Exit Criteria
- Project builds with `deno check`
- Tests run with `deno test`
- All directories and empty module files created

## Phase 1: Core Protocol Layer (~3 days)

### Tasks

1. **JSON-RPC types and parser** (`core/types.ts`)
   - Request, Response, Notification types
   - Type guards: `isRequest()`, `isResponse()`, `isNotification()`
   - Serialization/deserialization with validation

2. **Transport abstraction** (`core/transport.ts`)
   - `BridgeTransport` interface
   - `WebSocketTransport` implementation
   - Connection lifecycle (connect, disconnect, reconnect)
   - Error handling with fail-fast (no silent reconnection)

3. **Message router** (`core/message-router.ts`)
   - Route incoming messages to handlers by method
   - Pending request tracking (match responses to requests by ID)
   - Timeout for unanswered requests (fail-fast, no silent hang)

4. **Bridge client** (`core/bridge-client.ts`)
   - PostMessage interception
   - MessageEvent dispatch to App class
   - Platform event translation

### Tests
- JSON-RPC parser: valid/invalid messages, edge cases
- Transport: connect/disconnect lifecycle, error handling
- Message router: routing, timeout, concurrent requests
- Bridge client: postMessage interception (JSDOM)

### Exit Criteria
- All core types exported
- Transport connects and sends/receives messages
- Bridge client intercepts postMessage and routes through transport

## Phase 2: Telegram Adapter (~4 days)

### Tasks

1. **TelegramAdapter class** (`adapters/telegram.ts`)
   - SDK detection with fail-fast
   - `initialize()` -> `HostContext` mapping
   - Theme mapping (colorScheme + themeParams -> CSS variables)
   - Viewport mapping (viewportStableHeight, safeAreaInset)
   - Event listeners (themeChanged, viewportChanged, activated, deactivated)

2. **Telegram-specific capabilities**
   - MainButton integration (optional, exposed as custom JSON-RPC)
   - BackButton integration
   - Fullscreen request mapping

3. **Telegram auth validation** (server-side)
   - HMAC-SHA256 validation of initData
   - auth_date freshness check
   - User extraction from validated data

4. **Integration with bridge client**
   - Wire TelegramAdapter into BridgeClient
   - End-to-end message flow test

### Tests
- Adapter init with mock Telegram.WebApp
- Theme mapping correctness
- Auth validation (valid/invalid/expired)
- Event forwarding

### Exit Criteria
- TelegramAdapter correctly maps all Telegram state to HostContext
- Auth validation works with known test vectors
- Events translate to MCP notifications

## Phase 3: Resource Server (~2 days)

### Tasks

1. **HTTP server** (`server/resource-server.ts`)
   - Serve MCP App HTML at `/app/:resourceUri`
   - WebSocket endpoint at `/bridge`
   - Health check at `/health`

2. **MCP client integration**
   - Connect to MCP server on startup
   - `tools/list` -> discover UI-enabled tools
   - `resources/read` -> fetch `ui://` resources
   - `tools/call` -> forward tool calls from bridge

3. **HTML injection** (`server/html-injector.ts`)
   - Parse HTML
   - Inject bridge.js script tag
   - Inject platform adapter script tag
   - Inject initialization script with session ID and server URL

4. **CSP builder** (`server/csp-builder.ts`)
   - Read `_meta.ui.csp` from resource metadata
   - Generate HTTP Content-Security-Policy header
   - Add resource server origin to connect-src

5. **Session manager** (`server/session-manager.ts`)
   - Create session on WebSocket connect
   - Track active tool calls per session
   - Session timeout with cleanup
   - Audit logging

### Tests
- HTML injection correctness
- CSP generation from metadata
- Session lifecycle (create, timeout, cleanup)
- End-to-end: mock MCP server -> resource server -> mock bridge client

### Exit Criteria
- Resource server starts and connects to MCP server
- Serves HTML with injected bridge script
- WebSocket bridge forwards tool calls and returns results
- CSP headers correctly set

## Phase 4: End-to-End Integration (~2 days)

### Tasks

1. **Example MCP App**
   - Use the `get-time` example from the MCP Apps spec
   - Verify it works with the resource server

2. **Telegram Mini App testing**
   - Set up test Telegram Bot
   - Configure Mini App URL (via cloudflared or ngrok)
   - Test in Telegram mobile client
   - Verify: init, theme, tool call, viewport

3. **Documentation**
   - README.md with quick start
   - Example project
   - Platform setup guides (Telegram BotFather steps)

4. **Bug fixes and polish**
   - Edge cases from real-device testing
   - Error messages improvement
   - Logging cleanup

### Exit Criteria
- `get-time` MCP App works in Telegram Mini App
- Tool calls work bidirectionally
- Theme and viewport are correct
- README enables someone to set up in < 30 minutes

## Phase 5: LINE LIFF Adapter (~3 days, post-MVP)

### Tasks

1. **LineLiffAdapter class** (`adapters/line.ts`)
2. **LIFF SDK integration**
3. **Token validation on server**
4. **End-to-end testing in LINE**

## Phase 6: CLI Scaffold (~2 days, post-MVP)

### Tasks

1. **`init` command** — scaffold a bridge project
2. **`serve` command** — run resource server for an existing MCP server
3. **`validate` command** — check configuration

## Timeline Summary

| Phase | Duration | Dependency | Status |
|-------|----------|-----------|--------|
| P0: Project Setup | 0.5d | None | **Done** (2026-02-09) |
| P1: Core Protocol | 3d | P0 | **Done** (2026-02-09) — 87 tests |
| P2: Telegram Adapter | 4d | P1 | **Done** (2026-02-09) — 13 tests, theme+viewport+auth |
| P3: Resource Server | 2d | P1 | **Done** (2026-02-09) — HTTP+WS+CSP+sessions+auth |
| P4: E2E Integration | 2d | P2 + P3 | **Done** (2026-02-10) — demo-bot Telegram, color-picker UI |
| P4b: Real Traces | 1d | P4 | **Done** (2026-02-10) — workflowId propagation, GET /api/traces/:id |
| **MVP Total** | **~12.5d** | | **COMPLETE** — 107 tests, 0 lint |
| P5: LINE LIFF | 3d | P4 | Post-MVP (stub adapter exists) |
| P6: CLI | 2d | P4 | Post-MVP |

**Note:** P2 (Telegram Adapter) and P3 (Resource Server) can be developed in parallel since they share only the `PlatformAdapter` interface from P1.

## Implementation Notes (discovered during development)

### N1: `event.source` — The `_realPostMessage` Fix

**Problem:** The MCP Apps SDK (`@modelcontextprotocol/ext-apps`) checks `event.source === window.parent` when receiving `MessageEvent`s. Using `window.dispatchEvent(new MessageEvent(...))` leaves `event.source` as `null`, causing the SDK to silently ignore all messages from the bridge.

**Solution:** Save a reference to the real `window.postMessage` before monkey-patching, and use it in `dispatchToApp()`:

```javascript
var _realPostMessage = window.postMessage.bind(window);
// ... monkey-patch window.postMessage or window.parent.postMessage ...

function dispatchToApp(message) {
  _realPostMessage(message, "*"); // event.source === window (=== window.parent in standalone)
}
```

This was discovered via Chrome DevTools console showing `"Ignoring message from unknown source MessageEvent"`.

### N2: Early Notification Queue (Timing Fix)

**Problem:** The resource server flushes `ui/notifications/tool-result` immediately when the WebSocket connects, but the MCP App hasn't called `ui/initialize` yet. The App SDK ignores notifications received before initialization.

**Solution:** `bridge.js` queues notifications received before `ui/initialize` completes, then flushes them after the init response is dispatched:

```javascript
var appInitialized = false;
var earlyNotifications = [];

// In handleInitialize(), after dispatching the init response:
appInitialized = true;
for (var i = 0; i < earlyNotifications.length; i++) {
  dispatchToApp(earlyNotifications[i]);
}
earlyNotifications = [];
```

### N3: Opaque `?ref=` Tool Result Pattern

**Problem:** Tool results (from bot LLM execution) need to reach the MCP App UI. Embedding data in the URL (base64) is messy and has size limits.

**Solution:** Server-side store with opaque ref IDs:
1. Bot calls `resourceServer.storeToolResult(data)` → returns `"f3f69e72"` (8 hex chars)
2. Bot sends URL `https://bridge/ui?uri=ui://...&ref=f3f69e72` to Telegram
3. `serveProxiedHtml()` auto-extracts `?ref=`, looks up the stored result, buffers as `ui/notifications/tool-result` on the session
4. When WS connects → server flushes → bridge.js queues → app initializes → bridge.js delivers

Results auto-expire after 5 minutes. The `onHttpRequest` handler doesn't need to handle `?ref=` at all — it's automatic.

### N4: workflowId Propagation for Real Execution Traces

**Problem:** The demo bot needed to display real PML execution traces (from TraceSyncer) in the TraceViewer MCP App. But `buildMcpLocalResult()` only included `workflow_id` in `approval_required` responses, not in `success` or `error`.

**Solution (3 parts):**

1. **`buildMcpLocalResult()` fix** (`packages/pml/src/cli/shared/response-builder.ts`): Added optional `workflowId` parameter. Now included in all 3 response types (success, error, approval). 4 call sites updated (serve × 2, stdio × 2).

2. **`GET /api/traces/:id` endpoint** (`src/api/traces.ts`): New endpoint using existing `ExecutionTraceStore.getTraceById()`. Also fixed `UUID_REGEX` in `src/api/types.ts` to accept UUIDv7 (PML uses timestamp-based v7 UUIDs).

3. **Bot `fetchOrBuildTrace()`** (`telegram-bot.ts`): Extracts `workflowId` from PML response, fetches real trace via API with 3× retry (TraceSyncer flushes async), falls back to synthetic trace if unavailable.

**Flow:** PML execute → workflowId in MCP response → TraceSyncer flush to DB → bot GET /api/traces/:id → TraceViewer displays real trace.

### N5: LLM Model Selection for Tool Calling

**Problem:** `gpt-5-nano` (Aider 48.4%) produces "fake tool calls" — outputs JSON as text instead of invoking function calling. The bot responded with SQL examples instead of executing queries.

**Solution:**
- Default model changed to `gpt-5-mini` (much better at structured tool use)
- `tool_choice: "required"` on first LLM turn (matches playground pattern in `chat.ts:418`)
- System prompt enriched with PML context (capabilities, rules, examples)

### N6: Telegram localhost Limitation

**Problem:** Telegram rejects `http://localhost` URLs everywhere: inline keyboard buttons, `<a href>` links, even raw URLs in messages. Impossible to test Mini App buttons in local dev.

**Solution:** In production, use `BRIDGE_URL=https://...` (reverse proxy). Buttons use `web_app: { url }` for HTTPS, plain `url:` for non-localhost HTTP. No workaround for dev — must deploy with HTTPS to test buttons.
