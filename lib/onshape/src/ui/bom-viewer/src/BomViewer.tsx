/**
 * BOM Viewer -- Hierarchical Bill of Materials tree table for Onshape assemblies
 *
 * Consumes Onshape assembly BOM API data (bomTable with headers + items).
 * Provides expand/collapse tree navigation, filtering, CSV export, and
 * model context notifications on item selection.
 *
 * @module lib/onshape/src/ui/bom-viewer
 */

import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { OnshapeBadge, ContentSkeleton, cx, exportCsv } from "../../shared";

// ============================================================================
// Types (mirrors Onshape assembly BOM API response)
// ============================================================================

interface BomHeader {
  id: string;
  name: string;
  visible: boolean;
  propertyName?: string;
}

interface ItemSource {
  documentId?: string;
  elementId?: string;
  partId?: string;
  fullConfiguration?: string;
  wvmType?: string;
  wvmId?: string;
}

interface BomItem {
  itemSource: ItemSource;
  headerIdToValue: Record<string, { value: string | number }>;
  children?: BomItem[];
}

interface BomTable {
  formatVersion: string;
  headers: BomHeader[];
  items: BomItem[];
}

interface BomData {
  bomTable: BomTable;
}

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Bill of Materials", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

/** Build a stable key from index path: "0", "0.1", "0.1.2" */
function itemKey(parentKey: string, index: number): string {
  return parentKey ? `${parentKey}.${index}` : String(index);
}

/** Count total items in tree (recursive) */
function countItems(items: BomItem[]): number {
  let total = 0;
  for (const item of items) {
    total += 1;
    if (item.children) total += countItems(item.children);
  }
  return total;
}

/** Collect all keys up to maxDepth for expand-all */
function collectAllKeys(items: BomItem[], parentKey: string, maxDepth: number, depth = 0): string[] {
  const keys: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const key = itemKey(parentKey, i);
    if (items[i].children && items[i].children!.length > 0) {
      keys.push(key);
      if (depth < maxDepth) {
        keys.push(...collectAllKeys(items[i].children!, key, maxDepth, depth + 1));
      }
    }
  }
  return keys;
}

/** Get cell value as string for display */
function cellValue(item: BomItem, headerId: string): string {
  const entry = item.headerIdToValue[headerId];
  if (entry == null || entry.value == null) return "";
  return String(entry.value);
}

/** Check if any visible header value matches filter */
function itemMatchesFilter(item: BomItem, visibleHeaders: BomHeader[], query: string): boolean {
  for (const h of visibleHeaders) {
    if (cellValue(item, h.id).toLowerCase().includes(query)) return true;
  }
  return false;
}

/** Collect keys of items (and their ancestors) matching a filter */
function collectFilterMatches(
  items: BomItem[],
  parentKey: string,
  visibleHeaders: BomHeader[],
  query: string,
): { matchedKeys: Set<string>; expandKeys: Set<string> } {
  const matchedKeys = new Set<string>();
  const expandKeys = new Set<string>();

  function walk(items: BomItem[], pKey: string, ancestors: string[]): boolean {
    let anyMatch = false;
    for (let i = 0; i < items.length; i++) {
      const key = itemKey(pKey, i);
      const item = items[i];
      const selfMatch = itemMatchesFilter(item, visibleHeaders, query);
      let childMatch = false;

      if (item.children && item.children.length > 0) {
        childMatch = walk(item.children, key, [...ancestors, key]);
      }

      if (selfMatch || childMatch) {
        matchedKeys.add(key);
        anyMatch = true;
        // Expand ancestors so matched items are visible
        for (const a of ancestors) expandKeys.add(a);
        if (childMatch) expandKeys.add(key);
      }
    }
    return anyMatch;
  }

  walk(items, parentKey, []);
  return { matchedKeys, expandKeys };
}

/** Detect quantity header (Quantity or Qty) */
function findQuantityHeader(headers: BomHeader[]): BomHeader | undefined {
  return headers.find(
    (h) => h.visible && /^(quantity|qty)$/i.test(h.name.trim()),
  );
}

/** Sum quantity values across all items (recursive, raw quantities) */
function sumQuantity(items: BomItem[], qtyHeaderId: string): number {
  let total = 0;
  for (const item of items) {
    const v = item.headerIdToValue[qtyHeaderId]?.value;
    if (typeof v === "number") total += v;
    else if (typeof v === "string") total += parseFloat(v) || 0;
    if (item.children) total += sumQuantity(item.children, qtyHeaderId);
  }
  return total;
}

/** Flatten tree for CSV export */
function flattenForCsv(
  items: BomItem[],
  visibleHeaders: BomHeader[],
  depth: number,
  rows: Record<string, unknown>[],
) {
  for (const item of items) {
    const row: Record<string, unknown> = { Depth: depth };
    for (const h of visibleHeaders) {
      row[h.name] = cellValue(item, h.id);
    }
    rows.push(row);
    if (item.children) {
      flattenForCsv(item.children, visibleHeaders, depth + 1, rows);
    }
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function BomViewer() {
  const [data, setData] = useState<BomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // ---- MCP App wiring ----
  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        const parsed = JSON.parse(text) as BomData;
        if (!parsed.bomTable) {
          setError("Invalid BOM data: missing bomTable");
          return;
        }
        setData(parsed);
        // Auto-expand first 2 levels
        const keys = collectAllKeys(parsed.bomTable.items, "", 2);
        setExpandedKeys(new Set(keys));
        setSelectedKey(null);
      } catch (e) {
        setError(`Failed to parse BOM: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // ---- Derived state ----
  const visibleHeaders = useMemo(() => {
    if (!data) return [];
    return data.bomTable.headers.filter((h) => h.visible);
  }, [data]);

  const totalItems = useMemo(() => {
    if (!data) return 0;
    return countItems(data.bomTable.items);
  }, [data]);

  const qtyHeader = useMemo(() => {
    if (!data) return undefined;
    return findQuantityHeader(data.bomTable.headers);
  }, [data]);

  const totalQuantity = useMemo(() => {
    if (!data || !qtyHeader) return 0;
    return sumQuantity(data.bomTable.items, qtyHeader.id);
  }, [data, qtyHeader]);

  const filterQuery = filter.toLowerCase().trim();

  const filterResult = useMemo(() => {
    if (!data || !filterQuery) return null;
    return collectFilterMatches(data.bomTable.items, "", visibleHeaders, filterQuery);
  }, [data, filterQuery, visibleHeaders]);

  // When filter is active, override expanded keys with filter-derived keys
  const effectiveExpanded = useMemo(() => {
    if (filterResult) return new Set([...expandedKeys, ...filterResult.expandKeys]);
    return expandedKeys;
  }, [expandedKeys, filterResult]);

  // ---- Handlers ----
  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((key: string, item: BomItem) => {
    const hasChildren = item.children && item.children.length > 0;
    if (hasChildren) toggleExpand(key);
    setSelectedKey(key);
    notifyModel("select-bom-item", { itemSource: item.itemSource });
  }, [toggleExpand]);

  const expandAll = useCallback(() => {
    if (!data) return;
    setExpandedKeys(new Set(collectAllKeys(data.bomTable.items, "", 999)));
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpandedKeys(new Set());
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!data) return;
    const rows: Record<string, unknown>[] = [];
    flattenForCsv(data.bomTable.items, visibleHeaders, 0, rows);
    const columns = ["Depth", ...visibleHeaders.map((h) => h.name)];
    exportCsv(columns, rows, "onshape-bom");
  }, [data, visibleHeaders]);

  // ---- Render items recursively ----
  function renderItems(items: BomItem[], depth: number, parentKey: string) {
    return items.map((item, i) => {
      const key = itemKey(parentKey, i);
      const isExpanded = effectiveExpanded.has(key);
      const hasChildren = item.children && item.children.length > 0;
      const isSelected = selectedKey === key;

      // Filter visibility: if filter active, only show matched items
      if (filterResult && !filterResult.matchedKeys.has(key) && !filterResult.expandKeys.has(key)) {
        return null;
      }

      const isMatch = filterResult?.matchedKeys.has(key) && !filterResult.expandKeys.has(key);

      return (
        <tbody key={key}>
          <tr
            onClick={() => handleRowClick(key, item)}
            className={cx(
              "cursor-pointer transition-colors duration-75",
              isSelected
                ? "bg-accent-dim"
                : isMatch
                  ? "bg-[#00A6F0]/5"
                  : "hover:bg-bg-muted",
            )}
          >
            {visibleHeaders.map((header, colIdx) => {
              const val = cellValue(item, header.id);
              const isFirstCol = colIdx === 0;
              const isNumeric = !isNaN(Number(val)) && val !== "";

              return (
                <td
                  key={header.id}
                  className={cx(
                    "py-1.5 pr-3 text-sm border-b border-border-subtle whitespace-nowrap",
                    isNumeric && "text-right font-mono text-xs",
                    isFirstCol ? "font-medium text-fg-default" : "text-fg-muted",
                  )}
                  style={isFirstCol ? { paddingLeft: `${depth * 16 + 12}px` } : undefined}
                >
                  {isFirstCol && (
                    <span className="inline-flex items-center gap-1.5">
                      {hasChildren ? (
                        <span className="w-3.5 text-center text-fg-dim text-[10px] shrink-0 select-none">
                          {isExpanded ? "\u25BC" : "\u25B6"}
                        </span>
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="truncate max-w-[280px]">{val}</span>
                    </span>
                  )}
                  {!isFirstCol && (
                    <span className="truncate max-w-[200px] inline-block">{val}</span>
                  )}
                </td>
              );
            })}
          </tr>
          {hasChildren && isExpanded && renderItems(item.children!, depth + 1, key)}
        </tbody>
      );
    });
  }

  // ---- States ----
  if (loading) return <ContentSkeleton lines={6} />;
  if (error) return <div className="p-4 text-error text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-center text-fg-muted text-sm">No BOM data</div>;

  const showFilter = totalItems > 5;

  return (
    <div className={cx("p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]")}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <OnshapeBadge />
        <span className="text-fg-default font-semibold text-base">Bill of Materials</span>
        <span className="px-2 py-0.5 text-[10px] font-mono bg-accent-dim text-accent rounded">
          {totalItems} item{totalItems !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-3 items-center flex-wrap">
        {showFilter && (
          <input
            type="text"
            placeholder="Filter items..."
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            className="flex-1 min-w-[140px] max-w-[280px] px-3 py-1.5 text-sm border border-border-default rounded-md bg-bg-subtle text-fg-default placeholder:text-fg-dim focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
          />
        )}
        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-xs border border-border-default rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg-default transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs border border-border-default rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg-default transition-colors"
          >
            Collapse All
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 text-xs border border-border-default rounded-md text-fg-muted hover:bg-bg-muted hover:text-accent transition-colors inline-flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
              <path d="M6 1v8M6 9l-3-3M6 9l3-3M2 11h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      {/* Tree table */}
      <div className="border border-border-default rounded-lg bg-bg-subtle/30 overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: Math.max(480, visibleHeaders.length * 120) }}>
          <thead>
            <tr>
              {visibleHeaders.map((header) => (
                <th
                  key={header.id}
                  className="py-2 px-3 text-left text-xs font-semibold text-fg-muted bg-bg-muted border-b border-border-default uppercase tracking-wider whitespace-nowrap"
                >
                  {header.name}
                </th>
              ))}
            </tr>
          </thead>
          {data.bomTable.items.length === 0 ? (
            <tbody>
              <tr>
                <td
                  colSpan={visibleHeaders.length}
                  className="py-12 text-center text-fg-dim text-sm"
                >
                  Empty BOM -- no items
                </td>
              </tr>
            </tbody>
          ) : (
            renderItems(data.bomTable.items, 0, "")
          )}
        </table>
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between text-xs text-fg-dim">
        <span>{totalItems} total item{totalItems !== 1 ? "s" : ""}</span>
        {qtyHeader && (
          <span>
            Total {qtyHeader.name}: <span className="font-mono text-fg-muted">{totalQuantity}</span>
          </span>
        )}
      </div>
    </div>
  );
}
