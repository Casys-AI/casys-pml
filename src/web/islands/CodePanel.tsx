import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { detectLanguage, highlightCode, syntaxHighlightStyles } from "../lib/syntax-highlight.ts";
import type {
  CapabilityData,
  ExecutionTrace,
  ToolData,
  TraceTaskResult,
} from "./CytoscapeGraph.tsx";
import TraceSelector from "../components/ui/molecules/TraceSelector.tsx";
import TraceTimeline from "../components/ui/molecules/TraceTimeline.tsx";
import { parseToolId } from "../../capabilities/tool-id-utils.ts";

export type { CapabilityData, ExecutionTrace, ToolData, TraceTaskResult };

interface CodePanelProps {
  capability: CapabilityData | null;
  tool?: ToolData | null;
  onClose: () => void;
  onToolClick?: (toolId: string) => void;
  getServerColor?: (server: string) => string;
}

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

const MIN_PANEL_HEIGHT = 150;
const DEFAULT_MAX_HEIGHT = 800;
const DEFAULT_PANEL_HEIGHT = 300;

const getMaxPanelHeight = () =>
  typeof window !== "undefined" ? globalThis.innerHeight * 0.8 : DEFAULT_MAX_HEIGHT;

export default function CodePanel({
  capability,
  tool,
  onClose,
  onToolClick,
  getServerColor,
}: CodePanelProps) {
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [selectedTraceIndex, setSelectedTraceIndex] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  const [panelHeight, setPanelHeight] = useState(() => {
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
  const panelRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const displayMode = tool ? "tool" : capability ? "capability" : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && capability?.codeSnippet) {
        const selection = globalThis.getSelection();
        if (!selection || selection.toString().length === 0) {
          handleCopy();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, capability]);

  useEffect(() => {
    setCopied(false);
  }, [capability?.id, tool?.id]);

  useEffect(() => {
    if (typeof window !== "undefined" && panelHeight !== DEFAULT_PANEL_HEIGHT) {
      localStorage.setItem("codePanelHeight", String(panelHeight));
    }
  }, [panelHeight]);

  useEffect(() => {
    const timer = setTimeout(() => setHasAnimated(true), 350);
    return () => clearTimeout(timer);
  }, []);

  const handleResizeStart = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = "touches" in e ? e.touches[0].clientY : e.clientY;
    startHeightRef.current = panelHeight;

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }, [panelHeight]);

  const handleResizeMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isResizing) return;

    const currentY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaY = startYRef.current - currentY;
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

  const displayContent = tool
    ? JSON.stringify(tool.inputSchema || {}, null, 2)
    : capability?.codeSnippet || "";

  const contentLanguage = tool ? "json" : detectLanguage(displayContent);

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

  const getColor = (server: string): string => {
    if (getServerColor) return getServerColor(server);
    const hash = server.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
  };

  const contentLines = displayContent?.split("\n") || [];

  return (
    <>
      <style>{syntaxHighlightStyles}</style>

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
        .animate-slide-up {
          animation: slideUp 300ms ease-out;
        }
      `}
      </style>

      <div
        ref={panelRef}
        class={`w-full bg-stone-900 border-t border-amber-400/10 flex flex-col relative z-[100] outline-none ${
          hasAnimated ? "" : "animate-slide-up"
        }`}
        role="region"
        aria-labelledby="code-panel-title"
        tabIndex={0}
        style={{
          height: `${panelHeight}px`,
          minHeight: `${MIN_PANEL_HEIGHT}px`,
          maxHeight: `${getMaxPanelHeight()}px`,
        }}
      >
        <div
          onMouseDown={handleResizeStart as any}
          onTouchStart={handleResizeStart as any}
          class="absolute top-0 left-0 right-0 h-2 cursor-ns-resize flex justify-center items-center z-10"
          title="Drag to resize"
        >
          <div
            class={`w-10 h-1 rounded-full transition-colors ${
              isResizing ? "bg-amber-400" : "bg-amber-400/20 hover:bg-amber-400"
            }`}
          />
        </div>

        <div class="px-4 py-3 pt-4 border-b border-amber-400/10 flex justify-between items-center shrink-0">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <span
              class={`px-2 py-0.5 rounded text-[0.7rem] font-semibold uppercase tracking-wider ${
                displayMode === "tool"
                  ? "bg-amber-400/10 text-amber-400"
                  : "bg-green-500/15 text-green-500"
              }`}
            >
              {displayMode === "tool" ? "Tool" : "Capability"}
            </span>
            <h3
              id="code-panel-title"
              class="m-0 text-stone-100 text-base font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
              title={tool?.label || capability?.label}
            >
              {tool?.label || capability?.label}
            </h3>

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
                    <span class="text-stone-300" title="Observed usage">
                      {tool.observedCount}x used
                    </span>
                  )}
                  {tool.parentCapabilities && tool.parentCapabilities.length > 0 && (
                    <span class="text-stone-500" title="Parent capabilities">
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
                  <span class="text-stone-300" title="Usage count">
                    {capability.usageCount}x
                  </span>
                  <span class="text-stone-500" title="Tools count">
                    {capability.toolsCount} tools
                  </span>
                  {capability.communityId !== undefined && (
                    <span
                      class="text-amber-400 text-xs px-1.5 py-0.5 bg-amber-400/10 rounded"
                      title="Community cluster"
                    >
                      C{capability.communityId}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close panel"
            class="bg-transparent border-none text-stone-500 cursor-pointer px-2 py-1 text-xl leading-none rounded transition-all hover:bg-stone-800 hover:text-stone-100"
          >
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-hidden flex flex-row">
          <div
            class={`overflow-auto p-4 flex flex-col gap-3 ${
              displayMode === "capability" && capability?.traces?.length
                ? "w-1/2 border-r border-amber-400/10"
                : "w-full"
            }`}
          >
            <div class="bg-stone-950 rounded-lg border border-amber-400/10 overflow-hidden flex-1 flex flex-col">
              <div class="px-3 py-2 border-b border-amber-400/10 flex justify-between items-center text-xs text-stone-500">
                <span class="uppercase tracking-wider">
                  {displayMode === "tool" ? "Input Schema (JSON)" : contentLanguage}
                </span>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLineNumbers}
                    onChange={(e) => setShowLineNumbers((e.target as HTMLInputElement).checked)}
                    class="accent-amber-400"
                  />
                  Line numbers
                </label>
              </div>

              <div class="flex-1 overflow-auto p-3">
                {displayContent ? (
                  <pre class="m-0 font-mono text-[13px] leading-normal text-stone-100 whitespace-pre overflow-x-auto">
                    <code class="table w-full">
                      {contentLines.map((line, index) => (
                        <div key={index} class="table-row">
                          {showLineNumbers && (
                            <span class="table-cell pr-4 text-right text-stone-500 select-none w-[1%] whitespace-nowrap">
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
                ) : (
                  <div class="text-stone-500 italic p-6 text-center">
                    {displayMode === "tool"
                      ? "No input schema available"
                      : "No code snippet available"}
                  </div>
                )}
              </div>
            </div>

            <div class="flex justify-between items-start gap-4 flex-wrap">
              <div class="flex gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!displayContent}
                  class={`px-4 py-2 rounded-lg border-none font-semibold text-sm flex items-center gap-1.5 transition-all ${
                    copied
                      ? "bg-green-500 text-stone-950 cursor-pointer"
                      : displayContent
                      ? "bg-amber-400 text-stone-950 cursor-pointer"
                      : "bg-amber-400/50 text-stone-950 cursor-not-allowed opacity-50"
                  }`}
                >
                  {copied ? (
                    <>
                      <span>✓</span> Copied!
                    </>
                  ) : (
                    <>
                      <span>📋</span> {displayMode === "tool" ? "Copy Schema" : "Copy Code"}
                    </>
                  )}
                </button>

                <button
                  disabled={displayMode !== "tool"}
                  title={displayMode === "tool"
                    ? "Run this tool (Coming soon)"
                    : "Coming soon - Story 8.5"}
                  class={`px-4 py-2 rounded-lg font-medium text-sm cursor-not-allowed ${
                    displayMode === "tool"
                      ? "border border-amber-400 bg-amber-400/10 text-amber-400 opacity-80"
                      : "border border-amber-400/10 bg-stone-800 text-stone-500 opacity-60"
                  }`}
                >
                  ▶ {displayMode === "tool" ? "Run Tool" : "Try This"}
                </button>
              </div>

              {displayMode === "tool" && tool?.description && (
                <div class="flex-1 min-w-[200px] px-3 py-2 bg-stone-800 rounded-md text-[0.8125rem] text-stone-300 leading-snug">
                  {tool.description}
                </div>
              )}

              {displayMode === "capability" && capability?.toolIds &&
                capability.toolIds.length > 0 && (
                <div class="flex gap-1.5 flex-wrap items-center">
                  <span class="text-xs text-stone-500 uppercase tracking-wider">
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
                        class="px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all hover:-translate-y-px"
                        style={{
                          border: `1px solid ${color}40`,
                          background: `${color}15`,
                          color: color,
                          cursor: onToolClick ? "pointer" : "default",
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

            {displayMode === "capability" && capability &&
              (capability.lastUsedAt || capability.createdAt) && (
              <div class="flex gap-4 text-xs text-stone-500 pt-2 border-t border-amber-400/10">
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
              <div class="flex gap-2 items-center text-xs text-stone-500 pt-2 border-t border-amber-400/10 flex-wrap">
                <span class="uppercase tracking-wider">
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
                  <span class="text-stone-500">
                    +{tool.parentCapabilities.length - 5} more
                  </span>
                )}
              </div>
            )}
          </div>

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
