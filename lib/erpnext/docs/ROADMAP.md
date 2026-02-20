# ERPNext MCP Viewers — Roadmap

## Current State (2026-02-20)

### Viewers
| Viewer | Description |
|--------|------------|
| doclist-viewer | Generic DocType table (sort, filter, pagination, CSV export) |
| invoice-viewer | Sales/Purchase Invoice detail view |
| stock-viewer | Stock balance table with color-coded qty badges |
| chart-viewer | Universal chart renderer (12 types via Recharts) |
| order-pipeline-viewer | Sales Order kanban by status |

### Analytics Tools (→ chart-viewer)
| Tool | Chart Type |
|------|-----------|
| erpnext_stock_chart | bar / horizontal-bar |
| erpnext_sales_chart | donut / horizontal-bar |
| erpnext_revenue_trend | line / area / stacked-area |
| erpnext_order_breakdown | stacked-bar / pie / donut |
| erpnext_revenue_vs_orders | composed (bar + line, dual axis) |
| erpnext_stock_treemap | treemap |
| erpnext_product_radar | radar |
| erpnext_price_vs_qty | scatter |

## Roadmap

### TIER 1 — High Value (P0)

#### KPI Viewer (single metric card)
- **New viewer**: `kpi-viewer` — big number, subtitle, delta vs previous period, sparkline
- **Tools** (each returns ONE KPI, PML composes them):
  - `erpnext_kpi_revenue` — Revenue MTD/YTD with delta
  - `erpnext_kpi_outstanding` — Total outstanding receivables
  - `erpnext_kpi_orders` — Orders this month (count + value)
  - `erpnext_kpi_gross_margin` — Gross margin % with trend
  - `erpnext_kpi_overdue` — Number + value of overdue invoices
- **Rationale**: CFOs want at-a-glance metrics. ERPNext requires too many clicks. PML aggregation = compose N kpi cards in one feed view.

#### Accounts Receivable Aging
- **Reuses**: chart-viewer (stacked-bar, buckets per customer)
- **Tool**: `erpnext_ar_aging` — Aging buckets (0-30, 31-60, 61-90, 90+ days) from Sales Invoice
- **Rationale**: #1 financial report. 43+ GitHub issues about it. Native UX is a flat table.

### TIER 2 — Important (P1)

#### Gross Profit / Margins
- **Reuses**: chart-viewer (horizontal-bar with margin data)
- **Tool**: `erpnext_gross_profit` — Margin per item or customer, color-coded
- **Rationale**: "Which products are profitable?" — every business asks this daily.

#### P&L Statement
- **Reuses**: chart-viewer (composed or stacked-bar)
- **Tool**: `erpnext_profit_loss` — Income vs Expense accounts from GL Entry
- **Rationale**: Second most-used financial report.

#### Purchase Pipeline
- **Reuses**: order-pipeline-viewer (same kanban, different doctype)
- **Tool**: `erpnext_purchase_pipeline` — Purchase Orders by status
- **Rationale**: Mirror of Sales pipeline. Low effort (reuse existing viewer).

#### Sales Funnel
- **New viewer**: `funnel-viewer` — trapezoid stages with conversion rates
- **Tool**: `erpnext_sales_funnel` — Lead → Opportunity → Quotation → Order counts
- **Rationale**: Visually impressive for demos, universally understood.

### TIER 3 — Later (P2)

- BOM Cost Breakdown (reuse treemap)
- Bank Reconciliation Status (new viewer)
- HR Overview (reuse kpi-viewer + chart-viewer)
- Stock Ledger Timeline (reuse chart-viewer line + doclist-viewer)

## Architecture Notes

- Each KPI is a **separate tool call** — NO aggregated dashboard tool
- PML Feed composes multiple viewer iframes → user gets a dashboard
- New viewers follow the pattern: `lib/erpnext/src/ui/{name}/src/{Name}.tsx`
- Shared: `~/shared/theme.ts` (colors, fonts, styles), `~/shared/ErpNextBrand.tsx`
- MCP App protocol: `new App()`, `app.ontoolresult`, parse JSON from `content[0].text`
- `animationDuration={0}` on all Recharts components (no fade-in)
- Register viewer name in `lib/erpnext/server.ts` UI_VIEWERS array

## Sources
- [Frappe Forum — Dashboard Options](https://discuss.frappe.io/t/dashboard-options-for-erpnext/70454)
- [Frappe Forum — KPI Dashboard](https://discuss.frappe.io/t/how-i-created-this-sales-kpi-dashboard/33252)
- [GitHub — AR Aging Issues](https://github.com/frappe/erpnext/issues/45830)
- [Mint — Better Bank Reconciliation](https://github.com/The-Commit-Company/mint)
- [ERPNext Procurement Tracker](https://techfordai.com/procurement-tracker-in-erpnext/)
