---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/PRD.md
  - _bmad-output/planning-artifacts/architecture-overview.md
  - _bmad-output/planning-artifacts/integration-architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/spikes/2026-01-27-mcp-apps-ui-orchestration.md
project_name: "Casys PML"
epic_number: 16
created: "2026-01-28"
status: "ready"
---

# Epic 16: MCP Apps UI Orchestration

## Overview

This epic implements MCP Apps (SEP-1865) support in PML, enabling tools to return rich, interactive UIs displayed in iframes within the conversation. PML becomes the orchestrator that collects, composes, and synchronizes multiple UI components from different MCP servers.

## Requirements Inventory

### Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| FR-UI-001 | Le système doit exposer des tools MCP avec `_meta.ui.resourceUri` pour retourner des interfaces riches dans des iframes | Spike |
| FR-UI-002 | Le système doit collecter les `_meta.ui` des résultats MCP pendant l'exécution du code sandbox | Spike |
| FR-UI-003 | Le système doit composer des UI agrégées avec layout configurable (split, tabs, grid, stack) | Spike |
| FR-UI-004 | Le système doit router les events entre les UI enfants via sync rules | Spike |
| FR-UI-005 | Le système doit permettre la définition déclarative de sync rules dans les capabilities | Spike |
| FR-UI-006 | Le système doit générer le HTML composite avec event bus JavaScript | Spike |
| FR-UI-007 | Le système doit implémenter `resources/list` pour lister les UI resources disponibles | Spike |
| FR-UI-008 | Le système doit implémenter `resources/read` pour servir les UI resources (HTML) | Spike |
| FR-UI-009 | Le système doit abstraire le transport de messages (MessageTransport) pour Workers Deno et iframes browser | Spike |
| FR-UI-010 | Le système doit détecter les events en matchant les arguments des `callServerTool` | Spike |
| FR-UI-011 | Le système doit injecter un shared context dans toutes les UI enfants | Spike |
| FR-UI-012 | Le système doit servir les UI composites via le schéma `ui://pml/workflow/{id}` | Spike |

### Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-UI-001 | L'interception postMessage doit avoir une latence < 200ms (pas de round-trip LLM) | Spike |
| NFR-UI-002 | L'architecture doit suivre le principe "Zero-code change" pour les MCP existants | Spike |
| NFR-UI-003 | Le système doit supporter les clients MCP Apps: Claude, ChatGPT, VS Code, Goose, Postman | Spike |

### Additional Requirements (Architecture)

| ID | Requirement | Source |
|----|-------------|--------|
| ARCH-001 | L'abstraction MessageTransport doit être compatible avec le RpcBridge existant du sandbox worker | Architecture |
| ARCH-002 | Le protocol adapter doit traduire JSON-RPC MCP Apps ↔ format interne PML | Spike |
| ARCH-003 | Les types TypeScript doivent être ajoutés dans `packages/pml/src/types/` | Spike |
| ARCH-004 | Le sandbox-executor doit être modifié pour collecter `_meta.ui` de chaque appel MCP | Spike |
| ARCH-005 | Les UI resources doivent être servies via le MCP Gateway HTTP existant (port 3003) | Architecture |
| ARCH-006 | PMLGatewayServer devrait réutiliser ConcurrentMCPServer de lib/server au lieu de dupliquer la logique | Tech Debt |

### Additional Requirements (UX)

| ID | Requirement | Source |
|----|-------------|--------|
| UX-001 | Le mode Dev Frontend (Storybook-like) doit permettre de prévisualiser les layouts sans MCP réel | UX Spec |
| UX-002 | Le debugging des events cross-UI doit être visible dans le dashboard | UX Spec |

## FR Coverage Map

| Requirement | Story | Description |
|-------------|-------|-------------|
| FR-UI-001 | 16.1 | Types avec _meta.ui.resourceUri |
| FR-UI-002 | 16.3 | Collection dans sandbox-executor |
| FR-UI-003 | 16.1, 16.4 | Layouts: split, tabs, grid, stack |
| FR-UI-004 | 16.4 | Event routing via sync rules |
| FR-UI-005 | 16.1 | Sync rules déclaratives |
| FR-UI-006 | 16.4 | HTML composite avec event bus |
| FR-UI-007 | 16.2 | resources/list |
| FR-UI-008 | 16.2 | resources/read |
| FR-UI-009 | 16.5 | MessageTransport abstraction |
| FR-UI-010 | 16.3 | Event detection via callServerTool args |
| FR-UI-011 | 16.4 | Shared context injection |
| FR-UI-012 | 16.2 | ui://pml/workflow/{id} scheme |
| NFR-UI-001 | 16.4 | Latence < 200ms |
| NFR-UI-002 | 16.3 | Zero-code change pour MCP existants |
| NFR-UI-003 | 16.4 | Support multi-clients |
| ARCH-001 | 16.5 | Compatibilité RpcBridge |
| ARCH-002 | 16.5 | Protocol adapter JSON-RPC |
| ARCH-003 | 16.1 | Types TypeScript |
| ARCH-004 | 16.3 | Modification sandbox-executor |
| ARCH-005 | 16.2 | MCP Gateway HTTP |
| UX-001 | 16.6 | Dev Frontend Storybook-like |
| UX-002 | 16.6 | Debug events cross-UI |

## Epic Goal

Transform PML into the UI orchestrator for MCP Apps, enabling:
1. **Collection** of `_meta.ui` from each MCP call
2. **Composition** of aggregated UI with layout and sync rules
3. **Routing** of events between child UIs (PML innovation)
4. **Serving** of composite UI to clients (Claude, ChatGPT, etc.)

## Value Proposition

- **Unified UI Experience**: Multiple MCP server UIs composed into single coherent interface
- **Cross-UI Synchronization**: Filter in Table A → Update in Chart B (impossible without PML)
- **Zero MCP Changes**: Existing MCPs just return `_meta.ui`, PML handles orchestration
- **Client Agnostic**: Works with Claude, ChatGPT, VS Code, Goose, Postman

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: MCP Server (src/mcp/)                                  │
│  - Expose tools with _meta.ui                                    │
│  - Serve UI resources via resources/read                         │
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: PML Orchestrator (packages/pml/)                       │
│  - Collect _meta.ui from MCP calls                               │
│  - Compose UIs with sync rules                                   │
│  - Generate composite HTML with event bus                        │
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Dev Frontend (src/web/) - Optional                     │
│  - Preview layouts in isolation                                  │
│  - Test interactions without real MCP                            │
└─────────────────────────────────────────────────────────────────┘
```

## POC Status

**Validated 2026-01-27** - `apps/desktop/src/poc/mcp-apps-intercept-poc.html`

| Test | Result |
|------|--------|
| iframe child → postMessage → parent | ✅ |
| Parent intercepts `ui/initialize` | ✅ |
| Parent intercepts `tools/call` | ✅ |
| Sync rules (filter → update) | ✅ |
| UI B receives events and updates | ✅ |

## Stories

| Story | Title | FRs Covered | Status |
|-------|-------|-------------|--------|
| 16.1 | Types & Schema UI Orchestration | FR-UI-001, FR-UI-003, FR-UI-005, ARCH-003 | Draft |
| 16.2 | MCP Server Resources Handlers | FR-UI-007, FR-UI-008, FR-UI-012, ARCH-005 | Draft |
| 16.3 | UI Collection in Sandbox Executor | FR-UI-002, FR-UI-010, ARCH-004, NFR-UI-002 | Draft |
| 16.4 | Composite UI Generator | FR-UI-003, FR-UI-004, FR-UI-006, FR-UI-011, NFR-UI-001, NFR-UI-003 | Draft |
| 16.5 | MessageTransport Abstraction | FR-UI-009, ARCH-001, ARCH-002 | Draft |
| 16.6 | Dev Frontend Preview Mode (Optional) | UX-001, UX-002 | Draft |
| 16.7 | Migrate Gateway to ConcurrentMCPServer (Tech Debt) | ARCH-006 | Backlog |

### Story Dependencies

```
16.1 (Types) ────┬────────────────────────────────┐
                 │                                │
                 ▼                                ▼
16.2 (Resources) 16.3 (Collection)  16.5 (Transport)
                 │                                │
                 └────────────┬───────────────────┘
                              ▼
                     16.4 (Composite)
                              │
                              ▼
                     16.6 (Dev Frontend) [optional]
```

## Technical References

- [MCP Apps Documentation](https://modelcontextprotocol.io/docs/extensions/apps)
- [SEP-1865 Specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [SDK @modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps)
- Spike: `_bmad-output/planning-artifacts/spikes/2026-01-27-mcp-apps-ui-orchestration.md`

---

## Story Details

### Story 16.1: Types & Schema UI Orchestration

**As a** PML developer,
**I want** well-defined TypeScript types for UI orchestration,
**So that** I have compile-time safety and clear contracts for all UI-related functionality.

**Acceptance Criteria:**

**Given** the PML codebase without UI orchestration types
**When** I create the file `packages/pml/src/types/ui-orchestration.ts`
**Then** the following types are exported:
- `UiLayout` enum with values: `"split" | "tabs" | "grid" | "stack"`
- `UiSyncRule` interface with: `from`, `event`, `to`, `action` fields
- `UiOrchestration` interface with: `layout`, `sync?`, `sharedContext?` fields
- `CollectedUiResource` interface with: `source`, `resourceUri`, `context?`, `slot` fields
- `CompositeUiDescriptor` interface with: `type`, `resourceUri`, `layout`, `children`, `sync`, `sharedContext?` fields
- `McpUiToolMeta` interface with: `resourceUri?`, `visibility?` fields
- `McpUiResourceMeta` interface with: `csp?`, `permissions?`, `domain?`, `prefersBorder?` fields

**And** all types are properly documented with JSDoc comments
**And** types compile without errors with `deno check`

**FRs Covered:** FR-UI-001, FR-UI-003, FR-UI-005, ARCH-003

---

### Story 16.2: MCP Server Resources Handlers

**As a** MCP client (Claude, ChatGPT, VS Code),
**I want** PML to expose UI resources via standard MCP resources protocol,
**So that** I can discover and fetch interactive UI components to display in the conversation.

**Acceptance Criteria:**

**Given** the MCP Gateway HTTP server running on port 3003
**When** a client sends a `resources/list` JSON-RPC request
**Then** the server returns a list of available UI resources with:
- `uri` in format `ui://pml/{resource-name}`
- `name` human-readable resource name
- `description` explaining the resource purpose
- `mimeType` set to `"text/html;profile=mcp-app"`

**Given** a valid UI resource URI like `ui://pml/workflow/{workflowId}`
**When** a client sends a `resources/read` JSON-RPC request with that URI
**Then** the server returns the resource content with:
- `contents[].uri` matching the requested URI
- `contents[].mimeType` set to `"text/html;profile=mcp-app"`
- `contents[].text` containing valid HTML

**Given** an invalid or non-existent UI resource URI
**When** a client sends a `resources/read` request
**Then** the server returns a JSON-RPC error with code `-32602` and message `"Resource not found: {uri}"`

**And** handlers are added to `src/mcp/server/http.ts`
**And** resource management logic is added to `src/mcp/gateway-server.ts`

**FRs Covered:** FR-UI-007, FR-UI-008, FR-UI-012, ARCH-005

---

### Story 16.3: UI Collection in Sandbox Executor

**As a** PML orchestrator,
**I want** the sandbox executor to automatically collect `_meta.ui` from MCP tool responses,
**So that** I can compose multiple UI components returned by different MCP servers.

**Acceptance Criteria:**

**Given** a capability code that calls MCP tools via `mcp.server.tool()`
**When** the sandbox executor receives a tool response containing `_meta.ui.resourceUri`
**Then** the executor collects and stores:
- `source`: the tool name that returned this UI (e.g., `"postgres:query"`)
- `resourceUri`: the UI resource URI (e.g., `"ui://postgres/table/xxx"`)
- `context`: any additional context from `_meta.ui.context`
- `slot`: execution order index (0, 1, 2...)

**Given** multiple MCP tools return `_meta.ui` during execution
**When** all tool calls complete
**Then** the executor has an ordered array of `CollectedUiResource[]` matching execution order

**Given** an MCP tool response without `_meta.ui`
**When** the executor processes the response
**Then** no UI resource is collected for that tool (graceful skip)

**And** modifications are made to `packages/pml/src/execution/sandbox-executor.ts`
**And** existing MCP servers require zero code changes to work with this feature
**And** unit tests verify collection with mock MCP responses

**FRs Covered:** FR-UI-002, FR-UI-010, ARCH-004, NFR-UI-002

---

### Story 16.4: Composite UI Generator

**As a** user executing a multi-tool capability,
**I want** PML to generate a unified composite UI with synchronized interactions,
**So that** I see one coherent interface where actions in one component update others automatically.

**Acceptance Criteria:**

**Given** a `CollectedUiResource[]` array with 2+ UI resources and a `UiOrchestration` config
**When** I call `buildCompositeUi(resources, orchestration)`
**Then** a `CompositeUiDescriptor` is returned with:
- `type`: `"composite"`
- `resourceUri`: `"ui://pml/workflow/{uuid}"`
- `layout`: from orchestration config (split, tabs, grid, stack)
- `children`: mapped resources with slot indices
- `sync`: rules with tool names converted to slot indices

**Given** a `CompositeUiDescriptor`
**When** I call `generateCompositeHtml(descriptor)`
**Then** valid HTML is generated containing:
- CSS for the specified layout (flex/grid)
- Iframes for each child UI with `data-slot` and `data-source` attributes
- JavaScript event bus that routes events per sync rules
- Shared context injection on iframe load

**Given** sync rules `[{ from: "postgres:query", event: "filter", to: "viz:render", action: "update" }]`
**When** UI A posts a message with `{ slot: 0, event: "filter", data: {...} }`
**Then** the event bus forwards `{ action: "update", data: {...}, sharedContext }` to UI B (slot 1)

**And** postMessage routing latency is < 200ms (no LLM round-trip)
**And** composite HTML works in Claude, ChatGPT, VS Code, Goose, Postman clients
**And** new file created: `packages/pml/src/ui/composite-generator.ts`

**FRs Covered:** FR-UI-003, FR-UI-004, FR-UI-006, FR-UI-011, NFR-UI-001, NFR-UI-003

---

### Story 16.5: MessageTransport Abstraction

**As a** PML developer,
**I want** a unified MessageTransport interface for both Deno Workers and browser iframes,
**So that** the RpcBridge logic can be reused for MCP Apps communication without duplication.

**Acceptance Criteria:**

**Given** the existing RpcBridge that works with Deno Workers
**When** I create a `MessageTransport` interface
**Then** it exposes:
- `send(message: unknown): void`
- `onMessage(handler: (message: unknown) => void): void`
- `onError?(handler: (error: Error) => void): void`
- `close(): void`

**Given** the `MessageTransport` interface
**When** I create `DenoWorkerTransport` implementation
**Then** it wraps `Worker.postMessage()` and `Worker.onmessage`
**And** existing sandbox functionality continues to work unchanged

**Given** the `MessageTransport` interface
**When** I create `IframeTransport` implementation (browser-only)
**Then** it wraps `iframe.contentWindow.postMessage()` and `window.addEventListener('message')`
**And** messages from other sources are filtered out

**Given** MCP Apps JSON-RPC messages (`ui/initialize`, `tools/call`)
**When** I create `McpAppsProtocolAdapter`
**Then** it converts:
- `tools/call` → internal RPC format `{ type: 'rpc', method, args }`
- Internal response → JSON-RPC response `{ jsonrpc: '2.0', id, result }`

**And** RpcBridge accepts `MessageTransport` instead of direct `Worker` reference
**And** new files created in `packages/pml/src/sandbox/transport/`
**And** all existing tests continue to pass

**FRs Covered:** FR-UI-009, ARCH-001, ARCH-002

---

### Story 16.6: Dev Frontend Preview Mode (Optional)

**As a** PML developer building UI orchestrations,
**I want** a Storybook-like preview environment to test layouts and interactions,
**So that** I can develop and debug composite UIs without running real MCP servers.

**Acceptance Criteria:**

**Given** the web frontend in `src/web/`
**When** I navigate to the UI Preview section
**Then** I can select from available layouts: split, tabs, grid, stack

**Given** a selected layout
**When** I add mock UI panels
**Then** I see them rendered in the chosen layout with placeholder content

**Given** mock sync rules configured (e.g., filter → update)
**When** I trigger a mock event in Panel A (e.g., click "Send Filter Event")
**Then** Panel B receives and displays the event with action and data

**Given** the preview environment
**When** I inspect the event bus activity
**Then** I see a live log of:
- Events emitted (source slot, event type, data)
- Events routed (target slot, action, data)
- Timing information

**And** mock data can be injected for testing different scenarios
**And** preview works without any MCP server connection
**And** island component added to `src/web/islands/UiPreviewIsland.tsx`
**And** route added to `src/web/routes/dashboard/ui-preview.tsx`

**FRs Covered:** UX-001, UX-002

---

### Story 16.7: Migrate Gateway to ConcurrentMCPServer (Tech Debt)

**As a** PML maintainer,
**I want** `PMLGatewayServer` to use `ConcurrentMCPServer` from `lib/server`,
**So that** we eliminate code duplication and benefit from shared infrastructure (resources, rate limiting, schema validation).

**Acceptance Criteria:**

**Given** the existing `src/mcp/gateway-server.ts` using direct SDK calls
**When** I refactor to extend or compose with `ConcurrentMCPServer`
**Then** the following features from `lib/server` are reused:
- `registerResource()` / `registerResources()` methods
- `MCPResource`, `ResourceContent`, `MCP_APP_MIME_TYPE` types
- `RequestQueue` for concurrency control
- `RateLimiter` for rate limiting (optional)
- `SchemaValidator` for input validation (optional)

**Given** `ConcurrentMCPServer` supports only stdio transport
**When** I add HTTP support to `lib/server`
**Then** a new method `startHttp(port: number)` is available
**And** it creates an HTTP server using Hono (matching current gateway pattern)

**Given** the refactored gateway
**When** I run existing tests and functionality
**Then** all existing `tools/list`, `tools/call`, `resources/list`, `resources/read` handlers work unchanged
**And** all handlers (`pml:execute`, `pml:discover`, etc.) continue to function
**And** HTTP mode works on port 3003 as before
**And** stdio mode works for Claude Code integration as before

**And** `src/mcp/server/lifecycle.ts` is simplified or removed
**And** no duplication between `lib/server` and `src/mcp/` for MCP protocol handling
**And** all existing tests pass without modification

**Technical Notes:**

- Option A: `PMLGatewayServer extends ConcurrentMCPServer` (inheritance)
- Option B: `PMLGatewayServer` uses `ConcurrentMCPServer` via composition
- Option B preferred for flexibility
- Must add HTTP support to `lib/server/src/concurrent-server.ts`
- Keep backward compatibility with existing code

**FRs Covered:** ARCH-006 (Tech Debt)
