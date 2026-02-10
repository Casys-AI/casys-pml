---
title: 'Testing Strategy'
parent: mcp-apps-bridge
---

# Testing Strategy

## Test Pyramid

```
         ┌─────────┐
         │  E2E    │  2-3 scenarios (real Telegram, real MCP server)
         │ (Real)  │
        ┌┴─────────┴┐
        │Integration │  10-15 tests (resource server + mock MCP)
        │            │
       ┌┴────────────┴┐
       │    Unit       │  40-60 tests (core, adapters, server modules)
       │               │
       └───────────────┘
```

## Unit Tests

### Core Module

| Test File | Coverage |
|-----------|----------|
| `core/types.test.ts` | JSON-RPC parsing, type guards, validation |
| `core/transport.test.ts` | WebSocket lifecycle, send/receive, error handling |
| `core/message-router.test.ts` | Method routing, pending requests, timeouts |
| `core/bridge-client.test.ts` | postMessage interception, message dispatch |

#### Example: JSON-RPC Type Guards

```typescript
Deno.test('isRequest identifies valid request', () => {
  const msg = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} };
  assertEquals(isRequest(msg), true);
});

Deno.test('isRequest rejects notification (no id)', () => {
  const msg = { jsonrpc: '2.0', method: 'tools/call', params: {} };
  assertEquals(isRequest(msg), false);
});

Deno.test('isRequest rejects wrong jsonrpc version', () => {
  const msg = { jsonrpc: '1.0', id: 1, method: 'tools/call' };
  assertEquals(isRequest(msg), false);
});
```

#### Example: Message Router Timeout

```typescript
Deno.test('message router times out pending request', async () => {
  const router = new MessageRouter({ requestTimeout: 100 });
  const promise = router.sendRequest({ method: 'tools/call', params: {} });

  await assertRejects(
    () => promise,
    Error,
    'Request timed out after 100ms'
  );
});
```

### Adapter Module

| Test File | Coverage |
|-----------|----------|
| `adapters/telegram.test.ts` | SDK detection, theme mapping, auth validation |
| `adapters/line.test.ts` | LIFF init, token handling, capabilities |

#### Example: Telegram Adapter Fail-Fast

```typescript
Deno.test('TelegramAdapter throws if SDK not present', () => {
  // No window.Telegram.WebApp
  assertThrows(
    () => new TelegramAdapter(),
    Error,
    'Telegram.WebApp SDK not found'
  );
});
```

#### Example: Telegram Auth Validation

```typescript
Deno.test('validateTelegramInitData accepts valid HMAC', () => {
  const botToken = 'test-bot-token';
  const initData = buildTestInitData(botToken, { user_id: 123 });
  const result = validateTelegramInitData(initData, botToken);
  assertEquals(result.valid, true);
  assertEquals(result.userId, 123);
});

Deno.test('validateTelegramInitData rejects tampered data', () => {
  const botToken = 'test-bot-token';
  const initData = 'user=%7B%22id%22%3A123%7D&hash=invalid';
  const result = validateTelegramInitData(initData, botToken);
  assertEquals(result.valid, false);
});

Deno.test('validateTelegramInitData rejects expired data', () => {
  const botToken = 'test-bot-token';
  const oldDate = Math.floor(Date.now() / 1000) - 86400; // 24h ago
  const initData = buildTestInitData(botToken, { auth_date: oldDate });
  const result = validateTelegramInitData(initData, botToken, { maxAge: 3600 });
  assertEquals(result.valid, false);
});
```

### Server Module

| Test File | Coverage |
|-----------|----------|
| `server/html-injector.test.ts` | Script injection, edge cases |
| `server/csp-builder.test.ts` | CSP generation from metadata |
| `server/session-manager.test.ts` | Session lifecycle, timeout, cleanup |

#### Example: HTML Injection

```typescript
Deno.test('injectBridgeScript adds script before </body>', () => {
  const html = '<html><body><p>Hello</p></body></html>';
  const result = injectBridgeScript(html, {
    serverUrl: 'http://localhost:3002',
    platform: 'telegram',
    sessionId: 'abc123',
  });

  assertStringIncludes(result, '<script src="/bridge.js?platform=telegram');
  assertStringIncludes(result, 'abc123');
  // Script should be before </body>
  const scriptIdx = result.indexOf('<script src="/bridge.js');
  const bodyIdx = result.indexOf('</body>');
  assert(scriptIdx < bodyIdx);
});

Deno.test('injectBridgeScript handles HTML without </body>', () => {
  const html = '<html><p>No body tag</p></html>';
  const result = injectBridgeScript(html, {
    serverUrl: 'http://localhost:3002',
    platform: 'telegram',
    sessionId: 'abc123',
  });

  // Should append at end
  assertStringIncludes(result, '<script src="/bridge.js');
});
```

#### Example: CSP Builder

```typescript
Deno.test('buildCsp generates default CSP when no metadata', () => {
  const csp = buildCsp(undefined, 'http://localhost:3002');
  assertStringIncludes(csp, "default-src 'none'");
  assertStringIncludes(csp, "connect-src 'self' http://localhost:3002");
  assertStringIncludes(csp, "object-src 'none'");
});

Deno.test('buildCsp includes declared connect domains', () => {
  const csp = buildCsp(
    { connectDomains: ['https://api.example.com'] },
    'http://localhost:3002'
  );
  assertStringIncludes(csp, 'https://api.example.com');
  assertStringIncludes(csp, 'http://localhost:3002');
});
```

## Integration Tests

### Resource Server + Mock MCP Server

```typescript
Deno.test('resource server serves MCP App HTML with bridge', async () => {
  // Start mock MCP server that returns a test HTML resource
  const mockMcp = await startMockMcpServer({
    tools: [{ name: 'test-tool', _meta: { ui: { resourceUri: 'ui://test/app.html' } } }],
    resources: { 'ui://test/app.html': '<html><body>Test App</body></html>' },
  });

  // Start resource server connected to mock
  const server = new ResourceServer({
    mcpServerUrl: mockMcp.url,
    platform: 'telegram',
    port: 0, // random port
  });
  await server.start();

  // Fetch the app HTML
  const response = await fetch(`http://localhost:${server.port}/app/test/app.html`);
  const html = await response.text();

  // Verify bridge script injected
  assertStringIncludes(html, 'bridge.js');
  assertStringIncludes(html, 'Test App');

  // Verify CSP header set
  const csp = response.headers.get('Content-Security-Policy');
  assertExists(csp);

  await server.stop();
  await mockMcp.close();
});
```

### WebSocket Bridge + Tool Call Forwarding

```typescript
Deno.test('bridge forwards tool call to MCP server and returns result', async () => {
  const mockMcp = await startMockMcpServer({
    tools: [{ name: 'get-time' }],
    toolHandler: (name, args) => {
      if (name === 'get-time') {
        return { content: [{ type: 'text', text: '2026-02-09T12:00:00Z' }] };
      }
    },
  });

  const server = new ResourceServer({ mcpServerUrl: mockMcp.url, platform: 'telegram', port: 0 });
  await server.start();

  // Connect WebSocket
  const ws = new WebSocket(`ws://localhost:${server.port}/bridge?session=test`);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  // Send tools/call request
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'get-time', arguments: {} },
  }));

  // Receive response
  const response = await new Promise<MessageEvent>((resolve) => {
    ws.addEventListener('message', resolve, { once: true });
  });

  const data = JSON.parse(response.data);
  assertEquals(data.jsonrpc, '2.0');
  assertEquals(data.id, 1);
  assertEquals(data.result.content[0].text, '2026-02-09T12:00:00Z');

  ws.close();
  await server.stop();
  await mockMcp.close();
});
```

## End-to-End Tests

### E2E with Real Telegram Bot

**Manual test procedure** (cannot be fully automated):

1. Start MCP server with `get-time` tool
2. Start resource server with Telegram adapter
3. Expose via cloudflared/ngrok
4. Open Telegram, message the bot, open Mini App
5. Verify:
   - [ ] App loads and displays
   - [ ] Theme matches Telegram (light/dark)
   - [ ] Clicking "Get Server Time" calls the tool and shows result
   - [ ] Switching Telegram theme updates the app
   - [ ] Rotating device updates viewport
   - [ ] Back button works

### E2E with basic-host (Automated)

Use the MCP Apps `basic-host` example as an automated E2E test:

```typescript
Deno.test('e2e: MCP App works with basic-host via bridge', async () => {
  // This test verifies the protocol is compatible
  // by connecting the resource server to the basic-host test harness
  // ...
});
```

## Test Environment

### Mocking Platform SDKs

For unit/integration tests, mock the platform SDKs:

```typescript
// test-utils/mock-telegram.ts
export function mockTelegramWebApp(overrides?: Partial<TelegramWebApp>): void {
  (globalThis as any).window = {
    Telegram: {
      WebApp: {
        initData: 'test-init-data',
        initDataUnsafe: { user: { id: 123 } },
        version: '7.0',
        platform: 'android',
        colorScheme: 'dark',
        themeParams: {
          bg_color: '#1c1c1e',
          text_color: '#ffffff',
          secondary_bg_color: '#2c2c2e',
        },
        viewportHeight: 600,
        viewportStableHeight: 580,
        safeAreaInset: { top: 0, bottom: 34, left: 0, right: 0 },
        isExpanded: false,
        ready: () => {},
        expand: () => {},
        close: () => {},
        openLink: () => {},
        onEvent: () => {},
        offEvent: () => {},
        ...overrides,
      },
    },
  };
}
```

## CI Configuration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
      - run: deno check src/**/*.ts
      - run: deno test --allow-net --allow-read
      - run: deno lint
```
