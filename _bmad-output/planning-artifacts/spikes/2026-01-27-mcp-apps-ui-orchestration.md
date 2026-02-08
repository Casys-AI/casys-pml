# Spike: MCP Apps UI Orchestration

**Date:** 2026-01-27
**Updated:** 2026-01-27 (recherche approfondie spec officielle)
**Status:** Exploration
**Author:** Erwan + Claude

## Context

MCP Apps est une extension officielle du Model Context Protocol (SEP-1865) permettant aux outils de retourner **des interfaces riches et interactives** dans des iframes sécurisés directement dans la conversation.

**Extension ID:** `io.modelcontextprotocol/ui`

**Clients supportés:**
- Claude (web + desktop)
- ChatGPT
- VS Code Insiders
- Goose
- Postman
- MCPJam

## Architecture Cible

```
┌─────────────────────────────────────────────────────────────────┐
│  CONVERSATION (Claude, ChatGPT, etc.)                           │
│                                                                 │
│  User: "Analyse les ventes et visualise"                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PML Composite UI (ui://pml/workflow/xxx)               │   │
│  │  ┌─────────────────┐  ┌─────────────────┐               │   │
│  │  │ iframe: Table   │  │ iframe: Chart   │               │   │
│  │  │ (postgres UI)   │  │ (viz UI)        │               │   │
│  │  │                 │  │                 │               │   │
│  │  │  filter ────────┼──┼─► update        │               │   │
│  │  └─────────────────┘  └─────────────────┘               │   │
│  │            PML Event Bus (sync cross-UI)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (apps/desktop) - Storybook/Figma mode                 │
│                                                                 │
│  Pour développer et tester les UI en isolation :                │
│  - Preview des layouts (split, tabs, grid)                      │
│  - Test des interactions sans MCP réel                          │
│  - Debug des events cross-UI                                    │
│  - Mocking des données                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Opportunity for PML

PML est **l'orchestrateur** : quand une capacité appelle plusieurs MCP qui retournent chacun une UI, PML :

1. **Collecte** les `_meta.ui` de chaque appel MCP
2. **Compose** une UI agrégée avec layout et sync rules
3. **Retourne** le composite au client (Claude) qui l'affiche dans la conversation
4. **Route** les events entre les UI enfants (notre innovation)

### Problème résolu

```
Capacité PML "Analyze and Visualize"
    ├── mcp.postgres.query()  → UI A (tableau SQL interactif)
    └── mcp.viz.render()      → UI B (graphique)

Sans PML: 2 UI séparées, non synchronisées
Avec PML: 1 UI composite, filter dans A → update dans B
```

## Spécification Technique MCP Apps

### MIME Type officiel

```
text/html;profile=mcp-app
```

### Resource URI Scheme

Toutes les UI doivent utiliser le schéma `ui://` :

```
ui://server-name/path/to/resource
ui://pml/workflow/abc123
ui://postgres/table/users
```

### Structure `_meta.ui` (Tool Metadata)

```typescript
interface McpUiToolMeta {
  resourceUri: string;                    // OBLIGATOIRE - "ui://..."
  visibility?: Array<"model" | "app">;    // Qui peut voir/appeler ce tool
}

// Exemple dans tool definition
{
  name: "postgres:query",
  description: "Execute SQL query",
  inputSchema: { ... },
  _meta: {
    ui: {
      resourceUri: "ui://postgres/table"
    }
  }
}
```

### Structure `_meta.ui` (Resource Metadata)

```typescript
interface McpUiResourceMeta {
  csp?: {                        // Content Security Policy
    connectDomains?: string[];   // Pour fetch/XHR/WebSocket
    resourceDomains?: string[];  // Pour scripts/images/fonts externes
    frameDomains?: string[];     // Pour nested iframes
    baseUriDomains?: string[];   // Pour document base URIs
  };
  permissions?: {                // Browser capabilities demandées
    camera?: {};
    microphone?: {};
    geolocation?: {};
    clipboardWrite?: {};
  };
  domain?: string;               // Dedicated sandbox origin
  prefersBorder?: boolean;       // Visual presentation hint
}
```

### Tool Visibility Control

```typescript
// Tool visible seulement par le modèle (pas l'UI)
{ visibility: ["model"] }

// Tool visible seulement par l'UI (pas le modèle)
{ visibility: ["app"] }

// Tool visible par les deux (défaut)
{ visibility: ["model", "app"] }
```

**Use case:** Tools internes pour refresh/pagination que l'UI appelle mais que le modèle n'a pas besoin de connaître.

## Communication Model

### Lifecycle complet

```
Host (Claude)               UI iframe
      │                          │
      │──ui/initialize──────────▶│  Handshake
      │◀────────────────result───│
      │                          │
      │──ui/notifications/       │
      │   tool-input-partial────▶│  Streaming args (pendant génération)
      │                          │
      │──ui/notifications/       │
      │   tool-input────────────▶│  Args complets
      │                          │
      │──ui/notifications/       │
      │   tool-result───────────▶│  Résultat d'exécution
      │                          │
      │◀──tools/call─────────────│  UI appelle un tool
      │────────────────result───▶│
      │                          │
      │◀──ui/update-model-context│  UI informe le modèle
      │────────────────result───▶│
      │                          │
      │──ui/resource-teardown───▶│  Cleanup
      │◀────────────────result───│
```

### API côté UI (App class)

```typescript
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "My App", version: "1.0.0" });
await app.connect();

// Callbacks pour recevoir les données
app.ontoolinputpartial = (partial) => {
  // Args en cours de génération (streaming)
  console.log("Partial args:", partial.arguments);
};

app.ontoolinput = (input) => {
  // Args complets
  console.log("Complete args:", input.arguments);
};

app.ontoolresult = (result) => {
  // Résultat de l'exécution du tool
  renderData(result.content);
};

app.ontoolcancelled = (info) => {
  // Exécution annulée
  showError(info.reason);
};

app.onhostcontextchanged = (context) => {
  // Theme, locale, dimensions changés
  applyTheme(context.theme);
};

// Méthodes pour interagir
const result = await app.callServerTool({
  name: "postgres:query",
  arguments: { sql: "SELECT * FROM users WHERE region = 'EU'" }
});

// Informer le modèle d'une action utilisateur (optionnel)
await app.updateModelContext({
  content: [{ type: "text", text: "User filtered by region: EU" }],
  structuredContent: { filter: { region: "EU" } }
});

// Ouvrir un lien externe
await app.openLink({ url: "https://docs.example.com" });

// Changer le mode d'affichage
await app.requestDisplayMode({ mode: "fullscreen" });
```

### Host Context

```typescript
interface McpUiHostContext {
  toolInfo?: {
    id?: string;
    tool: Tool;
  };
  theme?: "light" | "dark";
  styles?: {
    variables?: Record<string, string>;  // CSS custom properties
    css?: { fonts?: string };
  };
  displayMode?: "inline" | "fullscreen" | "pip";
  containerDimensions?: {
    width?: number;
    height?: number;
    maxWidth?: number;
    maxHeight?: number;
  };
  locale?: string;      // "fr-FR", "en-US"
  timeZone?: string;    // "Europe/Paris"
  platform?: "web" | "desktop" | "mobile";
}
```

## Point clé : Le modèle N'EST PAS dans la boucle temps réel

```
UI filter action
       │
       ▼
callServerTool("postgres:query", { filter: "EU" })
       │
       │  DIRECT via postMessage (~50-200ms)
       │  PAS de round-trip LLM !
       ▼
Host route vers MCP Server
       │
       ▼
MCP Server exécute
       │
       ▼
UI reçoit résultat et se met à jour
```

Le modèle peut être **informé** via `updateModelContext` mais ce n'est pas bloquant.

## Design PML : Composition Déclarative

### Principe

La capacité déclare comment orchestrer les UI. PML collecte et compose.

```typescript
// Capability definition
{
  id: "analyze-and-visualize",
  code: `
    const data = await mcp.postgres.query({ sql: "SELECT * FROM sales" });
    const chart = await mcp.viz.render({ data, type: "bar" });
    return { data, chart };
  `,

  // Déclaration de l'orchestration UI
  ui: {
    layout: "split",           // "split" | "tabs" | "grid" | "stack"

    // Event routing entre UI (INNOVATION PML - pas dans la spec MCP Apps)
    sync: [
      {
        from: "postgres:query",
        event: "filter",        // Détecté via args du callServerTool
        to: "viz:render",
        action: "update"
      },
      {
        from: "postgres:query",
        event: "select",
        to: "viz:render",
        action: "highlight"
      }
    ],

    // Context partagé injecté dans toutes les UI
    sharedContext: ["workflowId", "userId"]
  }
}
```

### Flux d'exécution

```
┌─────────────────────────────────────────────────────────────┐
│  1. Capability Definition                                    │
│     ui: { layout: "split", sync: [...] }                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. PML Execution (sandbox-executor.ts)                      │
│                                                              │
│  Pour chaque appel MCP:                                      │
│  - Exécute le tool                                           │
│  - Collecte result._meta.ui si présent                       │
│  - Stocke { source, resourceUri, slot }                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Composition                                              │
│                                                              │
│  - Merge les UI collectées avec les sync rules               │
│  - Génère le CompositeUiDescriptor                           │
│  - Map tool names → slot indices                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Response to Client (Claude)                              │
│                                                              │
│  {                                                           │
│    value: { data: [...], chart: {...} },                     │
│    _meta: {                                                  │
│      ui: {                                                   │
│        type: "composite",                                    │
│        resourceUri: "ui://pml/workflow/abc123",              │
│        layout: "split",                                      │
│        children: [                                           │
│          { resourceUri: "ui://postgres/table", slot: 0 },    │
│          { resourceUri: "ui://viz/chart", slot: 1 }          │
│        ],                                                    │
│        sync: [                                               │
│          { from: 0, event: "filter", to: 1, action: "update" }│
│        ]                                                     │
│      }                                                       │
│    }                                                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Claude/ChatGPT affiche l'UI composite                    │
│     PML sert le HTML qui embed les enfants + event bus       │
└─────────────────────────────────────────────────────────────┘
```

## Architecture d'implémentation

### 3 Layers distincts

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: MCP Server (src/mcp/)                              │
│                                                              │
│  Responsabilités:                                            │
│  - Exposer tools PML avec _meta.ui                           │
│  - Servir les UI resources via resources/read                │
│  - Gérer resources/list pour discovery                       │
│                                                              │
│  Fichiers clés:                                              │
│  - src/mcp/server/http.ts (ajouter resources handlers)       │
│  - src/mcp/gateway-server.ts (exposer pml tools avec UI)     │
│  - src/mcp/server/types.ts (types McpUi*)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: PML Orchestrator (packages/pml/)                   │
│                                                              │
│  Responsabilités:                                            │
│  - Collecter _meta.ui des MCP appelés                        │
│  - Composer les UI en composite                              │
│  - Gérer les sync rules (notre innovation)                   │
│  - Générer le HTML composite avec event bus                  │
│                                                              │
│  Fichiers clés:                                              │
│  - packages/pml/src/execution/sandbox-executor.ts            │
│  - packages/pml/src/types/ui-orchestration.ts (nouveau)      │
│  - packages/pml/src/ui/composite-generator.ts (nouveau)      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Dev Frontend (apps/desktop/)                       │
│                                                              │
│  Mode Storybook/Figma - PAS pour l'affichage en production   │
│                                                              │
│  Responsabilités:                                            │
│  - Preview des layouts en isolation                          │
│  - Test des interactions sans MCP réel                       │
│  - Debug des events cross-UI                                 │
│  - Mock data pour développement                              │
│                                                              │
│  Fichiers clés:                                              │
│  - apps/desktop/src/components/UiPreview.tsx                 │
│  - apps/desktop/src/stories/ (UI stories)                    │
└─────────────────────────────────────────────────────────────┘
```

### Types TypeScript

```typescript
// packages/pml/src/types/ui-orchestration.ts

/** Layout modes for composite UI */
export type UiLayout = "split" | "tabs" | "grid" | "stack";

/** Sync rule for cross-UI event routing */
export interface UiSyncRule {
  from: string;           // Tool name: "postgres:query"
  event: string;          // Event type detected via args: "filter", "select"
  to: string | "*";       // Target tool or "*" for broadcast
  action: string;         // Action to trigger: "update", "highlight", "refresh"
}

/** Declarative UI orchestration in capability definition */
export interface UiOrchestration {
  layout: UiLayout;
  sync?: UiSyncRule[];
  sharedContext?: string[];  // Keys to inject in all UIs
}

/** Collected UI resource during execution */
export interface CollectedUiResource {
  source: string;           // Tool that returned this UI: "postgres:query"
  resourceUri: string;      // "ui://postgres/table/xxx"
  context?: Record<string, unknown>;
  slot: number;             // Execution order (for sync mapping)
}

/** Composite UI descriptor returned to client */
export interface CompositeUiDescriptor {
  type: "composite";
  resourceUri: string;      // "ui://pml/workflow/{id}"
  layout: UiLayout;
  children: CollectedUiResource[];
  sync: Array<{
    from: number;           // Slot index
    event: string;
    to: number | "*";
    action: string;
  }>;
  sharedContext?: Record<string, unknown>;
}

/** MCP Tool metadata with UI */
export interface McpUiToolMeta {
  resourceUri?: string;
  visibility?: Array<"model" | "app">;
}

/** MCP Resource metadata for UI */
export interface McpUiResourceMeta {
  csp?: {
    connectDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
    baseUriDomains?: string[];
  };
  permissions?: {
    camera?: {};
    microphone?: {};
    geolocation?: {};
    clipboardWrite?: {};
  };
  domain?: string;
  prefersBorder?: boolean;
}
```

### Sandbox Executor Changes

```typescript
// packages/pml/src/execution/sandbox-executor.ts

async execute(
  code: string,
  context: Record<string, unknown>,
  clientToolHandler?: ToolCallHandler,
  uiOrchestration?: UiOrchestration,
): Promise<SandboxExecutionResult> {

  const collectedUiResources: CollectedUiResource[] = [];
  let slotCounter = 0;

  const sandbox = new SandboxWorker({
    onRpc: async (method: string, args: unknown) => {
      const result = await this.routeToolCall(method, args, clientToolHandler);

      // Collect UI metadata from MCP responses
      if (result?._meta?.ui?.resourceUri) {
        collectedUiResources.push({
          source: method,
          resourceUri: result._meta.ui.resourceUri,
          context: result._meta.ui.context,
          slot: slotCounter++,
        });
      }

      return result;
    },
  });

  const result = await sandbox.execute(code, context);

  // Build composite UI if we collected any UI resources
  const compositeUi = collectedUiResources.length > 0
    ? this.buildCompositeUi(collectedUiResources, uiOrchestration)
    : undefined;

  return {
    success: result.success,
    value: result.value,
    toolCallRecords: this.toolCallRecords,
    _meta: compositeUi ? { ui: compositeUi } : undefined,
  };
}

private buildCompositeUi(
  resources: CollectedUiResource[],
  orchestration?: UiOrchestration,
): CompositeUiDescriptor {
  const workflowId = crypto.randomUUID();
  const toolToSlot = new Map(resources.map(r => [r.source, r.slot]));

  return {
    type: "composite",
    resourceUri: `ui://pml/workflow/${workflowId}`,
    layout: orchestration?.layout ?? "stack",
    children: resources,
    sync: (orchestration?.sync ?? []).map(rule => ({
      from: toolToSlot.get(rule.from) ?? 0,
      event: rule.event,
      to: rule.to === "*" ? "*" : (toolToSlot.get(rule.to) ?? 0),
      action: rule.action,
    })),
    sharedContext: orchestration?.sharedContext
      ? this.extractSharedContext(resources, orchestration.sharedContext)
      : undefined,
  };
}
```

### Composite UI HTML Generator

PML doit servir un HTML qui :
1. Embed les UI enfants dans des iframes
2. Implémente l'event bus pour le sync
3. Applique le layout

```typescript
// packages/pml/src/ui/composite-generator.ts

export function generateCompositeHtml(descriptor: CompositeUiDescriptor): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PML Composite UI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui; }

    .layout-split { display: flex; height: 100vh; }
    .layout-split > iframe { flex: 1; border: none; }

    .layout-tabs { height: 100vh; }
    .layout-tabs .tab-bar { display: flex; border-bottom: 1px solid #ccc; }
    .layout-tabs .tab { padding: 8px 16px; cursor: pointer; }
    .layout-tabs .tab.active { border-bottom: 2px solid #007bff; }
    .layout-tabs > iframe { width: 100%; height: calc(100% - 40px); border: none; }

    .layout-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 8px; height: 100vh; }
    .layout-grid > iframe { border: none; min-height: 300px; }

    .layout-stack { display: flex; flex-direction: column; }
    .layout-stack > iframe { flex: 1; border: none; min-height: 200px; }
  </style>
</head>
<body>
  <div class="layout-${descriptor.layout}" id="container">
    ${descriptor.children.map((child, i) => `
      <iframe
        id="ui-${child.slot}"
        src="${child.resourceUri}"
        data-slot="${child.slot}"
        data-source="${child.source}"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    `).join('\n')}
  </div>

  <script>
    // PML Event Bus - routes events between child UIs
    const syncRules = ${JSON.stringify(descriptor.sync)};
    const sharedContext = ${JSON.stringify(descriptor.sharedContext ?? {})};

    // Map slot to iframe
    const iframes = new Map();
    document.querySelectorAll('iframe').forEach(iframe => {
      iframes.set(parseInt(iframe.dataset.slot), iframe);
    });

    // Listen for messages from child UIs
    window.addEventListener('message', (e) => {
      const { slot, event, data } = e.data;
      if (typeof slot !== 'number' || !event) return;

      // Find matching sync rules
      const matchingRules = syncRules.filter(r => r.from === slot && r.event === event);

      for (const rule of matchingRules) {
        const targets = rule.to === "*"
          ? [...iframes.values()]
          : [iframes.get(rule.to)];

        for (const target of targets) {
          if (target && target !== e.source) {
            target.contentWindow.postMessage({
              action: rule.action,
              data,
              sharedContext,
            }, '*');
          }
        }
      }
    });

    // Inject shared context on load
    iframes.forEach((iframe, slot) => {
      iframe.addEventListener('load', () => {
        iframe.contentWindow.postMessage({
          action: 'init',
          slot,
          sharedContext,
        }, '*');
      });
    });
  </script>
</body>
</html>
  `.trim();
}
```

## MCP Server: Resources Handlers

```typescript
// src/mcp/server/http.ts - additions

// Add to handleJsonRpcRequest
if (method === "resources/list") {
  const resources = await deps.listResources?.() ?? [];
  return { jsonrpc: "2.0", id, result: { resources } };
}

if (method === "resources/read") {
  const { uri } = params as { uri: string };
  const resource = await deps.readResource?.(uri);
  if (!resource) {
    return { jsonrpc: "2.0", id, error: { code: -32602, message: `Resource not found: ${uri}` } };
  }
  return { jsonrpc: "2.0", id, result: resource };
}
```

```typescript
// src/mcp/gateway-server.ts - additions

async listResources(): Promise<Resource[]> {
  return [
    {
      uri: "ui://pml/trace-viewer",
      name: "Execution Trace Viewer",
      description: "Interactive visualization of PML execution traces",
      mimeType: "text/html;profile=mcp-app",
    },
    {
      uri: "ui://pml/graph-explorer",
      name: "Capability Graph Explorer",
      description: "Explore the capability knowledge graph",
      mimeType: "text/html;profile=mcp-app",
    },
  ];
}

async readResource(uri: string): Promise<ResourceContent | null> {
  if (uri.startsWith("ui://pml/workflow/")) {
    const workflowId = uri.split("/").pop();
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow?.compositeUi) return null;

    return {
      contents: [{
        uri,
        mimeType: "text/html;profile=mcp-app",
        text: generateCompositeHtml(workflow.compositeUi),
      }],
    };
  }

  // Other static UI resources...
  return null;
}
```

## Event Detection Strategy

MCP Apps ne définit pas d'events standardisés. PML détecte les events en matchant les `callServerTool` :

```typescript
// Sync rule
{ from: "postgres:query", event: "filter", to: "viz:render", action: "update" }

// Quand l'UI appelle:
callServerTool("postgres:query", { sql: "...", filter: { region: "EU" } })

// PML intercepte (dans AppBridge ou sandbox):
// - tool = "postgres:query" → match "from"
// - args contient "filter" → match "event"
// → Déclenche le routing vers "viz:render"
```

## POC Validé : Interception fonctionne

**Date:** 2026-01-27
**Fichier:** `apps/desktop/src/poc/mcp-apps-intercept-poc.html`

Le POC a validé que l'interception des `callServerTool` entre iframes fonctionne :

| Test | Résultat |
|------|----------|
| iframe enfant → `postMessage` → parent | ✅ |
| Parent intercepte `ui/initialize` | ✅ Répond comme host |
| Parent intercepte `tools/call` | ✅ Voit method + args |
| Sync rules (filter → update) | ✅ Notifie UI B |
| Sync rules (select → highlight) | ✅ Notifie UI B |
| UI B reçoit les événements | ✅ Se met à jour |

**Conclusion : L'architecture double-iframe fonctionne. PML peut intercepter et router.**

## Solution Élégante : Abstraction du Transport

### Insight clé

Le pattern d'interception MCP Apps est **identique** à celui de la sandbox PML existante :

```
SANDBOX (actuel)                    MCP APPS (nouveau)
─────────────────                   ────────────────────────

Deno Worker                         Browser iframe
     │                                   │
     │ mcp.postgres.query()              │ callServerTool()
     │                                   │
     ▼                                   ▼
postMessage({ type: "rpc" })        postMessage({ method: "tools/call" })
     │                                   │
     ▼                                   ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│  onRpc intercepte       │        │  onMessage intercepte   │
│  route vers MCP         │        │  route vers MCP         │
│  (RpcBridge)            │        │  + sync cross-UI        │
└─────────────────────────┘        └─────────────────────────┘
```

### Architecture avec abstraction

```
┌─────────────────────────────────────────────────────────────────┐
│                      RpcBridge (logique inchangée)              │
│                                                                 │
│  - handleMessage()      ← Même logique                          │
│  - handleRpcRequest()   ← Même logique (onRpc)                  │
│  - execute()            ← Même logique                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   MessageTransport    │  ← NOUVELLE ABSTRACTION
                    │   (interface)         │
                    └───────────┬───────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ DenoWorkerTransport│ │  IframeTransport  │ │ProtocolAdapter    │
│                   │ │                   │ │ (optionnel)       │
│ worker.postMessage│ │ iframe.postMessage│ │                   │
│ worker.onmessage  │ │ window.onmessage  │ │ toInternal()      │
│                   │ │                   │ │ toExternal()      │
└───────────────────┘ └───────────────────┘ └───────────────────┘
     EXISTANT            NOUVEAU               NOUVEAU
   (pas modifié)
```

### Interface MessageTransport

```typescript
// packages/pml/src/sandbox/transport/types.ts

/**
 * Generic message transport interface.
 * Works for both Deno Workers and Browser iframes.
 */
export interface MessageTransport {
  send(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
  onError?(handler: (error: Error) => void): void;
  close(): void;
}
```

### Implémentations

```typescript
// packages/pml/src/sandbox/transport/deno-worker.ts

export class DenoWorkerTransport implements MessageTransport {
  constructor(private worker: Worker) {}

  send(message: unknown): void {
    this.worker.postMessage(message);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.worker.onmessage = (e) => handler(e.data);
  }

  onError(handler: (error: Error) => void): void {
    this.worker.onerror = (e) => handler(new Error(e.message));
  }

  close(): void {
    this.worker.terminate();
  }
}
```

```typescript
// packages/pml/src/sandbox/transport/iframe.ts (BROWSER ONLY)

export class IframeTransport implements MessageTransport {
  private handler?: (message: unknown) => void;
  private boundHandleMessage: (e: MessageEvent) => void;

  constructor(private iframe: HTMLIFrameElement) {
    this.boundHandleMessage = this.handleMessage.bind(this);
    window.addEventListener('message', this.boundHandleMessage);
  }

  private handleMessage(e: MessageEvent): void {
    // Vérifier que ça vient de notre iframe
    if (e.source === this.iframe.contentWindow) {
      this.handler?.(e.data);
    }
  }

  send(message: unknown): void {
    this.iframe.contentWindow?.postMessage(message, '*');
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handler = handler;
  }

  close(): void {
    window.removeEventListener('message', this.boundHandleMessage);
  }
}
```

### Protocol Adapter (JSON-RPC ↔ format interne)

```typescript
// packages/pml/src/sandbox/transport/mcp-apps-adapter.ts

export class McpAppsProtocolAdapter {
  /**
   * Convert MCP Apps JSON-RPC to our internal format
   */
  static toInternal(jsonRpc: JsonRpcMessage): RpcMessage | null {
    // ui/initialize → on répond directement (pas de routing)
    if (jsonRpc.method === 'ui/initialize') {
      return { type: 'init', id: String(jsonRpc.id), params: jsonRpc.params };
    }

    // tools/call → convertir en notre format rpc
    if (jsonRpc.method === 'tools/call') {
      return {
        type: 'rpc',
        rpcId: String(jsonRpc.id),
        method: jsonRpc.params.name,
        args: jsonRpc.params.arguments,
      };
    }

    return null;
  }

  /**
   * Convert our internal format to MCP Apps JSON-RPC
   */
  static toExternal(internal: RpcResponseMessage): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: parseInt(internal.id) || internal.id,
      result: internal.result,
    };
  }
}
```

### Usage unifié

```typescript
// Sandbox Deno Worker (actuel - quasi inchangé)
const worker = new Worker(new URL("./sandbox-script.ts", import.meta.url), {
  type: "module",
  deno: { permissions: "none" },
});
const transport = new DenoWorkerTransport(worker);
const bridge = new RpcBridge(transport, onRpc);

// MCP Apps iframe (nouveau)
const iframe = document.getElementById('child-ui') as HTMLIFrameElement;
const transport = new IframeTransport(iframe);
const adapter = new McpAppsProtocolAdapter();
const bridge = new RpcBridge(transport, onRpc, adapter);

// LE MÊME onRpc POUR LES DEUX !
const onRpc: RpcHandler = async (method, args) => {
  // Sync rules (MCP Apps only)
  if (syncRules) {
    applySyncRules(method, args, syncRules);
  }

  // Route vers MCP server
  return await mcpClient.callTool(method, args);
};
```

### Ce qui change vs ce qui ne change pas

| Composant | Changement |
|-----------|------------|
| `RpcBridge` | Accepte `MessageTransport` au lieu de `Worker` direct |
| `SandboxWorker` | Crée `DenoWorkerTransport` en interne |
| `onRpc` handler | **IDENTIQUE** - même signature, même logique |
| Tests existants | **INCHANGÉS** |

| Nouveau | Description |
|---------|-------------|
| `MessageTransport` interface | Abstraction commune |
| `DenoWorkerTransport` | Wrapper pour Worker Deno |
| `IframeTransport` | Wrapper pour iframe browser |
| `McpAppsProtocolAdapter` | Traduction JSON-RPC ↔ interne |

## Implementation Plan

### Phase 0: POC (1-2 jours) ✅ FAIT

1. ~~Créer un MCP App minimal `pml:hello-ui`~~
2. ~~Le tester dans Claude Desktop via cloudflared~~
3. ~~Valider le rendu iframe~~

**Résultat:** POC HTML créé et validé (`apps/desktop/src/poc/mcp-apps-intercept-poc.html`)

### Phase 1: Types & Schema (2-3 jours)

1. Créer `packages/pml/src/types/ui-orchestration.ts`
2. Ajouter types dans `src/mcp/server/types.ts`
3. DB migration si stockage des UI orchestrations

### Phase 2: MCP Server Resources (3-5 jours)

1. Implémenter `resources/list` dans http.ts
2. Implémenter `resources/read` dans gateway-server.ts
3. Créer premier UI resource: trace-viewer

### Phase 3: UI Collection (3-5 jours)

1. Modifier sandbox-executor pour collecter `_meta.ui`
2. Tester avec MCP qui retournent des UI
3. Valider la collection fonctionne

### Phase 4: Composite Generation (1 semaine)

1. Implémenter `composite-generator.ts`
2. Ajouter le support des sync rules
3. Servir les UI composites via resources/read

### Phase 5: Dev Frontend (optionnel, 1 semaine)

1. Mode Storybook dans apps/desktop
2. Preview des layouts
3. Mock MCP pour test

## Risks

1. **Spec instability**: MCP Apps est nouveau (Jan 2026)
2. **Client fragmentation**: Chaque client peut implémenter différemment
3. **Sync complexity**: Le routing d'events peut devenir complexe
4. **Performance**: Chaque iframe = overhead

## Success Criteria

- [ ] PML expose des tools avec `_meta.ui.resourceUri`
- [ ] Claude/ChatGPT affiche les UI dans la conversation
- [ ] Les UI collectées sont composées correctement
- [x] **POC:** Le sync cross-UI fonctionne (filter → update) ✅ Validé 2026-01-27
- [x] **POC:** L'interception postMessage fonctionne ✅ Validé 2026-01-27
- [ ] Le dev frontend permet de prévisualiser les layouts
- [ ] Abstraction `MessageTransport` implémentée et testée

## References

- [MCP Apps Documentation](https://modelcontextprotocol.io/docs/extensions/apps)
- [SEP-1865 Specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [SDK @modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps)
- [Examples](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples)
- `packages/pml/src/execution/sandbox-executor.ts` - Point d'injection collection
