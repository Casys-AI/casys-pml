---
title: 'MCP Apps UI for lib/std - Audit & Implementation Guide'
slug: 'mcp-apps-lib-std-ui-audit'
created: '2026-01-28'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
implementedDate: '2026-01-28'
reviewedDate: '2026-01-28'
tech_stack:
  - '@modelcontextprotocol/ext-apps SDK'
  - '@casys/mcp-server (ConcurrentMCPServer)'
  - '@casys/mcp-std (48 tool modules, 310+ tools)'
  - 'Deno/TypeScript'
  - 'Vite + vite-plugin-singlefile (UI bundling)'
files_to_modify:
  - 'lib/std/src/tools/types.ts (extend MiniTool with _meta)'
  - 'lib/std/src/client.ts (toMCPFormat include _meta)'
  - 'lib/std/server.ts (registerResource for UIs)'
  - 'lib/std/src/tools/*.ts (add _meta.ui to tools)'
files_to_create:
  - 'lib/std/src/ui/ (new folder for UI bundles)'
  - 'lib/std/src/ui/table-viewer/ (first UI)'
  - 'lib/std/vite.config.ts (UI build config)'
code_patterns:
  - 'MiniTool with _meta.ui.resourceUri'
  - 'server.registerResource(resource, handler)'
  - 'App class for UI-to-host communication'
  - 'Bundled single-file HTML via Vite'
test_patterns:
  - 'UI integration tests with ext-apps basic-host'
  - 'postMessage event routing tests'
---

# Tech-Spec: MCP Apps UI for lib/std - Audit & Implementation Guide

**Created:** 2026-01-28

## Overview

### Problem Statement

La lib/std contient 48 modules (310+ MiniTools) qui retournent uniquement du texte brut. De nombreux tools bénéficieraient d'interfaces visuelles interactives (tables SQL, diff viewers, graphiques, dashboards) pour améliorer l'expérience utilisateur.

Le SDK MCP Apps (SEP-1865) permet désormais aux tools MCP de retourner des UIs riches dans des iframes sécurisés, supportés par Claude, ChatGPT, VS Code, Goose et Postman.

Il manque :
1. Un catalogue des modules lib/std par potentiel UI
2. Une documentation claire du pattern d'implémentation
3. Un plan de priorisation pour l'ajout progressif d'UIs
4. Une réflexion sur l'architecture (split lib/std ou non)

### Solution

Créer une tech-spec de référence qui :
1. Documente le pattern MCP Apps applicable à lib/std
2. Fournit un audit complet des 48 modules avec scoring UI
3. Priorise les modules à UI-ifier (database, json, diff, git en premier)
4. Propose un template reproductible pour ajouter une UI à n'importe quel tool
5. Évalue l'option de split de lib/std en packages granulaires

### Scope

**In Scope:**
- Audit complet des 48 modules lib/std avec potentiel UI
- Documentation du pattern MCP Apps (server + client)
- Template de référence pour ajouter UI à un tool existant
- Priorisation des modules par valeur UI
- Réflexion architecturale sur split de lib/std
- Identification de nouveaux MCP std potentiels

**Out of Scope:**
- Implémentation effective des UIs (specs séparées par module)
- Tests E2E complets des UIs
- Déploiement en production
- PML UI orchestration/composition (couvert par Epic 16)

## Context for Development

### Codebase Patterns

**Architecture existante lib/server :**

```typescript
// lib/server/src/types.ts - Types MCP Apps déjà définis
export interface McpUiToolMeta {
  resourceUri: string;           // "ui://mcp-std/table-viewer"
  visibility?: Array<"model" | "app">;
  emits?: string[];              // PML extension: ["filter", "select"]
  accepts?: string[];            // PML extension: ["setData", "highlight"]
}

export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const MCP_APP_URI_SCHEME = "ui:";
```

**Pattern d'enregistrement de tool avec UI :**

```typescript
// Server-side: Register tool + resource
import { registerAppTool, registerAppResource } from "@modelcontextprotocol/ext-apps/server";

const resourceUri = "ui://mcp-std/query-viewer";

registerAppTool(server, "psql_query", {
  title: "PostgreSQL Query",
  description: "Execute SQL query with interactive results",
  inputSchema: { ... },
  _meta: {
    ui: {
      resourceUri,
      emits: ["filter", "sort", "select"],
      accepts: ["setData", "highlight"]
    }
  }
}, async (args) => {
  const result = await executeQuery(args.query);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

registerAppResource(server, resourceUri, resourceUri,
  { mimeType: "text/html;profile=mcp-app" },
  async () => ({
    contents: [{ uri: resourceUri, mimeType: "text/html;profile=mcp-app", text: htmlContent }]
  })
);
```

**Pattern UI (client-side) :**

```typescript
// UI: src/ui/query-viewer.ts
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Query Viewer", version: "1.0.0" });
await app.connect();

// Recevoir les résultats
app.ontoolresult = (result) => {
  const data = JSON.parse(result.content[0].text);
  renderTable(data);
};

// Appeler un tool depuis l'UI (rafraîchir, paginer, etc.)
async function handleRefresh() {
  const result = await app.callServerTool({
    name: "psql_query",
    arguments: { query: currentQuery, offset: currentOffset }
  });
  renderTable(JSON.parse(result.content[0].text));
}

// Informer le modèle d'une action utilisateur
async function handleFilter(column: string, value: string) {
  await app.updateModelContext({
    content: [{ type: "text", text: `User filtered ${column} = ${value}` }]
  });
}
```

### Files to Reference

| File | Purpose | Status |
| ---- | ------- | ------ |
| `lib/server/src/types.ts` | Types MCP Apps (McpUiToolMeta, MCPResource, MCP_APP_MIME_TYPE) | ✅ Ready |
| `lib/server/src/concurrent-server.ts` | ConcurrentMCPServer avec `registerResource()` | ✅ Ready |
| `lib/std/src/tools/types.ts` | Interface `MiniTool` - manque `_meta` | ⚠️ Modify |
| `lib/std/src/client.ts` | `toMCPFormat()` - n'inclut pas `_meta` | ⚠️ Modify |
| `lib/std/server.ts` | Bootstrap - n'enregistre pas les resources | ⚠️ Modify |
| `lib/std/src/tools/mod.ts` | Export centralisé des tools + `allTools[]` | ✅ Ready |
| `lib/std/src/tools/database.ts` | Exemple: `psql_query` tool (candidat P0 pour UI) | ✅ Ready |
| `lib/std/deno.json` | Config JSR `@casys/mcp-std` v0.4.0 | ✅ Ready |

### Investigation Deep Dive Results

**1. Architecture lib/server (Support MCP Apps)**

```typescript
// lib/server/src/types.ts - DÉJÀ DÉFINI
export interface McpUiToolMeta {
  resourceUri: string;                    // "ui://mcp-std/table-viewer"
  visibility?: Array<"model" | "app">;    // Control qui peut voir/appeler
  emits?: string[];                       // PML: events émis ["filter", "select"]
  accepts?: string[];                     // PML: events acceptés ["setData"]
}

export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const MCP_APP_URI_SCHEME = "ui:";
```

```typescript
// lib/server/src/concurrent-server.ts - DÉJÀ IMPLÉMENTÉ
registerResource(resource: MCPResource, handler: ResourceHandler): void {
  this.validateResourceUri(resource.uri);  // Warn if not ui://
  this.mcpServer.registerResource(name, uri, { mimeType }, async (uri) => {
    const content = await handler(uri);
    return { contents: [content] };
  });
}
```

**2. Gap Identifié: lib/std ne passe pas _meta**

```typescript
// lib/std/src/tools/types.ts - ACTUEL (INCOMPLET)
export interface MiniTool {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: Record<string, unknown>;
  handler: MiniToolHandler;
  // ❌ MANQUE: _meta?: { ui?: McpUiToolMeta }
}

// lib/std/src/client.ts - ACTUEL (INCOMPLET)
toMCPFormat(): Array<{ name, description, inputSchema }> {
  return this.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    // ❌ _meta NON INCLUS - les UIs ne seront pas découvertes !
  }));
}
```

**3. Build actuel lib/std**

```json
// lib/std/deno.json
{
  "name": "@casys/mcp-std",
  "version": "0.4.0",
  "tasks": {
    "compile": "deno compile -A --output mcp-std server.ts"
  },
  "exports": {
    ".": "./mod.ts",
    "./server": "./server.ts"
  }
}
```

- Compilé en binaire standalone via `deno compile`
- Publié sur JSR comme `@casys/mcp-std`
- Pas de build UI actuellement (Vite à ajouter)

### Technical Decisions

1. **Utiliser l'infrastructure lib/server existante** - `McpUiToolMeta` et `registerResource()` sont déjà en place, pas besoin de réinventer
2. **Étendre MiniTool plutôt que créer un nouveau type** - Backward compatible, les tools sans UI continueront de fonctionner
3. **UI bundlée en single-file HTML** - Vite + vite-plugin-singlefile pour simplifier le serving et éviter les problèmes de paths
4. **Dossier `lib/std/src/ui/` séparé** - Isoler le code UI du code tool pour clarté et build séparé
5. **Framework-agnostic** - Vanilla JS/TS par défaut, frameworks (React/Vue/Svelte) optionnels
6. **emits/accepts pour PML** - Extensions PML déjà dans les types pour future composition cross-UI
7. **Pas de split lib/std pour l'instant** - Évaluer après implémentation des premières UIs si le bundle devient trop lourd (>500KB)

### Contraintes Techniques Identifiées

| Contrainte | Impact | Mitigation |
|------------|--------|------------|
| `toMCPFormat()` ignore `_meta` | Les UIs ne seront pas découvertes par les hosts | Modifier pour inclure `_meta` |
| Pas de build UI existant | Pas de pipeline pour bundler les HTML | Ajouter Vite config |
| 310+ tools existants | Migration progressive requise | Commencer par P0 (database) |
| Binaire compilé via `deno compile` | Les UIs doivent être embarquées ou servies séparément | Embed dans le binaire ou servir via HTTP |

## Audit Complet des Modules lib/std

### Modules à Potentiel UI HIGH (Prioritaires)

| Module | Tools | UI Ideas | Priority |
|--------|-------|----------|----------|
| **database** | 16 | Query builder, result table viewer, schema browser | P0 |
| **pglite** | 7 | Embedded DB query builder, result table | P0 |
| **json** | 10 | JSON tree viewer, JMESPath query builder, editor | P0 |
| **diff** | 7 | Interactive unified diff viewer, side-by-side compare | P1 |
| **git** | 4 | Commit history timeline, diff viewer, branch graph | P1 |
| **collections** | 20 | Data table with sort/filter, CSV export | P1 |
| **color** | 19 | Color picker, palette visualizer, gradient preview | P1 |
| **format** | 25 | YAML/JSON/TOML converter with live preview | P1 |
| **docker** | 19 | Container dashboard, resource graphs, network diagram | P2 |
| **kubernetes** | 4 | Cluster dashboard, pod visualizer, resource monitor | P2 |
| **sysinfo** | 12 | System metrics dashboard, CPU/memory/disk charts | P2 |
| **geo** | 13 | Interactive map viewer, distance calculator | P2 |
| **http** | 6 | Request builder, response inspector, headers editor | P2 |
| **network** | 8 | Network topology diagram, connection monitor | P2 |
| **qrcode** | 10 | QR code generator with preview, download button | P2 |
| **faker** | 16 | Live data preview table, seed manager | P2 |
| **string** | 21 | Text transformer with live preview | P3 |
| **text** | 10 | Text analyzer, word/character counter | P3 |
| **textanalysis** | 4 | Sentiment display, keyword cloud | P3 |
| **state** | 10 | State tree visualizer, transition diagram | P3 |
| **schema** | 6 | Schema editor, type visualizer | P3 |
| **process** | 5 | Process tree, CPU/memory monitor | P3 |
| **transform** | 8 | Transformation pipeline visualizer | P3 |
| **timezone** | 5 | World clock, timezone converter | P3 |
| **compare** | 6 | Text comparison with similarity % | P3 |
| **algo** | 20 | Algorithm visualizer, complexity graphs | P3 |
| **data** | 11 | Data transformation flow diagram | P3 |

### Modules à Potentiel UI MEDIUM

| Module | Tools | UI Ideas |
|--------|-------|----------|
| **crypto** | 20 | Key strength indicator, algorithm selector |
| **datetime** | 7 | Calendar picker, duration visualizer |
| **devtools** | 10 | Version selector, cron schedule preview |
| **encoding** | 10 | Encoding converter with live preview |
| **iptools** | 7 | IP calculator, CIDR visualizer, subnet table |
| **math** | 17 | Formula visualizer, graph plotter |
| **media** | 3 | File metadata display, thumbnail preview |
| **packages** | 5 | Dependency tree visualizer |
| **path** | 13 | Path builder, directory tree explorer |
| **python** | 5 | Script editor, output viewer |
| **resilience** | 8 | Retry visualizer, circuit breaker diagram |
| **ssh** | 3 | Connection config editor |

### Modules à Potentiel UI LOW/NONE

| Module | Reason |
|--------|--------|
| **archive** | Purely computational (compress/decompress) |
| **build** | Internal build operations |
| **cloud** | Cloud API wrappers |
| **common** | Internal utilities |
| **mod** | Module exports only |
| **types** | Type definitions only |
| **agent** | Agent internal state |

## Implementation Plan

### Phase 1: Infrastructure MCP Apps pour lib/std

#### Task 1.1: Étendre l'interface MiniTool avec _meta

- [ ] **File:** `lib/std/src/tools/types.ts`
- [ ] **Action:** Ajouter le champ optionnel `_meta` à l'interface `MiniTool`
- [ ] **Code:**
  ```typescript
  import type { McpUiToolMeta } from "@casys/mcp-server";

  export interface MiniTool {
    name: string;
    description: string;
    category: ToolCategory;
    inputSchema: Record<string, unknown>;
    handler: MiniToolHandler;
    _meta?: {
      ui?: McpUiToolMeta;
    };
  }
  ```
- [ ] **Notes:** Import depuis `@casys/mcp-server` pour éviter la duplication de types

#### Task 1.2: Modifier toMCPFormat() pour inclure _meta

- [ ] **File:** `lib/std/src/client.ts`
- [ ] **Action:** Modifier `toMCPFormat()` pour passer `_meta` aux tools
- [ ] **Code:**
  ```typescript
  toMCPFormat(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    _meta?: { ui?: McpUiToolMeta };
  }> {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      _meta: t._meta, // ✅ Inclure _meta pour MCP Apps discovery
    }));
  }
  ```
- [ ] **Notes:** Backward compatible - tools sans `_meta` retournent `undefined`

#### Task 1.3: Ajouter l'enregistrement des resources UI dans server.ts

- [ ] **File:** `lib/std/server.ts`
- [ ] **Action:** Enregistrer les resources UI après les tools
- [ ] **Code:**
  ```typescript
  // After server.registerTools()

  // Collect UI resources from tools
  const uiResources = new Map<string, { tool: MiniTool; uri: string }>();
  for (const tool of toolsClient.listTools()) {
    if (tool._meta?.ui?.resourceUri) {
      uiResources.set(tool._meta.ui.resourceUri, { tool, uri: tool._meta.ui.resourceUri });
    }
  }

  // Register UI resources
  for (const [uri, { tool }] of uiResources) {
    server.registerResource(
      { uri, name: `${tool.name} UI`, description: `Interactive UI for ${tool.name}` },
      async () => {
        const html = await loadUiHtml(uri);
        return { uri, mimeType: MCP_APP_MIME_TYPE, text: html };
      }
    );
  }
  ```
- [ ] **Notes:** `loadUiHtml()` helper à implémenter (Task 1.5)

#### Task 1.4: Créer la structure de dossier UI

- [ ] **Action:** Créer le dossier `lib/std/src/ui/` avec structure de base
- [ ] **Files to create:**
  ```
  lib/std/src/ui/
  ├── mod.ts              # Export des UIs et helper loadUiHtml
  ├── table-viewer/       # Première UI (P0)
  │   ├── index.html
  │   └── src/
  │       └── main.ts
  └── README.md           # Documentation du pattern
  ```

#### Task 1.5: Implémenter le helper loadUiHtml()

- [ ] **File:** `lib/std/src/ui/mod.ts`
- [ ] **Action:** Créer le helper pour charger les UIs bundlées
- [ ] **Code:**
  ```typescript
  import { MCP_APP_MIME_TYPE } from "@casys/mcp-server";

  // Map uri -> bundled HTML (embedded at build time)
  const UI_BUNDLES: Record<string, string> = {
    // Will be populated by build script
  };

  export async function loadUiHtml(uri: string): Promise<string> {
    const html = UI_BUNDLES[uri];
    if (!html) {
      throw new Error(`[mcp-std] UI resource not found: ${uri}`);
    }
    return html;
  }

  export { MCP_APP_MIME_TYPE };
  ```

#### Task 1.6: Ajouter Vite build config pour les UIs

- [ ] **File:** `lib/std/vite.config.ts`
- [ ] **Action:** Configurer Vite pour bundler les UIs en single-file HTML
- [ ] **Code:**
  ```typescript
  import { defineConfig } from "vite";
  import { viteSingleFile } from "vite-plugin-singlefile";

  export default defineConfig({
    plugins: [viteSingleFile()],
    build: {
      outDir: "dist/ui",
      rollupOptions: {
        input: {
          "table-viewer": "src/ui/table-viewer/index.html",
          // Ajouter les futures UIs ici
        },
      },
    },
  });
  ```

#### Task 1.7: Mettre à jour deno.json avec task build:ui

- [ ] **File:** `lib/std/deno.json`
- [ ] **Action:** Ajouter les tasks de build UI
- [ ] **Code:**
  ```json
  {
    "tasks": {
      "compile": "deno compile -A --output mcp-std server.ts",
      "build:ui": "vite build",
      "build": "deno task build:ui && deno task compile"
    }
  }
  ```

### Phase 2: Première UI - Table Viewer (POC)

#### Task 2.1: Implémenter Table Viewer HTML/TS

- [ ] **Files:** `lib/std/src/ui/table-viewer/index.html`, `lib/std/src/ui/table-viewer/src/main.ts`
- [ ] **Action:** Créer l'UI Table Viewer avec sort/filter (code fourni dans le template)
- [ ] **Features:**
  - Affichage des résultats en table
  - Tri par colonne (click header)
  - Filtre texte
  - Sélection de ligne
  - Notification au modèle des actions utilisateur

#### Task 2.2: Ajouter _meta.ui au tool psql_query

- [ ] **File:** `lib/std/src/tools/database.ts`
- [ ] **Action:** Ajouter `_meta.ui` au tool `psql_query`
- [ ] **Code:**
  ```typescript
  {
    name: "psql_query",
    description: "Execute SQL queries on PostgreSQL databases with interactive table viewer.",
    category: "database",
    inputSchema: { ... },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["filter", "sort", "select"],
        accepts: ["setData", "highlight"]
      }
    },
    handler: async (...) => { ... }
  }
  ```

#### Task 2.3: Tester avec basic-host

- [ ] **Action:** Tester l'UI avec le basic-host du SDK ext-apps
- [ ] **Steps:**
  1. `cd lib/std && deno task build`
  2. `deno run -A server.ts`
  3. Clone ext-apps, run basic-host avec `SERVERS='["stdio:deno run -A lib/std/server.ts"]'`
  4. Appeler `psql_query` et vérifier que l'UI s'affiche

### Phase 3: Rollout progressif (Specs séparées)

Chaque module P0-P3 aura sa propre mini tech-spec avec:
- UI design spécifique
- Acceptance criteria
- Tests

**Ordre recommandé:**
1. `psql_query` (P0) - Table Viewer ✅ (cette spec)
2. `pglite_query` (P0) - Réutilise Table Viewer
3. `json_parse` / `json_query` (P0) - JSON Tree Viewer
4. `diff_text` (P1) - Diff Viewer
5. `git_log` (P1) - Commit Timeline

### Réflexion: Split de lib/std

**Status actuel:** 48 modules dans un seul package `@anthropic/minitools`

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Keep monolith** | Simple, single import | Large bundle, all-or-nothing |
| **Split by domain** | Granular imports, smaller bundles | More packages to maintain |
| **Hybrid** | Core + extensions | Added complexity |

**Recommandation:** Commencer par l'option hybride :
- `@casys/mcp-std-core` - Tools essentiels (string, json, collections, path)
- `@casys/mcp-std-database` - database + pglite
- `@casys/mcp-std-devops` - docker, kubernetes, git, ssh
- `@casys/mcp-std-viz` - color, qrcode, geo
- `@casys/mcp-std-analysis` - text, textanalysis, diff, compare

**Decision:** À évaluer après implémentation des premières UIs. Si le bundle devient trop lourd (>500KB), procéder au split.

## Template de Référence: Ajouter UI à un Tool

### Structure de fichiers

```
lib/std/src/tools/
├── database.ts              # Tool definitions
├── database-ui/
│   ├── table-viewer.html    # UI entry point
│   ├── src/
│   │   └── table-viewer.ts  # UI logic
│   ├── vite.config.ts       # Build config
│   └── package.json         # UI dependencies
```

### Step 1: Modifier le tool pour déclarer l'UI

```typescript
// lib/std/src/tools/database.ts (partial)

export const psqlQueryTool: MCPTool = {
  name: "psql_query",
  description: "Execute PostgreSQL query with interactive table viewer",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "SQL query" },
      connectionString: { type: "string" }
    },
    required: ["query"]
  },
  _meta: {
    ui: {
      resourceUri: "ui://mcp-std/table-viewer",
      emits: ["filter", "sort", "select", "paginate"],
      accepts: ["setData", "highlight", "scrollTo"]
    }
  }
};
```

### Step 2: Enregistrer la resource UI

```typescript
// lib/server registration (or lib/std bundled UI)

server.registerResource({
  uri: "ui://mcp-std/table-viewer",
  name: "Interactive Table Viewer",
  description: "Display query results in sortable, filterable table",
  mimeType: "text/html;profile=mcp-app"
}, async () => {
  // Read bundled HTML (built from table-viewer.html)
  const html = await Deno.readTextFile("./dist/table-viewer.html");
  return {
    contents: [{ uri: "ui://mcp-std/table-viewer", mimeType: "text/html;profile=mcp-app", text: html }]
  };
});
```

### Step 3: Implémenter l'UI

```html
<!-- table-viewer.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Table Viewer</title>
  <style>
    /* Minimal styles - host provides theme via CSS variables */
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border: 1px solid var(--border-color, #ddd); text-align: left; }
    th { background: var(--header-bg, #f5f5f5); cursor: pointer; }
    th:hover { background: var(--header-hover, #e0e0e0); }
    .filter-input { width: 100%; padding: 4px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <input class="filter-input" type="text" placeholder="Filter..." id="filter">
  <table id="data-table">
    <thead id="table-head"></thead>
    <tbody id="table-body"></tbody>
  </table>
  <div id="pagination"></div>
  <script type="module" src="/src/table-viewer.ts"></script>
</body>
</html>
```

```typescript
// src/table-viewer.ts
import { App } from "@modelcontextprotocol/ext-apps";

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  totalCount: number;
}

const app = new App({ name: "Table Viewer", version: "1.0.0" });
let currentData: QueryResult | null = null;
let sortColumn = 0;
let sortDirection: "asc" | "desc" = "asc";
let filterText = "";

await app.connect();

// Receive initial data from tool result
app.ontoolresult = (result) => {
  try {
    currentData = JSON.parse(result.content?.find(c => c.type === "text")?.text ?? "{}");
    renderTable();
  } catch (e) {
    console.error("Failed to parse result:", e);
  }
};

// Receive partial args while streaming
app.ontoolinputpartial = (partial) => {
  // Could show query preview while typing
  console.log("Partial input:", partial.arguments);
};

function renderTable() {
  if (!currentData) return;

  const thead = document.getElementById("table-head")!;
  const tbody = document.getElementById("table-body")!;

  // Render headers with sort indicators
  thead.innerHTML = `<tr>${currentData.columns.map((col, i) =>
    `<th data-col="${i}">${col} ${i === sortColumn ? (sortDirection === "asc" ? "▲" : "▼") : ""}</th>`
  ).join("")}</tr>`;

  // Filter and sort rows
  let rows = [...currentData.rows];
  if (filterText) {
    rows = rows.filter(row =>
      row.some(cell => String(cell).toLowerCase().includes(filterText.toLowerCase()))
    );
  }
  rows.sort((a, b) => {
    const va = a[sortColumn], vb = b[sortColumn];
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDirection === "asc" ? cmp : -cmp;
  });

  // Render rows
  tbody.innerHTML = rows.map(row =>
    `<tr>${row.map(cell => `<td>${cell ?? ""}</td>`).join("")}</tr>`
  ).join("");
}

// Handle sort clicks
document.getElementById("table-head")!.addEventListener("click", (e) => {
  const th = (e.target as HTMLElement).closest("th");
  if (!th) return;

  const col = parseInt(th.dataset.col ?? "0");
  if (col === sortColumn) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  } else {
    sortColumn = col;
    sortDirection = "asc";
  }
  renderTable();

  // Notify model of sort action
  app.updateModelContext({
    content: [{ type: "text", text: `User sorted by column ${currentData?.columns[col]} ${sortDirection}` }]
  });
});

// Handle filter input
document.getElementById("filter")!.addEventListener("input", (e) => {
  filterText = (e.target as HTMLInputElement).value;
  renderTable();
});

// Handle row selection
document.getElementById("table-body")!.addEventListener("click", (e) => {
  const tr = (e.target as HTMLElement).closest("tr");
  if (!tr) return;

  // Highlight selected row
  document.querySelectorAll("tr.selected").forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");

  // Notify model
  const rowIndex = Array.from(tr.parentElement!.children).indexOf(tr);
  app.updateModelContext({
    content: [{ type: "text", text: `User selected row ${rowIndex + 1}` }],
    structuredContent: { selectedRow: currentData?.rows[rowIndex] }
  });
});
```

### Step 4: Build configuration

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "../../dist/ui",
    rollupOptions: {
      input: "table-viewer.html",
    },
  },
});
```

## Acceptance Criteria

### AC1: MiniTool supporte _meta.ui

- [ ] **Given** l'interface `MiniTool` dans `lib/std/src/tools/types.ts`
- [ ] **When** un développeur définit un tool avec `_meta: { ui: { resourceUri: "ui://mcp-std/table-viewer" } }`
- [ ] **Then** TypeScript compile sans erreur et le type est correctement inféré

### AC2: toMCPFormat() expose _meta aux hosts

- [ ] **Given** un `MiniTool` avec `_meta.ui.resourceUri` défini
- [ ] **When** `MiniToolsClient.toMCPFormat()` est appelé
- [ ] **Then** le résultat inclut `_meta` avec la valeur correcte
- [ ] **And** les tools sans `_meta` retournent `_meta: undefined` (pas d'erreur)

### AC3: Le serveur enregistre les resources UI

- [ ] **Given** le serveur `mcp-std` démarre avec des tools ayant `_meta.ui`
- [ ] **When** un host MCP appelle `resources/list`
- [ ] **Then** la liste inclut les resources `ui://mcp-std/*` déclarées
- [ ] **And** chaque resource a `mimeType: "text/html;profile=mcp-app"`

### AC4: Les resources UI sont servies correctement

- [ ] **Given** une resource UI enregistrée `ui://mcp-std/table-viewer`
- [ ] **When** un host appelle `resources/read` avec cette URI
- [ ] **Then** le serveur retourne le HTML bundlé
- [ ] **And** le HTML contient le code JavaScript inline (single-file)

### AC5: L'UI Table Viewer se connecte au host

- [ ] **Given** l'UI Table Viewer chargée dans un iframe sandbox
- [ ] **When** l'UI appelle `app.connect()`
- [ ] **Then** la connexion postMessage avec le host est établie
- [ ] **And** `app.ontoolresult` peut recevoir les données

### AC6: L'UI affiche et manipule les données

- [ ] **Given** l'UI reçoit un résultat `{ rows: [...], columns: [...] }`
- [ ] **When** l'utilisateur clique sur un header de colonne
- [ ] **Then** les données sont triées par cette colonne
- [ ] **And** l'indicateur de tri (▲/▼) s'affiche

### AC7: L'UI notifie le modèle des actions utilisateur

- [ ] **Given** l'utilisateur filtre ou sélectionne une ligne
- [ ] **When** l'action est effectuée
- [ ] **Then** `app.updateModelContext()` est appelé avec le contexte approprié
- [ ] **And** le modèle peut utiliser cette information pour des questions de suivi

### AC8: Build UI fonctionne

- [ ] **Given** le dossier `lib/std/src/ui/table-viewer/` avec HTML/TS
- [ ] **When** `deno task build:ui` est exécuté
- [ ] **Then** un fichier `dist/ui/table-viewer.html` est généré
- [ ] **And** le fichier est un single-file HTML avec JS/CSS inline

### AC9: Backward compatibility

- [ ] **Given** les 310+ tools existants sans `_meta.ui`
- [ ] **When** le serveur démarre
- [ ] **Then** tous les tools fonctionnent normalement
- [ ] **And** aucune erreur n'est loggée pour les tools sans UI

### AC10: Documentation complète

- [ ] **Given** cette tech-spec et le README dans `lib/std/src/ui/`
- [ ] **When** un développeur veut ajouter une UI à un nouveau tool
- [ ] **Then** il peut suivre le template sans information manquante
- [ ] **And** le template couvre: structure fichiers, types, build, test

## Additional Context

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/ext-apps` | `^1.0.1` | SDK officiel MCP Apps (client App class) |
| `vite` | `^7.1.3` | Build tool pour bundler les UIs |
| `vite-plugin-singlefile` | `latest` | Plugin pour générer single-file HTML |
| `@casys/mcp-server` | `workspace` | Types `McpUiToolMeta`, `MCP_APP_MIME_TYPE` |

**Hosts MCP Apps supportés:**
- Claude (web + desktop)
- ChatGPT
- VS Code Insiders
- Goose
- Postman
- MCPJam

### Testing Strategy

#### Unit Tests
- [ ] `lib/std/src/tools/types_test.ts` - Vérifier que `MiniTool` accepte `_meta`
- [ ] `lib/std/src/client_test.ts` - Vérifier que `toMCPFormat()` inclut `_meta`
- [ ] `lib/std/src/ui/table-viewer/src/main_test.ts` - Logique tri/filtre (optionnel)

#### Integration Tests
- [ ] Utiliser `ext-apps/examples/basic-host` pour tester le flow complet:
  ```bash
  cd ext-apps/examples/basic-host
  SERVERS='["http://localhost:3001"]' npm start
  ```
- [ ] Vérifier: tool discovery, resource fetch, UI render, events

#### Manual E2E Tests
- [ ] Test dans Claude Desktop:
  1. Exposer le serveur via `cloudflared tunnel --url http://localhost:3001`
  2. Ajouter comme custom connector dans Claude settings
  3. Demander "Execute a SQL query" et vérifier l'UI iframe
  4. Tester tri, filtre, sélection

### Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SDK MCP Apps change (spec instable) | Medium | High | Pin version, suivre changelog |
| Performance UI (large datasets) | Medium | Medium | Pagination côté serveur, virtual scroll |
| Binaire compilé trop lourd avec UIs | Low | Medium | Évaluer split lib/std si >500KB |
| Incompatibilité entre hosts | Low | Medium | Tester sur plusieurs hosts (Claude, ChatGPT) |

### Notes

- **Relation avec Epic 16:** Le spike `2026-01-27-mcp-apps-ui-orchestration.md` couvre la composition PML (orchestration de plusieurs UIs). Cette spec est complémentaire et couvre l'ajout d'UI aux tools **individuels**.
- **Extensions PML:** Les champs `emits`/`accepts` dans `_meta.ui` sont prêts pour le routing d'events cross-UI (implémenté dans Epic 16)
- **Split lib/std:** Décision reportée. Monitorer la taille du bundle après ajout des premières UIs.

### Future Considerations (Out of Scope)

1. **UI Components Library:** Créer des composants réutilisables (Table, Chart, Tree) pour accélérer le développement
2. **Theme System:** Support dark/light mode via CSS variables du host
3. **Offline Support:** Service Worker pour UIs qui fonctionnent hors-ligne
4. **Streaming Results:** Support des résultats streamés (grande datasets)

### Sources

- [MCP Apps Documentation](https://modelcontextprotocol.io/docs/extensions/apps)
- [MCP Apps SDK Repository](https://github.com/modelcontextprotocol/ext-apps)
- [MCP Apps API Reference](https://modelcontextprotocol.github.io/ext-apps/api/)
- [MCP Apps Quickstart](https://modelcontextprotocol.github.io/ext-apps/api/documents/Quickstart.html)
- [SEP-1865 Specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [MCP Apps Blog Post](http://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- Internal: `_bmad-output/planning-artifacts/spikes/2026-01-27-mcp-apps-ui-orchestration.md`

## Review Notes

- **Adversarial review completed:** 2026-01-28
- **Findings:** 17 total, 15 false positives, 2 fixed
- **Resolution approach:** Auto-fix
- **Tests added:** 10 new tests (types, client, UI module)
- **All tests passing:** 150 tests (140 original + 10 new)
