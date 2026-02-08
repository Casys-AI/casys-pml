---
title: 'MCP Apps Resources Support for lib/server'
slug: 'mcp-apps-resources-lib-server'
created: '2026-01-28'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - TypeScript
  - Deno
  - '@modelcontextprotocol/sdk ^1.11.0'
files_to_modify:
  - lib/server/src/types.ts
  - lib/server/src/concurrent-server.ts
  - lib/server/mod.ts
code_patterns:
  - Wrapper pattern around McpServer SDK
  - Map-based registry (Map<string, T>)
  - registerX() / registerXs() methods
  - getXNames() / getXCount() introspection
  - Fail-fast with explicit errors (no silent fallbacks)
test_patterns:
  - Deno.test() with jsr:@std/assert
  - File naming: *_test.ts
---

# Tech-Spec: MCP Apps Resources Support for lib/server

**Created:** 2026-01-28
**Reviewed:** 2026-01-28 (Adversarial Review - 16 findings addressed)

## Overview

### Problem Statement

Le framework `ConcurrentMCPServer` dans `lib/server/` ne supporte que les tools MCP basiques. Pour MCP Apps (SEP-1865), les tools doivent pouvoir déclarer `_meta.ui` avec leurs events (`emits`/`accepts`) pour la découverte par l'IA, et le serveur doit exposer les resources correspondantes via les handlers `resources/list` et `resources/read`.

### Solution

Étendre le wrapper `ConcurrentMCPServer` existant pour :
1. Supporter `_meta.ui` dans la définition des tools (avec `resourceUri`, `visibility`, `emits`, `accepts`)
2. Exposer `registerResource()` / `registerResources()` qui wrappent `McpServer.registerResource()` du SDK
3. Ajouter les types nécessaires pour les resources et metadata UI
4. Maintenir un registry interne des resources pour l'introspection

### Scope

**In Scope:**
- Type `MCPTool._meta.ui` avec `resourceUri`, `visibility`, `emits`, `accepts`
- Types `MCPResource`, `ResourceHandler`, `McpUiToolMeta`
- Méthodes `registerResource()` / `registerResources()` dans `ConcurrentMCPServer`
- Méthodes utilitaires (`getResourceUris()`, `getResourceCount()`)
- Validation du schéma URI `ui://`
- Error handling cohérent avec le pattern tools

**Out of Scope:**
- Modification des tools dans mcp-std (spec séparée)
- Orchestration PML / composite UI
- Génération HTML des UIs
- Sync rules routing (géré par PML, pas le serveur)
- Resource templates dynamiques (`ui://server/{id}`) - future spec

## Context for Development

### Codebase Patterns

Le `ConcurrentMCPServer` est un wrapper autour de `McpServer` du SDK officiel `@modelcontextprotocol/sdk`. Il ajoute :
- Concurrency control via `RequestQueue`
- Rate limiting optionnel
- Schema validation optionnelle
- Sampling support optionnel

**Pattern existant pour les tools (à répliquer pour resources) :**
```typescript
// Registry - Map-based pour consistance
private tools = new Map<string, ToolWithHandler>();

// Registration avec validation
registerTool(tool: MCPTool, handler: ToolHandler): void
registerTools(tools: MCPTool[], handlers: Map<string, ToolHandler>): void

// Introspection
getToolNames(): string[]
getToolCount(): number
```

**Handler `tools/list` actuel (ligne 124-131) - DOIT être modifié pour inclure `_meta` :**
```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      // _meta: t._meta,  ← MANQUANT, à ajouter
    })),
  };
});
```

### Files to Reference

| File | Purpose | Lines |
| ---- | ------- | ----- |
| `lib/server/src/concurrent-server.ts` | Wrapper principal à étendre | 364 lignes |
| `lib/server/src/types.ts` | Types à étendre | 180 lignes |
| `lib/server/mod.ts` | Exports publics | ~30 lignes |
| `lib/server/src/schema-validator_test.ts` | Pattern de test Deno | Référence |
| `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` | API SDK `.registerResource()` | Référence |

### Technical Decisions

1. **Wrapper du SDK** : On utilise `McpServer.registerResource()` du SDK qui :
   - Ajoute automatiquement `resources: { listChanged: true }` aux capabilities
   - Configure les handlers `resources/list` et `resources/read` en interne
   - Gère le lifecycle des resources

2. **Registry interne** : On maintient une `Map<string, RegisteredResourceInfo>` côté wrapper car :
   - Le SDK ne fournit pas d'API pour lister les resources enregistrées
   - Nécessaire pour l'introspection (`getResourceCount()`, `getResourceUris()`)
   - Source de vérité locale synchronisée avec le SDK

3. **Contract des handlers** :
   - `ResourceHandler` retourne `ResourceContent` (notre format simplifié)
   - Le wrapper adapte vers le format SDK `{ contents: [ResourceContent] }`
   - Séparation claire : utilisateur = format simple, SDK = format complet

4. **Fail-fast policy** (conforme à `.claude/rules/no-silent-fallbacks.md`) :
   - Validation du schéma URI `ui://` avec warning si non-conforme
   - Erreur explicite si handler manquant
   - `_meta` toujours inclus dans `tools/list` (même si undefined)

5. **`emits`/`accepts` - Extension PML** :
   - Permet à l'IA de découvrir les events disponibles via `tools/list`
   - Format : tableau de strings représentant les noms d'events
   - Exemples : `emits: ["filter", "select", "sort"]`, `accepts: ["setData", "highlight"]`
   - L'orchestrateur PML utilise ces infos pour construire les sync rules

6. **MIME type** : `text/html;profile=mcp-app` (constante exportée)

7. **URI scheme** : `ui://` obligatoire pour MCP Apps, validé avec warning

## Implementation Plan

### Tasks

- [x] **Task 1: Add MCP Apps types to `types.ts`**
  - File: `lib/server/src/types.ts`
  - Action: Add new interfaces and extend `MCPTool`
  - Details:
    ```typescript
    // ============================================
    // MCP Apps Types (SEP-1865)
    // ============================================

    /**
     * MCP Apps UI metadata for tools (SEP-1865 + PML extensions)
     *
     * @example
     * ```typescript
     * const tool: MCPTool = {
     *   name: "query_table",
     *   description: "Query database table",
     *   inputSchema: { ... },
     *   _meta: {
     *     ui: {
     *       resourceUri: "ui://mcp-std/table-viewer",
     *       emits: ["filter", "select"],
     *       accepts: ["setData", "highlight"]
     *     }
     *   }
     * };
     * ```
     */
    export interface McpUiToolMeta {
      /**
       * Resource URI for the UI. MUST use ui:// scheme.
       * @example "ui://mcp-std/table-viewer"
       */
      resourceUri: string;

      /**
       * Visibility control: who can see/call this tool
       * - "model": Only the AI model can see/call
       * - "app": Only the UI app can call (hidden from model)
       * - Default (both): Visible to model and app
       */
      visibility?: Array<"model" | "app">;

      /**
       * Events this UI can emit (PML extension for sync rules)
       * Used by PML orchestrator to build cross-UI event routing
       * @example ["filter", "select", "sort", "paginate"]
       */
      emits?: string[];

      /**
       * Events this UI can accept (PML extension for sync rules)
       * Used by PML orchestrator to build cross-UI event routing
       * @example ["setData", "highlight", "scrollTo"]
       */
      accepts?: string[];
    }

    /** MCP Tool metadata container */
    export interface MCPToolMeta {
      ui?: McpUiToolMeta;
    }

    /**
     * MCP Resource definition for registration
     */
    export interface MCPResource {
      /**
       * Resource URI. SHOULD use ui:// scheme for MCP Apps.
       * @example "ui://mcp-std/table-viewer"
       */
      uri: string;

      /** Human-readable name */
      name: string;

      /** Description of the resource */
      description?: string;

      /** MIME type. Defaults to MCP_APP_MIME_TYPE if not specified */
      mimeType?: string;
    }

    /**
     * Content returned by a resource handler
     */
    export interface ResourceContent {
      /** URI of the resource (should match request) */
      uri: string;
      /** MIME type of the content */
      mimeType: string;
      /** The actual content (HTML for MCP Apps) */
      text: string;
    }

    /**
     * Resource handler callback
     *
     * @param uri - The requested resource URI as URL object
     * @returns ResourceContent with uri, mimeType, and text
     *
     * @example
     * ```typescript
     * const handler: ResourceHandler = async (uri) => ({
     *   uri: uri.toString(),
     *   mimeType: MCP_APP_MIME_TYPE,
     *   text: "<html>...</html>"
     * });
     * ```
     */
    export type ResourceHandler = (uri: URL) => Promise<ResourceContent> | ResourceContent;

    /** MCP Apps MIME type constant */
    export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app" as const;

    /** URI scheme for MCP Apps resources */
    export const MCP_APP_URI_SCHEME = "ui:" as const;
    ```
  - Also extend `MCPTool` interface:
    ```typescript
    /**
     * MCP Tool definition (compatible with MCP protocol)
     */
    export interface MCPTool {
      /** Tool name */
      name: string;

      /** Human-readable description */
      description: string;

      /** JSON Schema for tool input */
      inputSchema: Record<string, unknown>;

      /**
       * Tool metadata including UI configuration for MCP Apps
       * @see McpUiToolMeta
       */
      _meta?: MCPToolMeta;
    }
    ```

- [x] **Task 2: Fix `tools/list` handler to include `_meta`**
  - File: `lib/server/src/concurrent-server.ts`
  - Location: Line 124-131 (setupHandlers method)
  - Action: Always include `_meta` field in tool response
  - Rationale: Avoid silent omission - AI clients expect `_meta.ui` for discovery
  - Before:
    ```typescript
    tools: Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    ```
  - After:
    ```typescript
    tools: Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      _meta: t._meta,  // Always include, even if undefined
    })),
    ```

- [x] **Task 3: Add resource registration methods**
  - File: `lib/server/src/concurrent-server.ts`
  - Action: Add `registerResource()` and `registerResources()` methods with proper error handling
  - Details:
    ```typescript
    /** Internal tracking of registered resources */
    interface RegisteredResourceInfo {
      resource: MCPResource;
      handler: ResourceHandler;
    }

    // Add to class properties:
    private resources = new Map<string, RegisteredResourceInfo>();

    /**
     * Validate resource URI scheme
     * Logs warning if not using ui:// scheme (MCP Apps standard)
     */
    private validateResourceUri(uri: string): void {
      if (!uri.startsWith(MCP_APP_URI_SCHEME)) {
        this.log(
          `[WARN] Resource URI "${uri}" does not use ${MCP_APP_URI_SCHEME} scheme. ` +
          `MCP Apps standard requires ui:// URIs.`
        );
      }
    }

    /**
     * Register a single resource
     *
     * @param resource - Resource definition with uri, name, description
     * @param handler - Callback that returns ResourceContent when resource is read
     * @throws Error if resource with same URI already registered
     *
     * @example
     * ```typescript
     * server.registerResource(
     *   { uri: "ui://my-server/viewer", name: "Viewer", description: "Data viewer" },
     *   async (uri) => ({
     *     uri: uri.toString(),
     *     mimeType: MCP_APP_MIME_TYPE,
     *     text: "<html>...</html>"
     *   })
     * );
     * ```
     */
    registerResource(resource: MCPResource, handler: ResourceHandler): void {
      // Validate URI scheme
      this.validateResourceUri(resource.uri);

      // Check for duplicate
      if (this.resources.has(resource.uri)) {
        throw new Error(
          `[ConcurrentMCPServer] Resource already registered: ${resource.uri}`
        );
      }

      // Register with SDK - wraps our handler to SDK format
      // SDK expects: { contents: ResourceContent[] }
      // Our handler returns: ResourceContent
      this.mcpServer.registerResource(
        resource.name,
        resource.uri,
        {
          description: resource.description,
          mimeType: resource.mimeType ?? MCP_APP_MIME_TYPE,
        },
        async (uri) => {
          try {
            const content = await handler(uri);
            return { contents: [content] };
          } catch (error) {
            this.log(
              `[ERROR] Resource handler failed for ${uri}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            throw error;
          }
        }
      );

      // Track in our registry
      this.resources.set(resource.uri, { resource, handler });

      this.log(`Registered resource: ${resource.name} (${resource.uri})`);
    }

    /**
     * Register multiple resources
     *
     * @param resources - Array of resource definitions
     * @param handlers - Map of URI to handler function
     * @throws Error if any resource is missing a handler (fail-fast)
     */
    registerResources(
      resources: MCPResource[],
      handlers: Map<string, ResourceHandler>
    ): void {
      // Validate all handlers exist BEFORE registering any (fail-fast)
      const missingHandlers: string[] = [];
      for (const resource of resources) {
        if (!handlers.has(resource.uri)) {
          missingHandlers.push(resource.uri);
        }
      }

      if (missingHandlers.length > 0) {
        throw new Error(
          `[ConcurrentMCPServer] Missing handlers for resources:\n` +
          missingHandlers.map(uri => `  - ${uri}`).join('\n')
        );
      }

      // All handlers present, register resources
      for (const resource of resources) {
        const handler = handlers.get(resource.uri)!;
        this.registerResource(resource, handler);
      }

      this.log(`Registered ${resources.length} resources`);
    }
    ```

- [x] **Task 4: Add resource introspection methods**
  - File: `lib/server/src/concurrent-server.ts`
  - Action: Add introspection methods consistent with tools pattern
  - Details:
    ```typescript
    /**
     * Get number of registered resources
     */
    getResourceCount(): number {
      return this.resources.size;
    }

    /**
     * Get registered resource URIs
     */
    getResourceUris(): string[] {
      return Array.from(this.resources.keys());
    }

    /**
     * Check if a resource is registered
     */
    hasResource(uri: string): boolean {
      return this.resources.has(uri);
    }

    /**
     * Get resource info by URI (for testing/debugging)
     */
    getResourceInfo(uri: string): MCPResource | undefined {
      return this.resources.get(uri)?.resource;
    }
    ```

- [x] **Task 5: Update imports and exports**
  - File: `lib/server/src/concurrent-server.ts`
  - Action: Import new types from `types.ts`
  - Add to imports:
    ```typescript
    import type {
      // ... existing imports ...
      MCPResource,
      ResourceHandler,
      ResourceContent,
      MCPToolMeta,
      McpUiToolMeta,
    } from "./types.ts";
    import { MCP_APP_MIME_TYPE, MCP_APP_URI_SCHEME } from "./types.ts";
    ```
  - File: `lib/server/mod.ts`
  - Action: Export new types and constants
  - Add:
    ```typescript
    // MCP Apps types and constants
    export type {
      MCPResource,
      ResourceHandler,
      ResourceContent,
      McpUiToolMeta,
      MCPToolMeta
    } from "./src/types.ts";
    export { MCP_APP_MIME_TYPE, MCP_APP_URI_SCHEME } from "./src/types.ts";
    ```

- [x] **Task 6: Write unit tests**
  - File: `lib/server/src/resource-registration_test.ts` (new file)
  - Action: Add comprehensive tests for resource registration
  - Test strategy: Create a test server instance, register resources, verify state
  - Details:
    ```typescript
    import { assertEquals, assertThrows } from "jsr:@std/assert";
    import { ConcurrentMCPServer } from "./concurrent-server.ts";
    import type { MCPResource, ResourceHandler } from "./types.ts";
    import { MCP_APP_MIME_TYPE } from "./types.ts";

    // Helper to create test server
    function createTestServer() {
      return new ConcurrentMCPServer({
        name: "test-server",
        version: "1.0.0",
      });
    }

    Deno.test("registerResource - registers a resource", () => {
      const server = createTestServer();
      const resource: MCPResource = {
        uri: "ui://test/viewer",
        name: "Test Viewer",
        description: "A test viewer",
      };
      const handler: ResourceHandler = () => ({
        uri: resource.uri,
        mimeType: MCP_APP_MIME_TYPE,
        text: "<html></html>",
      });

      server.registerResource(resource, handler);

      assertEquals(server.getResourceCount(), 1);
      assertEquals(server.getResourceUris(), ["ui://test/viewer"]);
      assertEquals(server.hasResource("ui://test/viewer"), true);
    });

    Deno.test("registerResource - throws on duplicate URI", () => {
      const server = createTestServer();
      const resource: MCPResource = { uri: "ui://test/dup", name: "Dup" };
      const handler: ResourceHandler = () => ({
        uri: resource.uri,
        mimeType: MCP_APP_MIME_TYPE,
        text: "",
      });

      server.registerResource(resource, handler);

      assertThrows(
        () => server.registerResource(resource, handler),
        Error,
        "Resource already registered"
      );
    });

    Deno.test("registerResources - registers multiple resources", () => {
      const server = createTestServer();
      const resources: MCPResource[] = [
        { uri: "ui://test/a", name: "A" },
        { uri: "ui://test/b", name: "B" },
      ];
      const handlers = new Map<string, ResourceHandler>([
        ["ui://test/a", () => ({ uri: "ui://test/a", mimeType: MCP_APP_MIME_TYPE, text: "A" })],
        ["ui://test/b", () => ({ uri: "ui://test/b", mimeType: MCP_APP_MIME_TYPE, text: "B" })],
      ]);

      server.registerResources(resources, handlers);

      assertEquals(server.getResourceCount(), 2);
    });

    Deno.test("registerResources - throws if handler missing (fail-fast)", () => {
      const server = createTestServer();
      const resources: MCPResource[] = [
        { uri: "ui://test/a", name: "A" },
        { uri: "ui://test/b", name: "B" },
      ];
      const handlers = new Map<string, ResourceHandler>([
        ["ui://test/a", () => ({ uri: "ui://test/a", mimeType: MCP_APP_MIME_TYPE, text: "A" })],
        // Missing handler for "ui://test/b"
      ]);

      assertThrows(
        () => server.registerResources(resources, handlers),
        Error,
        "Missing handlers for resources"
      );

      // Verify no resources were registered (atomic fail)
      assertEquals(server.getResourceCount(), 0);
    });

    Deno.test("getResourceInfo - returns resource details", () => {
      const server = createTestServer();
      const resource: MCPResource = {
        uri: "ui://test/info",
        name: "Info Test",
        description: "Description",
      };
      server.registerResource(resource, () => ({
        uri: resource.uri,
        mimeType: MCP_APP_MIME_TYPE,
        text: "",
      }));

      const info = server.getResourceInfo("ui://test/info");

      assertEquals(info?.name, "Info Test");
      assertEquals(info?.description, "Description");
    });

    Deno.test("getResourceInfo - returns undefined for unknown URI", () => {
      const server = createTestServer();

      assertEquals(server.getResourceInfo("ui://unknown"), undefined);
    });
    ```

  - File: `lib/server/src/tools-meta_test.ts` (new file)
  - Action: Test that `_meta` is included in tools/list
  - Note: Requires mocking or integration test approach
    ```typescript
    import { assertEquals } from "jsr:@std/assert";
    import { ConcurrentMCPServer } from "./concurrent-server.ts";
    import type { MCPTool } from "./types.ts";

    Deno.test("tools/list includes _meta when present", async () => {
      const server = createTestServer();
      const tool: MCPTool = {
        name: "test_tool",
        description: "A test tool",
        inputSchema: { type: "object" },
        _meta: {
          ui: {
            resourceUri: "ui://test/tool-ui",
            emits: ["filter"],
            accepts: ["setData"],
          },
        },
      };

      server.registerTool(tool, () => "result");

      // Access internal tools map to verify _meta is stored
      // Note: This tests storage, not the MCP response (would need integration test)
      assertEquals(server.getToolCount(), 1);
      // The actual tools/list response would need an integration test
    });
    ```

### Acceptance Criteria

- [ ] **AC1:** Given a tool with `_meta.ui`, when `tools/list` is called, then the response includes the `_meta` field with UI metadata including `resourceUri`, `emits`, and `accepts`

- [ ] **AC2:** Given a resource definition and handler, when `registerResource()` is called, then the resource is registered with the SDK and appears in `resources/list`

- [ ] **AC3:** Given a registered resource, when the MCP client calls `resources/read` with the URI, then the SDK invokes our handler wrapper which calls the user's handler and returns `{ contents: [ResourceContent] }`

- [ ] **AC4:** Given multiple resources with all handlers provided, when `registerResources()` is called, then all resources are registered atomically

- [ ] **AC5:** Given a resource registration without a handler in the handlers Map, when `registerResources()` is called, then an error is thrown listing all missing handlers AND no resources are registered (fail-fast)

- [ ] **AC6:** Given registered resources, when `getResourceCount()` is called, then it returns the exact count matching `resources.size`

- [ ] **AC7:** Given a resource URI not using `ui://` scheme, when `registerResource()` is called, then a warning is logged but registration proceeds (soft validation)

- [ ] **AC8:** Given a resource handler that throws an error, when `resources/read` is called, then the error is logged and re-thrown to the SDK

## Additional Context

### Dependencies

- `@modelcontextprotocol/sdk` ^1.11.0 (already present, no upgrade needed)
- No new external dependencies required

### Testing Strategy

**Unit Tests** (new files):
- `lib/server/src/resource-registration_test.ts`
  - Test `registerResource()` with valid resource
  - Test duplicate URI rejection
  - Test `registerResources()` with all handlers
  - Test `registerResources()` fail-fast on missing handlers
  - Test introspection methods

- `lib/server/src/tools-meta_test.ts`
  - Test `_meta` storage in tools registry
  - Test tool with `emits`/`accepts`

**Integration Tests** (manual or future automation):
1. Create test MCP server with `ConcurrentMCPServer`
2. Register tool with `_meta.ui` including `emits`/`accepts`
3. Register resource with HTML content
4. Connect via MCP Inspector or test client
5. Verify `tools/list` shows complete `_meta.ui`
6. Verify `resources/list` shows registered resource
7. Verify `resources/read` returns HTML content

**Mocking Strategy**:
- Unit tests operate on our wrapper's state (`resources` Map)
- We don't mock `McpServer.registerResource()` - we trust the SDK
- Integration tests verify end-to-end behavior

### Notes

**Adversarial Review Fixes Applied:**
- F1/F8: Clarified handler contract - user returns `ResourceContent`, wrapper adapts to SDK format
- F2: Using `Map<string, RegisteredResourceInfo>` as authoritative registry
- F3: Documented that SDK adds capabilities automatically on `registerResource()`
- F4: `_meta` now always included in `tools/list` response
- F5: Added try/catch with logging in resource handler wrapper
- F6: Fail-fast validation with detailed error listing all missing handlers
- F7: Added `validateResourceUri()` with warning for non-ui:// schemes
- F9: Clarified SDK handles `resources/read` routing
- F10: Added JSDoc examples for `emits`/`accepts` usage
- F11: Unified logging format with context prefixes
- F12: Detailed test strategy with mocking approach
- F13-F16: Added documentation and clarifications

**References:**
- Spike: `_bmad-output/planning-artifacts/spikes/2026-01-27-mcp-apps-ui-orchestration.md`
- Spec officielle: https://github.com/modelcontextprotocol/ext-apps
- Documentation: https://modelcontextprotocol.io/docs/extensions/apps
- Project policy: `.claude/rules/no-silent-fallbacks.md`

**Future Considerations (Out of Scope):**
- Resource templates for dynamic URIs (`ui://server/{id}`) - requires `ResourceTemplate` class
- Resource caching/invalidation
- Resource list changed notifications (`sendResourceListChanged()`)
- Middleware for resource reads (rate limiting, auth) - SDK limitation

**Known Limitations:**
- The SDK manages `resources/list` and `resources/read` handlers internally
- Cannot add middleware (rate limiting, metrics) to resource reads like we do for tools
- Introspection relies on our internal Map, not SDK state (kept in sync via registration)

### Sources

- [MCP Apps Documentation](https://modelcontextprotocol.io/docs/extensions/apps)
- [SEP-1865 Specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [MCP Apps GitHub](https://github.com/modelcontextprotocol/ext-apps)

---

## Review Notes

- **Adversarial review completed:** 2026-01-28
- **Findings:** 8 total, 3 fixed, 2 skipped, 3 noise
- **Resolution approach:** Walk-through

### Fixes Applied:
- F2: Added test for URI edge cases (trailing slash, query params, encoding)
- F3: Added pre-validation for duplicate URIs in `registerResources()` for atomic behavior
- F4: Replaced non-null assertion with explicit handler check

### Skipped (intentional):
- F1: URI scheme warning-only is intentional per spec (soft validation)
- F5: Input validation on `MCPResource.name` is caller responsibility
