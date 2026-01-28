# Story 16.1: Types & Schema UI Orchestration

Status: done

## Story

As a PML developer,
I want well-defined TypeScript types for UI orchestration,
so that I have compile-time safety and clear contracts for all UI-related functionality.

## Acceptance Criteria

1. **Type File Created** - File `packages/pml/src/types/ui-orchestration.ts` exists with all required types exported
2. **UiLayout Type** - Enum/type with values: `"split" | "tabs" | "grid" | "stack"` is exported
3. **UiSyncRule Interface** - Interface with `from`, `event`, `to`, `action` fields is exported
4. **UiOrchestration Interface** - Interface with `layout`, `sync?` fields is exported
5. **CollectedUiResource Interface** - Interface with `source`, `resourceUri`, `context?`, `slot` fields is exported
6. **CompositeUiDescriptor Interface** - Interface with `type`, `resourceUri`, `layout`, `children`, `sync` fields is exported
7. **McpUiToolMeta Interface** - Interface with `resourceUri?`, `visibility?` fields is exported
8. **McpUiResourceMeta Interface** - Interface with `csp?`, `permissions?`, `domain?`, `prefersBorder?` fields is exported
9. **JSDoc Documentation** - All types have proper JSDoc comments explaining their purpose
10. **Type Check Passes** - `deno check packages/pml/src/types/ui-orchestration.ts` completes without errors
11. **Module Export** - Types are re-exported from a `mod.ts` barrel file in the types directory
12. **CapabilityMetadata Extended** - `CapabilityMetadata` interface in `packages/pml/src/loader/types.ts` is extended with `ui?: UiOrchestration` field to allow capabilities to declare UI orchestration

## Tasks / Subtasks

- [x] Task 1: Create types directory structure (AC: #1)
  - [x] Create `packages/pml/src/types/` directory if not exists
  - [x] Create `packages/pml/src/types/ui-orchestration.ts` file
  - [x] Create `packages/pml/src/types/mod.ts` barrel export file (AC: #11)

- [x] Task 2: Implement layout and orchestration types (AC: #2, #3, #4)
  - [x] Define `UiLayout` type union: `"split" | "tabs" | "grid" | "stack"`
  - [x] Define `UiSyncRule` interface with `from: string`, `event: string`, `to: string | "*"`, `action: string`
  - [x] Define `UiOrchestration` interface with `layout: UiLayout`, `sync?: UiSyncRule[]`

- [x] Task 3: Implement collected resource and composite types (AC: #5, #6)
  - [x] Define `CollectedUiResource` interface with `source: string`, `resourceUri: string`, `context?: Record<string, unknown>`, `slot: number`
  - [x] Define `CompositeUiDescriptor` interface with all required fields including `children: CollectedUiResource[]` and resolved sync rules

- [x] Task 4: Implement MCP Apps metadata types (AC: #7, #8)
  - [x] Define `McpUiToolMeta` interface with `resourceUri?: string`, `visibility?: Array<"model" | "app">`
  - [x] Define `McpUiResourceMeta` interface with CSP, permissions, domain, prefersBorder fields

- [x] Task 5: Add comprehensive JSDoc documentation (AC: #9)
  - [x] Add module-level JSDoc header
  - [x] Document each type with purpose, usage context, and field descriptions
  - [x] Add `@example` blocks where helpful

- [x] Task 6: Extend CapabilityMetadata with UI field (AC: #12)
  - [x] Import `UiOrchestration` type in `packages/pml/src/loader/types.ts`
  - [x] Add `ui?: UiOrchestration` field to `CapabilityMetadata` interface
  - [x] Add JSDoc comment explaining the field purpose

- [x] Task 7: Validate and integrate (AC: #10, #11)
  - [x] Run `deno check packages/pml/src/types/ui-orchestration.ts`
  - [x] Run `deno check packages/pml/src/types/mod.ts`
  - [x] Run `deno check packages/pml/src/loader/types.ts`
  - [x] Verify no circular dependencies

## Dev Notes

### Architecture Patterns & Constraints

This story implements types defined in the MCP Apps specification (SEP-1865) plus PML-specific orchestration types.

**Key distinction:**
- `McpUiToolMeta` and `McpUiResourceMeta` → Follow MCP Apps spec exactly
- `UiOrchestration`, `UiSyncRule`, `CollectedUiResource`, `CompositeUiDescriptor` → PML innovation (sync rules)

### Source Files to Reference

| File | Purpose |
|------|---------|
| Spike doc | Type definitions source |
| `packages/pml/src/sandbox/types.ts` | Pattern for JSDoc and type organization |
| `packages/pml/src/execution/types.ts` | Pattern for interface documentation |
| `packages/pml/src/loader/types.ts` | `CapabilityMetadata` interface to extend |

### CapabilityMetadata Extension

The `CapabilityMetadata` interface (line ~78 in `loader/types.ts`) must be extended to allow capabilities to declare UI orchestration:

```typescript
export interface CapabilityMetadata {
  // ... existing fields ...

  /** UI orchestration config for MCP Apps composite display */
  ui?: UiOrchestration;
}
```

This enables capability definitions like:
```typescript
{
  intent: "Analyze and visualize sales",
  code: `...`,
  ui: {
    layout: "split",
    sync: [{ from: "postgres:query", event: "filter", to: "viz:render", action: "update" }]
  }
}
```

### Type Design Details (from Spike)

```typescript
// UiLayout - Layout modes for composite UI
export type UiLayout = "split" | "tabs" | "grid" | "stack";

// UiSyncRule - Sync rule for cross-UI event routing (PML innovation)
export interface UiSyncRule {
  from: string;           // Tool name: "postgres:query"
  event: string;          // Event type detected via args: "filter", "select"
  to: string | "*";       // Target tool or "*" for broadcast
  action: string;         // Action to trigger: "update", "highlight", "refresh"
}

// UiOrchestration - Declarative UI orchestration in capability definition
export interface UiOrchestration {
  layout: UiLayout;
  sync?: UiSyncRule[];
}

// CollectedUiResource - Collected UI resource during execution
export interface CollectedUiResource {
  source: string;           // Tool that returned this UI: "postgres:query"
  resourceUri: string;      // "ui://postgres/table/xxx"
  context?: Record<string, unknown>;
  slot: number;             // Execution order (for sync mapping)
}

// CompositeUiDescriptor - Composite UI descriptor returned to client
export interface CompositeUiDescriptor {
  type: "composite";
  resourceUri: string;      // "ui://pml/workflow/{id}"
  layout: UiLayout;
  children: CollectedUiResource[];
  sync: Array<{
    from: number;           // Slot index (resolved from tool name)
    event: string;
    to: number | "*";
    action: string;
  }>;
}

// McpUiToolMeta - MCP Tool metadata with UI (from MCP Apps spec)
export interface McpUiToolMeta {
  resourceUri?: string;
  visibility?: Array<"model" | "app">;
}

// McpUiResourceMeta - MCP Resource metadata for UI (from MCP Apps spec)
export interface McpUiResourceMeta {
  csp?: {
    connectDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
    baseUriDomains?: string[];
  };
  permissions?: {
    camera?: Record<string, never>;
    microphone?: Record<string, never>;
    geolocation?: Record<string, never>;
    clipboardWrite?: Record<string, never>;
  };
  domain?: string;
  prefersBorder?: boolean;
}
```

### Project Structure Notes

- **Location**: `packages/pml/src/types/ui-orchestration.ts`
- **Pattern**: Follows existing `packages/pml/src/sandbox/types.ts` structure
- **Exports**: All types should be re-exported from `packages/pml/src/types/mod.ts`
- **No runtime code**: This file contains only TypeScript type definitions

### Testing Standards

- **Type checking**: `deno check` must pass
- **No unit tests needed**: Pure type definitions have no runtime behavior
- **Integration validation**: Types will be validated when used in Story 16.3 (sandbox-executor)

### Dependencies

**This story has NO code dependencies** - it's the foundation for all other Epic 16 stories.

**Stories that depend on this:**
- 16.2 (MCP Resources) - Uses `McpUiResourceMeta`
- 16.3 (UI Collection) - Uses `CollectedUiResource`, `UiOrchestration`
- 16.4 (Composite Generator) - Uses `CompositeUiDescriptor`, `UiSyncRule`
- 16.5 (MessageTransport) - May use `McpUiToolMeta`

### References

- [Source: _bmad-output/planning-artifacts/spikes/2026-01-27-mcp-apps-ui-orchestration.md#Types-TypeScript]
- [Source: _bmad-output/planning-artifacts/epics/epic-16-mcp-apps-ui-orchestration.md#Story-16.1]
- [MCP Apps Specification (SEP-1865)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [Pattern: packages/pml/src/sandbox/types.ts]
- [Pattern: packages/pml/src/execution/types.ts]

### FRs Covered

| FR ID | Description | How Addressed |
|-------|-------------|---------------|
| FR-UI-001 | Tools with `_meta.ui.resourceUri` | `McpUiToolMeta` interface |
| FR-UI-003 | Layouts: split, tabs, grid, stack | `UiLayout` type |
| FR-UI-005 | Declarative sync rules | `UiSyncRule`, `UiOrchestration` interfaces |
| ARCH-003 | Types in `packages/pml/src/types/` | File location |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All `deno check` commands passed without errors (only deprecated experimentalDecorators warning)
- No circular dependencies detected (loader/mod.ts check passed)

### Completion Notes List

- ✅ Created `packages/pml/src/types/` directory
- ✅ Created `ui-orchestration.ts` with 10 types/interfaces:
  - `UiLayout` (type union: split|tabs|grid|stack)
  - `UiSyncRule` (interface: from, event, to, action)
  - `UiOrchestration` (interface: layout, sync?)
  - `CollectedUiResource` (interface: source, resourceUri, context?, slot)
  - `ResolvedSyncRule` (interface: resolved slot indices)
  - `CompositeUiDescriptor` (interface: type, resourceUri, layout, children, sync)
  - `McpUiToolMeta` (interface: resourceUri?, visibility?)
  - `McpUiCsp` (interface: connectDomains, resourceDomains, frameDomains, baseUriDomains)
  - `McpUiPermissions` (interface: camera, microphone, geolocation, clipboardWrite)
  - `McpUiResourceMeta` (interface: csp?, permissions?, domain?, prefersBorder?)
- ✅ Created `mod.ts` barrel export with all types
- ✅ Extended `CapabilityMetadata` with `ui?: UiOrchestration` field
- ✅ All types have comprehensive JSDoc with @example blocks
- ✅ All type checks pass (ui-orchestration.ts, mod.ts, loader/types.ts, loader/mod.ts)

### File List

- `packages/pml/src/types/ui-orchestration.ts` (NEW - 402 lines)
  - `UiLayout` type (line 34)
  - `UiSyncRule` interface (lines 67-92)
  - `UiOrchestration` interface (lines 119-130)
  - `CollectedUiResource` interface (lines 152-176)
  - `ResolvedSyncRule` interface (lines 188-210) - helper for slot-resolved sync rules
  - `CompositeUiDescriptor` interface (lines 234-261)
  - `McpUiToolMeta` interface (lines 286-299)
  - `McpUiCsp` interface (lines 307-327) - extracted for CSP config
  - `McpUiPermissions` interface (lines 336-356) - extracted for permissions config
  - `McpUiResourceMeta` interface (lines 379-401)
- `packages/pml/src/types/mod.ts` (NEW - 30 lines)
  - Barrel export for all UI orchestration types
- `packages/pml/src/loader/types.ts` (MODIFIED)
  - Line 9: Added import for `UiOrchestration`
  - Lines 113-133: Added `ui?: UiOrchestration` field with JSDoc to `CapabilityMetadata`
- `packages/pml/src/loader/mod.ts` (MODIFIED - code review fix)
  - Added re-export of UI orchestration types for public API access

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5
**Date:** 2026-01-28
**Outcome:** ✅ APPROVED (after fixes)

### Findings Summary

| Sévérité | Count | Status |
|----------|-------|--------|
| HIGH | 1 | ✅ Fixed |
| MEDIUM | 4 | ✅ Fixed/Documented |
| LOW | 2 | ✅ Fixed |

### Issues Found & Resolved

1. **[HIGH] Types not re-exported from loader/mod.ts** - Fixed by adding re-export block
2. **[MEDIUM] Helper types (McpUiCsp, McpUiPermissions, ResolvedSyncRule) undocumented** - Documented in File List
3. **[LOW] Example import path in mod.ts JSDoc was confusing** - Corrected

### Notes

- `sharedContext` field intentionally omitted from `UiOrchestration` per design decision
- All `deno check` commands pass (only experimentalDecorators warning from global config)
- No circular dependencies detected

## Change Log

- **2026-01-28**: Code Review - Fixed re-export in loader/mod.ts, updated documentation
- **2026-01-28**: Story 16.1 implemented - All UI orchestration types created, CapabilityMetadata extended
