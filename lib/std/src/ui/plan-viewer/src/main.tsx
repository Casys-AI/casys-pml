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

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack, Grid } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { IconButton } from "../../components/ui/icon-button";
import * as Card from "../../components/ui/card";
import "../../global.css";

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

function getNodeColorClass(nodeType: string): string {
  if (nodeType.includes("Scan")) return "scan";
  if (nodeType.includes("Join")) return "join";
  if (nodeType.includes("Sort") || nodeType.includes("Aggregate")) return "sort";
  if (nodeType.includes("Hash")) return "hash";
  return "default";
}

const nodeBadgeColors: Record<string, { bg: string; color: string; _dark: { bg: string; color: string } }> = {
  scan: { bg: "blue.100", color: "blue.800", _dark: { bg: "blue.900", color: "blue.200" } },
  join: { bg: "purple.100", color: "purple.800", _dark: { bg: "purple.900", color: "purple.200" } },
  sort: { bg: "orange.100", color: "orange.800", _dark: { bg: "orange.900", color: "orange.200" } },
  hash: { bg: "green.100", color: "green.800", _dark: { bg: "green.900", color: "green.200" } },
  default: { bg: "gray.100", color: "gray.800", _dark: { bg: "gray.800", color: "gray.200" } },
};

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
  const { node, depth, percentOfTotal, isSlow } = flatNode;
  const hasChildren = node.Plans && node.Plans.length > 0;
  const nodeColor = getNodeColorClass(node["Node Type"]);
  const badgeStyle = nodeBadgeColors[nodeColor];

  return (
    <Flex
      align="center"
      p="2"
      borderBottom="1px solid"
      borderColor="border.subtle"
      cursor="pointer"
      transition="background 0.1s"
      _hover={{ bg: "bg.subtle" }}
      onClick={onSelect}
      bg={isSelected ? { base: "blue.50", _dark: "blue.950" } : undefined}
      borderLeft={isSlow ? "3px solid" : undefined}
      borderLeftColor={isSlow ? "red.500" : undefined}
    >
      {/* Indentation and expand toggle */}
      <Flex align="center" style={{ paddingLeft: `${depth * 20}px` }}>
        {hasChildren ? (
          <IconButton
            variant="outline"
            size="xs"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={css({ w: "18px", h: "18px", mr: "2", minW: "18px" })}
          >
            {isExpanded ? "-" : "+"}
          </IconButton>
        ) : (
          <Box w="18px" mr="2" />
        )}
      </Flex>

      {/* Node type badge */}
      <Box
        w="28px"
        h="20px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        rounded="sm"
        fontSize="xs"
        fontWeight="bold"
        mr="2"
        flexShrink={0}
        bg={badgeStyle.bg}
        color={badgeStyle.color}
        _dark={badgeStyle._dark}
      >
        {getNodeIcon(node["Node Type"])}
      </Box>

      {/* Node info */}
      <Box flex="1" minW="0" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
        <Box as="span" fontWeight="medium" color="fg.default">{node["Node Type"]}</Box>
        {node["Relation Name"] && (
          <Box as="span" color={{ base: "blue.600", _dark: "blue.400" }}> on {node["Relation Name"]}</Box>
        )}
        {node["Index Name"] && (
          <Box as="span" color={{ base: "green.600", _dark: "green.400" }} fontSize="xs"> using {node["Index Name"]}</Box>
        )}
        {node["Alias"] && node["Alias"] !== node["Relation Name"] && (
          <Box as="span" color="fg.muted" fontSize="xs"> ({node["Alias"]})</Box>
        )}
      </Box>

      {/* Stats */}
      <Flex gap="3" w="200px" flexShrink={0}>
        <Stack gap="0" align="flex-end">
          <Box fontSize="xs" color="fg.muted">Time</Box>
          <Box
            fontFamily="mono"
            fontSize="xs"
            color={isSlow ? { base: "red.600", _dark: "red.400" } : "fg.default"}
            fontWeight={isSlow ? "bold" : "normal"}
          >
            {formatTime(node["Actual Total Time"])}
          </Box>
        </Stack>
        <Stack gap="0" align="flex-end">
          <Box fontSize="xs" color="fg.muted">Rows</Box>
          <Box fontFamily="mono" fontSize="xs" color="fg.default">{formatRows(node["Actual Rows"])}</Box>
        </Stack>
        <Stack gap="0" align="flex-end">
          <Box fontSize="xs" color="fg.muted">Loops</Box>
          <Box fontFamily="mono" fontSize="xs" color="fg.default">{node["Actual Loops"] ?? "-"}</Box>
        </Stack>
      </Flex>

      {/* Cost bar */}
      <Flex w="120px" align="center" gap="2" flexShrink={0}>
        <Box
          h="8px"
          bg={isSlow ? "red.500" : "blue.400"}
          rounded="full"
          transition="width 0.2s"
          style={{ width: `${Math.min(percentOfTotal, 100)}%` }}
        />
        <Box fontSize="xs" fontFamily="mono" color="fg.muted" minW="45px" textAlign="right">
          {percentOfTotal.toFixed(1)}%
        </Box>
      </Flex>
    </Flex>
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
    return <Box p="3" color="fg.muted" fontStyle="italic">No additional details</Box>;
  }

  return (
    <Box p="3" bg="bg.subtle" rounded="lg" border="1px solid" borderColor="border.default" mb="4">
      <Box as="h4" fontSize="sm" fontWeight="semibold" color="fg.default" mb="2">
        Details: {node["Node Type"]}
      </Box>
      <Grid gridTemplateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap="2">
        {details.map(({ label, value }) => (
          <Stack key={label} gap="0">
            <Box fontSize="xs" color="fg.muted">{label}</Box>
            <Box fontFamily="mono" fontSize="sm" color="fg.default" wordBreak="break-all">{value}</Box>
          </Stack>
        ))}
      </Grid>
    </Box>
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
    return <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="300px">
      <Box p="10" textAlign="center" color="fg.muted">Loading query plan...</Box>
    </Box>;
  }

  if (error) {
    return <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="300px">
      <Box p="4" bg={{ base: "red.50", _dark: "red.950" }} color={{ base: "red.700", _dark: "red.300" }} rounded="md">{error}</Box>
    </Box>;
  }

  if (!data) {
    return <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="300px">
      <Box p="10" textAlign="center" color="fg.muted">No plan data</Box>
    </Box>;
  }

  // Handle text format (non-JSON)
  if (typeof data.plan === "string") {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="300px">
        <Flex justify="space-between" align="center" mb="3">
          <Box fontWeight="bold" fontSize="lg" color="fg.default">Query Plan (Text)</Box>
        </Flex>
        <Box as="pre" fontFamily="mono" fontSize="xs" p="3" bg="bg.subtle" rounded="md" border="1px solid" borderColor="border.default" overflow="auto" whiteSpace="pre">
          {data.plan}
        </Box>
      </Box>
    );
  }

  if (!planResult) {
    return <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="300px">
      <Box p="10" textAlign="center" color="fg.muted">Invalid plan format</Box>
    </Box>;
  }

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="300px">
      {/* Header */}
      <Flex justify="space-between" align="center" mb="3">
        <Flex align="center" gap="2">
          <Box fontWeight="bold" fontSize="lg" color="fg.default">Query Execution Plan</Box>
          {data.analyzed && (
            <Badge variant="solid" className={css({ bg: "green.100", color: "green.800", _dark: { bg: "green.900", color: "green.200" } })}>ANALYZED</Badge>
          )}
        </Flex>
        <Flex gap="2">
          <Button variant="outline" size="xs" onClick={handleExpandAll}>Expand All</Button>
          <Button variant="outline" size="xs" onClick={handleCollapseAll}>Collapse All</Button>
        </Flex>
      </Flex>

      {/* Summary stats */}
      <Flex gap="4" mb="4" p="3" bg="bg.subtle" rounded="lg" border="1px solid" borderColor="border.default">
        {planResult["Planning Time"] !== undefined && (
          <Stack gap="0.5">
            <Box fontSize="xs" color="fg.muted" textTransform="uppercase">Planning Time</Box>
            <Box fontSize="lg" fontWeight="semibold" color="fg.default">{formatTime(planResult["Planning Time"])}</Box>
          </Stack>
        )}
        {planResult["Execution Time"] !== undefined && (
          <Stack gap="0.5">
            <Box fontSize="xs" color="fg.muted" textTransform="uppercase">Execution Time</Box>
            <Box fontSize="lg" fontWeight="semibold" color="fg.default">{formatTime(planResult["Execution Time"])}</Box>
          </Stack>
        )}
        <Stack gap="0.5">
          <Box fontSize="xs" color="fg.muted" textTransform="uppercase">Total Nodes</Box>
          <Box fontSize="lg" fontWeight="semibold" color="fg.default">{flatNodes.length}</Box>
        </Stack>
      </Flex>

      {/* Plan tree */}
      <Box border="1px solid" borderColor="border.default" rounded="lg" overflow="hidden" mb="4">
        <Flex align="center" p="2" bg="bg.subtle" borderBottom="1px solid" borderColor="border.default">
          <Box flex="1" fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">Operation</Box>
          <Box w="200px" fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">Stats</Box>
          <Box w="120px" fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">Cost %</Box>
        </Flex>
        <Box maxH="400px" overflowY="auto">
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
        </Box>
      </Box>

      {/* Selected node details */}
      {selectedNode && <NodeDetails node={selectedNode} />}

      {/* Query display */}
      <Box mt="4">
        <Box as="h4" fontSize="sm" fontWeight="semibold" color="fg.muted" mb="2">Query</Box>
        <Box as="pre" fontFamily="mono" fontSize="xs" p="3" bg="bg.subtle" rounded="md" border="1px solid" borderColor="border.default" overflow="auto" whiteSpace="pre-wrap" wordBreak="break-word">
          {data.query}
        </Box>
      </Box>
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<PlanViewer />);
