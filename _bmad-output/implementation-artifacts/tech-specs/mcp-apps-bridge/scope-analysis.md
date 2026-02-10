---
title: 'Scope Analysis: @casys/mcp-apps-bridge'
created: '2026-02-09'
status: approved
---

# Scope Analysis: @casys/mcp-apps-bridge

## 1. Executive Summary

**Goal:** Build a TypeScript library that bridges MCP Apps (interactive UI in MCP hosts) to messaging platform webviews (Telegram Mini Apps, LINE LIFF, etc.).

**Core insight:** MCP Apps and Telegram Mini Apps use the *exact same architecture* — an iframe/webview running HTML+JS that communicates with a host via a message bridge. The protocol differs (JSON-RPC 2.0 postMessage vs Telegram.WebApp native SDK), but the pattern is identical:

```
[HTML App] <--bridge--> [Host Container]
     |                       |
  postMessage           WebApp SDK
  JSON-RPC 2.0         Native bridge
```

**Opportunity:** No existing library bridges MCP Apps UI to messaging platforms. KakaoTalk's PlayMCP only supports text tool results, not interactive UI (MCP Apps).

## 2. MCP Apps Protocol Summary

### Key Technical Facts (from spec SEP-1865)

| Aspect | Detail |
|--------|--------|
| Transport | JSON-RPC 2.0 over `postMessage` (iframe) |
| Resource scheme | `ui://` with MIME `text/html;profile=mcp-app` |
| Init handshake | `ui/initialize` request -> response -> `ui/notifications/initialized` |
| Tool linkage | `_meta.ui.resourceUri` on tool declarations |
| Security | Sandboxed iframe + CSP + permission grants |
| Host rendering | Double-iframe (sandbox proxy) for web hosts |
| App SDK | `@modelcontextprotocol/ext-apps` (`App` class) |
| Host SDK | `@modelcontextprotocol/ext-apps/app-bridge` (`AppBridge`) |
| Supported clients | Claude, Claude Desktop, VS Code Insiders, Goose, Postman, MCPJam |

### JSON-RPC Methods (App <-> Host)

**App -> Host requests:**
- `ui/initialize` (handshake)
- `tools/call` (invoke MCP server tools)
- `resources/read` (read MCP resources)
- `ui/open-link` (open external URL)
- `ui/message` (send message to chat)
- `ui/update-model-context` (update context for LLM)
- `ui/request-display-mode` (inline/fullscreen/pip)
- `notifications/message` (logging)

**Host -> App notifications:**
- `ui/notifications/tool-input` (tool arguments)
- `ui/notifications/tool-input-partial` (streaming args)
- `ui/notifications/tool-result` (tool execution result)
- `ui/notifications/tool-cancelled`
- `ui/notifications/host-context-changed` (theme, locale, etc.)
- `ui/notifications/size-changed`
- `ui/resource-teardown` (cleanup before disposal)

## 3. Platform Analysis

### Telegram Mini Apps

| Aspect | Detail | Bridge Complexity |
|--------|--------|-------------------|
| Container | Native webview (WKWebView/Android WebView) | LOW - same as iframe |
| Bridge | `Telegram.WebApp` SDK (injected global) | MEDIUM - translate to JSON-RPC |
| Init | SDK auto-init, `initData` with HMAC validation | LOW - map to `ui/initialize` |
| Data to bot | `sendData()` (4KB max, closes app) or `answerWebAppQuery()` | MEDIUM - different semantics |
| Events | `onEvent(type, handler)` / `offEvent()` | LOW - map to notifications |
| Storage | `CloudStorage` (1024 items), `DeviceStorage` (5MB), `SecureStorage` | N/A - not needed for bridge |
| UI controls | `MainButton`, `BackButton`, native popups | LOW - expose as capabilities |
| Auth | `initData` HMAC-SHA256 + Ed25519 signature | LOW - pass through |
| Viewport | `viewportHeight`, `safeAreaInset`, CSS vars | LOW - map to `containerDimensions` |
| Theme | `colorScheme`, `themeParams` | LOW - map to `hostContext.theme` |

**Key mapping:** `Telegram.WebApp` methods -> JSON-RPC notifications/requests.

### LINE LIFF

| Aspect | Detail | Bridge Complexity |
|--------|--------|-------------------|
| Container | WKWebView/Android WebView via LIFF browser | LOW |
| Bridge | `liff` SDK (npm package) | MEDIUM |
| Init | `liff.init()` async, requires LIFF ID | MEDIUM - different lifecycle |
| Data | `liff.sendMessages()` (fails after reload) | HIGH - fragile API |
| Auth | Auto-token in LIFF browser, OAuth in external | MEDIUM |
| Storage | Standard web storage only | N/A |
| UI | Limited native controls | LOW |

**Verdict:** LINE LIFF is viable but has quirks (message sending fragility, external browser limitations).

### KakaoTalk PlayMCP (Reference Only)

PlayMCP supports MCP tools (text results) but NOT MCP Apps (interactive UI). Relevant as market reference only — their architecture doesn't apply.

## 4. Component Breakdown

### CRITICAL (MVP) — ALL DONE 2026-02-10

| # | Component | Effort | Risk | Status |
|---|-----------|--------|------|--------|
| C1 | **Core Protocol Layer** | 3d | LOW | **Done** — 25 protocol tests, 15 router tests, 7 bridge-client tests |
| | JSON-RPC 2.0 message parser/builder | | | |
| | postMessage transport abstraction | | | |
| | Message routing (app <-> platform) | | | |
| C2 | **Telegram Adapter** | 4d | MEDIUM | **Done** — 13 tests, theme+viewport+lifecycle+auth |
| | `Telegram.WebApp` -> JSON-RPC translation | | | |
| | Init handshake mapping | | | |
| | Tool call forwarding | | | |
| | Theme/viewport mapping | | | |
| C3 | **Resource Server** | 2d | LOW | **Done** — HTTP+WS+CSP+sessions, 7 auth tests, 8 session tests |
| | Serve `ui://` resources as HTTP | | | |
| | Inject bridge JS into HTML | | | |
| | CSP header generation from metadata | | | |

**MVP Total: ~9 days** — **COMPLETE** (107 tests, 0 lint errors)

### IMPORTANT (v1.0)

| # | Component | Effort | Risk | Status |
|---|-----------|--------|------|--------|
| I1 | **LINE LIFF Adapter** | 3d | MEDIUM | Stub exists (3 tests) |
| I2 | **CLI Scaffold** | 2d | LOW | Not started |
| I3 | **Auth Bridge** | 2d | MEDIUM | **Done** — Telegram initData HMAC validated (13 tests), WS auth enforced |
| | Telegram initData validation on MCP server | | | |
| | LIFF token forwarding | | | |

**v1.0 Total: ~7 days additional**

### NICE-TO-HAVE (v2.0+)

| # | Component | Effort | Risk |
|---|-----------|--------|------|
| N1 | Discord Activities adapter | 3d | LOW |
| N2 | WhatsApp Flows adapter | 3d | HIGH (limited API) |
| N3 | WeChat Mini Programs adapter | 4d | HIGH (China infra) |
| N4 | Display mode support (fullscreen/pip) | 1d | LOW |
| N5 | Streaming tool-input-partial support | 1d | LOW |

## 5. Technical Risks

### R1: Cross-Origin Restrictions (MEDIUM)

**Problem:** MCP Apps use iframe postMessage with origin checking. Telegram webview has no `postMessage` — it uses native bridge injection.

**Mitigation:** The bridge replaces postMessage transport with platform SDK calls. The `App` class from ext-apps can be bypassed entirely; we implement the JSON-RPC protocol directly.

### R2: Double-Iframe Sandbox Proxy (LOW for us)

**Problem:** Web-based MCP hosts use a double-iframe architecture (sandbox proxy pattern) for security.

**Mitigation:** We don't need this. Telegram/LINE webviews ARE the sandbox. The platform controls the container, not us. We skip the sandbox proxy entirely.

### R3: Tool Call Forwarding Latency (LOW)

**Problem:** MCP App -> Host -> MCP Server -> Host -> MCP App roundtrip. Adding a messaging platform in the middle adds latency.

**Mitigation:** The resource server sits next to the MCP server. Tool calls go: Telegram webview -> resource server (local) -> MCP server. No extra network hop vs. standard MCP Apps.

### R4: Telegram `sendData()` Semantics (MEDIUM)

**Problem:** `sendData()` closes the Mini App. MCP Apps expect persistent bidirectional communication.

**Mitigation:** Don't use `sendData()`. Use the webview's HTTP/WebSocket connection to the resource server for bidirectional communication. The Telegram webview is just a container.

### R5: CSP in Platform Webviews (LOW)

**Problem:** MCP Apps spec defines CSP metadata. Platform webviews may have their own CSP.

**Mitigation:** The resource server sets HTTP CSP headers matching MCP metadata. Platform webview CSP is typically permissive for loaded URLs.

## 6. Architecture Decision

### Option A: Replace postMessage Transport (SELECTED)

The bridge replaces the iframe postMessage layer with platform-native communication, while keeping the JSON-RPC 2.0 protocol intact.

```
Standard MCP Apps:
  [App HTML] <-postMessage/JSON-RPC-> [Host iframe container]

With Bridge (Telegram):
  [App HTML + bridge.js] <-HTTP/WS/JSON-RPC-> [Resource Server] <-MCP-> [MCP Server]
       |
  Telegram.WebApp SDK (for native UI: MainButton, theme, etc.)
```

**Why this works:**
1. The MCP App HTML is served by our resource server (not the MCP host)
2. We inject `bridge.js` that intercepts `postMessage` calls
3. `bridge.js` routes JSON-RPC messages over HTTP/WS to resource server
4. Resource server forwards `tools/call` etc. to the actual MCP server
5. Platform SDK (Telegram.WebApp) provides native features (theme, buttons, viewport)

### Option B: Full Protocol Reimplementation (REJECTED)

Rewrite the App class entirely for each platform. Too much duplication, harder to maintain.

### Option C: Proxy-Only (REJECTED)

Just proxy postMessage. Doesn't work because platform webviews don't have a parent iframe to postMessage to.

## 7. MVP Definition

**@casys/mcp-apps-bridge v0.1.0 — Telegram MVP**

Scope:
1. Core protocol layer (JSON-RPC 2.0 parser, message types, transport abstraction)
2. Telegram adapter (WebApp SDK integration, theme mapping, init handshake)
3. Resource server (serve ui:// as HTTP, inject bridge.js, CSP headers)
4. Basic example (one MCP App running in Telegram Mini App)

Out of scope for MVP:
- LINE LIFF adapter
- CLI scaffold
- Auth bridge (Telegram initData validation)
- Display mode changes
- Streaming tool-input-partial
- Any other platform adapters

**Success criteria:** An existing MCP App (e.g., the `get-time` example from the spec) renders and works interactively inside a Telegram Mini App without code changes to the MCP App itself.

## 8. Dependency Map

```
Task #2 (this) ─── scope-analysis.md
    │
    v
Task #1 ─── tech-spec BMAD (sharded, 10 files)
    │
    v
Task #3 ─── project init (lib/mcp-apps-bridge/)
    │
    v
Task #4 ─── core protocol layer
    │
    ├──> Task #5 ─── Telegram adapter
    │
    └──> Task #6 ─── resource server
```

## 9. Conclusion

Le projet est **techniquement faisable** avec un risque modere. L'architecture MCP Apps et Telegram Mini Apps partagent le meme pattern fondamental (HTML dans un conteneur avec un bridge de communication). La cle est de remplacer le transport postMessage par HTTP/WebSocket tout en conservant le protocole JSON-RPC 2.0 intact.

Le MVP (Telegram uniquement) est estimable a ~9 jours de travail. L'extension a LINE LIFF ajoute ~3 jours supplementaires.

**Recommandation : GO pour le MVP Telegram.**
