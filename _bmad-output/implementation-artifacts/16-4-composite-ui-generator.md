# Story 16.4: Composite UI Generator

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user executing a multi-tool capability,
I want PML to generate a unified composite UI with synchronized interactions,
so that I see one coherent interface where actions in one component update others automatically.

## Acceptance Criteria

1. **buildCompositeUi Function** - Given a `CollectedUiResource[]` array with 2+ UI resources and a `UiOrchestration` config, when I call `buildCompositeUi(resources, orchestration)`, then a `CompositeUiDescriptor` is returned with:
   - `type`: `"composite"`
   - `resourceUri`: `"ui://pml/workflow/{uuid}"`
   - `layout`: from orchestration config (split, tabs, grid, stack)
   - `children`: mapped resources with slot indices
   - `sync`: rules with tool names converted to slot indices

2. **generateCompositeHtml Function** - Given a `CompositeUiDescriptor`, when I call `generateCompositeHtml(descriptor)`, then valid HTML is generated containing:
   - CSS for the specified layout (flex/grid)
   - Iframes for each child UI with `data-slot` and `data-source` attributes
   - JavaScript event bus that routes events per sync rules
   - Shared context injection on iframe load

3. **Sync Rule Resolution** - Given sync rules `[{ from: "postgres:query", event: "filter", to: "viz:render", action: "update" }]`, when sync rules are resolved, then tool names are converted to slot indices based on `CollectedUiResource.source` matching

4. **Event Routing** - When UI A posts a message with `{ slot: 0, event: "filter", data: {...} }`, then the event bus forwards `{ action: "update", data: {...}, sharedContext }` to UI B (slot 1) per sync rules

5. **Broadcast Support** - When a sync rule has `to: "*"`, then the event is forwarded to all iframes except the sender

6. **Latency Requirement** - postMessage routing latency is < 200ms (no LLM round-trip, pure JS event routing)

7. **Layout CSS** - Each layout mode generates appropriate CSS:
   - `split`: `display: flex; flex: 1;` for side-by-side panels
   - `tabs`: Tab bar with active state, single visible iframe at a time
   - `grid`: `display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));`
   - `stack`: `display: flex; flex-direction: column;` for vertical stacking

8. **Iframe Attributes** - Each iframe has:
   - `id="ui-{slot}"` for DOM access
   - `data-slot="{slot}"` for event routing
   - `data-source="{source}"` for debugging
   - `sandbox="allow-scripts allow-same-origin"` (le Composite agit comme sandbox proxy)

9. **Multi-Client Compatibility** - Generated HTML works in Claude, ChatGPT, VS Code, Goose, Postman clients (standard HTML/CSS/JS only)

10. **Unit Tests** - Tests verify:
    - `buildCompositeUi()` produces correct descriptor
    - `generateCompositeHtml()` produces valid HTML
    - Sync rule resolution (tool names → slot indices)
    - All 4 layout modes generate distinct CSS
    - Broadcast (`to: "*"`) handling

11. **Type Safety** - All functions use types from `packages/pml/src/types/ui-orchestration.ts`

12. **Deno Check** - All new files pass `deno check` without errors

## Tasks / Subtasks

- [x] Task 1: Create composite-generator.ts file (AC: #11)
  - [x] Create directory `packages/pml/src/ui/`
  - [x] Create `packages/pml/src/ui/composite-generator.ts`
  - [x] Import types: `CollectedUiResource`, `UiOrchestration`, `CompositeUiDescriptor`, `ResolvedSyncRule`, `UiLayout`
  - [x] Add module-level JSDoc documentation

- [x] Task 2: Implement buildCompositeUi function (AC: #1, #3)
  - [x] Function signature: `buildCompositeUi(resources: CollectedUiResource[], orchestration?: UiOrchestration): CompositeUiDescriptor`
  - [x] Generate UUID for workflow ID (`crypto.randomUUID()`)
  - [x] Build `toolToSlot` map: `Map<source, slot>` from resources
  - [x] Resolve sync rules: convert tool names to slot indices
  - [x] Handle `to: "*"` broadcast marker (keep as `"*"`)
  - [x] Default layout to `"stack"` if no orchestration provided
  - [x] Return `CompositeUiDescriptor`

- [x] Task 3: Implement generateCompositeHtml function (AC: #2, #6, #7, #8, #9)
  - [x] Function signature: `generateCompositeHtml(descriptor: CompositeUiDescriptor): string`
  - [x] Generate HTML document with DOCTYPE, charset, title
  - [x] Generate CSS for layout mode (split, tabs, grid, stack)
  - [x] Generate iframes with data attributes (id, data-slot, data-source, sandbox)
  - [x] Generate JavaScript event bus

- [x] Task 4: Implement layout CSS generator (AC: #7)
  - [x] Create helper `getLayoutCss(layout: UiLayout): string`
  - [x] `split`: flexbox horizontal layout
  - [x] `tabs`: tab bar with active state + content area
  - [x] `grid`: CSS grid with responsive columns
  - [x] `stack`: flexbox vertical layout

- [x] Task 5: Implement JavaScript event bus (AC: #4, #5, #6)
  - [x] Inline `<script>` in generated HTML
  - [x] Store sync rules as JSON constant
  - [x] Build `Map<slot, iframe>` for routing
  - [x] Add `window.addEventListener('message', handler)`
  - [x] Match incoming events against sync rules
  - [x] Forward to target iframe(s) via `postMessage`
  - [x] Handle broadcast (`to: "*"`) by sending to all except sender
  - [x] Inject shared context on iframe load

- [x] Task 6: Export from mod.ts (AC: #11)
  - [x] Create `packages/pml/src/ui/mod.ts`
  - [x] Export `buildCompositeUi`, `generateCompositeHtml`
  - [x] Export helper functions if needed

- [x] Task 7: Unit tests (AC: #10)
  - [x] Create `packages/pml/src/ui/composite-generator_test.ts`
  - [x] Test: `buildCompositeUi()` with 2 resources → correct descriptor
  - [x] Test: `buildCompositeUi()` without orchestration → default "stack" layout
  - [x] Test: Sync rule resolution (tool names → slot indices)
  - [x] Test: Broadcast sync rule (`to: "*"`) preserved
  - [x] Test: `generateCompositeHtml()` generates valid HTML structure
  - [x] Test: Each layout mode generates distinct CSS class
  - [x] Test: Iframes have required attributes

- [x] Task 8: Validation (AC: #12)
  - [x] Run `deno check packages/pml/src/ui/composite-generator.ts`
  - [x] Run `deno lint packages/pml/src/ui/`
  - [x] Run `deno test packages/pml/src/ui/`

### Review Follow-ups (AI) - ALL FIXED

- [x] [AI-Review][HIGH] H1: Add sharedContext support to buildCompositeUi() and generateCompositeHtml() ✅ Implemented extractSharedContext() + sharedContext in event bus
- [x] [AI-Review][HIGH] H2: Extract sharedContext from UiOrchestration in buildCompositeUi() ✅ Added sharedContext field to both types
- [x] [AI-Review][MEDIUM] M1: Event bus sendToolResult() wrapper now includes sharedContext ✅ sharedContext forwarded in all messages
- [x] [AI-Review][MEDIUM] M2: Event bus console.warn for malformed JSON-RPC messages ✅ Added warnings for debugging
- [x] [AI-Review][MEDIUM] M3: Tabs layout handles empty resources gracefully ✅ Shows "No UI components available" message
- [x] [AI-Review][MEDIUM] M4: Add unit tests for sharedContext ✅ Added 11 new tests (total: 31 tests)
- [x] [AI-Review][LOW] L1: CSS variables for dark mode support ✅ Added --pml-* CSS custom properties with prefers-color-scheme
- [x] [AI-Review][LOW] L2: Document sandbox security implications ✅ Added JSDoc explaining localStorage access
- [x] [AI-Review][LOW] L3: Add viewport meta tag ✅ Added for mobile compatibility

## Dev Notes

### Critical: Types Import Path

```typescript
// packages/pml/src/ui/composite-generator.ts
import type {
  CollectedUiResource,
  CompositeUiDescriptor,
  ResolvedSyncRule,
  UiLayout,
  UiOrchestration,
} from "../types/ui-orchestration.ts";
```

### buildCompositeUi Implementation Pattern

```typescript
/**
 * Build a composite UI descriptor from collected resources.
 *
 * @param resources - UI resources collected during execution
 * @param orchestration - Optional orchestration config from capability
 * @returns Composite UI descriptor for rendering
 */
export function buildCompositeUi(
  resources: CollectedUiResource[],
  orchestration?: UiOrchestration,
): CompositeUiDescriptor {
  const workflowId = crypto.randomUUID();

  // Build source → slot mapping for sync rule resolution
  const toolToSlot = new Map<string, number>();
  for (const resource of resources) {
    toolToSlot.set(resource.source, resource.slot);
  }

  // Resolve sync rules: tool names → slot indices
  const resolvedSync: ResolvedSyncRule[] = (orchestration?.sync ?? []).map((rule) => ({
    from: toolToSlot.get(rule.from) ?? 0,
    event: rule.event,
    to: rule.to === "*" ? "*" : (toolToSlot.get(rule.to) ?? 0),
    action: rule.action,
  }));

  return {
    type: "composite",
    resourceUri: `ui://pml/workflow/${workflowId}`,
    layout: orchestration?.layout ?? "stack",
    children: resources,
    sync: resolvedSync,
  };
}
```

### generateCompositeHtml Template Structure

```typescript
export function generateCompositeHtml(descriptor: CompositeUiDescriptor): string {
  const layoutCss = getLayoutCss(descriptor.layout);
  const iframesHtml = descriptor.children
    .map((child) => `
      <iframe
        id="ui-${child.slot}"
        src="${child.resourceUri}"
        data-slot="${child.slot}"
        data-source="${child.source}"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    `)
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PML Composite UI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    ${layoutCss}
  </style>
</head>
<body>
  <div class="layout-${descriptor.layout}" id="container">
    ${iframesHtml}
  </div>
  <script>
    ${generateEventBusScript(descriptor)}
  </script>
</body>
</html>`;
}
```

### Layout CSS Specifications

```typescript
function getLayoutCss(layout: UiLayout): string {
  switch (layout) {
    case "split":
      return `
        .layout-split { display: flex; height: 100vh; }
        .layout-split > iframe { flex: 1; border: none; }
      `;
    case "tabs":
      return `
        .layout-tabs { height: 100vh; display: flex; flex-direction: column; }
        .tab-bar { display: flex; border-bottom: 1px solid #e0e0e0; background: #f5f5f5; }
        .tab { padding: 12px 24px; cursor: pointer; border: none; background: transparent; }
        .tab:hover { background: #e8e8e8; }
        .tab.active { background: white; border-bottom: 2px solid #1a73e8; }
        .layout-tabs > iframe { flex: 1; border: none; display: none; }
        .layout-tabs > iframe.active { display: block; }
      `;
    case "grid":
      return `
        .layout-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 8px;
          height: 100vh;
          padding: 8px;
        }
        .layout-grid > iframe { border: 1px solid #e0e0e0; border-radius: 4px; min-height: 300px; }
      `;
    case "stack":
      return `
        .layout-stack { display: flex; flex-direction: column; height: 100vh; }
        .layout-stack > iframe { flex: 1; border: none; border-bottom: 1px solid #e0e0e0; min-height: 200px; }
        .layout-stack > iframe:last-child { border-bottom: none; }
      `;
    default:
      return "";
  }
}
```

### Event Bus Script

```typescript
function generateEventBusScript(descriptor: CompositeUiDescriptor): string {
  return `
    // PML Event Bus - MCP Apps Protocol compliant
    const syncRules = ${JSON.stringify(descriptor.sync)};

    // Build slot → iframe map
    const iframes = new Map();
    document.querySelectorAll('iframe').forEach((iframe) => {
      const slot = parseInt(iframe.dataset.slot, 10);
      iframes.set(slot, iframe);
    });

    // Find slot by iframe contentWindow
    function getSlotBySource(source) {
      for (const [slot, iframe] of iframes.entries()) {
        if (iframe.contentWindow === source) return slot;
      }
      return -1;
    }

    // Send tool result to an iframe (MCP Apps protocol)
    function sendToolResult(iframe, data) {
      iframe.contentWindow?.postMessage({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: {
          content: [{ type: 'text', text: JSON.stringify(data) }],
          isError: false
        }
      }, '*');
    }

    // Listen for messages from child UIs
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (!msg || !msg.jsonrpc) return;

      const sourceSlot = getSlotBySource(e.source);

      // Handle ui/initialize - respond with host capabilities
      if (msg.method === 'ui/initialize') {
        e.source.postMessage({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2026-01-26',
            hostInfo: { name: 'PML Composite UI', version: '1.0.0' },
            hostCapabilities: {
              openLinks: {},
              logging: {},
              updateModelContext: { text: {} },
              message: { text: {} }
            },
            hostContext: {
              theme: document.body.classList.contains('dark') ? 'dark' : 'light',
              displayMode: 'inline'
            }
          }
        }, '*');
        return;
      }

      // Handle ui/update-model-context - route to other UIs per sync rules
      if (msg.method === 'ui/update-model-context') {
        const contextData = msg.params?.structuredContent || msg.params?.content;

        // Extract event type from context (convention: { event: "filter", ... })
        const eventType = contextData?.event || 'update';

        // Find matching sync rules and route
        for (const rule of syncRules) {
          if (rule.from !== sourceSlot) continue;
          if (rule.event !== '*' && rule.event !== eventType) continue;

          // Determine target(s)
          const targets = rule.to === '*'
            ? [...iframes.entries()].filter(([s]) => s !== sourceSlot).map(([, iframe]) => iframe)
            : [iframes.get(rule.to)].filter(Boolean);

          // Forward to targets via MCP Apps protocol
          for (const target of targets) {
            sendToolResult(target, {
              action: rule.action,
              data: contextData,
              sourceSlot
            });
          }
        }

        // Acknowledge the request
        e.source.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, '*');
        return;
      }

      // Handle ui/message - for debugging/logging
      if (msg.method === 'ui/message') {
        console.log('[Composite] UI message from slot', sourceSlot, ':', msg.params);
        e.source.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, '*');
        return;
      }
    });
  `;
}
```

### Tabs Layout Special Handling

For tabs layout, additional JavaScript is needed for tab switching:

```typescript
// Additional script for tabs layout
if (descriptor.layout === "tabs") {
  script += `
    // Tab switching logic
    const tabs = document.querySelectorAll('.tab');
    const tabIframes = document.querySelectorAll('.layout-tabs > iframe');

    function switchTab(slot) {
      tabs.forEach((t, i) => t.classList.toggle('active', i === slot));
      tabIframes.forEach((iframe, i) => iframe.classList.toggle('active', i === slot));
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => switchTab(i));
    });

    // Show first tab by default
    switchTab(0);
  `;
}
```

### Project Structure Notes

| Path | Purpose |
|------|---------|
| `packages/pml/src/ui/` | **NEW** directory for UI generation |
| `packages/pml/src/ui/composite-generator.ts` | **NEW** main file with buildCompositeUi, generateCompositeHtml |
| `packages/pml/src/ui/composite-generator_test.ts` | **NEW** unit tests |
| `packages/pml/src/ui/mod.ts` | **NEW** public exports |
| `packages/pml/src/types/ui-orchestration.ts` | Existing types (Story 16.1) |
| `packages/pml/src/execution/sandbox-executor.ts` | Existing - calls buildCompositeUi (Story 16.3 prep) |

### Design Decisions

1. **Pure Functions** - `buildCompositeUi` and `generateCompositeHtml` are pure functions, no side effects

2. **UUID for Workflow ID** - Use `crypto.randomUUID()` (native Deno/browser API) for unique workflow IDs

3. **Inline Event Bus** - JavaScript is inlined in HTML for self-contained composite (no external dependencies)

4. **No External CSS** - All CSS is inlined for portability across MCP clients

5. **Standard HTML5** - Use only standard HTML5/CSS3/ES6 features for maximum client compatibility

6. **Sandbox Security** - Iframes use `sandbox="allow-scripts allow-same-origin"` for controlled execution

7. **Fallback Layout** - Default to "stack" layout if no orchestration provided (most common use case)

8. **Broadcast as String** - Keep `"*"` as string in `ResolvedSyncRule.to` for explicit broadcast handling

### MCP Apps Protocol Requirements (Learned from Test Host)

**CRITICAL**: Le composite UI agit comme un "host" MCP Apps pour chaque iframe enfant. Le SDK `@modelcontextprotocol/ext-apps` utilise une validation Zod stricte - les messages mal formatés sont **ignorés silencieusement**.

#### 1. Réponse ui/initialize obligatoire

Chaque iframe envoie `ui/initialize` au chargement. Le composite **doit** répondre avec ce format exact :

```javascript
{
  jsonrpc: '2.0',
  id: msg.id,  // IMPORTANT: reprendre l'id de la requête
  result: {
    protocolVersion: '2026-01-26',  // Version du protocole
    hostInfo: {
      name: 'PML Composite UI',
      version: '1.0.0'
    },
    hostCapabilities: {
      openLinks: {},
      logging: {},
      updateModelContext: { text: {} },
      message: { text: {} }
    },
    hostContext: {
      theme: 'light',  // ou 'dark'
      displayMode: 'inline'  // ou 'fullscreen', 'pip'
    }
  }
}
```

**Erreurs courantes** :
- `capabilities` au lieu de `hostCapabilities` → ZodError
- Manque de `hostInfo` → ZodError
- `protocolVersion` incorrect → ZodError

#### 2. Méthode pour envoyer des données aux UIs

```javascript
// CORRECT - cette méthode déclenche app.ontoolresult dans le SDK
{
  jsonrpc: '2.0',
  method: 'ui/notifications/tool-result',
  params: {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    isError: false
  }
}

// INCORRECT - ces méthodes sont ignorées
method: 'ui/toolResult'           // ❌ n'existe pas
method: 'notifications/message'   // ❌ pour logging seulement
```

#### 3. Event Bus adapté au protocole MCP Apps

L'event bus doit intercepter les notifications des UIs enfants :

```javascript
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg.jsonrpc) return;

  // UI enfant demande l'initialisation
  if (msg.method === 'ui/initialize') {
    e.source.postMessage({
      jsonrpc: '2.0',
      id: msg.id,
      result: { /* hostInfo, hostCapabilities, hostContext */ }
    }, '*');
    return;
  }

  // UI enfant met à jour son contexte (ex: sélection de ligne)
  if (msg.method === 'ui/update-model-context') {
    // Extraire les données et router vers les autres UIs
    const data = msg.params?.content?.[0]?.text;
    routeToOtherUis(e.source, data);
  }
});
```

### Integration with Story 16.3

Story 16.3 prepared `SandboxExecutionResult.collectedUi` and `SandboxExecuteOptions.uiOrchestration`. This story implements the actual composition:

```typescript
// In pml:execute handler (future integration)
const result = await sandboxExecutor.execute(code, {
  context,
  clientToolHandler,
  uiOrchestration: capability.ui,  // From capability metadata
});

if (result.collectedUi && result.collectedUi.length > 1) {
  const composite = buildCompositeUi(result.collectedUi, capability.ui);
  const html = generateCompositeHtml(composite);
  // Register html as resource at composite.resourceUri
}
```

### Testing Pattern

```typescript
// packages/pml/src/ui/composite-generator_test.ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildCompositeUi, generateCompositeHtml } from "./composite-generator.ts";
import type { CollectedUiResource, UiOrchestration } from "../types/ui-orchestration.ts";

Deno.test("buildCompositeUi - creates descriptor with resolved sync rules", () => {
  const resources: CollectedUiResource[] = [
    { source: "postgres:query", resourceUri: "ui://postgres/table/1", slot: 0 },
    { source: "viz:render", resourceUri: "ui://viz/chart/2", slot: 1 },
  ];
  const orchestration: UiOrchestration = {
    layout: "split",
    sync: [{ from: "postgres:query", event: "filter", to: "viz:render", action: "update" }],
  };

  const result = buildCompositeUi(resources, orchestration);

  assertEquals(result.type, "composite");
  assertEquals(result.layout, "split");
  assertEquals(result.children.length, 2);
  assertEquals(result.sync.length, 1);
  assertEquals(result.sync[0].from, 0);  // Resolved from "postgres:query"
  assertEquals(result.sync[0].to, 1);    // Resolved from "viz:render"
});

Deno.test("buildCompositeUi - defaults to stack layout", () => {
  const resources: CollectedUiResource[] = [
    { source: "tool:a", resourceUri: "ui://a", slot: 0 },
  ];

  const result = buildCompositeUi(resources);

  assertEquals(result.layout, "stack");
});

Deno.test("buildCompositeUi - preserves broadcast marker", () => {
  const resources: CollectedUiResource[] = [
    { source: "date:picker", resourceUri: "ui://date", slot: 0 },
    { source: "table:view", resourceUri: "ui://table", slot: 1 },
  ];
  const orchestration: UiOrchestration = {
    layout: "split",
    sync: [{ from: "date:picker", event: "change", to: "*", action: "refresh" }],
  };

  const result = buildCompositeUi(resources, orchestration);

  assertEquals(result.sync[0].to, "*");
});

Deno.test("generateCompositeHtml - generates valid HTML structure", () => {
  const descriptor = buildCompositeUi([
    { source: "a", resourceUri: "ui://a", slot: 0 },
    { source: "b", resourceUri: "ui://b", slot: 1 },
  ], { layout: "split" });

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "<!DOCTYPE html>");
  assertStringIncludes(html, '<div class="layout-split"');
  assertStringIncludes(html, 'data-slot="0"');
  assertStringIncludes(html, 'data-slot="1"');
  assertStringIncludes(html, "syncRules");
});

Deno.test("generateCompositeHtml - each layout generates distinct CSS", () => {
  const layouts = ["split", "tabs", "grid", "stack"] as const;
  const htmls = layouts.map((layout) => {
    const descriptor = buildCompositeUi(
      [{ source: "a", resourceUri: "ui://a", slot: 0 }],
      { layout },
    );
    return generateCompositeHtml(descriptor);
  });

  // Each should have its own layout class
  assertStringIncludes(htmls[0], ".layout-split");
  assertStringIncludes(htmls[1], ".layout-tabs");
  assertStringIncludes(htmls[2], ".layout-grid");
  assertStringIncludes(htmls[3], ".layout-stack");
});
```

### Dependencies

**Depends on (DONE):**
- Story 16.1 - Types: `CollectedUiResource`, `UiOrchestration`, `CompositeUiDescriptor`, `ResolvedSyncRule`
- Story 16.3 - UI Collection: `SandboxExecutionResult.collectedUi`, `extractUiMeta()`

**Used by (FUTURE):**
- Story 16.2 (integration) - `resources/read` handler will call `generateCompositeHtml()`
- Story 16.5 - MessageTransport may use composite descriptor for routing

### Git Context (Recent Commits)

| Commit | Description |
|--------|-------------|
| `e2ade8c1` | fix(16.3): code review - lint fixes and test commits |
| `1bc71c2f` | 16.2 - MCP Server Resources Handlers |
| `2b309f16` | feat(pml): add UI orchestration types for MCP Apps (Story 16.1) |

### References

- [Source: packages/pml/src/types/ui-orchestration.ts - All UI types]
- [Source: packages/pml/src/execution/ui-utils.ts - extractUiMeta() helper]
- [Source: _bmad-output/planning-artifacts/spikes/2026-01-27-mcp-apps-ui-orchestration.md#Composite-UI-HTML-Generator]
- [Source: _bmad-output/planning-artifacts/epics/epic-16-mcp-apps-ui-orchestration.md#Story-16.4]

### FRs Covered

| FR ID | Description | How Addressed |
|-------|-------------|---------------|
| FR-UI-003 | Compose UIs with layout (split, tabs, grid, stack) | `buildCompositeUi()` + CSS per layout |
| FR-UI-004 | Route events between UI children via sync rules | Event bus script with rule matching |
| FR-UI-006 | Generate composite HTML with event bus | `generateCompositeHtml()` produces self-contained HTML |
| FR-UI-011 | Inject shared context in all UIs | Init message on iframe load |
| NFR-UI-001 | Latency < 200ms (no LLM round-trip) | Pure JS postMessage routing |
| NFR-UI-003 | Support Claude, ChatGPT, VS Code, Goose, Postman | Standard HTML5/CSS3/ES6 only |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- deno check: 3 files checked, no errors
- deno lint: 3 files checked, no errors
- deno test: 31 tests passed in 14ms (original 20 + 11 review fixes)

### Completion Notes List

- Implemented `buildCompositeUi()` with sync rule resolution (tool names → slot indices)
- Implemented `generateCompositeHtml()` with all 4 layout modes (split, tabs, grid, stack)
- Event bus supports MCP Apps Protocol (SEP-1865):
  - `ui/initialize` response with hostInfo, hostCapabilities, hostContext + sharedContext
  - `ui/update-model-context` routing per sync rules with sharedContext forwarding
  - `ui/notifications/tool-result` for sending data to child UIs
  - console.warn for malformed JSON-RPC messages (debugging)
- **sharedContext** fully implemented (FR-UI-011):
  - `UiOrchestration.sharedContext?: string[]` for key specification
  - `extractSharedContext()` extracts values from collected UI resources
  - Injected in hostContext and forwarded in all sync messages
- CSS variables for dark mode support (`--pml-*` custom properties)
- Viewport meta tag for mobile compatibility
- Tabs layout handles empty resources gracefully
- Broadcast (`to: "*"`) forwards to all except sender
- All iframes have required attributes: id, data-slot, data-source, sandbox (with security documentation)
- Pure functions, no side effects, inline CSS/JS for portability
- 31 unit tests covering all ACs + review fixes

### File List

- `packages/pml/src/ui/composite-generator.ts` (NEW) - buildCompositeUi(), generateCompositeHtml(), extractSharedContext()
- `packages/pml/src/ui/mod.ts` (NEW) - Public exports
- `packages/pml/src/ui/composite-generator_test.ts` (NEW) - 31 unit tests
- `packages/pml/src/types/ui-orchestration.ts` (MODIFIED) - Added sharedContext to UiOrchestration and CompositeUiDescriptor

## Change Log

| Date | Change |
|------|--------|
| 2026-02-02 | Story 16.4 implemented - Composite UI Generator with buildCompositeUi and generateCompositeHtml functions, 20 tests passing |
| 2026-02-02 | **AI Code Review** - 2 HIGH, 4 MEDIUM, 3 LOW issues found. Main gaps: sharedContext not implemented (FR-UI-011), event bus format non-standard. Status → in-progress |
| 2026-02-02 | **All Review Issues Fixed** - sharedContext fully implemented, CSS variables for dark mode, viewport meta, console.warn debugging, empty tabs handling. 31 tests passing. Status → done |
