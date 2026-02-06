/**
 * CompositeUiViewer Component
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * Displays composite UI from collected MCP Apps resources with:
 * - Direct iframes for each UI (not nested) using MCP Apps protocol
 * - Layout selector (AC2)
 * - Drag & drop panel reordering (AC3)
 * - Sync rules editor (AC4)
 * - Event debug log (AC5, AC6)
 * - Tool result injection from execution traces
 *
 * ## Architecture
 *
 * Each UI panel is rendered as a direct iframe in the DOM. We use the
 * official MCP Apps SDK (`AppBridge` + `PostMessageTransport`) to communicate
 * with each iframe via the standard MCP Apps protocol (JSON-RPC over postMessage).
 *
 * When trace results are provided, we send them to the appropriate
 * iframes via `bridge.sendToolInput()` and `bridge.sendToolResult()`,
 * which triggers the UI's `app.ontoolinput` and `app.ontoolresult` callbacks.
 *
 * @module web/components/ui/CompositeUiViewer
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type {
  CollectedUiResource,
  UiOrchestrationState,
} from "../../islands/CytoscapeGraph.tsx";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";

// Layout options
const LAYOUT_OPTIONS: Array<{ value: UiOrchestrationState["layout"]; label: string }> = [
  { value: "split", label: "Split" },
  { value: "tabs", label: "Tabs" },
  { value: "grid", label: "Grid" },
  { value: "stack", label: "Stack" },
];

// Event log entry
interface EventLogEntry {
  id: string;
  timestamp: number;
  sourceSlot: number;
  sourceTool: string;
  event: string;
  targetSlot?: number | "*";
  targetTool?: string;
  action?: string;
  data?: unknown;
}

/**
 * Tool execution result from a trace
 */
export interface ToolTraceResult {
  tool: string;
  args?: Record<string, unknown>;
  result: unknown;
  success: boolean;
}

interface CompositeUiViewerProps {
  /** Collected UI resources from capability execution */
  collectedUis: CollectedUiResource[];
  /** Current UI orchestration state */
  orchestration: UiOrchestrationState;
  /** Callback when orchestration changes */
  onOrchestrationChange: (newOrchestration: UiOrchestrationState) => void;
  /** Height of the viewer section */
  height?: number;
  /** Server color mapping function */
  getServerColor?: (server: string) => string;
  /**
   * Tool execution results from selected trace.
   * Map from tool name (e.g., "std:docker_ps") to result data.
   */
  traceResults?: Map<string, ToolTraceResult>;
}

/**
 * Convert tool result to MCP content format
 */
function resultToMcpContent(result: unknown): Array<{ type: "text"; text: string }> {
  if (result === null || result === undefined) {
    return [{ type: "text", text: "null" }];
  }
  if (typeof result === "string") {
    return [{ type: "text", text: result }];
  }
  return [{ type: "text", text: JSON.stringify(result, null, 2) }];
}

/**
 * Default server color palette
 */
const DEFAULT_COLORS = [
  "#FFB86F",
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#95E1D3",
  "#F38181",
  "#AA96DA",
  "#FCBAD3",
];

/**
 * Get color for a server
 */
function getDefaultColor(server: string): string {
  const hash = server.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
}

/**
 * Format timestamp for event log
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

/**
 * Get layout CSS styles for the container
 */
function getLayoutStyles(layout: UiOrchestrationState["layout"]): Record<string, string> {
  switch (layout) {
    case "split":
      return { display: "flex", flexDirection: "row", gap: "8px" };
    case "grid":
      return {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: "8px",
      };
    case "tabs":
      return { display: "flex", flexDirection: "column" };
    case "stack":
    default:
      return { display: "flex", flexDirection: "column", gap: "8px" };
  }
}

/**
 * CompositeUiViewer Component
 */
export default function CompositeUiViewer({
  collectedUis,
  orchestration,
  onOrchestrationChange,
  height = 350,
  getServerColor,
  traceResults,
}: CompositeUiViewerProps) {
  const [showSyncEditor, setShowSyncEditor] = useState(false);
  const [showEventLog, setShowEventLog] = useState(false);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [highlightedSlots, setHighlightedSlots] = useState<number[]>([]);
  const [syncRulesJson, setSyncRulesJson] = useState(
    JSON.stringify(orchestration.sync ?? [], null, 2),
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // Active tab index for tabs layout
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // Refs for iframes and bridges
  const iframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());
  const bridgeRefs = useRef<Map<number, AppBridge>>(new Map());
  const bridgeInitializedRefs = useRef<Map<number, boolean>>(new Map());

  // Auto-resize: track content heights for each slot
  const [contentHeights, setContentHeights] = useState<Map<number, number>>(new Map());

  const getColor = getServerColor ?? getDefaultColor;

  // Listen for auto-resize messages from iframes
  useEffect(() => {
    const handleResizeMessage = (event: MessageEvent) => {
      if (event.data?.type === "mcp-app-resize" && typeof event.data.height === "number") {
        // Find which slot this message came from
        for (const [slot, iframe] of iframeRefs.current.entries()) {
          if (iframe?.contentWindow === event.source) {
            // Clamp height between reasonable bounds
            const minHeight = 150;
            const maxHeight = 500;
            const newHeight = Math.min(Math.max(event.data.height, minHeight), maxHeight);

            setContentHeights((prev) => {
              const next = new Map(prev);
              next.set(slot, newHeight);
              return next;
            });
            break;
          }
        }
      }
    };

    window.addEventListener("message", handleResizeMessage);
    return () => window.removeEventListener("message", handleResizeMessage);
  }, []);

  // Get panels in display order
  const panelOrder = orchestration.panelOrder ?? collectedUis.map((_, i) => i);
  const orderedPanels = panelOrder.map((i) => collectedUis[i]).filter(Boolean);

  // Setup bridge for an iframe when it loads
  const setupBridge = useCallback(
    (slot: number, iframe: HTMLIFrameElement, toolSource: string) => {
      // Clean up existing bridge if any
      const existingBridge = bridgeRefs.current.get(slot);
      if (existingBridge) {
        existingBridge.close().catch(() => {});
      }

      // Create new bridge using official MCP Apps SDK
      const bridge = new AppBridge(
        null, // No MCP client - we're not proxying to a server
        { name: "Casys PML Dashboard", version: "1.0.0" },
        { openLinks: {}, logging: {} }, // Host capabilities
        { hostContext: { theme: "dark", displayMode: "inline" } },
      );

      // When UI initializes, replay any available trace execution
      bridge.oninitialized = () => {
        console.log(`[CompositeUiViewer] UI ${toolSource} (slot ${slot}) initialized`);
        bridgeInitializedRefs.current.set(slot, true);

        // Replay trace execution if available (input + result)
        // Use toolId (long format) for matching, fallback to source (short format)
        const panel = collectedUis.find((u) => u.slot === slot);
        const traceKey = panel?.toolId ?? toolSource;

        if (traceResults) {
          console.log(`[CompositeUiViewer] Looking for trace key="${traceKey}" in traceResults:`, [...traceResults.keys()]);
          const traceResult = traceResults.get(traceKey);
          if (traceResult) {
            console.log(`[CompositeUiViewer] Replaying trace for ${traceKey}:`, traceResult);
            // Send input first
            bridge.sendToolInput({ arguments: traceResult.args ?? {} });
            // Then send result
            bridge.sendToolResult({
              content: resultToMcpContent(traceResult.result),
              isError: !traceResult.success,
            });
          } else {
            console.warn(`[CompositeUiViewer] No trace found for key="${traceKey}"`);
          }
        } else {
          console.warn(`[CompositeUiViewer] traceResults is undefined/null`);
        }
      };

      // Store refs before async connect
      bridgeRefs.current.set(slot, bridge);
      bridgeInitializedRefs.current.set(slot, false);
      iframeRefs.current.set(slot, iframe);

      // Connect bridge before iframe loads
      if (!iframe.contentWindow) {
        console.warn(`[CompositeUiViewer] No contentWindow for slot ${slot}`);
        return;
      }

      console.log(`[CompositeUiViewer] Creating transport for ${toolSource} (slot ${slot})`);
      const transport = new PostMessageTransport(
        iframe.contentWindow,
        iframe.contentWindow,
      );

      // CRITICAL: Connect bridge and wait for it to be ready BEFORE loading iframe content
      bridge.connect(transport).then(() => {
        console.log(`[CompositeUiViewer] Bridge ready, loading iframe for ${toolSource}`);
        // NOW set the iframe src - bridge is listening
        const srcUrl = `/api/ui/resource?uri=${encodeURIComponent(
          collectedUis.find((u) => u.slot === slot)?.resourceUri ?? ""
        )}`;
        iframe.src = srcUrl;
      }).catch((err) => {
        console.error(`[CompositeUiViewer] Bridge connect error for ${toolSource}:`, err);
      });
    },
    [traceResults, collectedUis],
  );

  // Replay trace when results change (e.g., user selects different trace)
  useEffect(() => {
    if (!traceResults) return;

    // For each initialized bridge, replay the corresponding trace
    for (const panel of orderedPanels) {
      const bridge = bridgeRefs.current.get(panel.slot);
      const isInitialized = bridgeInitializedRefs.current.get(panel.slot);
      if (bridge && isInitialized) {
        // Use toolId (long format) for matching, fallback to source (short format)
        const traceKey = panel.toolId ?? panel.source;
        const traceResult = traceResults.get(traceKey);
        if (traceResult) {
          console.log(`[CompositeUiViewer] Replaying updated trace for ${traceKey}`);
          // Send input first, then result
          bridge.sendToolInput({ arguments: traceResult.args ?? {} });
          bridge.sendToolResult({
            content: resultToMcpContent(traceResult.result),
            isError: !traceResult.success,
          });
        }
      }
    }
  }, [traceResults, orderedPanels]);

  // Cleanup bridges on unmount
  useEffect(() => {
    return () => {
      for (const bridge of bridgeRefs.current.values()) {
        bridge.close().catch(() => {});
      }
      bridgeRefs.current.clear();
      bridgeInitializedRefs.current.clear();
      iframeRefs.current.clear();
    };
  }, []);

  // Add event to log
  const addEventLogEntry = useCallback((entry: Omit<EventLogEntry, "id" | "timestamp">) => {
    const newEntry: EventLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...entry,
    };
    setEventLog((prev) => [newEntry, ...prev].slice(0, 100));
  }, []);

  // Listen for events from UI iframes (sync rules routing)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object" || data.jsonrpc !== "2.0") return;

      // Find which iframe sent this message
      let sourceSlot = -1;
      let sourcePanel: CollectedUiResource | undefined;
      for (const panel of orderedPanels) {
        const iframe = iframeRefs.current.get(panel.slot);
        if (iframe?.contentWindow === event.source) {
          sourceSlot = panel.slot;
          sourcePanel = panel;
          break;
        }
      }

      if (sourceSlot === -1) return;

      // Handle ui/update-model-context - this is how UIs emit events
      if (data.method === "ui/update-model-context") {
        const contextData = data.params?.structuredContent || data.params?.content;
        const eventType = contextData?.event || "update";

        // Log the event
        const sourceTool = sourcePanel?.source ?? "unknown";
        addEventLogEntry({
          sourceSlot,
          sourceTool,
          event: eventType,
          data: contextData,
        });

        // Route according to sync rules
        // Note: UiOrchestrationState uses tool names (strings), not resolved slot numbers
        // The resolution happens in buildCompositeUi() but we use the unresolved version here
        const syncRules = orchestration.sync ?? [];
        for (const rule of syncRules) {
          if (rule.from !== sourceTool) continue;
          if (rule.event !== "*" && rule.event !== eventType) continue;

          // Find target panels by tool name
          const targetPanels = rule.to === "*"
            ? orderedPanels.filter((p) => p.source !== sourceTool)
            : orderedPanels.filter((p) => p.source === rule.to);

          for (const targetPanel of targetPanels) {
            const bridge = bridgeRefs.current.get(targetPanel.slot);
            const isInitialized = bridgeInitializedRefs.current.get(targetPanel.slot);
            if (bridge && isInitialized) {
              // Send via MCP Apps protocol
              bridge.sendToolResult({
                content: resultToMcpContent({
                  action: rule.action,
                  data: contextData,
                  sourceSlot,
                }),
                isError: false,
              });

              // Log the routed event
              addEventLogEntry({
                sourceSlot,
                sourceTool: sourcePanel?.source ?? "unknown",
                event: eventType,
                targetSlot: targetPanel.slot,
                targetTool: targetPanel.source,
                action: rule.action,
                data: contextData,
              });
            }
          }

          // Highlight involved slots
          const involvedSlots = [sourceSlot, ...targetPanels.map((p) => p.slot)];
          setHighlightedSlots(involvedSlots);
          setTimeout(() => setHighlightedSlots([]), 1500);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [orderedPanels, orchestration.sync, addEventLogEntry]);

  // Handle layout change
  const handleLayoutChange = (layout: UiOrchestrationState["layout"]) => {
    onOrchestrationChange({ ...orchestration, layout });
  };

  // Handle sync rules edit
  const handleSyncRulesChange = (json: string) => {
    setSyncRulesJson(json);
    setSyncError(null);

    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        setSyncError("Sync rules must be an array");
        return;
      }
      for (const rule of parsed) {
        if (!rule.from || !rule.event || !rule.to || !rule.action) {
          setSyncError("Each rule needs: from, event, to, action");
          return;
        }
      }
      onOrchestrationChange({ ...orchestration, sync: parsed });
    } catch (_e) {
      setSyncError("Invalid JSON");
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const newOrder = [...panelOrder];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    onOrchestrationChange({
      ...orchestration,
      panelOrder: newOrder,
    });

    setDraggedIndex(null);
  };

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
        background: "var(--bg-surface, #1a1816)",
      }}
    >
      {/* Header with layout selector and toggles */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* UI Badge */}
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "0.7rem",
              fontWeight: 600,
              background: "rgba(78, 205, 196, 0.15)",
              color: "#4ECDC4",
            }}
          >
            {collectedUis.length} UI{collectedUis.length !== 1 ? "s" : ""}
          </span>

          {/* Panel indicators with drag handles */}
          <div style={{ display: "flex", gap: "4px" }}>
            {orderedPanels.map((panel, index) => {
              const color = getColor(panel.source.split(":")[0]);
              const isHighlighted = highlightedSlots.includes(panel.slot);
              const hasData = traceResults?.has(panel.source);

              return (
                <div
                  key={panel.slot}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver as any}
                  onDrop={() => handleDrop(index)}
                  title={`${panel.source} (slot ${panel.slot})${hasData ? " - Has data" : ""} - Drag to reorder`}
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.7rem",
                    background: isHighlighted ? `${color}50` : `${color}20`,
                    color: color,
                    border: `1px solid ${isHighlighted ? color : hasData ? `${color}80` : "transparent"}`,
                    cursor: "grab",
                    transition: "all 0.2s ease",
                    opacity: draggedIndex === index ? 0.5 : 1,
                  }}
                >
                  {panel.source.split(":")[1]}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Layout selector */}
          <select
            value={orchestration.layout}
            onChange={(e) =>
              handleLayoutChange((e.target as HTMLSelectElement).value as UiOrchestrationState["layout"])
            }
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid var(--border, rgba(255, 184, 111, 0.2))",
              background: "var(--bg, #0a0908)",
              color: "var(--text, #f5f0ea)",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            {LAYOUT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Sync Rules toggle */}
          <button
            onClick={() => setShowSyncEditor(!showSyncEditor)}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border: showSyncEditor
                ? "1px solid var(--accent, #FFB86F)"
                : "1px solid var(--border, rgba(255, 184, 111, 0.2))",
              background: showSyncEditor
                ? "var(--accent-dim, rgba(255, 184, 111, 0.1))"
                : "transparent",
              color: showSyncEditor ? "var(--accent, #FFB86F)" : "var(--text-muted, #d5c3b5)",
              fontSize: "0.7rem",
              cursor: "pointer",
            }}
          >
            Sync Rules
          </button>

          {/* Event Log toggle */}
          <button
            onClick={() => setShowEventLog(!showEventLog)}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border: showEventLog
                ? "1px solid var(--accent, #FFB86F)"
                : "1px solid var(--border, rgba(255, 184, 111, 0.2))",
              background: showEventLog
                ? "var(--accent-dim, rgba(255, 184, 111, 0.1))"
                : "transparent",
              color: showEventLog ? "var(--accent, #FFB86F)" : "var(--text-muted, #d5c3b5)",
              fontSize: "0.7rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            Events
            {eventLog.length > 0 && (
              <span
                style={{
                  padding: "1px 4px",
                  borderRadius: "8px",
                  background: "var(--accent, #FFB86F)",
                  color: "var(--bg, #0a0908)",
                  fontSize: "0.6rem",
                  fontWeight: 600,
                }}
              >
                {eventLog.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tabs bar (only for tabs layout) */}
      {orchestration.layout === "tabs" && orderedPanels.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: "2px",
            padding: "0 8px",
            borderBottom: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
            background: "var(--bg, #0a0908)",
          }}
        >
          {orderedPanels.map((panel, index) => {
            const color = getColor(panel.source.split(":")[0]);
            const isActive = index === activeTabIndex;

            return (
              <button
                key={panel.slot}
                onClick={() => setActiveTabIndex(index)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
                  background: isActive ? `${color}15` : "transparent",
                  color: isActive ? color : "var(--text-muted, #d5c3b5)",
                  fontSize: "0.8rem",
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {panel.source.split(":")[1] || panel.source}
              </button>
            );
          })}
        </div>
      )}

      {/* UI Panels - Direct iframes with MCP Apps protocol */}
      <div
        style={{
          padding: "8px",
          minHeight: `${Math.min(height, 300)}px`,
          maxHeight: `${height}px`,
          ...(orchestration.layout === "tabs"
            ? { display: "flex", flexDirection: "column" }
            : getLayoutStyles(orchestration.layout)),
        }}
      >
        {orderedPanels.map((panel, index) => {
          const color = getColor(panel.source.split(":")[0]);

          // In tabs mode, only show the active tab
          if (orchestration.layout === "tabs" && index !== activeTabIndex) {
            return null;
          }

          return (
            <div
              key={panel.slot}
              style={{
                flex: 1,
                minWidth: orchestration.layout === "split" ? "200px" : undefined,
                minHeight: "150px",
                border: `1px solid ${color}40`,
                borderRadius: "8px",
                background: "#1a1a1a",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Panel header (hidden in tabs mode since we have tab bar) */}
              {orchestration.layout !== "tabs" && (
                <div
                  style={{
                    padding: "6px 12px",
                    background: `${color}15`,
                    borderBottom: `1px solid ${color}30`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: color, fontSize: "0.8rem", fontWeight: 500 }}>
                    {panel.source}
                  </span>
                  <span style={{ color: "#666", fontSize: "0.65rem" }}>
                    slot {panel.slot}
                  </span>
                </div>
              )}

              {/* UI iframe - src is set by setupBridge after bridge.connect() completes */}
              <iframe
                ref={(el) => {
                  if (el && !iframeRefs.current.has(panel.slot)) {
                    // Setup bridge - it will set iframe.src after connect() completes
                    setupBridge(panel.slot, el, panel.source);
                  }
                }}
                title={`UI: ${panel.source}`}
                sandbox="allow-scripts allow-same-origin"
                style={{
                  flex: 1,
                  width: "100%",
                  minHeight: "100px",
                  border: "none",
                  background: "#1a1a1a",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Sync Rules Editor (collapsible) */}
      {showSyncEditor && (
        <div
          style={{
            padding: "12px",
            borderTop: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
            background: "var(--bg, #0a0908)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-dim, #8a8078)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Sync Rules (JSON)
            </span>
            {syncError && (
              <span style={{ fontSize: "0.7rem", color: "var(--error, #ef4444)" }}>
                {syncError}
              </span>
            )}
          </div>
          <textarea
            value={syncRulesJson}
            onChange={(e) => handleSyncRulesChange((e.target as HTMLTextAreaElement).value)}
            style={{
              width: "100%",
              height: "80px",
              padding: "8px",
              borderRadius: "4px",
              border: syncError
                ? "1px solid var(--error, #ef4444)"
                : "1px solid var(--border, rgba(255, 184, 111, 0.2))",
              background: "var(--bg-elevated, #12110f)",
              color: "var(--text, #f5f0ea)",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              resize: "vertical",
            }}
          />
        </div>
      )}

      {/* Event Debug Log (collapsible) */}
      {showEventLog && (
        <div
          style={{
            padding: "12px",
            borderTop: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
            background: "var(--bg, #0a0908)",
            maxHeight: "150px",
            overflow: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-dim, #8a8078)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Event Log
            </span>
            <button
              onClick={() => setEventLog([])}
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                border: "none",
                background: "transparent",
                color: "var(--text-dim, #8a8078)",
                fontSize: "0.7rem",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>

          {eventLog.length === 0 ? (
            <div
              style={{
                color: "var(--text-dim, #8a8078)",
                fontSize: "0.75rem",
                fontStyle: "italic",
                textAlign: "center",
                padding: "12px",
              }}
            >
              No events yet. Events will appear here when UIs emit them.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {eventLog.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    background: "var(--bg-elevated, #12110f)",
                    fontSize: "0.7rem",
                    fontFamily: "monospace",
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "var(--text-dim, #8a8078)" }}>
                    {formatTime(entry.timestamp)}
                  </span>
                  <span style={{ color: getColor(entry.sourceTool.split(":")[0]) }}>
                    {entry.sourceTool}
                  </span>
                  <span style={{ color: "var(--accent, #FFB86F)" }}>{entry.event}</span>
                  {entry.targetTool && (
                    <>
                      <span style={{ color: "var(--text-dim, #8a8078)" }}>→</span>
                      <span style={{ color: getColor(entry.targetTool.split(":")[0]) }}>
                        {entry.targetTool}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
