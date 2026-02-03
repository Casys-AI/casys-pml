/**
 * Plan Viewer UI for MCP Apps
 *
 * Displays PostgreSQL EXPLAIN ANALYZE query plans with:
 * - Tree visualization of operations
 * - Actual time, rows, loops for each node
 * - Relative cost bar (% of total)
 * - Highlighting for slow operations (>50% of time)
 * - Expandable details (buffers, filter, etc.)
 *
 * @module lib/std/src/ui/plan-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Alias"?: string;
  "Startup Cost"?: number;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Plan Width"?: number;
  "Actual Startup Time"?: number;
  "Actual Total Time"?: number;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Filter"?: string;
  "Rows Removed by Filter"?: number;
  "Index Cond"?: string;
  "Hash Cond"?: string;
  "Join Type"?: string;
  "Sort Key"?: string[];
  "Sort Method"?: string;
  "Sort Space Used"?: number;
  "Sort Space Type"?: string;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Shared Dirtied Blocks"?: number;
  "Shared Written Blocks"?: number;
  "Local Hit Blocks"?: number;
  "Local Read Blocks"?: number;
  "Temp Read Blocks"?: number;
  "Temp Written Blocks"?: number;
  "I/O Read Time"?: number;
  "I/O Write Time"?: number;
  "Plans"?: PlanNode[];
  [key: string]: unknown;
}

interface ExplainResult {
  "Plan": PlanNode;
  "Planning Time"?: number;
  "Execution Time"?: number;
  "Triggers"?: unknown[];
}

interface PlanData {
  plan: ExplainResult[] | ExplainResult | string;
  query: string;
  analyzed: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface FlatNode {
  node: PlanNode;
  depth: number;
  id: string;
  actualTime: number;
  percentOfTotal: number;
  isSlow: boolean;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Plan Viewer", version: "1.0.0" });
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

function extractPlan(data: PlanData): ExplainResult | null {
  if (!data.plan) return null;

  // Handle string format (text output)
  if (typeof data.plan === "string") return null;

  // Handle array format (standard EXPLAIN JSON output)
  if (Array.isArray(data.plan) && data.plan.length > 0) {
    return data.plan[0] as ExplainResult;
  }

  // Handle direct object format
  if (typeof data.plan === "object" && "Plan" in data.plan) {
    return data.plan as ExplainResult;
  }

  return null;
}

function flattenPlan(
  node: PlanNode,
  depth: number,
  totalTime: number,
  parentId: string = ""
): FlatNode[] {
  const id = parentId ? `${parentId}-${depth}` : `node-${depth}`;
  const actualTime = (node["Actual Total Time"] ?? 0) * (node["Actual Loops"] ?? 1);
  const percentOfTotal = totalTime > 0 ? (actualTime / totalTime) * 100 : 0;
  const isSlow = percentOfTotal > 50;

  const result: FlatNode[] = [{
    node,
    depth,
    id,
    actualTime,
    percentOfTotal,
    isSlow,
  }];

  if (node.Plans) {
    node.Plans.forEach((child, index) => {
      result.push(...flattenPlan(child, depth + 1, totalTime, `${id}-${index}`));
    });
  }

  return result;
}

function formatTime(ms: number | undefined): string {
  if (ms === undefined) return "-";
  if (ms < 1) return `${(ms * 1000).toFixed(2)} us`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatRows(rows: number | undefined): string {
  if (rows === undefined) return "-";
  if (rows >= 1000000) return `${(rows / 1000000).toFixed(1)}M`;
  if (rows >= 1000) return `${(rows / 1000).toFixed(1)}K`;
  return rows.toString();
}

function getNodeIcon(nodeType: string): string {
  const icons: Record<string, string> = {
    "Seq Scan": "T",
    "Index Scan": "I",
    "Index Only Scan": "IO",
    "Bitmap Index Scan": "BI",
    "Bitmap Heap Scan": "BH",
    "Hash Join": "HJ",
    "Merge Join": "MJ",
    "Nested Loop": "NL",
    "Hash": "H",
    "Sort": "S",
    "Aggregate": "A",
    "Group": "G",
    "Limit": "L",
    "Unique": "U",
    "Append": "AP",
    "Result": "R",
    "Materialize": "M",
    "CTE Scan": "CT",
    "Subquery Scan": "SQ",
    "Function Scan": "F",
    "Values Scan": "V",
    "Gather": "GA",
    "Gather Merge": "GM",
  };
  return icons[nodeType] || nodeType.substring(0, 2).toUpperCase();
}

function getNodeColor(nodeType: string): string {
  if (nodeType.includes("Scan")) return "scan";
  if (nodeType.includes("Join")) return "join";
  if (nodeType.includes("Sort") || nodeType.includes("Aggregate")) return "sort";
  if (nodeType.includes("Hash")) return "hash";
  return "default";
}

// ============================================================================
// Components
// ============================================================================

interface PlanNodeRowProps {
  flatNode: FlatNode;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

function PlanNodeRow({ flatNode, isExpanded, isSelected, onToggle, onSelect }: PlanNodeRowProps) {
  const { node, depth, actualTime, percentOfTotal, isSlow } = flatNode;
  const hasChildren = node.Plans && node.Plans.length > 0;
  const nodeColor = getNodeColor(node["Node Type"]);

  return (
    <div
      class={css(
        styles.nodeRow,
        isSelected && styles.nodeRowSelected,
        isSlow && styles.nodeRowSlow
      )}
      onClick={onSelect}
    >
      {/* Indentation and expand toggle */}
      <div class={styles.nodeIndent} style={{ paddingLeft: `${depth * 20}px` }}>
        {hasChildren ? (
          <button class={styles.expandBtn} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {isExpanded ? "-" : "+"}
          </button>
        ) : (
          <span class={styles.expandPlaceholder} />
        )}
      </div>

      {/* Node type badge */}
      <div class={css(styles.nodeBadge, styles[`nodeBadge_${nodeColor}`])}>
        {getNodeIcon(node["Node Type"])}
      </div>

      {/* Node info */}
      <div class={styles.nodeInfo}>
        <span class={styles.nodeType}>{node["Node Type"]}</span>
        {node["Relation Name"] && (
          <span class={styles.nodeRelation}> on {node["Relation Name"]}</span>
        )}
        {node["Index Name"] && (
          <span class={styles.nodeIndex}> using {node["Index Name"]}</span>
        )}
        {node["Alias"] && node["Alias"] !== node["Relation Name"] && (
          <span class={styles.nodeAlias}> ({node["Alias"]})</span>
        )}
      </div>

      {/* Stats */}
      <div class={styles.nodeStats}>
        <div class={styles.statItem}>
          <span class={styles.statLabel}>Time</span>
          <span class={css(styles.statValue, isSlow && styles.statValueSlow)}>
            {formatTime(node["Actual Total Time"])}
          </span>
        </div>
        <div class={styles.statItem}>
          <span class={styles.statLabel}>Rows</span>
          <span class={styles.statValue}>{formatRows(node["Actual Rows"])}</span>
        </div>
        <div class={styles.statItem}>
          <span class={styles.statLabel}>Loops</span>
          <span class={styles.statValue}>{node["Actual Loops"] ?? "-"}</span>
        </div>
      </div>

      {/* Cost bar */}
      <div class={styles.costBarContainer}>
        <div
          class={css(styles.costBar, isSlow && styles.costBarSlow)}
          style={{ width: `${Math.min(percentOfTotal, 100)}%` }}
        />
        <span class={styles.costPercent}>{percentOfTotal.toFixed(1)}%</span>
      </div>
    </div>
  );
}

interface NodeDetailsProps {
  node: PlanNode;
}

function NodeDetails({ node }: NodeDetailsProps) {
  const details: Array<{ label: string; value: string | number }> = [];

  // Planning estimates
  if (node["Plan Rows"] !== undefined) {
    details.push({ label: "Est. Rows", value: formatRows(node["Plan Rows"]) });
  }
  if (node["Plan Width"] !== undefined) {
    details.push({ label: "Est. Width", value: `${node["Plan Width"]} bytes` });
  }
  if (node["Startup Cost"] !== undefined) {
    details.push({ label: "Startup Cost", value: node["Startup Cost"].toFixed(2) });
  }
  if (node["Total Cost"] !== undefined) {
    details.push({ label: "Total Cost", value: node["Total Cost"].toFixed(2) });
  }

  // Filter info
  if (node["Filter"]) {
    details.push({ label: "Filter", value: node["Filter"] });
  }
  if (node["Rows Removed by Filter"] !== undefined) {
    details.push({ label: "Rows Removed", value: formatRows(node["Rows Removed by Filter"]) });
  }
  if (node["Index Cond"]) {
    details.push({ label: "Index Cond", value: node["Index Cond"] });
  }
  if (node["Hash Cond"]) {
    details.push({ label: "Hash Cond", value: node["Hash Cond"] });
  }

  // Sort info
  if (node["Sort Key"]) {
    details.push({ label: "Sort Key", value: node["Sort Key"].join(", ") });
  }
  if (node["Sort Method"]) {
    details.push({ label: "Sort Method", value: node["Sort Method"] });
  }
  if (node["Sort Space Used"] !== undefined) {
    details.push({ label: "Sort Space", value: `${node["Sort Space Used"]} KB (${node["Sort Space Type"]})` });
  }

  // Buffer stats
  const bufferStats: string[] = [];
  if (node["Shared Hit Blocks"]) bufferStats.push(`Hit: ${node["Shared Hit Blocks"]}`);
  if (node["Shared Read Blocks"]) bufferStats.push(`Read: ${node["Shared Read Blocks"]}`);
  if (node["Shared Dirtied Blocks"]) bufferStats.push(`Dirtied: ${node["Shared Dirtied Blocks"]}`);
  if (node["Shared Written Blocks"]) bufferStats.push(`Written: ${node["Shared Written Blocks"]}`);
  if (bufferStats.length > 0) {
    details.push({ label: "Shared Buffers", value: bufferStats.join(", ") });
  }

  // I/O timing
  if (node["I/O Read Time"] !== undefined || node["I/O Write Time"] !== undefined) {
    const ioTimes: string[] = [];
    if (node["I/O Read Time"]) ioTimes.push(`Read: ${formatTime(node["I/O Read Time"])}`);
    if (node["I/O Write Time"]) ioTimes.push(`Write: ${formatTime(node["I/O Write Time"])}`);
    if (ioTimes.length > 0) {
      details.push({ label: "I/O Time", value: ioTimes.join(", ") });
    }
  }

  if (details.length === 0) {
    return <div class={styles.detailsEmpty}>No additional details</div>;
  }

  return (
    <div class={styles.detailsPanel}>
      <h4 class={styles.detailsTitle}>Details: {node["Node Type"]}</h4>
      <div class={styles.detailsGrid}>
        {details.map(({ label, value }) => (
          <div key={label} class={styles.detailItem}>
            <span class={styles.detailLabel}>{label}</span>
            <span class={styles.detailValue}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function PlanViewer() {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[plan-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[plan-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }
        const parsed = JSON.parse(textContent.text) as PlanData;
        setData(parsed);
        setSelectedNodeId(null);
        // Expand root by default
        setExpandedNodes(new Set(["node-0"]));
      } catch (e) {
        setError(`Failed to parse plan: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Extract and flatten plan
  const { flatNodes, planResult, totalTime } = useMemo(() => {
    if (!data) return { flatNodes: [], planResult: null, totalTime: 0 };

    const result = extractPlan(data);
    if (!result) return { flatNodes: [], planResult: null, totalTime: 0 };

    const execTime = result["Execution Time"] ?? result.Plan["Actual Total Time"] ?? 0;
    const nodes = flattenPlan(result.Plan, 0, execTime);

    return { flatNodes: nodes, planResult: result, totalTime: execTime };
  }, [data]);

  // Filter visible nodes based on expansion state
  const visibleNodes = useMemo(() => {
    const visible: FlatNode[] = [];
    const collapsedPrefixes: string[] = [];

    for (const flatNode of flatNodes) {
      // Check if this node is hidden by a collapsed parent
      const isHidden = collapsedPrefixes.some((prefix) => flatNode.id.startsWith(prefix + "-"));
      if (isHidden) continue;

      visible.push(flatNode);

      // If this node has children but is not expanded, mark its children as hidden
      const hasChildren = flatNode.node.Plans && flatNode.node.Plans.length > 0;
      if (hasChildren && !expandedNodes.has(flatNode.id)) {
        collapsedPrefixes.push(flatNode.id);
      }
    }

    return visible;
  }, [flatNodes, expandedNodes]);

  // Handlers
  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
    notifyModel(expandedNodes.has(nodeId) ? "collapseNode" : "expandNode", { nodeId });
  }, [expandedNodes]);

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId);
    notifyModel("selectNode", { nodeId });
  }, [selectedNodeId]);

  const handleExpandAll = useCallback(() => {
    const allIds = flatNodes.map((n) => n.id);
    setExpandedNodes(new Set(allIds));
  }, [flatNodes]);

  const handleCollapseAll = useCallback(() => {
    setExpandedNodes(new Set(["node-0"]));
  }, []);

  // Get selected node for details panel
  const selectedNode = selectedNodeId
    ? flatNodes.find((n) => n.id === selectedNodeId)?.node
    : null;

  // Render states
  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading query plan...</div></div>;
  }

  if (error) {
    return <div class={styles.container}><div class={styles.error}>{error}</div></div>;
  }

  if (!data) {
    return <div class={styles.container}><div class={styles.empty}>No plan data</div></div>;
  }

  // Handle text format (non-JSON)
  if (typeof data.plan === "string") {
    return (
      <div class={styles.container}>
        <div class={styles.header}>
          <span class={styles.title}>Query Plan (Text)</span>
        </div>
        <pre class={styles.textPlan}>{data.plan}</pre>
      </div>
    );
  }

  if (!planResult) {
    return <div class={styles.container}><div class={styles.empty}>Invalid plan format</div></div>;
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        <div class={styles.headerInfo}>
          <span class={styles.title}>Query Execution Plan</span>
          {data.analyzed && (
            <span class={styles.analyzedBadge}>ANALYZED</span>
          )}
        </div>
        <div class={styles.headerActions}>
          <button class={styles.btn} onClick={handleExpandAll}>Expand All</button>
          <button class={styles.btn} onClick={handleCollapseAll}>Collapse All</button>
        </div>
      </div>

      {/* Summary stats */}
      <div class={styles.summary}>
        {planResult["Planning Time"] !== undefined && (
          <div class={styles.summaryItem}>
            <span class={styles.summaryLabel}>Planning Time</span>
            <span class={styles.summaryValue}>{formatTime(planResult["Planning Time"])}</span>
          </div>
        )}
        {planResult["Execution Time"] !== undefined && (
          <div class={styles.summaryItem}>
            <span class={styles.summaryLabel}>Execution Time</span>
            <span class={styles.summaryValue}>{formatTime(planResult["Execution Time"])}</span>
          </div>
        )}
        <div class={styles.summaryItem}>
          <span class={styles.summaryLabel}>Total Nodes</span>
          <span class={styles.summaryValue}>{flatNodes.length}</span>
        </div>
      </div>

      {/* Plan tree */}
      <div class={styles.planTree}>
        <div class={styles.treeHeader}>
          <span class={styles.treeHeaderCell} style={{ flex: 1 }}>Operation</span>
          <span class={styles.treeHeaderCell} style={{ width: "200px" }}>Stats</span>
          <span class={styles.treeHeaderCell} style={{ width: "120px" }}>Cost %</span>
        </div>
        <div class={styles.treeBody}>
          {visibleNodes.map((flatNode) => (
            <PlanNodeRow
              key={flatNode.id}
              flatNode={flatNode}
              isExpanded={expandedNodes.has(flatNode.id)}
              isSelected={selectedNodeId === flatNode.id}
              onToggle={() => handleToggleExpand(flatNode.id)}
              onSelect={() => handleSelectNode(flatNode.id)}
            />
          ))}
        </div>
      </div>

      {/* Selected node details */}
      {selectedNode && <NodeDetails node={selectedNode} />}

      {/* Query display */}
      <div class={styles.querySection}>
        <h4 class={styles.queryTitle}>Query</h4>
        <pre class={styles.queryCode}>{data.query}</pre>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    p: "4",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    minH: "300px",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "3",
  }),
  headerInfo: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
  }),
  headerActions: css({
    display: "flex",
    gap: "2",
  }),
  title: css({
    fontWeight: "bold",
    fontSize: "lg",
    color: "fg.default",
  }),
  analyzedBadge: css({
    px: "2",
    py: "0.5",
    fontSize: "xs",
    fontWeight: "semibold",
    bg: "green.100",
    color: "green.800",
    rounded: "md",
    _dark: { bg: "green.900", color: "green.200" },
  }),
  btn: css({
    px: "3",
    py: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "xs",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  summary: css({
    display: "flex",
    gap: "4",
    mb: "4",
    p: "3",
    bg: "bg.subtle",
    rounded: "lg",
    border: "1px solid",
    borderColor: "border.default",
  }),
  summaryItem: css({
    display: "flex",
    flexDirection: "column",
    gap: "0.5",
  }),
  summaryLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    textTransform: "uppercase",
  }),
  summaryValue: css({
    fontSize: "lg",
    fontWeight: "semibold",
    color: "fg.default",
  }),
  planTree: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
    mb: "4",
  }),
  treeHeader: css({
    display: "flex",
    alignItems: "center",
    p: "2",
    bg: "bg.subtle",
    borderBottom: "1px solid",
    borderColor: "border.default",
  }),
  treeHeaderCell: css({
    fontSize: "xs",
    fontWeight: "semibold",
    color: "fg.muted",
    textTransform: "uppercase",
  }),
  treeBody: css({
    maxH: "400px",
    overflowY: "auto",
  }),
  nodeRow: css({
    display: "flex",
    alignItems: "center",
    p: "2",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
    cursor: "pointer",
    transition: "background 0.1s",
    _hover: { bg: "bg.subtle" },
  }),
  nodeRowSelected: css({
    bg: "blue.50",
    _hover: { bg: "blue.100" },
    _dark: { bg: "blue.950", _hover: { bg: "blue.900" } },
  }),
  nodeRowSlow: css({
    borderLeft: "3px solid",
    borderLeftColor: "red.500",
  }),
  nodeIndent: css({
    display: "flex",
    alignItems: "center",
  }),
  expandBtn: css({
    w: "18px",
    h: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "sm",
    bg: "bg.default",
    color: "fg.muted",
    fontSize: "xs",
    cursor: "pointer",
    mr: "2",
    _hover: { bg: "bg.muted" },
  }),
  expandPlaceholder: css({
    w: "18px",
    mr: "2",
  }),
  nodeBadge: css({
    w: "28px",
    h: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    rounded: "sm",
    fontSize: "xs",
    fontWeight: "bold",
    mr: "2",
    flexShrink: 0,
  }),
  nodeBadge_scan: css({
    bg: "blue.100",
    color: "blue.800",
    _dark: { bg: "blue.900", color: "blue.200" },
  }),
  nodeBadge_join: css({
    bg: "purple.100",
    color: "purple.800",
    _dark: { bg: "purple.900", color: "purple.200" },
  }),
  nodeBadge_sort: css({
    bg: "orange.100",
    color: "orange.800",
    _dark: { bg: "orange.900", color: "orange.200" },
  }),
  nodeBadge_hash: css({
    bg: "green.100",
    color: "green.800",
    _dark: { bg: "green.900", color: "green.200" },
  }),
  nodeBadge_default: css({
    bg: "gray.100",
    color: "gray.800",
    _dark: { bg: "gray.800", color: "gray.200" },
  }),
  nodeInfo: css({
    flex: 1,
    minW: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  nodeType: css({
    fontWeight: "medium",
    color: "fg.default",
  }),
  nodeRelation: css({
    color: "blue.600",
    _dark: { color: "blue.400" },
  }),
  nodeIndex: css({
    color: "green.600",
    fontSize: "xs",
    _dark: { color: "green.400" },
  }),
  nodeAlias: css({
    color: "fg.muted",
    fontSize: "xs",
  }),
  nodeStats: css({
    display: "flex",
    gap: "3",
    w: "200px",
    flexShrink: 0,
  }),
  statItem: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  }),
  statLabel: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  statValue: css({
    fontFamily: "mono",
    fontSize: "xs",
    color: "fg.default",
  }),
  statValueSlow: css({
    color: "red.600",
    fontWeight: "bold",
    _dark: { color: "red.400" },
  }),
  costBarContainer: css({
    w: "120px",
    display: "flex",
    alignItems: "center",
    gap: "2",
    flexShrink: 0,
  }),
  costBar: css({
    h: "8px",
    bg: "blue.400",
    rounded: "full",
    transition: "width 0.2s",
  }),
  costBarSlow: css({
    bg: "red.500",
  }),
  costPercent: css({
    fontSize: "xs",
    fontFamily: "mono",
    color: "fg.muted",
    minW: "45px",
    textAlign: "right",
  }),
  detailsPanel: css({
    p: "3",
    bg: "bg.subtle",
    rounded: "lg",
    border: "1px solid",
    borderColor: "border.default",
    mb: "4",
  }),
  detailsTitle: css({
    fontSize: "sm",
    fontWeight: "semibold",
    color: "fg.default",
    mb: "2",
  }),
  detailsGrid: css({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "2",
  }),
  detailItem: css({
    display: "flex",
    flexDirection: "column",
  }),
  detailLabel: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  detailValue: css({
    fontFamily: "mono",
    fontSize: "sm",
    color: "fg.default",
    wordBreak: "break-all",
  }),
  detailsEmpty: css({
    p: "3",
    color: "fg.muted",
    fontStyle: "italic",
  }),
  querySection: css({
    mt: "4",
  }),
  queryTitle: css({
    fontSize: "sm",
    fontWeight: "semibold",
    color: "fg.muted",
    mb: "2",
  }),
  queryCode: css({
    fontFamily: "mono",
    fontSize: "xs",
    p: "3",
    bg: "bg.subtle",
    rounded: "md",
    border: "1px solid",
    borderColor: "border.default",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  }),
  textPlan: css({
    fontFamily: "mono",
    fontSize: "xs",
    p: "3",
    bg: "bg.subtle",
    rounded: "md",
    border: "1px solid",
    borderColor: "border.default",
    overflow: "auto",
    whiteSpace: "pre",
  }),
  loading: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  error: css({ p: "4", bg: "red.50", color: "red.700", rounded: "md", _dark: { bg: "red.950", color: "red.300" } }),
};

// ============================================================================
// Mount
// ============================================================================

render(<PlanViewer />, document.getElementById("app")!);
