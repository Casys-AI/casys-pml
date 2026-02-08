# Story 16.3: UI Collection in Sandbox Executor

Status: done

## Story

As a PML orchestrator,
I want the sandbox executor to automatically collect `_meta.ui` from MCP tool responses,
so that I can compose multiple UI components returned by different MCP servers.

## Acceptance Criteria

1. **UI Metadata Detection** - When an MCP tool response contains `_meta.ui.resourceUri`, the executor detects and collects it
2. **CollectedUiResource Structure** - Collected resources include:
   - `source`: tool name that returned this UI (e.g., `"postgres:query"`)
   - `resourceUri`: UI resource URI from `_meta.ui.resourceUri`
   - `context`: additional context from `_meta.ui.context` (if present)
   - `slot`: execution order index (0, 1, 2...)
3. **Ordered Collection** - Multiple UI resources are collected in an ordered array matching execution order
4. **Graceful Skip** - Tool responses without `_meta.ui` are gracefully skipped (no collection, no error)
5. **Type Import** - Uses `CollectedUiResource` type from `packages/pml/src/types/ui-orchestration.ts`
6. **SandboxExecutionResult Extended** - `SandboxExecutionResult` interface includes optional `collectedUi?: CollectedUiResource[]` field
7. **Zero MCP Changes** - Existing MCP servers require zero code changes to work with this feature
8. **UiOrchestration Support** - `SandboxExecuteOptions` accepts optional `uiOrchestration?: UiOrchestration` for capability-defined orchestration
9. **Unit Tests** - Tests verify collection with mock MCP responses containing `_meta.ui`
10. **Deno Check** - All modified files pass `deno check` without errors

## Tasks / Subtasks

- [x] Task 1: Extend SandboxExecutionResult type (AC: #6)
  - [x] Import `CollectedUiResource` type in `packages/pml/src/execution/types.ts`
  - [x] Add `collectedUi?: CollectedUiResource[]` field to `SandboxExecutionResult`
  - [x] Add JSDoc comment explaining the field

- [x] Task 2: Extend SandboxExecuteOptions type (AC: #8)
  - [x] Import `UiOrchestration` type in `packages/pml/src/execution/types.ts`
  - [x] Add `uiOrchestration?: UiOrchestration` field to `SandboxExecuteOptions`
  - [x] Add JSDoc comment explaining the field

- [x] Task 3: Implement UI collection in sandbox-executor.ts (AC: #1, #2, #3, #4, #5)
  - [x] Import `CollectedUiResource` type and `extractUiMeta` helper
  - [x] Add `collectedUiResources: CollectedUiResource[]` array initialization
  - [x] Add `uiSlotCounter: number` variable
  - [x] In `onRpc` callback, after successful tool call, call `extractUiMeta(result)`
  - [x] If present, push to `collectedUiResources` with source, resourceUri, context (incl. `_args`), slot
  - [x] Add `logDebug()` when UI is collected
  - [x] Return `collectedUi` in `SandboxExecutionResult` if array is non-empty

- [x] Task 4: Helper for _meta.ui extraction (AC: #1, #4)
  - [x] Create `extractUiMeta()` helper in `packages/pml/src/execution/ui-utils.ts` (separate file)
  - [x] Handle nested `_meta.ui` safely with optional chaining
  - [x] Return `null` if no UI metadata present
  - [x] Export from `packages/pml/src/execution/mod.ts`

- [x] Task 5: Unit tests (AC: #9)
  - [x] Test: MCP response with `_meta.ui.resourceUri` → collected
  - [x] Test: MCP response without `_meta.ui` → gracefully skipped
  - [x] Test: Multiple UI responses → ordered by slot
  - [x] Test: `_meta.ui.context` is preserved if present
  - [x] Test: Tool args are included in `context._args`
  - [x] Test: `extractUiMeta()` helper (unit tests in `ui-utils_test.ts`)

- [x] Task 6: Validation (AC: #7, #10)
  - [x] Run `deno check packages/pml/src/execution/types.ts`
  - [x] Run `deno check packages/pml/src/execution/sandbox-executor.ts`
  - [x] Verify no changes required to existing MCP servers

## Dev Notes

### Critical: Type Imports

```typescript
// packages/pml/src/execution/types.ts
import type { CollectedUiResource, UiOrchestration } from "../types/mod.ts";
```

### Point of Injection in sandbox-executor.ts

The collection logic goes in the `onRpc` callback inside `execute()`:

```typescript
// packages/pml/src/execution/sandbox-executor.ts (line ~93)
async execute(code: string, options: SandboxExecuteOptions): Promise<SandboxExecutionResult> {
  const { context, clientToolHandler, workflowId, fqdnMap, uiOrchestration } = options;

  const toolsCalled: string[] = [];
  const toolCallRecords: ToolCallRecord[] = [];
  const collectedUiResources: CollectedUiResource[] = [];  // NEW
  let uiSlotCounter = 0;  // NEW
  const startTime = Date.now();

  const sandbox = new SandboxWorker({
    onRpc: async (method: string, args: unknown) => {
      toolsCalled.push(method);
      const callStart = Date.now();
      let result: unknown;
      let success = true;
      try {
        result = await this.routeToolCall(method, args, clientToolHandler, traceId);

        // NEW: Collect UI metadata if present
        const uiMeta = extractUiMeta(result);
        if (uiMeta?.resourceUri) {
          collectedUiResources.push({
            source: method,
            resourceUri: uiMeta.resourceUri,
            // Merge tool args with UI context for event detection (Story 16.4)
            context: { ...uiMeta.context, _args: args },
            slot: uiSlotCounter++,
          });
          logDebug(`Collected UI from ${method}: ${uiMeta.resourceUri}`);
        }
      } catch (error) {
        // ... existing error handling
      } finally {
        // ... existing toolCallRecords push
      }
      return result;
    },
    // ...
  });
```

### Helper Function (Separate File)

**File:** `packages/pml/src/execution/ui-utils.ts`

```typescript
/**
 * UI Utilities for Sandbox Executor
 *
 * Helper functions for extracting and processing UI metadata
 * from MCP tool responses.
 *
 * @module execution/ui-utils
 */

/**
 * UI metadata extracted from MCP tool response.
 */
export interface ExtractedUiMeta {
  resourceUri: string;
  context?: Record<string, unknown>;
}

/**
 * Extract UI metadata from tool result if present.
 * Safe extraction with optional chaining.
 *
 * @param result - Tool call result (may contain _meta.ui)
 * @returns UI metadata or null if not present
 *
 * @example
 * ```ts
 * const result = await toolCall();
 * const uiMeta = extractUiMeta(result);
 * if (uiMeta) {
 *   console.log("UI available at:", uiMeta.resourceUri);
 * }
 * ```
 */
export function extractUiMeta(result: unknown): ExtractedUiMeta | null {
  if (!result || typeof result !== "object") return null;

  // Handle result types that may have _meta.ui
  const maybeWithMeta = result as {
    _meta?: {
      ui?: {
        resourceUri?: string;
        context?: Record<string, unknown>;
      };
    };
  };

  const ui = maybeWithMeta._meta?.ui;
  if (!ui?.resourceUri) return null;

  return {
    resourceUri: ui.resourceUri,
    context: ui.context,
  };
}
```

**Export from mod.ts:**
```typescript
// packages/pml/src/execution/mod.ts
export { extractUiMeta, type ExtractedUiMeta } from "./ui-utils.ts";
```

### SandboxExecutionResult Extension

```typescript
// packages/pml/src/execution/types.ts
export interface SandboxExecutionResult {
  success: boolean;
  value?: unknown;
  error?: SandboxError;
  durationMs: number;
  toolsCalled?: string[];
  toolCallRecords?: ToolCallRecord[];
  traceId: string;
  /** UI resources collected from MCP tool responses with _meta.ui */
  collectedUi?: CollectedUiResource[];  // NEW
}
```

### SandboxExecuteOptions Extension

```typescript
// packages/pml/src/execution/types.ts
export interface SandboxExecuteOptions {
  context: Record<string, unknown>;
  clientToolHandler?: ToolCallHandler;
  workflowId?: string;
  fqdnMap?: Map<string, string>;
  /** UI orchestration config from capability definition (layout, sync rules) */
  uiOrchestration?: UiOrchestration;  // NEW
}
```

### Return Value Update

```typescript
// In execute() method, return statement
return {
  success: true,
  value: result.value,
  durationMs,
  toolsCalled,
  toolCallRecords,
  traceId,
  // Only include collectedUi if non-empty
  ...(collectedUiResources.length > 0 && { collectedUi: collectedUiResources }),
};
```

### Project Structure Notes

| Path | Purpose |
|------|---------|
| `packages/pml/src/execution/sandbox-executor.ts` | Main file to modify - add collection logic |
| `packages/pml/src/execution/types.ts` | Type extensions for result and options |
| `packages/pml/src/execution/ui-utils.ts` | **NEW** - Helper `extractUiMeta()` function |
| `packages/pml/src/execution/ui-utils_test.ts` | **NEW** - Unit tests for helper |
| `packages/pml/src/execution/mod.ts` | Export new helper |
| `packages/pml/src/types/ui-orchestration.ts` | Source of `CollectedUiResource`, `UiOrchestration` |

### Design Decisions

1. **Helper in separate file** - `extractUiMeta()` goes in `ui-utils.ts` for reusability and testability

2. **Logging UI collection** - Add `logDebug()` call when UI is collected for debugging visibility

3. **Args in context** - Include tool call `args` in `context._args` for event detection in Story 16.4:
   ```typescript
   context: { ...uiMeta.context, _args: args }
   ```
   This enables sync rules to detect events like "filter" from the args pattern.

### Testing Pattern

```typescript
// packages/pml/src/execution/sandbox-executor_test.ts
Deno.test("SandboxExecutor - collects UI metadata from MCP response", async () => {
  const executor = new SandboxExecutor({
    cloudUrl: "http://mock",
    apiKey: "test",
  });

  // Mock a tool handler that returns _meta.ui
  const mockHandler: ToolCallHandler = async (toolId) => {
    if (toolId === "viz:render") {
      return {
        chart: { type: "bar", data: [] },
        _meta: {
          ui: {
            resourceUri: "ui://viz/chart/abc123",
            context: { chartType: "bar" },
          },
        },
      };
    }
    return { result: "ok" };
  };

  const result = await executor.execute(
    `const chart = await mcp.viz.render({ type: "bar" }); return chart;`,
    {
      context: {},
      clientToolHandler: mockHandler,
    },
  );

  assertEquals(result.success, true);
  assertExists(result.collectedUi);
  assertEquals(result.collectedUi?.length, 1);
  assertEquals(result.collectedUi?.[0].source, "viz:render");
  assertEquals(result.collectedUi?.[0].resourceUri, "ui://viz/chart/abc123");
  assertEquals(result.collectedUi?.[0].slot, 0);
});

Deno.test("SandboxExecutor - skips responses without UI metadata", async () => {
  const executor = new SandboxExecutor({ cloudUrl: "http://mock", apiKey: "test" });

  const mockHandler: ToolCallHandler = async () => {
    return { data: "no UI here" };
  };

  const result = await executor.execute(
    `return await mcp.std.echo({ msg: "hello" });`,
    { context: {}, clientToolHandler: mockHandler },
  );

  assertEquals(result.success, true);
  assertEquals(result.collectedUi, undefined); // No UI collected
});

Deno.test("SandboxExecutor - maintains slot order for multiple UIs", async () => {
  const executor = new SandboxExecutor({ cloudUrl: "http://mock", apiKey: "test" });

  let callCount = 0;
  const mockHandler: ToolCallHandler = async (toolId) => {
    callCount++;
    return {
      _meta: {
        ui: { resourceUri: `ui://test/slot/${callCount}` },
      },
    };
  };

  const result = await executor.execute(
    `
    await mcp.tool.a({});
    await mcp.tool.b({});
    await mcp.tool.c({});
    return "done";
    `,
    { context: {}, clientToolHandler: mockHandler },
  );

  assertEquals(result.collectedUi?.length, 3);
  assertEquals(result.collectedUi?.[0].slot, 0);
  assertEquals(result.collectedUi?.[1].slot, 1);
  assertEquals(result.collectedUi?.[2].slot, 2);
});

Deno.test("SandboxExecutor - includes tool args in context._args", async () => {
  const executor = new SandboxExecutor({ cloudUrl: "http://mock", apiKey: "test" });

  const mockHandler: ToolCallHandler = async (toolId, args) => {
    return {
      data: "result",
      _meta: {
        ui: {
          resourceUri: "ui://postgres/table/abc",
          context: { query: "SELECT *" },
        },
      },
    };
  };

  const result = await executor.execute(
    `return await mcp.postgres.query({ sql: "SELECT *", filter: { region: "EU" } });`,
    { context: {}, clientToolHandler: mockHandler },
  );

  assertEquals(result.collectedUi?.length, 1);
  // Tool args are preserved for event detection
  assertEquals(result.collectedUi?.[0].context?._args, { sql: "SELECT *", filter: { region: "EU" } });
  // Original context is also preserved
  assertEquals(result.collectedUi?.[0].context?.query, "SELECT *");
});
```

### Helper Tests (ui-utils_test.ts)

```typescript
// packages/pml/src/execution/ui-utils_test.ts
import { assertEquals } from "@std/assert";
import { extractUiMeta } from "./ui-utils.ts";

Deno.test("extractUiMeta - returns null for non-object", () => {
  assertEquals(extractUiMeta(null), null);
  assertEquals(extractUiMeta(undefined), null);
  assertEquals(extractUiMeta("string"), null);
  assertEquals(extractUiMeta(123), null);
});

Deno.test("extractUiMeta - returns null for object without _meta", () => {
  assertEquals(extractUiMeta({ data: "value" }), null);
  assertEquals(extractUiMeta({ _meta: {} }), null);
  assertEquals(extractUiMeta({ _meta: { other: "field" } }), null);
});

Deno.test("extractUiMeta - returns null for _meta.ui without resourceUri", () => {
  assertEquals(extractUiMeta({ _meta: { ui: {} } }), null);
  assertEquals(extractUiMeta({ _meta: { ui: { context: {} } } }), null);
});

Deno.test("extractUiMeta - extracts resourceUri", () => {
  const result = extractUiMeta({
    _meta: { ui: { resourceUri: "ui://test/resource" } },
  });
  assertEquals(result?.resourceUri, "ui://test/resource");
  assertEquals(result?.context, undefined);
});

Deno.test("extractUiMeta - extracts resourceUri and context", () => {
  const result = extractUiMeta({
    _meta: {
      ui: {
        resourceUri: "ui://postgres/table/abc",
        context: { query: "SELECT *", rows: 100 },
      },
    },
  });
  assertEquals(result?.resourceUri, "ui://postgres/table/abc");
  assertEquals(result?.context, { query: "SELECT *", rows: 100 });
});
```

### Dependencies

**Depends on (DONE):**
- Story 16.1 - Types already created: `CollectedUiResource`, `UiOrchestration`
- Story 16.2 - `registerResource()` ready for dynamic resource registration

**Used by (FUTURE):**
- Story 16.4 - Will use `collectedUi` to build composite UI
- Story 16.5 - May use collected resources for transport routing

### Git Context (Recent Commits)

| Commit | Description |
|--------|-------------|
| `1bc71c2f` | 16.2 - MCP Server Resources Handlers |
| `2b309f16` | feat(pml): add UI orchestration types for MCP Apps (Story 16.1) |
| `4a473e5b` | feat(lib/server): add HTTP transport support with Hono |

### References

- [Source: packages/pml/src/execution/sandbox-executor.ts - lines 93-120 for onRpc callback]
- [Source: packages/pml/src/execution/types.ts - SandboxExecutionResult, SandboxExecuteOptions]
- [Source: packages/pml/src/types/ui-orchestration.ts - CollectedUiResource type at lines 152-176]
- [Source: _bmad-output/planning-artifacts/spikes/2026-01-27-mcp-apps-ui-orchestration.md#Sandbox-Executor-Changes]
- [Source: _bmad-output/planning-artifacts/epics/epic-16-mcp-apps-ui-orchestration.md#Story-16.3]

### FRs Covered

| FR ID | Description | How Addressed |
|-------|-------------|---------------|
| FR-UI-002 | Collect `_meta.ui` during sandbox execution | `onRpc` callback intercepts results |
| FR-UI-010 | Event detection via callServerTool args | Preserved in `context` field |
| ARCH-004 | Modify sandbox-executor | Collection logic added |
| NFR-UI-002 | Zero-code change for existing MCPs | Collection is transparent, no MCP changes needed |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - no issues encountered

### Completion Notes List

- Extended `SandboxExecutionResult` with `collectedUi?: CollectedUiResource[]` field
- Extended `SandboxExecuteOptions` with `uiOrchestration?: UiOrchestration` field
- Created `extractUiMeta()` helper function in separate `ui-utils.ts` file for reusability
- Implemented UI collection in `onRpc` callback - collects `_meta.ui.resourceUri` after successful tool calls
- Tool args are preserved in `context._args` for event detection in Story 16.4
- `collectedUi` is only included in result if non-empty (no empty array returned)
- 13 unit tests for `extractUiMeta()` helper - all passing
- 7 integration tests for UI collection in SandboxExecutor - all passing
- No regressions in existing sandbox tests (16 tests passing)
- Zero changes required to existing MCP servers (transparent collection)

### File List

| File | Change |
|------|--------|
| `packages/pml/src/execution/types.ts` | Modified - added imports and fields for UI types |
| `packages/pml/src/execution/sandbox-executor.ts` | Modified - added UI collection logic in onRpc callback |
| `packages/pml/src/execution/ui-utils.ts` | **NEW** - extractUiMeta() helper function |
| `packages/pml/src/execution/ui-utils_test.ts` | **NEW** - 13 unit tests for helper |
| `packages/pml/src/execution/mod.ts` | Modified - export extractUiMeta |
| `packages/pml/tests/sandbox_ui_collection_test.ts` | **NEW** - 7 integration tests for UI collection |

### Change Log

- 2026-01-29: Story 16.3 implemented - UI Collection in Sandbox Executor (20 tests passing)
- 2026-01-29: Code Review APPROVED - 2 lint issues fixed, tests committed

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5
**Date:** 2026-01-29
**Outcome:** APPROVED

### Issues Found & Fixed
1. **[HIGH] Lint errors** - `require-await` in sandbox-executor.ts lines 112, 226 → Added explicit `await`
2. **[CRITICAL] Tests not committed** - ui-utils_test.ts and sandbox_ui_collection_test.ts were untracked → Committed

### Issues Accepted (No Action)
- **[HIGH] uiOrchestration unused** - Accepted as prep for Story 16.4

### Validation Results
- ✅ 20 tests passing (13 unit + 7 integration)
- ✅ `deno lint` passes
- ✅ `deno check` passes
- ✅ All 10 ACs validated
