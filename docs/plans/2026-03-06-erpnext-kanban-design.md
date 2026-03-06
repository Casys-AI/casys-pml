# ERPNext Generic Kanban MCP App Design

**Date:** 2026-03-06

**Scope:** `lib/erpnext` only

## Goal

Design a production-grade generic kanban system for ERPNext MCP Apps without creating a parallel UI/tool stack, while keeping MCP Apps protocol compliance, strong business-transition validation, and a clean migration path away from the current `order-pipeline-viewer`.

## Validated Constraints

- Must stay in the MCP Apps model already used by `lib/erpnext`.
- Must not put ERPNext kanban business logic into `lib/server`.
- Must avoid a dirty side-by-side duplicate implementation.
- Existing `order-pipeline-viewer` is not the long-term canonical viewer.
- It is acceptable to change the current `order-pipeline-viewer` contract if that materially simplifies the architecture.
- Accessibility matters from the start: keyboard alternative, focus management, inline errors, pending state, and rollback.

## What Was Verified

### Repository and protocol

- `lib/erpnext/server.ts` already exposes ERPNext UI resources as `ui://mcp-erpnext/...` via `ConcurrentMCPServer.registerResource()`.
- Existing viewers use `@modelcontextprotocol/ext-apps` and receive data through MCP Apps host notifications.
- The current viewers are read-only; no ERPNext viewer currently uses `app.callServerTool(...)`.
- `lib/server` is the generic MCP framework and should remain protocol/infrastructure only.

### Live ERPNext instance

The local ERPNext Docker stack configured in `.env` was inspected and brought back up for verification.

- ERPNext is exposed at `http://localhost:8069`.
- The instance currently has no active `Workflow` records.
- `Sales Order.workflow_state` is not queryable on this instance.
- Observed `Sales Order` statuses on the live instance include:
  - `Draft`
  - `To Deliver and Bill`
  - `Completed`

This confirms that a generic kanban cannot rely on automatic workflow discovery on this instance. It must use explicit per-DocType transition rules.

## External Product Signals

ERPNext/Frappe product patterns and community demand support starting with board-friendly objects:

- `Task` is a natural native kanban/project-view case.
- `Opportunity` is a strong CRM kanban candidate, especially around sales stages and richer cards.
- `Issue` is a natural support board candidate.
- `Sales Order` and `Purchase Order` are transactional documents, not freely movable generic kanban cards.

Sources:

- https://docs.frappe.io/erpnext/project-views
- https://docs.frappe.io/erpnext/sales_stage
- https://docs.frappe.io/erpnext/sales-order
- https://docs.frappe.io/erpnext/support-settings
- https://docs.frappe.io/erpnext/v13/user/manual/en/support/issue
- https://discuss.frappe.io/t/feature-wishes-for-kanban-boards/63240

## Recommended Approach

Use a generic kanban engine inside `lib/erpnext`, backed by explicit per-DocType adapters and transition rules.

This means:

- a canonical generic viewer is introduced for kanban behavior
- the current `order-pipeline-viewer` is not treated as the canonical path and is not part of V1 migration work
- the internal implementation is shared, not duplicated
- the server side exposes a single kanban-oriented domain model with per-DocType business adapters

Rejected approaches:

- automatic workflow/status deduction from ERPNext metadata
- making `order-pipeline-viewer` the permanent generic viewer
- building a second independent kanban stack beside the existing ERPNext MCP App infrastructure

## Architecture

### Layer split

#### `lib/server`

Remains generic MCP infrastructure only:

- tool/resource registration
- HTTP/stdio transport
- MCP Apps resource serving
- auth, validation, concurrency, metrics

No ERPNext kanban business logic belongs here.

#### `lib/erpnext`

Owns the kanban feature:

- DocType-specific board definitions
- business transitions
- ERPNext API calls
- UI resources
- shared viewer state model

### Target shape inside `lib/erpnext`

#### UI

- Canonical viewer: `lib/erpnext/src/ui/kanban-viewer/`
- Shared UI engine: `lib/erpnext/src/ui/shared/kanban/`
- `order-pipeline-viewer` remains an existing legacy viewer and is allowed to die by obsolescence later, without a dedicated compatibility refactor in V1

#### Server/domain

- Shared kanban contracts: `lib/erpnext/src/kanban/`
- Per-DocType adapters:
  - `task`
  - `opportunity`
  - `issue`
  - later: transactional adapters such as `sales-order` and `purchase-order`
- Tool integration remains in `lib/erpnext/src/tools/`

## Data Model

The viewer should not render raw ERPNext rows directly. It should render a normalized kanban payload.

### Board payload

At minimum:

- `boardId`
- `title`
- `doctype`
- `generatedAt`
- `moveToolName`
- `columns[]`
- `allowedTransitions[]`
- `cards[]` or cards nested under columns
- `capabilities`
- `selection/filter context`
- `pagination`

### Column payload

- `id`
- `label`
- `color`
- `count`
- `totals` when relevant

### Card payload

- `id`
- `title`
- `subtitle`
- `badges`
- `metrics`
- `accent`
- `columnId`
- `actions`
- `pending`

### Transition payload

- `fromColumn`
- `toColumn`
- `allowed`
- `reason` when blocked
- `label` when useful for UI affordance
- optional parameter template or adapter-owned action strategy

### Move result payload

- `ok`
- `cardId`
- `fromColumn`
- `toColumn`
- `errorMessage`
- `serverCard` or enough server data to reconcile the local optimistic state

## Mutation Model

### Source of truth

The server remains the source of truth.

The viewer:

- performs lightweight UX prevalidation
- never decides business correctness alone
- calls `app.callServerTool(...)`
- refreshes from server after successful mutation

### Viewer behavior

For a move:

1. user starts drag or keyboard move
2. viewer checks host `serverTools` capability
3. viewer checks local transition allowlist for UX
4. viewer applies a local optimistic move
5. viewer queues the mutation in a local FIFO queue
6. the queue sends one `app.callServerTool(...)` mutation at a time
7. on success, viewer reconciles local state silently from the server response
8. on failure, viewer rolls back and surfaces the server error inline

This means V1 should not do a brute full-board refetch after every move unless reconciliation proves insufficient in practice.

### Error handling

- hard failure if host does not expose proxied server tool calls
- inline error toast/banner per failed move
- `aria-live="polite"` feedback for move success/failure
- no silent swallow
- card unlocked after failure

## Accessibility

AX requirements are first-class:

- drag-and-drop is not the only way to move a card
- keyboard move action must exist
- column and card focus order must be coherent
- pending and error states must be announced/readable
- color is not the only status signal
- touch and pointer interactions must both be supported

## Scope

### Generic kanban V1

- `Task`

### Generic kanban next

- `Opportunity`
- `Issue`

### Later transactional boards

- `Sales Order`
- `Purchase Order`

These should reuse the same UI engine, but with stricter business adapters because their status changes often map to submit/cancel/fulfillment actions rather than free moves.

## Migration Strategy

### Phase 1

- introduce canonical `kanban-viewer`
- ship one end-to-end generic board on `Task`
- validate the read-write MCP App pattern

### Phase 2

- add `Opportunity`
- add `Issue`

### Phase 3

- add transactional boards such as `Sales Order` and `Purchase Order` with stricter business adapters

There is intentionally no dedicated refactor phase for `order-pipeline-viewer` in this plan.

## Testing Strategy

### Server-side

- adapter unit tests per DocType
- transition validation tests
- tool result shape tests
- failure-path tests for forbidden transitions and ERPNext API errors

### UI

- board rendering tests
- drag/pointer interaction tests
- keyboard move tests
- pending/error state tests
- regression tests around viewer hydration from MCP Apps events

### Integration

- verify `ui://` registration still works
- verify MCP Apps initialization still works in host
- verify `app.callServerTool(...)` path works when server tools are exposed

## Why Not Native ERPNext Kanban?

The value here is not "another kanban". The value is a read-write MCP App inside the existing PML conversation flow.

That matters because:

- the user is already inside an agent conversation context
- they should not have to context-switch into ERPNext to complete simple workflow moves
- the kanban can be rendered from agent-selected data and filters
- the same MCP App pattern can later support other read-write business viewers, not just kanban

This feature should therefore be positioned as the first production-grade read-write ERPNext MCP App viewer, with kanban as the first interaction surface.

## Decision Summary

- Keep MCP Apps architecture.
- Keep kanban business logic in `lib/erpnext`, not `lib/server`.
- Avoid side-by-side duplicate stacks.
- Introduce a canonical generic kanban viewer.
- Use explicit per-DocType adapters.
- Start V1 with `Task` only.
- Add `Opportunity` and `Issue` in follow-up increments.
- Treat `Sales Order` and `Purchase Order` as stricter transactional boards later.
- Build accessibility in from the start.
- Use explicit `allowedTransitions`, not viewer-inferred drop policy.
- Use optimistic local state plus FIFO mutation serialization and server reconciliation.
