# Tech Spec: PML Serve Feed SSE

**Date**: 2026-02-18
**Status**: Completed
**Scope**: `lib/server`, `packages/pml`, `lib/plm`

## Problem

Tool execution events have no single, clean event source:

- **Feed server (3011)**: Embedded in `lib/plm/server.ts` as a demo hack. PLM wraps each handler to POST results to `localhost:3011/broadcast`. Only PLM tools broadcast; SysON and SIM don't.
- **API EventBus (3003)**: Internal to the API server process. PML runs as a separate stdio process and never reaches this bus.

PML is the gateway — all tool calls (PLM, SysON, SIM, remote `--expose`) pass through `sandbox-executor.handleRpcCall()`. The feed belongs in PML.

## Design Decisions

### Feed = UI events only

The feed displays viewers. Broadcasting every tool call would be noise. The hook targets `collectedUi` (tools with `_meta.ui`), not `toolCallRecords` (all tools).

In `handleRpcCall()` (sandbox-executor.ts):

```
finally { toolCallRecords.push(record); }       // ALL — not our target
if (success) {
  uiMeta = extractUiMeta(result);                // existing code
  if (uiMeta) { collectedUi.push(...); }         // ONLY UIs — our target
}
```

### Web standard custom routes, not Hono

`customRoutes` uses Web standard `Request → Response`. Hono is an internal detail of `@casys/mcp-server` — re-exporting it would couple consumers to a framework that could change.

### Parse MCP envelope before broadcasting

In `handleRpcCall()`, `result` is the MCP envelope: `{ content: [{ type: "text", text: "{...}" }], _meta: {...} }`. The feed must send **parsed data** (`JSON.parse(content[0].text)`), not the envelope. New helper `extractResultData()` in `ui-utils.ts` (pattern from `lib/plm/server.ts:205-218` wrapper being removed).

### Distributed: works by design

Remote tools (via `--expose` on other machines) return results to the principal PML via `routeToolCall()`. The `_meta.ui` is in the result. The `onUiCollected` callback fires on the orchestrator, not the executor. The feed SSE is always on the principal PML.

## Solution

### 1. Custom Routes in ConcurrentMCPServer

**`lib/server/src/types.ts`** — Add to `HttpServerOptions`:

```typescript
customRoutes?: Array<{
  method: "get" | "post";
  path: string;
  handler: (req: Request) => Response | Promise<Response>;
}>;
```

**`lib/server/src/concurrent-server.ts`** — In `startHttp()`, after CORS middleware, before MCP catch-all routes:

```typescript
if (options.customRoutes) {
  for (const route of options.customRoutes) {
    app[route.method](route.path, (c) => route.handler(c.req.raw));
  }
}
```

### 2. `extractResultData()` helper

**`packages/pml/src/execution/ui-utils.ts`** — Parse MCP content envelope to extract data:

```typescript
export function extractResultData(result: unknown): unknown {
  if (!isObject(result)) return result;
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (r.content) {
    for (const c of r.content) {
      if (c.type === "text" && c.text) {
        try { return JSON.parse(c.text); } catch { return c.text; }
      }
    }
  }
  return result;
}
```

### 3. `onUiCollected` Callback in SandboxExecutor

**`packages/pml/src/execution/types.ts`** — Add to `SandboxExecutorOptions`:

```typescript
onUiCollected?: (ui: CollectedUiResource, parsedResult: unknown) => void;
```

**`packages/pml/src/execution/sandbox-executor.ts`** — After `collectedUi.push()`:

```typescript
this.onUiCollected?.(collected, extractResultData(result));
```

**`packages/pml/src/cli/shared/local-executor.ts`** — Propagate `onUiCollected` to `SandboxExecutor`.

### 4. Feed SSE in PmlServer

**`packages/pml/src/server/pml-server.ts`**:

- `feedClients: Set<ReadableStreamDefaultController>` — connected SSE clients
- `broadcastUiEvent(ui, parsedResult)` — serialize + enqueue to all clients
- `customRoutes: [{ method: "get", path: "/feed", handler }]` passed to `startHttp()`
- `handleExecute()` passes `broadcastUiEvent.bind(this)` as `onUiCollected` to `executeLocalCode()`

Event shape:

```json
{
  "toolName": "syson:syson_element_children",
  "result": { "elements": [...] },
  "resourceUri": "ui://mcp-syson/model-explorer-viewer",
  "timestamp": "2026-02-18T10:00:00Z"
}
```

### 5. Remove Feed Server from PLM

**`lib/plm/server.ts`** — Remove `FeedEvent`, `feedClients`, `DEFAULT_FEED_PORT`, `broadcastFeedEvent()`, `startFeedServer()`, handler wrapper broadcast calls.

**`lib/plm/demo.html`** — Delete file.

**NOT touched**: External broadcasts in `lib/sim` and `lib/syson` (env var overrides, separate scope).

## Call Chain

```
pml serve (3004)
  └─ PmlServer
      ├─ startHttp({ customRoutes: [GET /feed → SSE] })
      └─ handleExecute()
          └─ executeLocalCode(onUiCollected: broadcastUiEvent)
              └─ SandboxExecutor({ onUiCollected })
                  └─ handleRpcCall() → routeToolCall() → result
                      └─ extractUiMeta(result) → collectedUi.push()
                          └─ onUiCollected(collected, extractResultData(result))
                              └─ SSE: data: {"toolName","result","resourceUri","timestamp"}
```

## Files

| File | Change |
|------|--------|
| `lib/server/src/types.ts` | + `customRoutes` in `HttpServerOptions` |
| `lib/server/src/concurrent-server.ts` | Map `customRoutes` to Hono in `startHttp()` |
| `packages/pml/src/execution/ui-utils.ts` | + `extractResultData()` |
| `packages/pml/src/execution/types.ts` | + `onUiCollected` in `SandboxExecutorOptions` |
| `packages/pml/src/execution/sandbox-executor.ts` | Call `onUiCollected` after `collectedUi.push()` |
| `packages/pml/src/cli/shared/local-executor.ts` | Propagate `onUiCollected` param |
| `packages/pml/src/server/pml-server.ts` | + `feedClients`, `broadcastUiEvent()`, custom route `/feed` |
| `lib/plm/server.ts` | Remove feed server |
| `lib/plm/demo.html` | Delete |

## Not in scope

- PML stdio mode feed (no HTTP = no SSE; stdio users use Claude Desktop viewers)
- `/ui/{name}` viewer serving (handled by MCP `resources/read` + `/api/ui/resource` proxy)
- LiveFeed frontend component (separate story, connects to `3004/feed`)
- External broadcast cleanup in sim/syson tools (env var redirect suffices)

## Review Notes

- Adversarial review completed (12 findings)
- Findings: 4 fixed, 8 skipped (noise/intentional)
- Resolution approach: auto-fix
- F1 (Critical, fixed): `cancel()` callback captured controller in closure
- F3 (High, fixed): `JSON.stringify` wrapped in try/catch with fallback
- F7 (Low, fixed): Removed `Connection: keep-alive` header
- F9 (Low, fixed): TextEncoder hoisted to static class field
