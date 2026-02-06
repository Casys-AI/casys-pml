/**
 * CodePanel Island - Bottom panel for displaying capability code snippets
 * Story 8.4: Code Panel Integration
 *
 * Displays:
 * - Capability name and description
 * - Syntax-highlighted code snippet
 * - Success rate, usage count, tools count stats
 * - Copy to clipboard functionality
 * - Tools list with clickable items
 *
 * @module web/islands/CodePanel
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { detectLanguage, highlightCode, syntaxHighlightStyles } from "../lib/syntax-highlight.ts";
import type {
  CapabilityData,
  ExecutionTrace,
  ToolData,
  TraceTaskResult,
  UiOrchestrationState,
} from "./CytoscapeGraph.tsx";
import TraceSelector from "../components/ui/molecules/TraceSelector.tsx";
import TraceTimeline from "../components/ui/molecules/TraceTimeline.tsx";
import CompositeUiViewer, { type ToolTraceResult } from "../components/ui/CompositeUiViewer.tsx";
import { parseToolId } from "../../capabilities/tool-id-utils.ts";

// Re-export for convenience
export type { CapabilityData, ExecutionTrace, ToolData, TraceTaskResult };

interface CodePanelProps {
  /** Capability data to display (null hides panel) */
  capability: CapabilityData | null;
  /** Tool data to display (null hides panel) */
  tool?: ToolData | null;
  /** Callback when panel is closed */
  onClose: () => void;
  /** Callback when a tool is clicked (highlights in graph) */
  onToolClick?: (toolId: string) => void;
  /** Server color mapping function */
  getServerColor?: (server: string) => string;
}

/**
 * Default server color palette (matches D3GraphVisualization)
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
 * Format relative time ("2h ago", "yesterday", etc.)
 */
function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return "N/A";

  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * CodePanel Component
 *
 * Bottom panel that displays capability code and metadata.
 * Shows when a capability hull is clicked in the hypergraph view.
 */
// Min/Max heights for the panel
const MIN_PANEL_HEIGHT = 150;
const DEFAULT_MAX_HEIGHT = 800;
const DEFAULT_PANEL_HEIGHT = 300;

// Get max height dynamically (SSR-safe) - allow full window height
const getMaxPanelHeight = () =>
  typeof window !== "undefined" ? globalThis.innerHeight : DEFAULT_MAX_HEIGHT;

// Threshold for fullscreen mode (covers header)
const FULLSCREEN_THRESHOLD = 0.9;

export default function CodePanel({
  capability,
  tool,
  onClose,
  onToolClick,
  getServerColor,
}: CodePanelProps) {
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  // Story 11.4: Selected trace index for Invocation view
  const [selectedTraceIndex, setSelectedTraceIndex] = useState(0);
  // Track if initial animation has completed (prevents re-animation on resize)
  const [hasAnimated, setHasAnimated] = useState(false);

  // Resizable panel state
  const [panelHeight, setPanelHeight] = useState(() => {
    // Try to restore from localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("codePanelHeight");
      if (saved) {
        const height = parseInt(saved, 10);
        if (!isNaN(height) && height >= MIN_PANEL_HEIGHT && height <= getMaxPanelHeight()) {
          return height;
        }
      }
    }
    return DEFAULT_PANEL_HEIGHT;
  });
  const [isResizing, setIsResizing] = useState(false);
  // Fullscreen mode: covers entire viewport including header
  const isFullscreen = typeof window !== "undefined" && panelHeight >= globalThis.innerHeight * FULLSCREEN_THRESHOLD;
  const panelRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Story 16.6: UI orchestration state for composite viewer
  // Initialized from capability or fetched from API - no hardcoded defaults
  const [uiOrchestration, setUiOrchestration] = useState<UiOrchestrationState | null>(
    capability?.uiOrchestration ?? null
  );

  // Story 16.6: Code section collapsed state (when UIs are present)
  const [codeCollapsed, setCodeCollapsed] = useState(false);

  // Story 16.6: Fetched UIs from API
  const [fetchedUis, setFetchedUis] = useState<CapabilityData["collectedUis"]>(undefined);

  // Story 16.6: Fetch UIs when capability changes
  useEffect(() => {
    if (!capability?.id) {
      setFetchedUis(undefined);
      return;
    }

    const fetchUis = async () => {
      try {
        console.log("[CodePanel] Fetching UIs for capability.id:", capability.id, "full capability:", JSON.stringify(capability, null, 2));
        const response = await fetch(`/api/capabilities/${capability.id}/uis`);
        if (response.ok) {
          const data = await response.json();
          if (data.hasUis && data.collectedUis?.length > 0) {
            setFetchedUis(data.collectedUis);
            if (data.uiOrchestration) {
              setUiOrchestration(data.uiOrchestration);
            }
          } else {
            setFetchedUis(undefined);
          }
        }
      } catch (error) {
        console.error("[CodePanel] Failed to fetch UIs:", error);
        setFetchedUis(undefined);
      }
    };

    fetchUis();
  }, [capability?.id]);

  // Check if capability has UI resources (from fetched data or inline)
  const collectedUis = fetchedUis ?? capability?.collectedUis;
  const hasCollectedUis = collectedUis && collectedUis.length > 0;

  // Determine display mode
  const displayMode = tool ? "tool" : capability ? "capability" : null;

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      // Ctrl/Cmd+C to copy when panel is focused
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && capability?.codeSnippet) {
        // Only copy if no text is selected
        const selection = globalThis.getSelection();
        if (!selection || selection.toString().length === 0) {
          handleCopy();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, capability]);

  // Reset copied state when capability/tool changes
  useEffect(() => {
    setCopied(false);
  }, [capability?.id, tool?.id]);

  // Story 16.6: Update UI orchestration when capability changes
  // Don't set hardcoded defaults here - let the API fetch (line ~148-169) be the source of truth
  useEffect(() => {
    if (capability?.uiOrchestration) {
      setUiOrchestration(capability.uiOrchestration);
    } else {
      // Reset to null - API fetch will provide the actual orchestration
      setUiOrchestration(null);
    }
    // Reset code collapsed state when capability changes
    setCodeCollapsed(false);
  }, [capability?.id]);

  // Save panel height to localStorage when it changes
  useEffect(() => {
    if (typeof window !== "undefined" && panelHeight !== DEFAULT_PANEL_HEIGHT) {
      localStorage.setItem("codePanelHeight", String(panelHeight));
    }
  }, [panelHeight]);

  // Mark animation as complete after initial slide-up (prevents re-animation on resize)
  useEffect(() => {
    const timer = setTimeout(() => setHasAnimated(true), 350); // 300ms animation + buffer
    return () => clearTimeout(timer);
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = "touches" in e ? e.touches[0].clientY : e.clientY;
    startHeightRef.current = panelHeight;

    // Add cursor style to body during resize
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }, [panelHeight]);

  const handleResizeMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isResizing) return;

    const currentY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaY = startYRef.current - currentY; // Negative = dragging down, Positive = dragging up
    const newHeight = Math.min(
      getMaxPanelHeight(),
      Math.max(MIN_PANEL_HEIGHT, startHeightRef.current + deltaY),
    );

    setPanelHeight(newHeight);
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  // Global mouse/touch events for resize
  useEffect(() => {
    if (isResizing) {
      const handleMove = (e: MouseEvent | TouchEvent) => handleResizeMove(e);
      const handleEnd = () => handleResizeEnd();

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleEnd);
      document.addEventListener("touchmove", handleMove);
      document.addEventListener("touchend", handleEnd);

      return () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleEnd);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  if (!capability && !tool) return null;

  // Get content to display (schema for tools, code for capabilities)
  const displayContent = tool
    ? JSON.stringify(tool.inputSchema || {}, null, 2)
    : capability?.codeSnippet || "";

  // Detect language based on mode
  const contentLanguage = tool ? "json" : detectLanguage(displayContent);

  /**
   * Copy content to clipboard
   */
  const handleCopy = async () => {
    if (!displayContent) return;

    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[CodePanel] Failed to copy to clipboard:", error);
    }
  };

  /**
   * Get color for a server
   */
  const getColor = (server: string): string => {
    if (getServerColor) return getServerColor(server);
    // Fallback: hash-based color selection
    const hash = server.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
  };


  // Split content into lines for line numbers
  const contentLines = displayContent?.split("\n") || [];

  return (
    <>
      {/* Inject syntax highlighting styles */}
      <style>{syntaxHighlightStyles}</style>

      {/* Slide-up animation keyframes */}
      <style>
        {`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}
      </style>

      <div
        ref={panelRef}
        class={`code-panel w-full flex flex-col outline-none bg-pml-bg-elevated border-t border-pml-border ${
          isFullscreen ? "fixed inset-0 z-[200]" : "relative z-[100]"
        }`}
        role="region"
        aria-labelledby="code-panel-title"
        tabIndex={0}
        style={{
          height: isFullscreen ? "100vh" : `${panelHeight}px`,
          minHeight: `${MIN_PANEL_HEIGHT}px`,
          maxHeight: isFullscreen ? "100vh" : `${getMaxPanelHeight()}px`,
          animation: hasAnimated ? "none" : "slideUp 300ms ease-out",
        }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={handleResizeStart as any}
          onTouchStart={handleResizeStart as any}
          class="absolute top-0 left-0 right-0 h-2 cursor-ns-resize flex justify-center items-center z-10"
          title="Drag to resize"
        >
          {/* Visual grip indicator */}
          <div
            class={`w-[40px] h-1 rounded-sm transition-colors duration-150 ${
              isResizing ? "bg-pml-accent" : "bg-pml-border hover:bg-pml-accent"
            }`}
          />
        </div>

        {/* Header */}
        <div class="panel-header px-4 py-3 pt-4 border-b border-pml-border flex justify-between items-center shrink-0">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            {/* Title with type badge */}
            <span
              class={`px-2 py-0.5 rounded text-[0.7rem] font-semibold uppercase tracking-wide ${
                displayMode === "tool"
                  ? "bg-pml-accent/10 text-pml-accent"
                  : "bg-green-500/15 text-green-500"
              }`}
            >
              {displayMode === "tool" ? "Tool" : "Capability"}
            </span>
            <h3
              id="code-panel-title"
              class="m-0 text-pml-text text-base font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
              title={tool?.label || capability?.label}
            >
              {tool?.label || capability?.label}
            </h3>

            {/* Inline stats - different for tool vs capability */}
            <div class="flex gap-4 text-[0.8125rem] shrink-0">
              {displayMode === "tool" && tool && (
                <>
                  <span
                    class="font-semibold px-2 py-0.5 rounded"
                    style={{
                      color: getColor(tool.server),
                      background: `${getColor(tool.server)}20`,
                    }}
                    title="MCP Server"
                  >
                    {tool.server}
                  </span>
                  {tool.observedCount !== undefined && tool.observedCount > 0 && (
                    <span class="text-pml-text-muted" title="Observed usage">
                      {tool.observedCount}x used
                    </span>
                  )}
                  {tool.parentCapabilities && tool.parentCapabilities.length > 0 && (
                    <span class="text-pml-text-dim" title="Parent capabilities">
                      {tool.parentCapabilities.length} capabilities
                    </span>
                  )}
                </>
              )}
              {displayMode === "capability" && capability && (
                <>
                  <span
                    class={`font-semibold ${
                      capability.successRate >= 0.8
                        ? "text-green-500"
                        : capability.successRate >= 0.5
                        ? "text-amber-500"
                        : "text-red-500"
                    }`}
                    title="Success rate"
                  >
                    {(capability.successRate * 100).toFixed(0)}%
                  </span>
                  <span class="text-pml-text-muted" title="Usage count">
                    {capability.usageCount}x
                  </span>
                  <span class="text-pml-text-dim" title="Tools count">
                    {capability.toolsCount} tools
                  </span>
                  {/* Story 16.6: UI components badge */}
                  {hasCollectedUis && (
                    <span
                      class="text-[#4ECDC4] text-xs px-1.5 py-0.5 bg-[#4ECDC4]/15 rounded"
                      title="UI components from MCP Apps"
                    >
                      {collectedUis?.length} UI{(collectedUis?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                  )}
                  {capability.communityId !== undefined && (
                    <span
                      class="text-pml-accent text-xs px-1.5 py-0.5 bg-pml-accent/10 rounded"
                      title="Community cluster"
                    >
                      C{capability.communityId}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close panel"
            class="bg-transparent border-none text-pml-text-dim cursor-pointer px-2 py-1 text-xl leading-none rounded transition-all duration-150 hover:bg-pml-bg-surface hover:text-pml-text"
          >
            ✕
          </button>
        </div>

        {/* Story 16.6: Composite UI Viewer (shown when capability has collected UIs) */}
        {displayMode === "capability" && hasCollectedUis && collectedUis && (
          <CompositeUiViewer
            collectedUis={collectedUis}
            orchestration={uiOrchestration ?? {
              layout: "stack",
              sync: [],
              panelOrder: collectedUis.map((_, i) => i),
            }}
            onOrchestrationChange={(newOrchestration) => {
              setUiOrchestration(newOrchestration);
              // TODO: Persist to API
              // fetch(`/api/capabilities/${capability.id}/uis`, {
              //   method: 'PUT',
              //   headers: { 'Content-Type': 'application/json' },
              //   body: JSON.stringify(newOrchestration),
              // });
            }}
            height={Math.max(200, panelHeight - 150)}
            getServerColor={getServerColor}
            // Pass trace results from selected trace to replay in UIs
            traceResults={(() => {
              const selectedTrace = capability?.traces?.[selectedTraceIndex];
              if (!selectedTrace?.taskResults) return undefined;

              const resultsMap = new Map<string, ToolTraceResult>();
              for (const task of selectedTrace.taskResults) {
                resultsMap.set(task.tool, {
                  tool: task.tool,
                  args: task.args,
                  result: task.result,
                  success: task.success,
                });
              }
              return resultsMap;
            })()}
          />
        )}

        {/* Story 16.6: Collapsible toggle for code section when UIs present */}
        {displayMode === "capability" && hasCollectedUis && (
          <button
            onClick={() => setCodeCollapsed(!codeCollapsed)}
            class="px-3 py-1 rounded-none border-none border-b border-pml-border bg-pml-bg-surface text-pml-text-muted text-[0.7rem] cursor-pointer flex items-center gap-1.5 w-full justify-center"
          >
            <span
              class="transition-transform duration-150"
              style={{ transform: codeCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
            >
              ▼
            </span>
            {codeCollapsed ? "Show Code & Traces" : "Hide Code & Traces"}
          </button>
        )}

        {/* Content - Story 11.4: Split layout for Definition (left) + Invocation (right) */}
        <div
          class={`flex-1 overflow-hidden flex-row gap-0 ${codeCollapsed ? "hidden" : "flex"}`}
        >
          {/* Left Side: Definition (code, stats, tools) */}
          <div
            class={`overflow-auto p-4 flex flex-col gap-3 ${
              displayMode === "capability" && capability?.traces?.length
                ? "w-1/2 border-r border-pml-border"
                : "w-full"
            }`}
          >
            {/* Code Section */}
            <div class="bg-pml-bg rounded-lg border border-pml-border overflow-hidden flex-1 flex flex-col">
              {/* Code header with line numbers toggle */}
              <div class="px-3 py-2 border-b border-pml-border flex justify-between items-center text-xs text-pml-text-dim">
                <span class="uppercase tracking-wide">
                  {displayMode === "tool" ? "Input Schema (JSON)" : contentLanguage}
                </span>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLineNumbers}
                    onChange={(e) => setShowLineNumbers((e.target as HTMLInputElement).checked)}
                    class="accent-pml-accent"
                  />
                  Line numbers
                </label>
              </div>

              {/* Code content */}
              <div class="flex-1 overflow-auto p-3">
                {displayContent
                  ? (
                    <pre class="code-block m-0 font-mono text-[13px] leading-relaxed text-pml-text whitespace-pre overflow-x-auto">
                  <code class="table w-full">
                    {contentLines.map((line, index) => (
                      <div
                        key={index}
                        class="table-row"
                      >
                        {showLineNumbers && (
                          <span class="table-cell pr-4 text-right text-pml-text-dim select-none w-[1%] whitespace-nowrap">
                            {index + 1}
                          </span>
                        )}
                        <span class="table-cell">
                          {highlightCode(line || " ", contentLanguage)}
                        </span>
                      </div>
                    ))}
                  </code>
                    </pre>
                  )
                  : (
                    <div class="text-pml-text-dim italic p-6 text-center">
                      {displayMode === "tool"
                        ? "No input schema available"
                        : "No code snippet available"}
                    </div>
                  )}
              </div>
            </div>

            {/* Actions + Info Row */}
            <div class="flex justify-between items-start gap-4 flex-wrap">
              {/* Actions */}
              <div class="flex gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!displayContent}
                  class={`px-4 py-2 rounded-lg border-none font-semibold text-sm flex items-center gap-1.5 transition-all duration-150 ${
                    copied
                      ? "bg-green-500 text-pml-bg cursor-pointer"
                      : displayContent
                      ? "bg-pml-accent text-pml-bg cursor-pointer hover:opacity-90"
                      : "bg-pml-accent text-pml-bg cursor-not-allowed opacity-50"
                  }`}
                >
                  {copied
                    ? (
                      <>
                        <span>✓</span> Copied!
                      </>
                    )
                    : (
                      <>
                        <span>📋</span> {displayMode === "tool" ? "Copy Schema" : "Copy Code"}
                      </>
                    )}
                </button>

                {/* Run button - enabled for tools (future), disabled for capabilities */}
                <button
                  disabled={displayMode !== "tool"}
                  title={displayMode === "tool"
                    ? "Run this tool (Coming soon)"
                    : "Coming soon - Story 8.5"}
                  class={`px-4 py-2 rounded-lg font-medium text-sm cursor-not-allowed ${
                    displayMode === "tool"
                      ? "border border-pml-accent bg-pml-accent/10 text-pml-accent opacity-80"
                      : "border border-pml-border bg-pml-bg-surface text-pml-text-dim opacity-60"
                  }`}
                >
                  ▶ {displayMode === "tool" ? "Run Tool" : "Try This"}
                </button>
              </div>

              {/* Tool description (for tool mode) */}
              {displayMode === "tool" && tool?.description && (
                <div class="flex-1 min-w-[200px] px-3 py-2 bg-pml-bg-surface rounded-md text-[0.8125rem] text-pml-text-muted leading-snug">
                  {tool.description}
                </div>
              )}

              {/* Tools used (for capability mode) */}
              {displayMode === "capability" && capability?.toolIds &&
                capability.toolIds.length > 0 && (
                <div class="flex gap-1.5 flex-wrap items-center">
                  <span class="text-xs text-pml-text-dim uppercase tracking-wide">
                    Tools:
                  </span>
                  {capability.toolIds.map((toolId) => {
                    const { namespace: server, action: name } = parseToolId(toolId);
                    const color = getColor(server);

                    return (
                      <button
                        key={toolId}
                        onClick={() => onToolClick?.(toolId)}
                        title={`${server}:${name} - Click to highlight in graph`}
                        class="px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all duration-150"
                        style={{
                          border: `1px solid ${color}40`,
                          background: `${color}15`,
                          color: color,
                          cursor: onToolClick ? "pointer" : "default",
                        }}
                        onMouseOver={(e) => {
                          if (onToolClick) {
                            e.currentTarget.style.background = `${color}30`;
                            e.currentTarget.style.transform = "translateY(-1px)";
                          }
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = `${color}15`;
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        <span
                          class="w-1.5 h-1.5 rounded-full"
                          style={{ background: color }}
                        />
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Additional metadata */}
            {displayMode === "capability" && capability &&
              (capability.lastUsedAt || capability.createdAt) && (
              <div class="flex gap-4 text-xs text-pml-text-dim pt-2 border-t border-pml-border">
                {capability.lastUsedAt && (
                  <span>Last used: {formatRelativeTime(capability.lastUsedAt)}</span>
                )}
                {capability.createdAt && (
                  <span>Created: {formatRelativeTime(capability.createdAt)}</span>
                )}
              </div>
            )}
            {displayMode === "tool" && tool?.parentCapabilities &&
              tool.parentCapabilities.length > 0 && (
              <div class="flex gap-2 items-center text-xs text-pml-text-dim pt-2 border-t border-pml-border flex-wrap">
                <span class="uppercase tracking-wide">
                  Used by:
                </span>
                {tool.parentCapabilities.slice(0, 5).map((capId) => (
                  <span
                    key={capId}
                    class="px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 text-[0.7rem]"
                  >
                    {capId.replace("cap:", "")}
                  </span>
                ))}
                {tool.parentCapabilities.length > 5 && (
                  <span class="text-pml-text-dim">
                    +{tool.parentCapabilities.length - 5} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right Side: Invocation (trace selector + timeline) - Story 11.4 */}
          {displayMode === "capability" && capability?.traces && capability.traces.length > 0 && (
            <div class="w-1/2 overflow-auto p-4 flex flex-col gap-3">
              <TraceSelector
                traces={capability.traces}
                selectedIndex={selectedTraceIndex}
                onSelect={setSelectedTraceIndex}
              />
              {capability.traces[selectedTraceIndex] && (
                <TraceTimeline
                  trace={capability.traces[selectedTraceIndex]}
                  getServerColor={getServerColor}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
