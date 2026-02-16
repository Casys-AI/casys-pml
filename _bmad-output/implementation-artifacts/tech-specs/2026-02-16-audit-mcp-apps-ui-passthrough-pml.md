# Audit: MCP Apps UI Passthrough via PML Package

**Date**: 2026-02-16
**Severity**: CRITICAL
**Baseline commit**: `0d4b47e8`

---

## Executive Summary

Individual MCP servers (lib/std, lib/plm, lib/syson) correctly return UI via the MCP Apps protocol (`_meta.ui.resourceUri` + `resources/read`). When these servers are aggregated through the PML package (`pml stdio`), **the UI never renders in Claude Desktop**.

**Root cause**: A deterministic race condition in PML's stdio mode causes resource registration to silently fail after transport connection. Resources are never declared in server capabilities, and `resources/read` handlers are never installed.

---

## How the Protocol Works (Nominal Flow)

```
┌──────────────┐    tools/call     ┌─────────┐    resources/read    ┌─────────┐
│ Claude       │ ──────────────→   │ MCP     │ ←─────────────────   │ Claude  │
│ Desktop      │ ←── _meta.ui ──   │ Server  │ ──── HTML ────────→  │ Desktop │
│              │    resourceUri    │         │                      │ (iframe)│
└──────────────┘                   └─────────┘                      └─────────┘
```

1. Server returns `_meta.ui.resourceUri` (e.g., `ui://mcp-std/metrics-panel`) in `tools/call` response
2. Claude Desktop calls `resources/read` with that URI
3. Server serves the HTML content (`text/html;profile=mcp-app`)
4. Claude Desktop renders in an iframe

---

## What Works

### Individual MCP Servers (Direct Connection)

`lib/plm/server.ts` registers resources **synchronously before `start()`**:

```typescript
// lib/plm/server.ts:87-112 — resources registered BEFORE start()
for (const tool of toolsClient.listTools()) {
  const ui = tool._meta?.ui;
  if (ui?.resourceUri) {
    server.registerResource({ uri: ui.resourceUri, ... }, handler);
  }
}
// Line 139: await server.start()  ← AFTER resources are registered
```

Timeline: `registerResource()` → `registerCapabilities({ resources: {} })` → `start()` → `connect(transport)`

Result: capabilities include `resources`, handlers installed, Claude Desktop can call `resources/read`.

### PML tools/call Response (_meta.ui Propagation)

The sandbox execution pipeline correctly collects and propagates `_meta.ui`:

| Step | File | What happens |
|------|------|-------------|
| 1. Tool call | `sandbox-executor.ts:207` | `extractUiMeta(result)` extracts `_meta.ui` from child server response |
| 2. Collection | `sandbox-executor.ts:210` | `collectedUi.push({ source, resourceUri, context })` |
| 3. Response | `response-builder.ts:49-58` | Single UI: `mcpResult._meta = { ui: { resourceUri } }` |
| 4. Response | `response-builder.ts:65-77` | Multi UI: composite HTML generated, `_meta.ui.html` inline |

The `_meta.ui.resourceUri` IS returned to Claude Desktop on `tools/call` responses.

---

## What Breaks: The Race Condition

### PML stdio Mode (packages/pml/)

`stdio-command.ts` lines 81-142:

```typescript
// Line 85: Fire-and-forget async IIFE — NOT awaited
(async () => {
  // Discovery: spawn child servers, handshake, tools/list, resources/read, sync
  // Takes 5-30 seconds typically
  const discoveryResults = await discoverAllMcpToolsWithTimeout(...);

  // Line 125: Register UI resources AFTER discovery completes
  for (const ui of result.uiHtml ?? []) {
    pmlServer.registerUiResource(ui.resourceUri, ui.content, ui.mimeType);
  }
})();

// Line 142: start() called IMMEDIATELY — no await on discovery
await pmlServer.start();
```

### The Kill Chain

```
T=0ms    ┌─ (async) Discovery starts — spawning child servers...
T=1ms    └─ pmlServer.start()
               └─ ConcurrentMCPServer.start()          [concurrent-server.ts:742]
                    └─ mcpServer.server.connect(transport)  [line 751]
                         └─ this.transport = transport       [SDK server/index.js]
                         └─ this.started = true              [line 753]

T=~5-30s ┌─ Discovery finishes
         └─ registerUiResource("ui://mcp-std/metrics-panel", html)  [pml-server.ts:360]
              └─ ConcurrentMCPServer.registerResource(...)           [concurrent-server.ts:654]
                   └─ this.mcpServer.registerResource(...)           [SDK mcp.js:476]
                        └─ setResourceRequestHandlers()              [SDK mcp.js:333]
                             └─ this.server.registerCapabilities(    [SDK mcp.js:340]
                                  { resources: { listChanged: true } }
                                )
                             └─ ❌ THROWS: "Cannot register capabilities
                                            after connecting to transport"
                                            [SDK server/index.js:90]

         └─ PmlServer.registerUiResource catch block                 [pml-server.ts:373]
              └─ logs: "already registered: ui://mcp-std/metrics-panel"  ← WRONG MESSAGE
              └─ (the actual error is "Cannot register capabilities after connecting")
```

### Consequences

| What | Status | Why |
|------|--------|-----|
| `resources` in server capabilities | ABSENT | `registerCapabilities` throws, never merges |
| `resources/list` handler | NOT INSTALLED | `setRequestHandler` never called |
| `resources/read` handler | NOT INSTALLED | `setRequestHandler` never called |
| `_meta.ui.resourceUri` in tools/call | PRESENT | Different code path (response-builder.ts) |
| ConcurrentMCPServer `.resources` Map | EMPTY | `this.resources.set()` at line 678 never reached |
| Claude Desktop UI rendering | BROKEN | Can't fetch HTML via resources/read |

### Why Individual Servers Work

| Server | Registration Timing | Works? |
|--------|-------------------|--------|
| lib/plm/server.ts | Before `start()` (sync) | YES |
| lib/std/server.ts | Before `start()` (sync) | YES |
| lib/syson/server.ts | Before `start()` (sync) | YES |
| packages/pml (stdio) | After `start()` (async discovery) | NO |
| packages/pml (HTTP) | After `startHttp()` (no SDK transport) | MAYBE* |

*HTTP mode doesn't connect SDK transport, so `registerCapabilities` doesn't throw. But HTTP mode isn't used with Claude Desktop.

---

## Secondary Issue: Silent Fallback

`PmlServer.registerUiResource()` at `pml-server.ts:360-378` violates the project's **no-silent-fallbacks policy** (`.claude/rules/no-silent-fallbacks.md`):

```typescript
registerUiResource(resourceUri: string, htmlContent: string, mimeType = "text/html"): void {
  try {
    this.server.registerResource(...);
  } catch (error) {
    // ❌ Catches ALL errors, logs wrong message
    this.config.logger.debug?.(
      `[pml-server] UI resource already registered: ${resourceUri}`,
    );
    // Real error: "Cannot register capabilities after connecting to transport"
    // Logged as: "already registered" — completely misleading
  }
}
```

This catch block was designed for duplicate URI errors, but it also swallows the critical `registerCapabilities` error, making the bug invisible in logs.

---

## Impact Assessment

### What Users See

1. Call `pml_execute` with a tool that has UI (e.g., metrics-panel, color-picker)
2. Get correct JSON result + `_meta.ui.resourceUri` in response
3. Claude Desktop sees resourceUri, tries to fetch HTML
4. `resources/read` fails — no handler registered
5. **No UI rendered** — user just sees raw JSON text

### What the Log Says

```
[pml] UI resource already registered: ui://mcp-std/metrics-panel  ← WRONG
```

### What Actually Happened

```
Error: Cannot register capabilities after connecting to transport
  at Server.registerCapabilities (node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:90:19)
  at McpServer.setResourceRequestHandlers (mcp.js:340:26)
  at McpServer.registerResource (mcp.js:482:18)
```

---

## Root Cause Analysis

The bug is at the intersection of 3 design decisions:

1. **Async discovery** — MCP child server discovery is fire-and-forget to avoid blocking stdio handshake. This is correct: Claude Desktop/Claude Code expects the `initialize` response quickly, and discovery can take 30+ seconds.

2. **Post-discovery resource registration** — UI HTML is fetched via `resources/read` on child servers during discovery, then re-registered on PML's own server. This happens AFTER `start()` by design (discovery is async).

3. **MCP SDK immutable capabilities** — `@modelcontextprotocol/sdk` v1.15.x enforces `registerCapabilities` before transport connection. This is by design in the SDK: capabilities are part of the `initialize` handshake and are declared once.

These three are fundamentally incompatible.

---

## Bug #2 (MODERATE): `ui_orchestration` Dropped by Parser

`parseExecuteLocallyResponse()` in `workflow-utils.ts:70-91` does NOT extract `ui_orchestration` from the server response, even though `ExecuteLocallyResponse` in `types.ts:82-85` declares it.

```typescript
// workflow-utils.ts:80-87 — ui_orchestration MISSING
return {
  status: parsed.status,
  code: parsed.code,
  client_tools: (parsed.client_tools ?? parsed.clientTools ?? []) as string[],
  tools_used: (parsed.tools_used ?? []) as ExecuteLocallyResponse["tools_used"],
  workflowId: (parsed.workflowId ?? parsed.workflow_id) as string | undefined,
  dag: parsed.dag as ExecuteLocallyResponse["dag"],
  // ❌ ui_orchestration never extracted → always undefined
};
```

**Impact**: `buildMcpLocalResult()` always receives `undefined` for orchestration. Multi-UI composites default to `{ layout: "stack", sync: [] }`. Custom layouts (split, tabs, grid) and sync rules from the capability DB are never used.

**Fix**: Add `ui_orchestration: parsed.ui_orchestration as ExecuteLocallyResponse["ui_orchestration"]` to the return object. One line.

---

## Fix Options

### Option A: Pre-declare resources capability (QUICK FIX, ~20 lines)

Register the `resources` capability and handlers BEFORE `start()`, even with empty resource list. Then populate the registry lazily as discovery completes.

**Where**: `ConcurrentMCPServer` constructor or a new `enableResources()` method.

**How**: Call `this.mcpServer.server.registerCapabilities({ resources: {} })` in the constructor when a flag like `expectResources: true` is set. Register the `resources/list` and `resources/read` handlers that read from `this.resources` Map (which gets populated later by discovery).

**Risk**: Low. The SDK allows handler registration before transport connection. The handlers reference `this.resources` which is the ConcurrentMCPServer's internal Map, populated asynchronously.

### Option B: Await discovery before start (SIMPLEST, ~5 lines)

```typescript
// stdio-command.ts — await discovery BEFORE start
const discoveryResults = await discoverAllMcpToolsWithTimeout(...);
// register resources
await pmlServer.start();
```

**Risk**: Claude Desktop/Claude Code may timeout waiting for `initialize` if discovery is slow. The 10-60s discovery window could be too long.

### Option C: Bypass SDK for resource registration (WORKAROUND, ~30 lines)

After `start()`, directly set request handlers on the SDK's low-level `Server` object instead of going through `McpServer.registerResource()`. This bypasses the `registerCapabilities` check.

**Risk**: Couples to SDK internals. May break on SDK updates.

### Recommendation

**Option A** is the right fix. It's idiomatic, clean, and doesn't change the async discovery architecture.

---

## Files Referenced

| File | Role |
|------|------|
| `packages/pml/src/cli/stdio-command.ts:85-142` | Race condition: async discovery + immediate start |
| `packages/pml/src/server/pml-server.ts:360-378` | Silent fallback in registerUiResource |
| `lib/server/src/concurrent-server.ts:640-681` | ConcurrentMCPServer.registerResource() |
| `lib/server/src/concurrent-server.ts:742-753` | start() connects transport |
| `node_modules/@modelcontextprotocol/sdk/.../server/index.js:88-93` | registerCapabilities throws after connect |
| `node_modules/@modelcontextprotocol/sdk/.../server/mcp.js:333-344` | setResourceRequestHandlers calls registerCapabilities |
| `packages/pml/src/execution/sandbox-executor.ts:206-216` | _meta.ui extraction (works fine) |
| `packages/pml/src/cli/shared/response-builder.ts:36-80` | _meta.ui propagation (works fine) |
| `packages/pml/src/discovery/mcp-discovery.ts:527-570` | fetchUiResources via resources/read on children |
| `lib/plm/server.ts:87-139` | Individual server — correct order (resources before start) |

---

## Verification Steps

To confirm this bug empirically:

1. Run `pml stdio` with debug logging
2. Look for `"UI resource already registered"` log messages
3. These indicate the silent failure (actual error swallowed)
4. Run `resources/list` on the PML server — expect empty result
5. Compare with `deno run --allow-all lib/plm/server.ts` directly — `resources/list` returns resources

---

*Report generated by audit of MCP Apps UI passthrough in PML package (packages/pml/).*
