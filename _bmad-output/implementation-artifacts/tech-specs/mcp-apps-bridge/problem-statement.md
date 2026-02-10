---
title: 'Problem Statement'
parent: mcp-apps-bridge
---

# Problem Statement

## The Gap

MCP Apps (SEP-1865) enable MCP tool servers to return **interactive HTML UIs** that render inside MCP host applications (Claude, VS Code, Goose, Postman). The protocol uses:

- `ui://` resource scheme for HTML content
- JSON-RPC 2.0 over `postMessage` for bidirectional communication
- Sandboxed iframes with CSP enforcement
- `_meta.ui.resourceUri` on tool declarations to link tools to UIs

**Current reach:** MCP Apps only work inside MCP-native hosts (Claude Desktop, claude.ai, VS Code Insiders, Goose, Postman, MCPJam). These are developer/power-user tools.

**Missing reach:** 2+ billion users on messaging platforms (Telegram, LINE, KakaoTalk, Discord, WhatsApp) have NO access to MCP Apps UIs.

## The Opportunity

Messaging platforms already support **web apps inside chat**:

| Platform | Technology | Users | Web App Support |
|----------|-----------|-------|-----------------|
| Telegram | Mini Apps (iframe/webview) | 950M+ | Full HTML+JS in native webview |
| LINE | LIFF (webview) | 200M+ | Full HTML+JS in LINE browser |
| KakaoTalk | PlayMCP | 50M+ | MCP tools (text only, NO UI) |
| Discord | Activities (iframe) | 200M+ | HTML+JS in iframe |
| WhatsApp | Flows | 2B+ | Limited JSON forms |

**Key insight:** Telegram Mini Apps and MCP Apps use the **exact same architecture pattern**:

```
MCP Apps:       [HTML] <--postMessage/JSON-RPC--> [Host iframe]
Telegram:       [HTML] <--WebApp SDK bridge--->   [Native webview]
LINE:           [HTML] <--LIFF SDK bridge----->   [LINE browser]
```

The transport differs, but the pattern is identical: an HTML application communicating with a host container through a message bridge.

## Why No One Has Built This

1. **MCP Apps is new** (spec published 2026-01-26, ~2 weeks ago)
2. **KakaoTalk's PlayMCP** handles text tool results only, not interactive UIs
3. **No SDK exists** to translate between MCP Apps JSON-RPC and platform-native bridges
4. **Cross-platform abstraction is hard** — each platform has unique auth, lifecycle, and capabilities

## What We Build

`@casys/mcp-apps-bridge` — a TypeScript library that:

1. **Serves MCP App HTML** via HTTP (replacing the `ui://` scheme resolution that MCP hosts do internally)
2. **Injects a bridge script** that translates JSON-RPC 2.0 messages to/from platform-native SDK calls
3. **Provides platform adapters** (Telegram first, then LINE) that map platform concepts to MCP concepts

**Result:** An existing MCP App works inside Telegram/LINE with **zero changes to the MCP App code**.

## Success Metrics

- An unmodified MCP App example (e.g., `get-time` from the MCP spec) runs interactively inside a Telegram Mini App
- Tool calls from the UI reach the MCP server and return results
- Theme, viewport, and lifecycle events are mapped correctly
- No security degradation vs. standard MCP Apps hosting
