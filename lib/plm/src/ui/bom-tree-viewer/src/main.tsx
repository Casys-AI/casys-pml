/**
 * BOM Tree Viewer — native PLM viewer for BomTree
 *
 * Consumes BomTree { root: BomTreeNode, metadata: BomMetadata } directly.
 * No format conversion needed.
 *
 * @module lib/plm/src/ui/bom-tree-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx, formatNumber } from "../../components/utils";
import { TreeSkeleton } from "../../shared";
import "../../global.css";

// ============================================================================
// Types (mirrors lib/plm/src/data/bom-types.ts)
// ============================================================================

interface MaterialAssignment {
  materialId: string;
  mass_kg: number;
}

interface BomItem {
  id: string;
  partNumber: string;
  name: string;
  quantity: number;
  unit: string;
  material?: MaterialAssignment;
  level: number;
  type: "part" | "assembly";
}

interface BomTreeNode {
  item: BomItem;
  children: BomTreeNode[];
}

interface BomMetadata {
  productName: string;
  revision: string;
  generatedAt: string;
  uniquePartsCount: number;
  totalItemsCount: number;
}

interface BomTree {
  root: BomTreeNode;
  metadata: BomMetadata;
}

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "BOM Tree Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Tree Node Component
// ============================================================================

function BomNode({
  node,
  depth,
  expanded,
  selected,
  searchTerm,
  onToggle,
  onSelect,
}: {
  node: BomTreeNode;
  depth: number;
  expanded: Set<string>;
  selected: string | null;
  searchTerm: string;
  onToggle: (id: string) => void;
  onSelect: (node: BomTreeNode) => void;
}) {
  const item = node.item;
  const isExpanded = expanded.has(item.id);
  const isSelected = selected === item.id;
  const hasChildren = node.children.length > 0;
  const isAssembly = item.type === "assembly";

  const matchesSearch =
    searchTerm &&
    (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.material?.materialId.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div>
      <div
        className={cx(
          "flex items-center gap-2 py-1 px-2 rounded cursor-pointer text-sm",
          isSelected
            ? "bg-blue-900/40"
            : matchesSearch
              ? "bg-yellow-900/30"
              : "hover:bg-white/5"
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => {
          if (hasChildren) onToggle(item.id);
          onSelect(node);
        }}
      >
        {/* Expand indicator */}
        {hasChildren ? (
          <span className="w-4 text-center text-gray-500 text-xs shrink-0">
            {isExpanded ? "v" : ">"}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Type icon */}
        <span
          className={cx(
            "w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0",
            isAssembly
              ? "bg-amber-500/20 text-amber-400"
              : "bg-blue-500/20 text-blue-400"
          )}
        >
          {isAssembly ? "A" : "P"}
        </span>

        {/* Part number */}
        <span className="font-mono text-xs text-gray-500 shrink-0">
          {item.partNumber}
        </span>

        {/* Name */}
        <span className="text-gray-200 font-medium truncate">{item.name}</span>

        {/* Quantity badge */}
        <span className="ml-auto shrink-0 px-1.5 py-0.5 text-[10px] font-mono bg-white/5 text-gray-400 rounded">
          x{item.quantity}
        </span>

        {/* Material badge */}
        {item.material && (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 rounded">
            {item.material.materialId} {item.material.mass_kg}kg
          </span>
        )}

        {/* Children count */}
        {hasChildren && (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-white/5 text-gray-500 rounded-full">
            {node.children.length}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <BomNode
              key={child.item.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selected={selected}
              searchTerm={searchTerm}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function BomTreeViewer() {
  const [data, setData] = useState<BomTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<BomTreeNode | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        const parsed = JSON.parse(text) as BomTree;
        setData(parsed);
        // Auto-expand first 2 levels
        const ids = collectIds(parsed.root, 2);
        setExpanded(new Set(ids));
      } catch (e) {
        setError(`Failed to parse BOM: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: BomTreeNode) => {
    setSelected(node.item.id);
    setSelectedNode(node);
    notifyModel("select", { partNumber: node.item.partNumber, name: node.item.name });
  }, []);

  const expandAll = useCallback(() => {
    if (!data) return;
    setExpanded(new Set(collectIds(data.root, 999)));
  }, [data]);

  const collapseAll = useCallback(() => {
    if (!data) return;
    setExpanded(new Set([data.root.item.id]));
  }, [data]);

  const nodeCount = useMemo(() => data ? countNodes(data.root) : 0, [data]);

  if (loading) return <TreeSkeleton />;
  if (error) return <div className="p-4 text-red-400 text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-center text-gray-500 text-sm">No BOM data</div>;

  const meta = data.metadata;

  return (
    <div className="p-4 font-sans text-sm bg-[#08080a] min-h-[200px]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-gray-200 font-semibold">{meta.productName}</span>
        <span className="px-2 py-0.5 text-[10px] font-mono bg-amber-500/15 text-amber-400 rounded">
          Rev {meta.revision}
        </span>
        <span className="text-gray-500 text-xs">
          {meta.uniquePartsCount} unique parts | {meta.totalItemsCount} total items
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-3 items-center">
        <input
          type="text"
          placeholder="Search parts..."
          value={searchTerm}
          onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          className="flex-1 min-w-[120px] px-3 py-1.5 text-sm border border-white/10 rounded-md bg-white/5 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
        <button onClick={expandAll} className="px-3 py-1.5 text-xs border border-white/10 rounded-md text-gray-400 hover:bg-white/5">
          Expand All
        </button>
        <button onClick={collapseAll} className="px-3 py-1.5 text-xs border border-white/10 rounded-md text-gray-400 hover:bg-white/5">
          Collapse All
        </button>
      </div>

      {/* Selected node detail */}
      {selectedNode && selectedNode.item.material && (
        <div className="mb-3 p-3 bg-white/5 rounded-md border border-white/10">
          <div className="text-xs font-semibold text-gray-400 mb-1">{selectedNode.item.name}</div>
          <div className="flex flex-wrap gap-4 text-xs">
            <span><span className="text-gray-500">Part#:</span> <span className="font-mono text-gray-300">{selectedNode.item.partNumber}</span></span>
            <span><span className="text-gray-500">Material:</span> <span className="font-mono text-emerald-400">{selectedNode.item.material.materialId}</span></span>
            <span><span className="text-gray-500">Mass:</span> <span className="font-mono text-gray-300">{selectedNode.item.material.mass_kg} kg</span></span>
            <span><span className="text-gray-500">Qty:</span> <span className="font-mono text-gray-300">{selectedNode.item.quantity}</span></span>
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="border border-white/10 rounded-lg bg-white/[0.02] overflow-x-auto">
        <BomNode
          node={data.root}
          depth={0}
          expanded={expanded}
          selected={selected}
          searchTerm={searchTerm}
          onToggle={handleToggle}
          onSelect={handleSelect}
        />
      </div>

      {/* Footer */}
      <div className="mt-2 text-right text-xs text-gray-600">
        {nodeCount} nodes
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function collectIds(node: BomTreeNode, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const ids = [node.item.id];
  for (const child of node.children) ids.push(...collectIds(child, maxDepth, depth + 1));
  return ids;
}

function countNodes(node: BomTreeNode): number {
  let c = 1;
  for (const child of node.children) c += countNodes(child);
  return c;
}

// ============================================================================
// Mount
// ============================================================================

render(<BomTreeViewer />, document.getElementById("app")!);
