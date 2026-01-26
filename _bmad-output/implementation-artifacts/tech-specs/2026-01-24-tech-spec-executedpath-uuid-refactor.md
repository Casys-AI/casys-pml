---
title: 'ExecutedPath UUID Refactor'
slug: 'executedpath-uuid-refactor'
created: '2026-01-24'
updated: '2026-01-26'
status: 'complete'
stepsCompleted: ['analysis', 'implementation', 'testing']
tech_stack: ['deno', 'typescript', 'postgresql', 'fresh']
files_to_modify: []
code_patterns: []
test_patterns: ['tests/unit/api/graph_mappers_test.ts']
---

# Tech-Spec: ExecutedPath UUID Refactor

**Created:** 2026-01-24
**Status:** Complete ✅
**Completed:** 2026-01-26

## Implementation Summary

This tech spec is **implemented as Issue 6** in `tech-spec-execution-learning-fixes.md`.

Key commits:
- `01916e98` - Backend: `resolveExecutedPathForDisplay()` in graph-mappers.ts
- `70c723d5` - Tests: Unit tests for UUID→name resolution

Tests: `tests/unit/api/graph_mappers_test.ts` (8 tests)

---

## Original Analysis (for reference)
**Related:** tech-spec-execution-learning-fixes.md (Issue 6)

## Overview

### Problem Statement

`executedPath` currently stores tool/capability **names** (e.g., `std:psql_query`, `code:log_test`), but this approach has critical flaws:

1. **Key mismatch in flattenExecutedPath()** - Cannot match child traces because `capability_id` is a UUID
2. **Name collision risk** - Same name can exist with different hashes (versions)
3. **Names can change** - Capability renaming breaks historical traces
4. **Inconsistent with FK** - `execution_trace.capability_id` already uses UUID

### Proposed Solution

Store `workflow_pattern.pattern_id` (UUID) in `executedPath` instead of names.

## Current State

### Data Flow Analysis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. TRACE EVENT CREATION (sandbox execution)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ToolTraceEvent (src/sandbox/types.ts:321)                                  │
│  ├── type: "tool_end"                                                       │
│  └── tool: "std:psql_query"  ◄── NAME (unique in tool_schema)               │
│                                                                             │
│  CapabilityTraceEvent (src/sandbox/types.ts:332)                            │
│  ├── type: "capability_end"                                                 │
│  ├── capability: "code:my_cap"      ◄── NAME                                │
│  └── capabilityId: "abc-123-..."    ◄── UUID (workflow_pattern.pattern_id)  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. EXECUTEDPATH CONSTRUCTION (worker-bridge.ts:426-434)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  const executedPath = sortedTraces                                          │
│    .filter(t => t.type === "tool_end" || t.type === "capability_end")       │
│    .map(t => {                                                              │
│      if (t.type === "tool_end") return t.tool;        // ✅ NAME (OK)       │
│      return t.capability;                              // ❌ NAME (BAD!)    │
│    });                                        // Should use t.capabilityId  │
│                                                                             │
│  Result: ["std:psql_query", "code:my_cap"]  ◄── NAMES, not UUIDs            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. STORAGE (capability-store.ts → execution-trace-store.ts → DB)            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  execution_trace table:                                                     │
│  ├── id: UUID                                                               │
│  ├── capability_id: UUID  ◄── FK to workflow_pattern.pattern_id             │
│  ├── executed_path: TEXT[]  ◄── ["std:psql_query", "code:my_cap"] (NAMES)   │
│  └── parent_trace_id: UUID  ◄── FK to parent execution_trace                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌───────────────────────┐ ┌─────────────────┐ ┌─────────────────────────────┐
│ 4a. PER TRAINING      │ │ 4b. PER PRIORITY│ │ 4c. FRONTEND                │
│ (per-training.ts)     │ │ (per-priority)  │ │ (CytoscapeGraph.tsx)        │
├───────────────────────┤ ├─────────────────┤ ├─────────────────────────────┤
│                       │ │                 │ │                             │
│ flattenExecutedPath() │ │ predictPath-    │ │ Displays trace timeline     │
│                       │ │ Success()       │ │ with tool/capability names  │
│ // BUG HERE:          │ │                 │ │                             │
│ childTraceMap.set(    │ │ shgat.predict-  │ │ executedPath used for       │
│   child.capabilityId, │ │ PathSuccess(    │ │ display (human-readable)    │
│   child              │ │   intent,       │ │                             │
│ );  // Key = UUID     │ │   executedPath  │ │ ✅ Wants NAMES for display  │
│                       │ │ );              │ │                             │
│ for (nodeId of path) {│ │                 │ │                             │
│   childTraceMap.get(  │ │ // Uses path to │ │                             │
│     nodeId            │ │ // lookup in    │ │                             │
│   ); // nodeId = NAME │ │ // SHGAT graph  │ │                             │
│ }                     │ │                 │ │                             │
│                       │ │ // Graph nodes  │ │                             │
│ ❌ NEVER MATCHES!     │ │ // indexed by?  │ │                             │
│                       │ │ // (need check) │ │                             │
└───────────────────────┘ └─────────────────┘ └─────────────────────────────┘
```

### Key Insight

`CapabilityTraceEvent` already contains BOTH:
- `capability: string` (name) - currently used
- `capabilityId: string` (UUID) - **available but not used!**

The fix for capabilities is simple: use `t.capabilityId` instead of `t.capability`.

For tools, there's only the name - but that's OK since tools are uniquely identified by name in `tool_schema`.

### Affected Components

| Component | File | Current | Impact |
|-----------|------|---------|--------|
| executedPath builder | `worker-bridge.ts:431-434` | Uses `t.capability` (name) | Change to `t.capabilityId` |
| flattenExecutedPath | `per-training.ts:136-152` | Key mismatch (name vs UUID) | Will work after fix |
| SHGAT predictPathSuccess | `per-priority.ts:132` | Uses path for graph lookup | Need to verify graph indexing |
| SHGAT graph nodes | `graph-builder.ts` | Need to check indexing | Tools by name, caps by UUID? |
| Frontend display | `CytoscapeGraph.tsx` | Displays names | Need UUID→name resolution |
| execution-trace-store | `execution-trace-store.ts` | Stores TEXT[] | No schema change needed |

### SHGAT Graph Indexing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SHGAT GRAPH NODE INDEXING                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  toolNodes Map<string, ToolNode>                                            │
│  ├── Key: TOOL NAME (e.g., "std:psql_query")                                │
│  └── Source: post-execution.service.ts:213-216                              │
│              shgat.registerTool({ id: toolId, embedding })                  │
│              where toolId = "std:psql_query"                                │
│                                                                             │
│  capabilityNodes Map<string, CapabilityNode>                                │
│  ├── Key: UUID (e.g., "abc-123-def-456")                                    │
│  └── Source: graph-sync/controller.ts:344-345                               │
│              shgat.registerCapability({ id: capabilityId, ... })            │
│              where capabilityId = workflow_pattern.pattern_id               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

predictPathSuccess() (scoring-helpers.ts:70-104):
  - Looks up path[i] in toolNodes (by NAME) → ✅ works for tools
  - Looks up path[i] in capabilityNodes (by UUID) → ✅ will work after refactor
```

### After Refactor

`executedPath` will contain **mixed format**:
- Tools: NAME (e.g., `std:psql_query`) - unchanged
- Capabilities: UUID (e.g., `abc-123-def-456`) - changed from name

This aligns with SHGAT's existing indexing strategy.

## Target State

### Data Flow After Refactor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. TRACE EVENT CREATION (unchanged)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ToolTraceEvent                                                             │
│  └── tool: "std:psql_query"  ◄── NAME (no UUID available, that's OK)        │
│                                                                             │
│  CapabilityTraceEvent                                                       │
│  ├── capability: "code:my_cap"      ◄── NAME (ignored)                      │
│  └── capabilityId: "abc-123-..."    ◄── UUID (USE THIS)                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. EXECUTEDPATH CONSTRUCTION (CHANGED)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  const executedPath = sortedTraces                                          │
│    .filter(t => t.type === "tool_end" || t.type === "capability_end")       │
│    .map(t => {                                                              │
│      if (t.type === "tool_end") return t.tool;        // NAME (unchanged)   │
│      return t.capabilityId;                            // ✅ UUID (FIXED!)  │
│    });                                                                      │
│                                                                             │
│  Result: ["std:psql_query", "abc-123-uuid"]  ◄── Mixed: names + UUIDs       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. STORAGE (unchanged)                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  execution_trace.executed_path: TEXT[]                                      │
│  ["std:psql_query", "abc-123-uuid"]  ◄── Still TEXT[], just different values│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌───────────────────────┐ ┌─────────────────┐ ┌─────────────────────────────┐
│ 4a. PER TRAINING      │ │ 4b. PER PRIORITY│ │ 4c. FRONTEND                │
│ ✅ WORKS              │ │ ✅ WORKS        │ │ ⚠️ NEEDS CHANGE             │
├───────────────────────┤ ├─────────────────┤ ├─────────────────────────────┤
│                       │ │                 │ │                             │
│ flattenExecutedPath() │ │ predictPath-    │ │ Must resolve UUIDs to       │
│                       │ │ Success()       │ │ human-readable names        │
│ childTraceMap.set(    │ │                 │ │                             │
│   child.capabilityId, │ │ Graph lookup:   │ │ Options:                    │
│   child               │ │ - toolNodes by  │ │ 1. JOIN workflow_pattern    │
│ );  // Key = UUID     │ │   NAME ✅       │ │ 2. Add name field to trace  │
│                       │ │ - capNodes by   │ │ 3. Client-side lookup       │
│ for (nodeId of path) {│ │   UUID ✅       │ │                             │
│   childTraceMap.get(  │ │                 │ │                             │
│     nodeId // UUID    │ │                 │ │                             │
│   );                  │ │                 │ │                             │
│ }                     │ │                 │ │                             │
│                       │ │                 │ │                             │
│ ✅ NOW MATCHES!       │ │                 │ │                             │
└───────────────────────┘ └─────────────────┘ └─────────────────────────────┘
```

## Impact Analysis

### Backend Changes

| File | Change | Effort |
|------|--------|--------|
| `src/sandbox/worker-bridge.ts:432-433` | Use `t.capabilityId` instead of `t.capability` | 1 line |
| `src/graphrag/learning/per-training.ts` | No change needed | None |
| `src/capabilities/per-priority.ts` | No change needed | None |
| `src/capabilities/execution-trace-store.ts` | No change needed (TEXT[] works) | None |

**Total backend: 1 line change** (assuming no other consumers)

### Frontend Changes

| File | Change | Effort |
|------|--------|--------|
| `src/web/islands/CytoscapeGraph.tsx` | Resolve UUID → name for display | Medium |
| `src/web/components/ui/molecules/TraceTimeline.tsx` | May need UUID resolution | Low |

**Options for UUID resolution:**

1. **Server-side JOIN** (recommended): Modify the API endpoint that fetches traces to include capability names
   ```sql
   SELECT et.*, wp.description as capability_name
   FROM execution_trace et
   LEFT JOIN workflow_pattern wp ON ...
   ```

2. **Add `capability_name` field to trace**: Store name alongside UUID in DB (denormalization)

3. **Client-side lookup**: Fetch capability names separately (more API calls)

### Database Changes

**No schema changes required.**

`executed_path` is `TEXT[]` which accepts any strings (names or UUIDs).

Existing data will have names, new data will have UUIDs for capabilities.

### Migration Strategy

**Option A: No migration (recommended)**
- Old traces keep names → displayed as-is (might not match SHGAT nodes)
- New traces use UUIDs → proper matching
- Over time, old traces age out

**Option B: Backfill migration**
- Update old traces to replace capability names with UUIDs
- Requires mapping name → UUID (may have collisions)
- Complex and risky

**Recommendation:** Option A (no migration). Old traces are historical and don't need SHGAT matching.

## Implementation Plan

| Phase | Task | File | Effort | Status |
|-------|------|------|--------|--------|
| 1.1 | Change `t.capability` → `t.capabilityId` | `worker-bridge.ts:433` | 5 min | |
| 1.2 | Add UUID→name resolution in API | `routes/api/traces.ts` (or similar) | 1h | |
| 1.3 | Update frontend to use resolved names | `CytoscapeGraph.tsx` | 30 min | |
| 1.4 | Add tests for mixed name/UUID paths | `per-training.test.ts` | 30 min | |
| 1.5 | Integration test: full flow | New test file | 1h | |

**Total estimated effort: ~3h**

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Old traces have names, new have UUIDs | Frontend handles both formats gracefully |
| Frontend displays raw UUIDs if resolution fails | Fallback to UUID display with tooltip |
| Mixed format in `executedPath` confusing | Document clearly, add helper to detect format |
| SHGAT graph might have stale name-indexed nodes | Tools stay name-indexed (OK), only caps change |

## Acceptance Criteria

- [ ] AC1: `executedPath` stores UUIDs for capabilities
- [ ] AC2: `flattenExecutedPath()` correctly matches child traces
- [ ] AC3: Frontend displays human-readable names
- [ ] AC4: Existing traces handled gracefully (migration or fallback)
- [ ] AC5: All tests pass

## References

- `src/sandbox/worker-bridge.ts` - Where executedPath is built
- `src/graphrag/learning/per-training.ts` - flattenExecutedPath()
- `src/web/islands/CytoscapeGraph.tsx` - Frontend trace display
- `src/capabilities/capability-store.ts` - Capability persistence
