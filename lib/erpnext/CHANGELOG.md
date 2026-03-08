# Changelog

All notable changes to `@casys/mcp-erpnext` will be documented in this file.

## [Unreleased]

### Added

- **Canonical read-write kanban MCP App** — `kanban-viewer` is now the single kanban surface, backed by `erpnext_kanban_get_board` and `erpnext_kanban_move_card`.
- **Kanban adapters for three ERPNext DocTypes** — `Task`, `Opportunity`, and `Issue` now share the same normalized board contract, explicit transition matrices, optimistic reconciliation, and server-authoritative mutation flow.
- **Shared viewer refresh infrastructure** — server-side `refreshRequest` injection plus shared viewer refresh helpers now support safe revalidation for long-lived MCP Apps.
- **Refresh-aware passive viewers** — `doclist-viewer`, `stock-viewer`, `invoice-viewer`, `chart-viewer`, `kpi-viewer`, and `funnel-viewer` now support focus refresh and manual fallback refresh actions.
- **Packaged Node distribution fixes** — the npm/Node bundle now serves the packaged MCP server and embedded UI resources correctly in HTTP mode.

### Changed

- **MCP App positioning** — the library is now documented and structured around the first production-grade read-write ERPNext MCP App flow, rather than around a read-only viewer catalog.
- **Kanban scope** — what started as a `Task` validation path is now extended through the same architecture to `Opportunity` and `Issue`.
- **Documentation consolidation** — `README.md`, `docs/ROADMAP.md`, `docs/coverage.md`, and the kanban design/implementation plans now reflect the live server surface and current viewer/tool counts.

### Removed

- **Legacy order pipeline surface** — `order-pipeline-viewer` has been removed.
- **Legacy pipeline tools** — `erpnext_order_pipeline` and `erpnext_purchase_pipeline` have been removed in favor of the canonical kanban path.
