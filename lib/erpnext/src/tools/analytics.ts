/**
 * ERPNext Analytics Tools
 *
 * Tools that return shaped data for chart/pipeline viewers.
 * - erpnext_order_pipeline  → Kanban columns by SO status
 * - erpnext_stock_chart     → Bar chart of stock levels by item
 * - erpnext_sales_chart     → Bar/donut chart of sales by customer or item
 *
 * @module lib/erpnext/tools/analytics
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const analyticsTools: ErpNextTool[] = [
  // ── Order Pipeline ────────────────────────────────────────────────────────

  {
    name: "erpnext_order_pipeline",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/order-pipeline-viewer" } },
    description:
      "Get sales orders grouped by workflow status as a kanban pipeline. " +
      "Returns columns (Draft, Open, To Deliver, To Bill, Completed, Cancelled) " +
      "with order count, total value, and individual order cards. " +
      "Ideal for seeing the current state of your sales pipeline at a glance.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max total orders to fetch (default 200)" },
        customer: { type: "string", description: "Filter by customer name" },
        exclude_cancelled: {
          type: "boolean",
          description: "Exclude cancelled orders from results (default false)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 200;
      const filters: FrappeFilter[] = [];

      if (input.customer) {
        filters.push(["customer", "=", input.customer as string]);
      }
      if (input.exclude_cancelled) {
        filters.push(["status", "!=", "Cancelled"]);
      }

      const orders = await ctx.client.list("Sales Order", {
        fields: [
          "name",
          "customer",
          "customer_name",
          "status",
          "grand_total",
          "transaction_date",
          "delivery_date",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      const STATUS_MAP: Record<string, { label: string; color: string }> = {
        "Draft":                { label: "Draft",       color: "#78716c" },
        "Open":                 { label: "Open",        color: "#fbbf24" },
        "To Deliver and Bill":  { label: "To Deliver",  color: "#60a5fa" },
        "To Bill":              { label: "To Bill",     color: "#c084fc" },
        "Completed":            { label: "Completed",   color: "#4ade80" },
        "Cancelled":            { label: "Cancelled",   color: "#f87171" },
      };

      const grouped: Record<string, typeof orders> = {};
      for (const order of orders) {
        const status = (order.status as string) ?? "Draft";
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(order);
      }

      const columns = Object.entries(STATUS_MAP)
        .filter(([status]) => grouped[status]?.length > 0)
        .map(([status, { label, color }]) => {
          const statusOrders = grouped[status] ?? [];
          return {
            status,
            label,
            color,
            count: statusOrders.length,
            total: statusOrders.reduce((sum, o) => sum + (Number(o.grand_total) || 0), 0),
            orders: statusOrders.map((o) => ({
              name: o.name,
              customer: (o.customer_name ?? o.customer) as string,
              amount: Number(o.grand_total) || 0,
              date: o.transaction_date as string,
              delivery_date: o.delivery_date as string | undefined,
            })),
          };
        });

      return {
        title: "Sales Order Pipeline",
        currency: "USD",
        generatedAt: new Date().toISOString(),
        columns,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/order-pipeline-viewer" } },
      };
    },
  },

  // ── Stock Chart ───────────────────────────────────────────────────────────

  {
    name: "erpnext_stock_chart",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
    description:
      "Get stock levels as a bar chart. Shows actual_qty per item (optionally filtered by warehouse). " +
      "Groups items and returns chart-ready data. " +
      "Use type='horizontal-bar' for readability with many items.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        warehouse: { type: "string", description: "Filter by warehouse name" },
        item_group: { type: "string", description: "Filter by item group" },
        limit: { type: "number", description: "Max items to show (default 20)" },
        type: {
          type: "string",
          enum: ["bar", "horizontal-bar"],
          description: "Chart type (default: horizontal-bar for many items, bar for few)",
        },
        min_qty: { type: "number", description: "Only show items with qty >= this value (filters out zeros)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [["actual_qty", ">", (input.min_qty as number) ?? 0]];

      if (input.warehouse) filters.push(["warehouse", "=", input.warehouse as string]);
      if (input.item_group) filters.push(["item_group", "=", input.item_group as string]);

      const bins = await ctx.client.list("Bin", {
        fields: ["item_code", "warehouse", "actual_qty", "stock_value"],
        filters,
        limit,
        order_by: "actual_qty desc",
      });

      // Aggregate by item_code (sum across warehouses if no filter)
      const byItem: Record<string, { qty: number; value: number }> = {};
      for (const bin of bins) {
        const item = bin.item_code as string;
        if (!byItem[item]) byItem[item] = { qty: 0, value: 0 };
        byItem[item].qty += Number(bin.actual_qty) || 0;
        byItem[item].value += Number(bin.stock_value) || 0;
      }

      const sorted = Object.entries(byItem)
        .sort(([, a], [, b]) => b.qty - a.qty)
        .slice(0, limit);

      const warehouseLabel = (input.warehouse as string) ?? "All Warehouses";
      const chartType = (input.type as string) ?? (sorted.length > 6 ? "horizontal-bar" : "bar");

      return {
        title: "Stock Levels",
        subtitle: warehouseLabel,
        type: chartType,
        labels: sorted.map(([item]) => item),
        datasets: [
          {
            label: "Qty on Hand",
            values: sorted.map(([, { qty }]) => qty),
            color: "#60a5fa",
          },
        ],
        unit: "units",
        generatedAt: new Date().toISOString(),
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
      };
    },
  },

  // ── Sales Chart ───────────────────────────────────────────────────────────

  {
    name: "erpnext_sales_chart",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
    description:
      "Analyze sales revenue as a chart. " +
      "group_by='customer' → bar chart of top customers by revenue. " +
      "group_by='item' → bar chart of top items sold. " +
      "group_by='status' → donut chart of invoice status breakdown. " +
      "Reads from Sales Invoice (submitted only by default).",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["customer", "item", "status"],
          description: "Dimension to group by (default: customer)",
        },
        limit: { type: "number", description: "Top N results (default 10)" },
        include_drafts: { type: "boolean", description: "Include Draft invoices (default false)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 10;
      const groupBy = (input.group_by as string) ?? "customer";
      const filters: FrappeFilter[] = [];

      if (!input.include_drafts) {
        filters.push(["docstatus", "=", 1]); // Submitted only
      }

      if (groupBy === "status") {
        // Get invoice counts + amounts by status — fetch more to cover all statuses
        const invoices = await ctx.client.list("Sales Invoice", {
          fields: ["name", "status", "grand_total"],
          filters: [["docstatus", "!=", 2]], // exclude cancelled
          limit: 500,
          order_by: "modified desc",
        });

        const byStatus: Record<string, number> = {};
        for (const inv of invoices) {
          const s = (inv.status as string) ?? "Unknown";
          byStatus[s] = (byStatus[s] ?? 0) + (Number(inv.grand_total) || 0);
        }

        const sorted = Object.entries(byStatus).sort(([, a], [, b]) => b - a);

        return {
          title: "Invoice Revenue by Status",
          type: "donut",
          labels: sorted.map(([s]) => s),
          datasets: [{ label: "Revenue", values: sorted.map(([, v]) => v) }],
          currency: "USD",
          generatedAt: new Date().toISOString(),
          _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
        };
      }

      if (groupBy === "item") {
        // Fetch invoice items (Sales Invoice Item child table)
        const items = await ctx.client.list("Sales Invoice Item", {
          fields: ["item_code", "item_name", "amount"],
          filters: [["docstatus", "=", 1]],
          limit: 500,
          order_by: "amount desc",
        });

        const byItem: Record<string, { name: string; total: number }> = {};
        for (const row of items) {
          const code = (row.item_code as string) ?? "Unknown";
          if (!byItem[code]) byItem[code] = { name: (row.item_name as string) ?? code, total: 0 };
          byItem[code].total += Number(row.amount) || 0;
        }

        const sorted = Object.entries(byItem)
          .sort(([, a], [, b]) => b.total - a.total)
          .slice(0, limit);

        return {
          title: "Top Items by Revenue",
          subtitle: `Top ${sorted.length} items`,
          type: "horizontal-bar",
          labels: sorted.map(([, { name }]) => name),
          datasets: [{ label: "Revenue", values: sorted.map(([, { total }]) => total), color: "#c084fc" }],
          currency: "USD",
          generatedAt: new Date().toISOString(),
          _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
        };
      }

      // Default: group by customer
      const invoices = await ctx.client.list("Sales Invoice", {
        fields: ["customer", "customer_name", "grand_total"],
        filters,
        limit: 500,
        order_by: "modified desc",
      });

      const byCustomer: Record<string, { name: string; total: number }> = {};
      for (const inv of invoices) {
        const code = (inv.customer as string) ?? "Unknown";
        if (!byCustomer[code]) byCustomer[code] = { name: (inv.customer_name as string) ?? code, total: 0 };
        byCustomer[code].total += Number(inv.grand_total) || 0;
      }

      const sorted = Object.entries(byCustomer)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, limit);

      return {
        title: "Top Customers by Revenue",
        subtitle: `Top ${sorted.length} customers`,
        type: "horizontal-bar",
        labels: sorted.map(([, { name }]) => name),
        datasets: [{ label: "Revenue", values: sorted.map(([, { total }]) => total), color: "#4ade80" }],
        currency: "USD",
        generatedAt: new Date().toISOString(),
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
      };
    },
  },
];
