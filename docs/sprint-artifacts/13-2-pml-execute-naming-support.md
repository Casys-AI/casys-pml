# Story 13.2: pml_execute Auto-FQDN & Call-by-Name

Status: done

## Story

As a **developer**, I want **capabilities to get auto-generated FQDNs and be callable by name**, So
that **I can reuse capabilities without remembering code**.

## Acceptance Criteria

### AC1: Auto-generated FQDN

**Given** `pml_execute({ intent, code })` **When** executed successfully **Then** capability
registered in `capability_records` with auto-generated FQDN like
`local.default.filesystem.exec_a7f3b2c1.a7f3`

### AC2: Deduplication by Code Hash

**Given** same code executed twice **When** second pml_execute called **Then** existing capability
reused (usage_count incremented), no duplicate created

### AC3: Response Includes FQDN

**Given** successful pml_execute **When** response returned **Then** includes `capabilityName`
(auto-generated) and `capabilityFqdn` (full FQDN)

### AC4: Auto-generated Display Name

**Given** pml_execute without explicit naming **When** executed successfully **Then** capability
receives display_name like `unnamed_<hash>` or inferred from intent

### AC6: Call by Name

**Given** existing capability `my-config-reader` **When**
`pml_execute({ intent: "read config", capability: "my-config-reader", args: { path: "config.json" } })`
**Then** capability code is executed with args merged into context

### AC7: Name Resolution

**Given** capability name **When** lookup performed via `CapabilityRegistry.resolveByName()`
**Then** resolves to full FQDN and retrieves `code_snippet` from `capability_records`

### AC8: Args Merging

**Given** capability with default params `{ encoding: "utf-8" }` (from `parameters_schema.default`)
**When** called with args `{ path: "x.json" }` **Then** execution context has
`{ path: "x.json", encoding: "utf-8" }`

### AC9: Not Found Error

**Given** non-existent capability name **When** pml_execute called with `capability: "non-existent"`
**Then** returns error "Capability not found: non-existent"

### AC10: Usage Tracking

**Given** capability called successfully by name **When** execution completes **Then** `usage_count`
incremented in `capability_records` and `success_count` updated based on result

## Tasks / Subtasks

- [x] Task 1: Extend ExecuteArgs Interface (AC: #6)
  - [x] 1.1: Add `capability?: string` parameter for call-by-name mode
  - [x] 1.2: Add `args?: Record<string, JsonValue>` parameter for capability execution
  - [x] 1.3: Update JSDoc with examples for both modes
  - Note: `name` param removed - naming done via cap:name API (Story 13.3). AC5 was removed.

- [x] Task 2: Extend ExecuteResponse Interface (AC: #3)
  - [x] 2.1: Add `capabilityName?: string` field (auto-generated)
  - [x] 2.2: Add `capabilityFqdn?: string` field (auto-generated)
  - [x] 2.3: Update response building in `executeDirectMode()` to include new fields

- [x] Task 3: Implement Auto-FQDN in Direct Mode (AC: #1, #4, #3)
  - [x] 3.1: Create session scope context: `{ org: "local", project: "default" }`
  - [x] 3.2: After successful execution, create `CapabilityRecord` via `CapabilityRegistry.create()`
  - [x] 3.3: Auto-generate displayName as `unnamed_<hash>` or from capability.name
  - [x] 3.4: Auto-generate FQDN: `{org}.{project}.{namespace}.exec_{hash}.{hash}`
  - [x] 3.5: Include `capabilityName` and `capabilityFqdn` in response

- [x] Task 4: Implement Call-by-Name Mode (AC: #5, #6, #7, #8, #9)
  - [x] 4.1: Detect call-by-name mode when `params.capability` is present
  - [x] 4.2: Resolve name via `CapabilityRegistry.resolveByName(name, scope)`
  - [x] 4.3: Fetch `code_snippet` and `parameters_schema` from resolved record
  - [x] 4.4: Merge `args` with defaults from `parameters_schema.default`
  - [x] 4.5: Execute capability code via existing DAG/WorkerBridge flow
  - [x] 4.6: Record usage via `CapabilityRegistry.recordUsage(fqdn, success, latencyMs)`

- [x] Task 5: Wire CapabilityRegistry Dependency (AC: all)
  - [x] 5.1: Add `capabilityRegistry?: CapabilityRegistry` to `ExecuteDependencies`
  - [x] 5.2: Initialize `CapabilityRegistry` in Gateway startup with PGliteClient
  - [x] 5.3: Pass registry to `handleExecute()` via deps

- [x] Task 6: Unit Tests (AC: all)
  - [x] 6.1: Test mutual exclusivity (code + capability error)
  - [x] 6.2: Test call-by-name requires registry
  - [x] 6.3: Test not-found error
  - [x] 6.4: Test mode detection priority

## Dev Notes

### Architecture: Dual-Table Strategy

Story 13.1 introduced `capability_records` as a **registry** alongside `workflow_pattern`. Story
13.2 connects them:

```
┌──────────────────────┐         ┌───────────────────────┐
│   capability_records │ ◄────── │    workflow_pattern   │
│   (FQDN registry)    │ code_   │  (code, embeddings,   │
│   Story 13.1         │ hash    │   execution stats)    │
└──────────────────────┘         └───────────────────────┘
       │
       │  display_name
       ▼
   "my-config-reader"
```

**Linking Strategy:**

- When capability is named, find or create `capability_records` entry
- Link via matching `code_hash` (capability_records.hash == workflow_pattern.code_hash first 4
  chars)
- `workflow_pattern` continues to store execution data (success_rate, avg_duration_ms)
- `capability_records` stores naming metadata (display_name, visibility, tags)

### ExecuteArgs Extension

```typescript
// src/mcp/handlers/execute-handler.ts:119
export interface ExecuteArgs {
  /** Natural language description of the intent (REQUIRED) */
  intent: string;
  /** TypeScript code to execute (OPTIONAL - triggers Mode Direct) */
  code?: string;
  /** Call existing capability by name (AC6) - format: mcp__namespace__action */
  capability?: string;
  /** Arguments for capability execution (AC8) */
  args?: Record<string, JsonValue>;
  /** Execution options */
  options?: {
    timeout?: number;
    per_layer_validation?: boolean;
  };
}
// Note: `name` param removed - naming done via cap:name API (Story 13.3)
```

### Mode Detection Logic

```typescript
// In handleExecute()
if (params.capability) {
  // Mode: Call-by-Name - execute existing capability
  return await executeByNameMode(intent, capabilityName, args, options, deps, startTime);
} else if (params.code) {
  // Mode: Direct - execute code, auto-generate FQDN (naming via cap:name API later)
  return await executeDirectMode(intent, code, options, deps, startTime);
} else {
  // Mode: Suggestion - DR-DSP search (existing behavior)
  return await executeSuggestionMode(intent, options, deps, startTime);
}
```

### Scope Context

For now, use hardcoded scope for local development:

```typescript
const defaultScope: Scope = {
  org: "local",
  project: "default",
};

// Future: Extract from session/auth context
// const scope = deps.sessionContext?.scope ?? defaultScope;
```

### Args Merging Algorithm

```typescript
function mergeArgs(
  providedArgs: Record<string, JsonValue>,
  parametersSchema: JSONSchema | undefined,
): Record<string, JsonValue> {
  const merged = { ...providedArgs };

  if (parametersSchema?.properties) {
    for (const [key, schema] of Object.entries(parametersSchema.properties)) {
      if (!(key in merged) && schema.default !== undefined) {
        merged[key] = schema.default;
      }
    }
  }

  return merged;
}
```

### Error Messages

| Scenario            | Error Message                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Invalid name format | `Invalid capability name: "{name}". Must be alphanumeric with underscores, hyphens, and colons only.` |
| Name collision      | `Capability name '{name}' already exists in scope {org}.{project}`                                    |
| Not found           | `Capability not found: {name}`                                                                        |
| Resolved via alias  | `[WARN] Deprecated: Using alias "{alias}" for capability "{displayName}". Update your code.`          |

### Project Structure Notes

| File                                              | Purpose                                                    |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `src/mcp/handlers/execute-handler.ts`             | Main handler - extend `ExecuteArgs`, add call-by-name mode |
| `src/capabilities/capability-registry.ts`         | Already exists (Story 13.1) - use for name resolution      |
| `src/capabilities/fqdn.ts`                        | Already exists - use `isValidMCPName()` for validation     |
| `src/mcp/server/types.ts`                         | Add `capabilityRegistry` to gateway config if needed       |
| `tests/unit/mcp/execute_handler_naming_test.ts`   | New unit tests                                             |
| `tests/integration/capability_naming_e2e_test.ts` | New E2E tests                                              |

### Existing Dependencies to Use

From `src/capabilities/capability-registry.ts` (Story 13.1):

- `CapabilityRegistry.create()` - Create named capability record
- `CapabilityRegistry.resolveByName()` - Resolve name to FQDN
- `CapabilityRegistry.recordUsage()` - Increment usage metrics

From `src/capabilities/fqdn.ts` (Story 13.1):

- `isValidMCPName()` - Validate MCP-compatible name format
- `generateHash()` - Generate 4-char hash for FQDN

From `src/capabilities/types.ts`:

- `Scope` - org/project context
- `CapabilityRecord` - Registry record type

### Response Format Extension

```typescript
// Extended response for named capabilities
const response: ExecuteResponse = {
  status: "success",
  result: executionResult,
  capabilityId: capability.id, // UUID (existing)
  capabilityName: record?.displayName, // NEW: "my-config-reader"
  capabilityFqdn: record?.id, // NEW: "local.default.fs.read_json.a7f3"
  mode: "direct",
  executionTimeMs,
  dag: {/* existing */},
};
```

### References

- [Story 13.1: Schema, FQDN & Aliases](./13-1-schema-fqdn-aliases.md) - Foundation for this story
- [Epic 13: Capability Naming & Curation](../epics/epic-13-capability-naming-curation.md) -
  FR001-FR008
- [execute-handler.ts](../../src/mcp/handlers/execute-handler.ts) - Main file to modify
- [capability-registry.ts](../../src/capabilities/capability-registry.ts) - Name resolution
- [capability-store.ts](../../src/capabilities/capability-store.ts) - Execution stats storage
- [Project Context](../project-context.md) - Technology stack, coding patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

### Completion Notes List

- Implemented 3-mode execution: Direct, Call-by-Name, Suggestion
- Extended `ExecuteArgs` with `capability`, `args` parameters (no `name` - done via cap:name API)
- Extended `ExecuteResponse` with `capabilityName`, `capabilityFqdn` fields
- Auto-generate FQDN on execution: `{org}.{project}.{namespace}.exec_{hash}.{hash}`
- Auto-generate displayName as `unnamed_<hash>` until renamed via cap:name
- Deduplication by code_hash: same code = same capability (usage_count++)
- Implemented `executeByNameMode()` for call-by-name execution
- Added `mergeArgsWithDefaults()` for args merging with schema defaults
- Wired `CapabilityRegistry` into gateway-server.ts
- Added 4 unit tests for Story 13.2 (mutual exclusivity, registry required, not found, mode
  priority)
- 18 total tests passing

**Architecture Fix (Migration 022-023):**

- Migration 022: Removed duplicated `workflow_pattern.name` column (unified naming via
  capability_records)
- Migration 023: Added `workflow_pattern_id` FK to capability_records, removed duplicated columns
  (code_snippet, description, parameters_schema, tools_used)
- Updated `CapabilityRegistry.create()` to use FK + hash instead of duplicating data
- Updated `executeByNameMode()` to fetch code from workflow_pattern via FK
- Updated `data-service.ts` JOIN to use FK instead of hash-based join
- Final architecture: capability_records = registry (naming), workflow_pattern = source of truth
  (code/stats)

### File List

- `src/mcp/handlers/execute-handler.ts` - Main implementation (3-mode execution)
- `src/mcp/gateway-server.ts` - Registry wiring + TraceFeatureExtractor init
- `src/capabilities/capability-registry.ts` - FK-based create()
- `src/capabilities/capability-store.ts` - Updated for Story 13.2 integration
- `src/capabilities/types.ts` - CapabilityRecord with workflowPatternId
- `src/capabilities/data-service.ts` - FK-based JOIN
- `src/capabilities/per-priority.ts` - PER priority updates
- `src/db/migrations.ts` - Migration registry updates
- `src/db/migrations/022_unify_capability_naming.ts` - Remove workflow_pattern.name
- `src/db/migrations/023_capability_records_fk.ts` - Add FK, remove duplicates
- `src/mcp/server/types.ts` - Type exports for registry
- `src/mcp/routing/handlers/capabilities.ts` - API endpoint updates
- `src/mcp/routing/handlers/graph.ts` - Graph handler updates
- `tests/unit/mcp/handlers/execute_handler_test.ts` - Unit tests (18 passing)
- `tests/unit/capabilities/data_service_test.ts` - Updated tests
