# ERPNext Generic Kanban Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-grade generic kanban MCP App in `lib/erpnext`, validated on `Task` first, then extended to additional DocTypes, and positioned as the first read-write ERPNext MCP App viewer rather than as a replacement for ERPNext native kanban.

**Architecture:** Keep MCP protocol and resource serving in `lib/server` and `lib/erpnext/server.ts`, but move kanban business logic into `lib/erpnext/src/kanban/` modules plus a canonical `kanban-viewer`. The delivered implementation now supports `Task`, `Opportunity`, and `Issue`, with explicit allowed transition matrices, optimistic local state, FIFO mutation serialization, refresh/revalidation infrastructure, and server-side reconciliation through MCP Apps tool calls.

**Tech Stack:** Deno, TypeScript, `@casys/mcp-server`, `@modelcontextprotocol/ext-apps`, React 18, Vite, ERPNext REST/Frappe APIs

---

## Execution Status

This document started as the original 8-task execution plan. The sequence below is still useful as the historical delivery path, but the implementation has now moved beyond the original `Task`-only scope.

### Completed from the original plan

- Task 1: shared kanban contracts
- Task 2: board definition registry
- Task 3: `Task` adapter
- Task 4: kanban read/move tools
- Task 5: canonical `kanban-viewer`
- Task 6: interactive move flow with AX
- Task 7: server/resource registration
- Task 8: scope and product-positioning docs

### Completed beyond the original plan

- `Opportunity` adapter and live kanban support
- `Issue` adapter and live kanban support
- shared `refreshRequest` injection for MCP App payloads
- shared viewer refresh helpers used across passive and interactive viewers
- refresh-enabled `doclist-viewer`, `stock-viewer`, `invoice-viewer`, `kpi-viewer`, `chart-viewer`, and `funnel-viewer`
- removal of `order-pipeline-viewer`
- removal of `erpnext_order_pipeline` and `erpnext_purchase_pipeline`
- packaged Node bundle validation and live HTTP serving on `3012`

### Remaining work

- transactional kanban adapters for `Sales Order` / `Purchase Order`
- additional interactive viewers beyond kanban
- host-level end-to-end validation for richer MCP App mutation flows

## Historical Task Sequence

The tasks below describe the original execution order. They should be read as a record of how the work was sequenced, not as the current surface area of the feature.

### Task 1: Define shared kanban contracts

**Files:**
- Create: `lib/erpnext/src/kanban/types.ts`
- Create: `lib/erpnext/tests/kanban/types_test.ts`
- Reference: `docs/plans/2026-03-06-erpnext-kanban-design.md`

**Step 1: Write the failing test**

Create `lib/erpnext/tests/kanban/types_test.ts` with assertions for:
- board shape
- column shape
- card shape
- transition result shape

**Step 2: Run test to verify it fails**

Run: `deno test lib/erpnext/tests/kanban/types_test.ts`
Expected: FAIL because `lib/erpnext/src/kanban/types.ts` does not exist

**Step 3: Write minimal implementation**

Create `lib/erpnext/src/kanban/types.ts` exporting shared interfaces:
- `KanbanBoard`
- `KanbanColumn`
- `KanbanCard`
- `KanbanMoveRequest`
- `KanbanMoveResult`
- `KanbanAdapter`

**Step 4: Run test to verify it passes**

Run: `deno test lib/erpnext/tests/kanban/types_test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/erpnext/src/kanban/types.ts lib/erpnext/tests/kanban/types_test.ts
git commit -m "feat(lib/erpnext): add shared kanban contracts"
```

### Task 2: Add board definition registry

**Files:**
- Create: `lib/erpnext/src/kanban/definitions.ts`
- Create: `lib/erpnext/tests/kanban/definitions_test.ts`
- Modify: `lib/erpnext/src/tools/types.ts`

**Step 1: Write the failing test**

Add tests asserting:
- only `Task` is registered in generic V1
- each definition declares title, columns, and adapter key
- the definition exposes `moveToolName`

**Step 2: Run test to verify it fails**

Run: `deno test lib/erpnext/tests/kanban/definitions_test.ts`
Expected: FAIL because registry file is missing

**Step 3: Write minimal implementation**

Create the registry entry for:
- `Task`

Keep `Opportunity`, `Issue`, `Sales Order`, and `Purchase Order` out of V1.

**Step 4: Run test to verify it passes**

Run: `deno test lib/erpnext/tests/kanban/definitions_test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/erpnext/src/kanban/definitions.ts lib/erpnext/tests/kanban/definitions_test.ts lib/erpnext/src/tools/types.ts
git commit -m "feat(lib/erpnext): register generic kanban doctypes"
```

### Task 3: Implement Task adapter

**Files:**
- Create: `lib/erpnext/src/kanban/adapters/task.ts`
- Create: `lib/erpnext/tests/kanban/task-adapter_test.ts`
- Reference: `lib/erpnext/src/tools/project.ts`

**Step 1: Write the failing test**

Test:
- Task rows map to columns/cards correctly
- forbidden moves are rejected
- allowed moves resolve to the proper ERPNext update action

**Step 2: Run test to verify it fails**

Run: `deno test lib/erpnext/tests/kanban/task-adapter_test.ts`
Expected: FAIL because adapter file is missing

**Step 3: Write minimal implementation**

Implement:
- task board builder
- task status transition rules
- task move dispatch via existing project/task tool patterns

**Step 4: Run test to verify it passes**

Run: `deno test lib/erpnext/tests/kanban/task-adapter_test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/erpnext/src/kanban/adapters/task.ts lib/erpnext/tests/kanban/task-adapter_test.ts
git commit -m "feat(lib/erpnext): add task kanban adapter"
```

### Task 4: Add kanban read and move tools

**Files:**
- Create: `lib/erpnext/src/tools/kanban.ts`
- Modify: `lib/erpnext/src/tools/mod.ts`
- Create: `lib/erpnext/tests/tools/kanban_test.ts`

**Step 1: Write the failing test**

Add tests for:
- `erpnext_kanban_get_board`
- `erpnext_kanban_move_card`
- adapter dispatch by DocType
- `_meta.ui.resourceUri` targeting `ui://mcp-erpnext/kanban-viewer`
- `limit` and `offset` parameters
- `errorMessage` passthrough on failed move

**Step 2: Run test to verify it fails**

Run: `deno test lib/erpnext/tests/tools/kanban_test.ts`
Expected: FAIL because tool module is missing

**Step 3: Write minimal implementation**

Implement:
- board read tool dispatching to adapters
- move tool dispatching to adapter transition handlers
- explicit errors for unsupported doctypes and invalid moves
- pagination inputs for high-cardinality doctypes

**Step 4: Run test to verify it passes**

Run: `deno test lib/erpnext/tests/tools/kanban_test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/erpnext/src/tools/kanban.ts lib/erpnext/src/tools/mod.ts lib/erpnext/tests/tools/kanban_test.ts
git commit -m "feat(lib/erpnext): add generic kanban tools"
```

### Task 5: Build canonical kanban viewer shell

**Files:**
- Create: `lib/erpnext/src/ui/kanban-viewer/index.html`
- Create: `lib/erpnext/src/ui/kanban-viewer/src/main.tsx`
- Create: `lib/erpnext/src/ui/kanban-viewer/src/KanbanViewer.tsx`
- Create: `lib/erpnext/src/ui/shared/kanban/types.ts`
- Create: `lib/erpnext/src/ui/shared/kanban/useKanbanBoard.ts`

**Step 1: Write the failing test**

If the existing UI test setup is minimal, add at least shape-level unit tests or lightweight component tests for:
- board hydration from tool result
- empty state
- pending card state

**Step 2: Run test to verify it fails**

Run: `cd lib/erpnext/src/ui && npm run build`
Expected: FAIL because the viewer is not registered yet or imports are missing

**Step 3: Write minimal implementation**

Create the canonical kanban viewer:
- MCP App connection
- board state hydration
- `useReducer` local state
- empty/loading states
- shared card/column primitives

**Step 4: Run build to verify it passes**

Run: `cd lib/erpnext/src/ui && npm run build`
Expected: PASS and `dist/kanban-viewer/index.html` generated

**Step 5: Commit**

```bash
git add lib/erpnext/src/ui/kanban-viewer lib/erpnext/src/ui/shared/kanban
git commit -m "feat(lib/erpnext): add canonical kanban viewer"
```

### Task 6: Add interactive move flow with AX

**Files:**
- Modify: `lib/erpnext/src/ui/kanban-viewer/src/KanbanViewer.tsx`
- Create: `lib/erpnext/src/ui/shared/kanban/interactions.ts`
- Create: `lib/erpnext/src/ui/shared/kanban/interactions_test.ts`
- Modify: `lib/erpnext/src/ui/global.css`

**Step 1: Write the failing test**

Add tests for:
- pointer drag move
- keyboard move alternative
- pending state lock
- rollback on failed move
- FIFO mutation serialization
- `aria-live` announcements

**Step 2: Run test to verify it fails**

Run: `cd lib/erpnext/src/ui && npm run build`
Expected: FAIL or missing-interaction coverage

**Step 3: Write minimal implementation**

Implement:
- drag-and-drop
- keyboard move action
- visible focus states
- error/pending banners
- per-card pending indicators
- local mutation queue with one in-flight move at a time
- optimistic move plus animated rollback
- `app.callServerTool(...)` mutation path

**Step 4: Run verification**

Run: `cd lib/erpnext/src/ui && npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/erpnext/src/ui/kanban-viewer/src/KanbanViewer.tsx lib/erpnext/src/ui/shared/kanban/interactions.ts lib/erpnext/src/ui/shared/kanban/interactions_test.ts lib/erpnext/src/ui/global.css
git commit -m "feat(lib/erpnext): add accessible kanban interactions"
```

### Task 7: Register viewer and wire server resource

**Files:**
- Modify: `lib/erpnext/server.ts`
- Modify: `lib/erpnext/src/ui/build-all.mjs`
- Modify: `lib/erpnext/src/ui/package.json`

**Step 1: Write the failing test**

Add or update tests to assert `ui://mcp-erpnext/kanban-viewer` registration and build inclusion.

**Step 2: Run test/build to verify it fails**

Run: `deno test lib/erpnext/tests/tools/kanban_test.ts`
Expected: FAIL until viewer resource is registered

**Step 3: Write minimal implementation**

Register the new viewer in:
- `UI_VIEWERS` in `lib/erpnext/server.ts`
- the UI build script
- any relevant dev scripts

**Step 4: Run verification**

Run: `deno test lib/erpnext/tests/tools/kanban_test.ts && cd lib/erpnext/src/ui && npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/erpnext/server.ts lib/erpnext/src/ui/build-all.mjs lib/erpnext/src/ui/package.json
git commit -m "feat(lib/erpnext): register kanban viewer resource"
```

### Task 8: Document scope and product positioning

**Files:**
- Modify: `lib/erpnext/README.md`
- Modify: `lib/erpnext/docs/ROADMAP.md`
- Modify: `docs/plans/2026-03-06-erpnext-kanban-design.md`

**Step 1: Write the failing doc checklist**

Add a checklist for:
- canonical kanban viewer
- `Task`-only V1
- `Opportunity` and `Issue` as follow-up increments
- transactional board follow-up
- "Why not native ERPNext?"

**Step 2: Run verification**

Run: `rg -n "kanban-viewer|order-pipeline-viewer|Task|Opportunity|Issue" lib/erpnext/README.md lib/erpnext/docs/ROADMAP.md docs/plans/2026-03-06-erpnext-kanban-design.md`
Expected: missing entries before update

**Step 3: Write minimal documentation**

Document:
- scope
- viewer ownership
- `Task`-only V1 rationale
- read-write MCP App positioning
- AX expectations

**Step 4: Run verification**

Run: `rg -n "kanban-viewer|Task|Opportunity|Issue|native ERPNext|read-write MCP App" lib/erpnext/README.md lib/erpnext/docs/ROADMAP.md docs/plans/2026-03-06-erpnext-kanban-design.md`
Expected: PASS with all expected references present

**Step 5: Commit**

```bash
git add lib/erpnext/README.md lib/erpnext/docs/ROADMAP.md docs/plans/2026-03-06-erpnext-kanban-design.md
git commit -m "docs(lib/erpnext): document generic kanban migration"
```

## Next Backlog

The next implementation batch should not revisit the generic kanban foundation. That part is already in place.

Priority backlog:

1. Transaction-safe kanban adapters for `Sales Order` and `Purchase Order`
2. Actionable non-kanban viewers using the same `app.callServerTool(...)` mutation pattern
3. Shared React-level helpers only where duplication is proven, not pre-emptively
4. Host-level revalidation/push strategies beyond viewer-side focus/poll refresh
