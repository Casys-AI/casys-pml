/**
 * Chart Viewer — ERPNext charts via Recharts
 *
 * Supports: bar, horizontal-bar, donut
 * Data shape: ChartData (returned by erpnext_stock_chart, erpnext_sales_chart, etc.)
 */

import { useState, useEffect, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend as RLegend,
  ResponsiveContainer,
} from "recharts";
import { colors, fonts, formatNumber, formatCurrency } from "~/shared/theme";
import { ErpNextBrandHeader } from "~/shared/ErpNextBrand";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Chart Viewer", version: "2.0.0" });

// ============================================================================
// Types
// ============================================================================

interface Dataset {
  label: string;
  values: number[];
  color?: string;
}

interface ChartData {
  title: string;
  subtitle?: string;
  type?: "bar" | "horizontal-bar" | "donut";
  labels: string[];
  datasets: Dataset[];
  unit?: string;
  currency?: string;
  generatedAt?: string;
}

// ============================================================================
// Color palette — real hex values (CSS vars don't work in SVG fill)
// ============================================================================

const PALETTE = [
  "#60a5fa", // blue
  "#4ade80", // green
  "#fbbf24", // amber
  "#818cf8", // indigo
  "#c084fc", // purple
  "#fb923c", // orange
  "#34d399", // emerald
  "#f472b6", // pink
];

// ============================================================================
// Helpers
// ============================================================================

/** Transform ChartData → Recharts-friendly array of objects */
function toRechartsData(data: ChartData) {
  return data.labels.map((label, i) => {
    const entry: Record<string, string | number> = { name: label };
    for (const ds of data.datasets) {
      entry[ds.label] = ds.values[i] ?? 0;
    }
    return entry;
  });
}

function fmtValue(v: number, data: ChartData) {
  if (data.currency) return formatCurrency(v);
  return `${formatNumber(v, v % 1 === 0 ? 0 : 1)}${data.unit ? " " + data.unit : ""}`;
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: i === 1 ? 32 : 20,
              width: i === 1 ? "40%" : `${60 + i * 8}%`,
            }}
          />
        ))}
        <div style={{ marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 36, marginBottom: 2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Custom Tooltip
// ============================================================================

function ChartTooltip({ active, payload, data }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  data: ChartData;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 6, padding: "8px 12px", fontSize: 12,
      fontFamily: fonts.sans, boxShadow: "var(--shadow-md)",
    }}>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ color: "var(--text-secondary)" }}>{p.name}:</span>
          <span style={{ color: "var(--text-primary)", fontFamily: fonts.mono, fontWeight: 600 }}>
            {fmtValue(p.value, data)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Vertical Bar Chart
// ============================================================================

function VerticalBarChart({ data }: { data: ChartData }) {
  const rows = toRechartsData(data);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 4 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--text-secondary)", fontFamily: fonts.sans }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--text-faint)", fontFamily: fonts.mono }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatNumber(v, v < 10 ? 1 : 0)}
        />
        <Tooltip content={<ChartTooltip data={data} />} cursor={{ fill: "var(--bg-hover)", opacity: 0.5 }} />
        {data.datasets.map((ds, i) => (
          <Bar
            key={ds.label}
            dataKey={ds.label}
            fill={ds.color ?? PALETTE[i % PALETTE.length]}
            radius={[3, 3, 0, 0]}
            opacity={0.85}
            maxBarSize={56}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Horizontal Bar Chart
// ============================================================================

function HorizontalBarChart({ data }: { data: ChartData }) {
  const rows = toRechartsData(data);
  const h = Math.max(data.labels.length * 36 + 40, 120);

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "var(--text-faint)", fontFamily: fonts.mono }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatNumber(v, v < 10 ? 1 : 0)}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 11, fill: "var(--text-secondary)", fontFamily: fonts.sans }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip data={data} />} cursor={{ fill: "var(--bg-hover)", opacity: 0.5 }} />
        {data.datasets.map((ds, i) => (
          <Bar
            key={ds.label}
            dataKey={ds.label}
            fill={ds.color ?? PALETTE[i % PALETTE.length]}
            radius={[0, 3, 3, 0]}
            opacity={0.85}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Donut Chart
// ============================================================================

function DonutChart({ data }: { data: ChartData }) {
  const ds = data.datasets[0];
  if (!ds) return null;

  const total = ds.values.reduce((s, v) => s + v, 0) || 1;
  const pieData = data.labels.map((label, i) => ({
    name: label,
    value: ds.values[i] ?? 0,
  }));

  const renderLabel = ({ name, percent }: { name: string; percent: number }) =>
    `${name} ${(percent * 100).toFixed(0)}%`;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          label={renderLabel}
          labelLine={{ stroke: "var(--text-faint)", strokeWidth: 1 }}
        >
          {pieData.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} opacity={0.85} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => fmtValue(value, data)}
          contentStyle={{
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 6, fontSize: 12, fontFamily: fonts.sans,
          }}
        />
        <text
          x="50%" y="48%" textAnchor="middle" dominantBaseline="middle"
          fontSize={11} fill="var(--text-muted)" fontFamily={fonts.sans}
        >
          Total
        </text>
        <text
          x="50%" y="56%" textAnchor="middle" dominantBaseline="middle"
          fontSize={15} fill="var(--text-primary)" fontFamily={fonts.mono} fontWeight={700}
        >
          {data.currency ? formatCurrency(total) : formatNumber(total, 0)}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Legend (for multi-dataset)
// ============================================================================

function DatasetLegend({ datasets }: { datasets: Dataset[] }) {
  if (datasets.length <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {datasets.map((ds, i) => (
        <div key={ds.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: ds.color ?? PALETTE[i % PALETTE.length] }} />
          {ds.label}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ChartContent({ data }: { data: ChartData }) {
  const type = data.type ?? "bar";

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: fonts.sans, background: "var(--bg-root)" }}>
      <ErpNextBrandHeader />
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{data.title}</div>
          {data.subtitle && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{data.subtitle}</div>}
        </div>

        <DatasetLegend datasets={data.datasets} />

        {type === "bar" && <VerticalBarChart data={data} />}
        {type === "horizontal-bar" && <HorizontalBarChart data={data} />}
        {type === "donut" && <DonutChart data={data} />}
      </div>
    </div>
  );
}

export function ChartViewer() {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      const text = result.content?.find((c) => c.type === "text")?.text;
      if (text) {
        try { setData(JSON.parse(text)); } catch (e) { console.error("Parse error:", e); }
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (!data) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13, fontFamily: fonts.sans }}>
        No chart data — run <code style={{ fontFamily: fonts.mono, fontSize: 11 }}>erpnext_stock_chart</code> or{" "}
        <code style={{ fontFamily: fonts.mono, fontSize: 11 }}>erpnext_sales_chart</code>
      </div>
    );
  }

  return <ChartContent data={data} />;
}
