/**
 * BOM Viewer — Onshape Assembly Bill of Materials
 *
 * Consumes raw Onshape BOM API response:
 *   { data: { headers: BomHeader[], rows: BomRow[], ... } }
 *
 * Hierarchy via indentLevel (flat list, visual indent).
 * Visible headers only. Filter + CSV export.
 */

import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { OnshapeBadge, ContentSkeleton, exportCsv } from "../../shared";

// ── Types (mirrors Onshape BOM API) ──────────────────────────────────────────

interface BomHeader {
  id: string;
  name: string;
  visible: boolean;
  propertyName?: string;
}

interface BomRow {
  indentLevel: number;
  headerIdToValue: Record<string, unknown>;
}

interface BomApiData {
  formatVersion?: string;
  headers: BomHeader[];
  rows: BomRow[];
}

// Tool returns: { data: BomApiData, _meta: ... }
interface BomContent {
  data: BomApiData;
}

// ── MCP App ───────────────────────────────────────────────────────────────────

const app = new App({ name: "Bill of Materials", version: "2.0.0" });
let appConnected = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Display a raw cell value as a readable string */
function displayValue(raw: unknown): string {
  if (raw === null || raw === undefined || raw === false || raw === "") return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "boolean") return raw ? "Yes" : "";
  if (Array.isArray(raw)) {
    return raw.map((v) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>).name ?? "" : v)).filter(Boolean).join(", ");
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return String(o.name ?? o.value ?? o.id ?? "");
  }
  return String(raw);
}

/** Columns that have actual data in at least one row (ignore visible flag — Name is often hidden but essential) */
function selectColumns(headers: BomHeader[], rows: BomRow[]): BomHeader[] {
  return headers.filter((h) =>
    rows.some((r) => {
      const v = displayValue(r.headerIdToValue[h.id]);
      return v !== "" && v !== "N/A";
    })
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BomViewer() {
  const [content, setContent] = useState<BomContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setContent(null); return; }
        const parsed = JSON.parse(text) as BomContent;
        if (!parsed.data?.headers || !parsed.data?.rows) {
          setError("Invalid BOM: missing data.headers or data.rows");
          return;
        }
        setContent(parsed);
      } catch (e) {
        setError(`Parse error: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const columns = useMemo(() => {
    if (!content) return [];
    return selectColumns(content.data.headers, content.data.rows);
  }, [content]);

  const filteredRows = useMemo(() => {
    if (!content) return [];
    const q = filter.toLowerCase().trim();
    if (!q) return content.data.rows;
    return content.data.rows.filter((row) =>
      columns.some((h) => displayValue(row.headerIdToValue[h.id]).toLowerCase().includes(q))
    );
  }, [content, columns, filter]);

  if (loading) return <ContentSkeleton rows={8} />;

  if (error) return (
    <div style={{ padding: 24, color: "#f87171", fontFamily: "monospace", fontSize: 12 }}>
      {error}
    </div>
  );

  if (!content) return (
    <div style={{ padding: 32, textAlign: "center", color: "#78716c", fontSize: 13, fontFamily: "sans-serif" }}>
      No BOM data — run <code>onshape_assembly_bom</code>
    </div>
  );

  const { rows } = content.data;
  const totalQty = rows.reduce((sum, row) => {
    const qtyHeader = columns.find((h) => /^quantity$/i.test(h.name));
    if (!qtyHeader) return sum;
    const v = row.headerIdToValue[qtyHeader.id];
    return sum + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
  }, 0);

  function handleExport() {
    const csvRows = filteredRows.map((row) => {
      const r: Record<string, string> = {};
      columns.forEach((h) => { r[h.name] = displayValue(row.headerIdToValue[h.id]); });
      return r;
    });
    exportCsv(csvRows, columns.map((h) => h.name), "bom.csv");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0a0a0b", fontFamily: "sans-serif" }}>
      <OnshapeBadge />

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #27272a" }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#a8a29e" }}>
          Bill of Materials
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "#57534e" }}>
            {rows.length} items · qty {totalQty}
          </span>
        </div>
        <input
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
          placeholder="Filter…"
          style={{
            background: "#18181b", border: "1px solid #3f3f46", borderRadius: 4,
            color: "#d6d3d1", padding: "4px 8px", fontSize: 12, width: 140, outline: "none",
          }}
        />
        <button
          onClick={handleExport}
          style={{
            background: "#18181b", border: "1px solid #3f3f46", borderRadius: 4,
            color: "#a8a29e", padding: "4px 10px", fontSize: 11, cursor: "pointer",
          }}
        >
          CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#111113", position: "sticky", top: 0 }}>
              {columns.map((h) => (
                <th
                  key={h.id}
                  style={{
                    padding: "6px 10px", textAlign: "left", fontWeight: 600,
                    color: "#78716c", fontSize: 10, letterSpacing: "0.05em",
                    textTransform: "uppercase", borderBottom: "1px solid #27272a",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid #18181b",
                  background: i % 2 === 0 ? "transparent" : "#0d0d0f",
                }}
              >
                {columns.map((h, ci) => {
                  const val = displayValue(row.headerIdToValue[h.id]);
                  const isFirst = ci === 0;
                  const indent = isFirst ? row.indentLevel * 16 : 0;
                  const isNum = !isNaN(Number(val)) && val !== "";
                  return (
                    <td
                      key={h.id}
                      style={{
                        padding: `5px 10px 5px ${10 + indent}px`,
                        color: isFirst ? "#e7e5e4" : isNum ? "#60a5fa" : "#a8a29e",
                        fontFamily: isNum ? "monospace" : "sans-serif",
                        fontWeight: isFirst && row.indentLevel === 0 ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isFirst && row.indentLevel > 0 && (
                        <span style={{ marginRight: 6, color: "#3f3f46" }}>{"└"}</span>
                      )}
                      {val || <span style={{ color: "#3f3f46" }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
