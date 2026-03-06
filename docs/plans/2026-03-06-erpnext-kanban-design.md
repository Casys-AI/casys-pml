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
- the current `order-pipeline-viewer` is refactored only as needed for migration/compatibility
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
- Transitional compatibility: existing `order-pipeline-viewer` may temporarily wrap or delegate to shared kanban internals until fully removed

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
- `columns[]`
- `cards[]` or cards nested under columns
- `capabilities`
- `selection/filter context`

### Column payload

- `id`
- `label`
- `color`
- `count`
- `totals` when relevant
- `dropPolicy`

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
- `tool` or action strategy to execute

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
4. viewer marks the card as pending
5. viewer calls the mapped server tool
6. on success, viewer refreshes the board payload
7. on failure, viewer rolls back and surfaces an inline error

### Error handling

- hard failure if host does not expose proxied server tool calls
- inline error toast/banner per failed move
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
- `Opportunity`
- `Issue`

### Later transactional boards

- `Sales Order`
- `Purchase Order`

These should reuse the same UI engine, but with stricter business adapters because their status changes often map to submit/cancel/fulfillment actions rather than free moves.

## Migration Strategy

### Phase 1

- extract shared kanban UI logic from current patterns
- introduce canonical `kanban-viewer`
- keep existing ERPNext viewer registry functional

### Phase 2

- adapt `order-pipeline-viewer` to reuse shared internals where helpful
- preserve behavior only as long as needed for transition

### Phase 3

- migrate call sites and tools to canonical kanban viewer
- remove `order-pipeline-viewer` once obsolete

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

## Decision Summary

- Keep MCP Apps architecture.
- Keep kanban business logic in `lib/erpnext`, not `lib/server`.
- Avoid side-by-side duplicate stacks.
- Introduce a canonical generic kanban viewer.
- Use explicit per-DocType adapters.
- Start generic support with `Task`, `Opportunity`, and `Issue`.
- Treat `Sales Order` and `Purchase Order` as stricter transactional boards later.
- Build accessibility in from the start.
