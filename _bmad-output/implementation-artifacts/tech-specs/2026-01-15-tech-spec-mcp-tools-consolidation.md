---
title: 'MCP Tools Consolidation - Extended Discover + Admin'
slug: 'mcp-tools-consolidation'
created: '2026-01-15'
status: 'in-review'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - TypeScript (strict mode)
  - Deno 2.x
  - MCP Protocol (JSON-RPC)
  - PostgreSQL (via DbClient)
  - Zod (validation)
files_to_modify:
  - src/mcp/tools/definitions.ts
  - src/mcp/handlers/discover-handler-facade.ts
  - src/mcp/handlers/cap-handler.ts
  - src/mcp/handlers/admin-handler.ts
  - src/application/use-cases/discover/mod.ts
  - src/application/use-cases/discover/types.ts
  - src/application/use-cases/discover/list-capabilities.ts
  - src/application/use-cases/discover/lookup.ts
  - src/application/use-cases/discover/get-details.ts
  - src/application/use-cases/discover/scope-filter.ts
  - src/application/use-cases/discover/discover-capabilities.ts
  - src/application/use-cases/admin/mod.ts
  - src/application/use-cases/admin/types.ts
  - src/application/use-cases/admin/rename-capability.ts
  - src/application/use-cases/admin/merge-capabilities.ts
  - src/mcp/gateway-server.ts
  - packages/pml/src/cli/shared/constants.ts
  - packages/pml/src/cli/stdio-command.ts
code_patterns:
  - Use Case pattern (UseCaseResult<T>)
  - Handler Facade pattern
  - Repository pattern (IToolRepository, CapabilityRegistry)
  - Deps interface for dependency injection
test_patterns:
  - Deno.test with @std/assert
  - Unit tests in tests/unit/application/use-cases/
  - Test file naming: *_test.ts or *.test.ts
---

# Tech-Spec: MCP Tools Consolidation - Extended Discover + Admin

**Created:** 2026-01-15

## Overview

### Problem Statement

The 5 cap tools (`cap:list`, `cap:lookup`, `cap:whois`, `cap:rename`, `cap:merge`) are separate from the main MCP schema, creating fragmentation. Users must learn and call multiple specialized tools when a unified interface would be simpler and more intuitive.

### Solution

Consolidate capability management into two unified tools:
1. **Extend `pml:discover`** to handle all "find" operations (search, list, lookup, whois) for both capabilities AND tools
2. **Create `pml:admin`** for all mutation operations (rename, merge)

This reduces the tool count from 9 to 3 main tools (`pml:execute`, `pml:discover`, `pml:admin`).

### Scope

**In Scope:**
- Extend `pml:discover` schema with `pattern`, `name`, `id`, `details` parameters
- Unified lookup for capabilities AND tools (not just caps)
- New use cases in `src/application/use-cases/discover/`:
  - `ListCapabilitiesUseCase` (pattern glob filtering)
  - `LookupUseCase` (exact name resolution for caps + tools)
  - `GetDetailsUseCase` (whois-style detailed metadata)
- New use case folder `src/application/use-cases/admin/`:
  - `RenameCapabilityUseCase`
  - `MergeCapabilitiesUseCase`
- New `pml:admin` tool definition
- Update `src/mcp/tools/definitions.ts`
- Refactor `src/mcp/handlers/cap-handler.ts` to use new use cases
- Delete `lib/std/src/tools/cap.ts`

**In Scope (Package):**
- Add `pml:abort`, `pml:replan`, `pml:admin` to package schema (`PML_TOOLS_FULL`)
- Update `packages/pml/src/cli/shared/constants.ts`
- Update `packages/pml/src/cli/stdio-command.ts` to handle new tools (forward to cloud)

**Out of Scope:**
- Data migration
- Other lib/std modules

## Context for Development

### Codebase Patterns

**Use Case Pattern (from `src/application/use-cases/`):**
```typescript
// Standard structure for all use cases
interface MyUseCaseDeps {
  repository: IRepository;
  // other dependencies
}

class MyUseCase {
  constructor(private readonly deps: MyUseCaseDeps) {}

  async execute(request: MyRequest): Promise<UseCaseResult<MyResult>> {
    // Validate input
    if (!request.field) {
      return { success: false, error: { code: "MISSING_FIELD", message: "..." } };
    }
    // Business logic
    return { success: true, data: result };
  }
}
```

**Handler Facade Pattern (from `src/mcp/handlers/`):**
- Thin facade that validates input and routes to use cases
- Formats MCP response (JSON in `content[0].text`)
- Handles telemetry/logging

**Repository Pattern:**
- `IToolRepository` - `findById(toolId)`, `findByIds(toolIds[])`
- `CapabilityRegistry` - `resolveByName(name, scope)`, `getById(id)`, `getByFqdnComponents(...)`

**Multi-tenant Support:**
- `getUserScope(userId)` returns `{ org, project }` for filtering
- Capabilities filtered by `cr.org = $1 AND cr.project = $2`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/application/use-cases/discover/discover-capabilities.ts` | Pattern to follow for new use cases |
| `src/application/use-cases/discover/types.ts` | Type definitions pattern |
| `src/application/use-cases/shared/types.ts` | `UseCaseResult<T>`, `UseCaseError` |
| `src/mcp/handlers/discover-handler-facade.ts` | Handler facade pattern |
| `src/mcp/handlers/cap-handler.ts` | Business logic to extract (CapModule class) |
| `src/mcp/tools/definitions.ts` | Tool schema definitions |
| `src/capabilities/capability-registry.ts` | Capability resolution methods |
| `src/tools/tool-store.ts` | Tool lookup methods |
| `src/domain/interfaces/tool-repository.ts` | IToolRepository interface |
| `packages/pml/src/cli/shared/constants.ts` | Package tool schema definitions (`PML_TOOLS_FULL`) |
| `packages/pml/src/cli/stdio-command.ts` | Package stdio handler (tool routing) |

### Technical Decisions

1. **Multi-tenant Scoping (CRITICAL):**
   - **Discover operations** (search, list, lookup, whois) return ONLY:
     - Capabilities in user's scope (`org = user.org AND project = user.project`)
     - OR public capabilities (`visibility = 'public'`)
   - **Admin operations** (rename, merge) allowed ONLY on:
     - User's own capabilities (`userId = currentUser.id`)
     - NOT on public capabilities they don't own
   - Tools are not user-scoped (MCP server-defined, visible to all)

   **Implementation: ScopeFilter Function Pattern (Efficient)**

   Instead of over-fetching (limit * 3) and post-filtering, the facade passes a
   `scopeFilter` function to the use case. This filters SHGAT results **BEFORE**
   fetching capability details, avoiding unnecessary database lookups.

   - **Facade** receives `userId`, computes `Scope` via `getUserScope()`
   - **Facade** creates a `scopeFilter` closure with `db` and `scope`
   - **Use case** calls `scopeFilter(capabilityIds)` after SHGAT scoring
   - **Use case** fetches details ONLY for allowed IDs

   ```typescript
   // DiscoverHandlerFacade
   async handle(args: unknown, userId?: string): Promise<...> {
     const scope = await this.deps.getUserScope(userId ?? null);

     // Create scope filter function (closure over db + scope)
     const scopeFilter = this.deps.db
       ? async (capIds: string[]) => filterCapabilityIdsByScope(this.deps.db!, capIds, scope)
       : undefined;

     const capsResult = await this.deps.capabilitiesUseCase.execute({
       intent,
       limit,
       intentEmbedding,
       scopeFilter,  // Function, not scope object
     });
   }

   // DiscoverCapabilitiesUseCase
   export type ScopeFilterFn = (capabilityIds: string[]) => Promise<Set<string>>;

   async execute(request: { intent, scopeFilter?, ... }): Promise<...> {
     let shgatResults = shgat.scoreAllCapabilities(embedding);

     // Filter by scope BEFORE fetching details (efficient)
     if (request.scopeFilter) {
       const allIds = shgatResults.map(r => r.capabilityId);
       const allowedIds = await request.scopeFilter(allIds);
       shgatResults = shgatResults.filter(r => allowedIds.has(r.capabilityId));
     }

     // Now fetch details only for allowed capabilities
     for (const result of shgatResults.slice(0, limit)) {
       const capability = await capStore.findById(result.capabilityId);
       // ...
     }
   }
   ```

   **Why this approach:**
   - SHGAT scores ALL capabilities anyway (it's a graph traversal)
   - The `limit` parameter only affects how many details we fetch
   - Over-fetching (limit * 3) wastes DB queries on filtered-out items
   - With `scopeFilter`, we fetch details only for items that pass the filter

   **SQL for scope filter:**
   ```sql
   SELECT pattern_id FROM workflow_pattern wp
   JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
   WHERE wp.pattern_id = ANY($1::uuid[])
   AND ((cr.org = $2 AND cr.project = $3) OR cr.visibility = 'public')
   ```

2. **Unified Lookup (caps + tools):**
   - For capabilities: use `CapabilityRegistry.resolveByName(name, scope)`
   - For tools: use `IToolRepository.findById(toolId)`
   - Distinguish by prefix or try both with fallback

3. **Details Parameter:**
   - `details: true` returns full metadata (whois-style)
   - `details: ["field1", "field2"]` returns specific fields (flexible)
   - Default: returns minimal info (id, name, description)

3. **Pattern Listing:**
   - Use existing `globToSqlLike()` helper from cap-handler
   - Support glob patterns: `*` → `%`, `?` → `_`

4. **Admin Actions:**
   - `action: "rename" | "merge"` with action-specific params
   - Validation via Zod schemas (reuse existing NamespaceSchema, ActionSchema)

## Implementation Plan

### Tasks

#### Phase 1: Types & Use Cases for Discover Extension

- [x] **Task 1:** Create discover extension types + scope filter helper
  - File: `src/application/use-cases/discover/types.ts`
  - Action: Add new types `ListRequest`, `LookupRequest`, `GetDetailsRequest` and corresponding result types
  - Notes: Keep existing types, add new ones alongside

- [x] **Task 1b:** Add scope filter helper for SHGAT post-filtering
  - File: `src/application/use-cases/discover/scope-filter.ts`
  - Action: Create `filterCapabilityIdsByScope(ids: string[], scope: Scope): Promise<Set<string>>`
  - Notes:
    ```typescript
    export async function filterCapabilityIdsByScope(
      db: DbClient,
      capabilityIds: string[],
      scope: Scope
    ): Promise<Set<string>> {
      if (capabilityIds.length === 0) return new Set();
      const rows = await db.query(`
        SELECT id FROM capability_records
        WHERE id = ANY($1::uuid[])
        AND ((org = $2 AND project = $3) OR visibility = 'public')
      `, [capabilityIds, scope.org, scope.project]);
      return new Set(rows.map(r => r.id));
    }
    ```

- [x] **Task 1c:** Update existing DiscoverCapabilitiesUseCase with scope filtering
  - File: `src/application/use-cases/discover/discover-capabilities.ts`
  - Action: Add `scopeFilter` function parameter and filter BEFORE fetching details
  - Notes:
    ```typescript
    // Type for scope filter function (injected by facade)
    export type ScopeFilterFn = (capabilityIds: string[]) => Promise<Set<string>>;

    export interface DiscoverCapabilitiesRequest extends DiscoverRequest {
      intentEmbedding?: number[];
      scopeFilter?: ScopeFilterFn;  // Function, not scope object
    }

    async execute(request: DiscoverCapabilitiesRequest): Promise<...> {
      let shgatResults = shgat.scoreAllCapabilities(embedding);

      // Filter by scope BEFORE fetching details (efficient)
      if (request.scopeFilter) {
        const allIds = shgatResults.map(r => r.capabilityId);
        const allowedIds = await request.scopeFilter(allIds);
        shgatResults = shgatResults.filter(r => allowedIds.has(r.capabilityId));
      }

      // Now fetch details only for allowed capabilities
      for (const result of shgatResults.slice(0, limit)) {
        const capability = await capStore.findById(result.capabilityId);
        // ... build result
      }
    }
    ```
  - Rationale: Passing a function instead of scope object keeps the use case
    decoupled from DB concerns. The facade owns the db connection and creates
    the filter closure. This avoids over-fetching (limit * 3) which would waste
    DB queries on filtered-out items.

- [x] **Task 2:** Create ListCapabilitiesUseCase
  - File: `src/application/use-cases/discover/list-capabilities.ts`
  - Action: Extract list logic from `cap-handler.ts` `handleList()` method
  - Notes:
    - Move `globToSqlLike()` to shared utils or keep in use case
    - Use `DbClient` for SQL queries with pattern filtering
    - Support `pattern`, `limit`, `offset` parameters
    - **Scoping:** Return only `(user's scope) OR (visibility = 'public')`
    - SQL: `WHERE (cr.org = $1 AND cr.project = $2) OR cr.visibility = 'public'`

- [x] **Task 3:** Create LookupUseCase (unified caps + tools)
  - File: `src/application/use-cases/discover/lookup.ts`
  - Action: Create use case that looks up by exact name
  - Notes:
    - Try capability lookup first via `CapabilityRegistry.resolveByName()`
    - Fall back to tool lookup via `IToolRepository.findById()`
    - Return unified `LookupResult` with `type: "capability" | "tool"`
    - **Scoping:** Capability must be in user's scope OR public

- [x] **Task 4:** Create GetDetailsUseCase
  - File: `src/application/use-cases/discover/get-details.ts`
  - Action: Extract whois logic from `cap-handler.ts` `handleWhois()` method
  - Notes:
    - Support lookup by UUID or FQDN
    - Return full metadata including `parametersSchema`, `toolsUsed`, etc.
    - For tools, return `inputSchema` and `serverId`
    - **Scoping:** Capability must be in user's scope OR public

- [x] **Task 5:** Update discover module exports
  - File: `src/application/use-cases/discover/mod.ts`
  - Action: Export new use cases and types
  - Notes: Keep existing exports, add new ones

#### Phase 2: Types & Use Cases for Admin

- [x] **Task 6:** Create admin use case folder structure
  - Files:
    - `src/application/use-cases/admin/mod.ts`
    - `src/application/use-cases/admin/types.ts`
  - Action: Create folder with module exports and type definitions
  - Notes: Follow same pattern as discover folder

- [x] **Task 7:** Create RenameCapabilityUseCase
  - File: `src/application/use-cases/admin/rename-capability.ts`
  - Action: Extract rename logic from `cap-handler.ts` `handleRename()` method
  - Notes:
    - Keep Zod validation (NamespaceSchema, ActionSchema)
    - Preserve embedding update logic
    - Emit `capability.zone.updated` event
    - Multi-tenant check: only allow mutations on user's own capabilities

- [x] **Task 8:** Create MergeCapabilitiesUseCase
  - File: `src/application/use-cases/admin/merge-capabilities.ts`
  - Action: Extract merge logic from `cap-handler.ts` `handleMerge()` method
  - Notes:
    - Keep transaction logic for atomicity
    - Preserve dependency redirection
    - Multi-tenant check for both source and target
    - Call `onMergedCallback` for graph cache invalidation

#### Phase 3: Tool Definitions & Handlers

- [x] **Task 9:** Extend pml:discover schema
  - File: `src/mcp/tools/definitions.ts`
  - Action: Add new parameters to `discoverTool.inputSchema`:
    ```typescript
    pattern: { type: "string", description: "Glob pattern for listing (e.g., 'auth:*')" },
    name: { type: "string", description: "Exact name for lookup (namespace:action or server:tool)" },
    id: { type: "string", description: "UUID or FQDN for detailed lookup" },
    details: {
      oneOf: [
        { type: "boolean" },
        { type: "array", items: { type: "string" } }
      ],
      description: "Return detailed metadata. true=all fields, array=specific fields"
    },
    limit: { type: "number", description: "Max results (default: 10, max: 500 for list)" },
    offset: { type: "number", description: "Pagination offset (for pattern listing)" }
    ```
  - Notes:
    - Make `intent` optional (required only for semantic search mode)
    - Update `DiscoverArgs` interface in facade to match:
    ```typescript
    export interface DiscoverArgs {
      intent?: string;      // Semantic search mode
      pattern?: string;     // List mode
      name?: string;        // Lookup mode
      id?: string;          // Details mode
      details?: boolean | string[];
      filter?: { type?: "tool" | "capability" | "all"; minScore?: number };
      limit?: number;
      offset?: number;
    }
    ```

- [x] **Task 10:** Create pml:admin tool definition
  - File: `src/mcp/tools/definitions.ts`
  - Action: Add new `adminTool` definition with schema:
    ```typescript
    {
      name: "pml:admin",
      description: "Manage capabilities: rename, merge. Administrative operations.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["rename", "merge"] },
          // For rename
          target: { type: "string", description: "Capability name or UUID to modify" },
          namespace: { type: "string" },
          action_name: { type: "string" },  // "action" is reserved
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          visibility: { type: "string", enum: ["private", "project", "org", "public"] },
          // For merge
          source: { type: "string", description: "Source capability (will be deleted)" },
          prefer_source_code: { type: "boolean" }
        },
        required: ["action"]
      }
    }
    ```
  - Notes: Update `getMetaTools()` to include `adminTool`

- [x] **Task 11:** Update DiscoverHandlerFacade
  - File: `src/mcp/handlers/discover-handler-facade.ts`
  - Action:
    1. Add `userId` parameter to `handle()` method
    2. Add `getUserScope` to deps interface
    3. Compute scope and pass to all use cases
    4. Add mode detection and routing:
       - If `pattern` provided → call `ListCapabilitiesUseCase`
       - If `name` provided → call `LookupUseCase`
       - If `id` provided → call `GetDetailsUseCase`
       - Else (only `intent`) → existing semantic search flow
  - Notes:
    ```typescript
    export interface DiscoverHandlerFacadeDeps {
      // ... existing
      listCapabilitiesUseCase: ListCapabilitiesUseCase;
      lookupUseCase: LookupUseCase;
      getDetailsUseCase: GetDetailsUseCase;
      getUserScope: (userId: string | null) => Promise<Scope>;
    }

    async handle(args: unknown, userId?: string): Promise<...> {
      const scope = await this.deps.getUserScope(userId ?? null);
      const params = args as DiscoverArgs;

      // Mode detection
      if (params.pattern) {
        return this.handleListMode(params, scope);
      }
      if (params.name) {
        return this.handleLookupMode(params, scope);
      }
      if (params.id) {
        return this.handleDetailsMode(params, scope);
      }
      // Default: semantic search (existing logic)
      return this.handleSearchMode(params, scope);
    }
    ```

- [x] **Task 12:** Create AdminHandlerFacade
  - File: `src/mcp/handlers/admin-handler.ts`
  - Action: Create new handler facade that routes to admin use cases
  - Notes:
    - Route `action: "rename"` → `RenameCapabilityUseCase`
    - Route `action: "merge"` → `MergeCapabilitiesUseCase`
    - Handle MCP response formatting

- [x] **Task 13:** Update gateway to route pml:admin + pass userId to handlers
  - File: `src/mcp/gateway-server.ts`
  - Action:
    1. Add routing for `pml:admin` tool calls to `AdminHandlerFacade`
    2. Pass `userId` from request context to `DiscoverHandlerFacade.handle()` and `AdminHandlerFacade.handle()`
  - Notes:
    - `userId` should come from authenticated session/API key
    - If no auth, pass `null` (will use default scope)
    ```typescript
    case "pml:discover":
      return discoverFacade.handle(args, request.userId);
    case "pml:admin":
      return adminFacade.handle(args, request.userId);
    ```

#### Phase 4: Cleanup

- [x] **Task 14:** Refactor cap-handler.ts
  - File: `src/mcp/handlers/cap-handler.ts`
  - Action:
    - Remove business logic now in use cases
    - Keep `CapModule` as thin router to use cases (for backward compat)
    - Or deprecate `CapModule` entirely if not needed
  - Notes: Keep `globToSqlLike()`, validation schemas if used elsewhere

- [x] **Task 15:** Delete lib/std cap tools
  - File: `lib/std/src/tools/cap.ts` (DELETED)
  - Updated `lib/std/src/tools/mod.ts` to remove pmlTools references
  - Action: Delete the file entirely
  - Notes:
    - Check for imports in `lib/std/src/tools/mod.ts` and remove
    - Verify no other lib/std modules depend on it

- [x] **Task 16:** Update handler exports
  - File: `src/mcp/handlers/mod.ts`
  - Action: Export new `AdminHandlerFacade`, remove cap-related exports if deprecated
  - Notes: Keep backward-compatible exports if needed

#### Phase 5: Package Schema Updates

- [x] **Task 17:** Add new tools to package schema
  - File: `packages/pml/src/cli/shared/constants.ts`
  - Action: Add `pml:abort`, `pml:replan`, `pml:admin` to `PML_TOOLS_FULL` array
  - Notes:
    ```typescript
    // Add to PML_TOOLS_FULL:
    {
      name: "pml:abort",
      description: "Stop a running workflow immediately.",
      inputSchema: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "Workflow ID to abort" },
          reason: { type: "string", description: "Optional reason for abort" }
        },
        required: ["workflow_id"]
      }
    },
    {
      name: "pml:replan",
      description: "Add new tasks to a running workflow based on discovered context.",
      inputSchema: {
        type: "object",
        properties: {
          workflow_id: { type: "string" },
          new_tasks: { type: "array", items: { type: "object" } },
          reason: { type: "string" }
        },
        required: ["workflow_id", "new_tasks"]
      }
    },
    {
      name: "pml:admin",
      description: "Manage capabilities: rename, merge. Administrative operations.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["rename", "merge"] },
          target: { type: "string" },
          source: { type: "string" },
          namespace: { type: "string" },
          action_name: { type: "string" },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          visibility: { type: "string", enum: ["private", "project", "org", "public"] },
          prefer_source_code: { type: "boolean" }
        },
        required: ["action"]
      }
    }
    ```

- [x] **Task 18:** Update stdio-command to handle new tools
  - File: `packages/pml/src/cli/stdio-command.ts`
  - Action: Add routing for `pml:abort`, `pml:replan`, `pml:admin` in `handleToolsCall()`
  - Notes:
    - All three should forward to cloud (same pattern as `pml:discover`)
    - Add cases in the switch or use a set of "cloud-forwarded" tools
    ```typescript
    // Forward to cloud
    if (["pml:discover", "pml:abort", "pml:replan", "pml:admin"].includes(name)) {
      const cloudResult = await forwardToCloud(id, name, args || {}, cloudUrl, sessionClient);
      ...
    }
    ```

- [x] **Task 19:** Update PML_TOOLS (compact version) if needed
  - File: `packages/pml/src/cli/shared/constants.ts`
  - Action: Add compact versions to `PML_TOOLS` array if used elsewhere
  - Notes: Check if `PML_TOOLS` is used anywhere; if not, skip this task

### Acceptance Criteria

#### Discover Extension

- [x] **AC1:** Given no parameters, when calling `pml:discover`, then it returns an error requiring at least one of `intent`, `pattern`, `name`, or `id`

- [x] **AC2:** Given `intent: "read files"`, when calling `pml:discover`, then it performs semantic search (existing behavior unchanged)

- [x] **AC3:** Given `pattern: "auth:*"`, when calling `pml:discover`, then it returns all capabilities matching the glob pattern with pagination

- [x] **AC4:** Given `name: "auth:login"` (capability), when calling `pml:discover`, then it returns the capability's id, fqdn, description, usageCount

- [x] **AC5:** Given `name: "filesystem:read_file"` (tool), when calling `pml:discover`, then it returns the tool's id, description, inputSchema

- [x] **AC6:** Given `id: "<uuid>"` and `details: true`, when calling `pml:discover`, then it returns full metadata (whois-style) for the capability

- [x] **AC7:** Given `id: "<uuid>"` and `details: ["tags", "visibility"]`, when calling `pml:discover`, then it returns only the specified fields

#### Admin Operations

- [x] **AC8:** Given `action: "rename"`, `target: "auth:login"`, `namespace: "authentication"`, when calling `pml:admin`, then the capability is renamed and embedding is updated

- [x] **AC9:** Given `action: "rename"` with invalid namespace (uppercase), when calling `pml:admin`, then it returns a validation error

- [x] **AC10:** Given `action: "merge"`, `source: "auth:loginV1"`, `target: "auth:login"`, when calling `pml:admin`, then usage stats are combined and source is deleted

- [x] **AC11:** Given `action: "merge"` where source and target have different `tools_used`, when calling `pml:admin`, then it returns an error

- [x] **AC12:** Given a user trying to rename/merge another user's capability, when calling `pml:admin`, then it returns "not found" error (multi-tenant isolation)

#### Multi-tenant Scoping

- [x] **AC12b:** Given a public capability owned by another user, when calling `pml:discover` with lookup, then it IS visible (public = readable)

- [x] **AC12c:** Given a public capability owned by another user, when calling `pml:admin` to rename/merge, then it returns "not found" error (public ≠ editable)

- [x] **AC12d:** Given a private capability owned by another user, when calling `pml:discover`, then it is NOT visible (private = invisible)

- [x] **AC12e:** Given SHGAT returns 30 results but only 8 are in user's scope, when `limit=10`, then response contains exactly 8 results (post-filter works correctly)

#### Backward Compatibility

- [x] **AC13:** Given existing code calling `cap:list`, when executing, then it still works (via deprecated CapModule or redirect)

- [x] **AC14:** Given the package (`packages/pml/`) calling `pml:discover`, when executing, then new functionality is accessible

#### Package Schema

- [x] **AC15:** Given the package running in stdio mode, when calling `pml:abort`, then the call is forwarded to cloud and workflow is stopped

- [x] **AC16:** Given the package running in stdio mode, when calling `pml:replan`, then the call is forwarded to cloud and tasks are added

- [x] **AC17:** Given the package running in stdio mode, when calling `pml:admin`, then the call is forwarded to cloud and admin operation is executed

- [x] **AC18:** Given `tools/list` request to package, when executed, then response includes all 5 tools: `pml:execute`, `pml:discover`, `pml:abort`, `pml:replan`, `pml:admin`

## Additional Context

### Dependencies

**Internal:**
- `CapabilityRegistry` - name resolution, CRUD for capabilities
- `IToolRepository` / `ToolStore` - tool lookup
- `DbClient` - direct SQL for list/merge operations
- `EmbeddingModelInterface` - embedding updates on rename
- `eventBus` - for emitting `capability.zone.updated` events

**External:**
- `zod` - validation schemas (already in use)

**No new dependencies required.**

### Testing Strategy

**Unit Tests (Required):**
- `tests/unit/application/use-cases/discover/scope-filter_test.ts`
- `tests/unit/application/use-cases/discover/list-capabilities_test.ts`
- `tests/unit/application/use-cases/discover/lookup_test.ts`
- `tests/unit/application/use-cases/discover/get-details_test.ts`
- `tests/unit/application/use-cases/admin/rename-capability_test.ts`
- `tests/unit/application/use-cases/admin/merge-capabilities_test.ts`

**Each test file should cover:**
- Happy path
- Input validation errors
- Not found cases
- Multi-tenant isolation

**Integration Tests (Optional but recommended):**
- Test full flow from MCP call to database
- Test backward compatibility with old cap:* calls

**Manual Testing:**
- Call `pml:discover` with each mode via MCP client
- Call `pml:admin` with rename and merge actions
- Verify dashboard reflects changes (SSE events)

### Notes

**High-Risk Items:**
- Multi-tenant filtering must be preserved - test thoroughly
- Transaction logic in merge must be atomic - verify rollback behavior
- Backward compatibility for cap:* tools if external consumers exist

**Known Limitations:**
- Tool lookup by pattern not supported (tools don't have pattern-based storage)
- Details for tools limited to inputSchema and serverId (no usage stats)

**Implementation Decisions Made:**
- **ScopeFilter as Function:** Instead of passing `scope` object to use cases and
  having them query the DB directly, we pass a `scopeFilter` function from the facade.
  This keeps use cases decoupled from DB concerns and allows efficient filtering
  BEFORE fetching capability details (vs. over-fetching with limit * 3).
- **Backward Compat:** Kept `cap:*` tools in `lib/std` for backward compatibility
  instead of deleting them. Added deprecation notice to `cap-handler.ts`.

**Future Considerations (Out of Scope):**
- Tool renaming/aliasing (tools are MCP server-defined)
- Bulk operations (rename/merge multiple at once)
- Audit log for admin operations
