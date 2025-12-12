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

import { useEffect, useState } from "preact/hooks";
import { highlightCode, detectLanguage, syntaxHighlightStyles } from "../lib/syntax-highlight.ts";
import type { CapabilityData } from "./D3GraphVisualization.tsx";

// Re-export for convenience
export type { CapabilityData };

interface CodePanelProps {
  /** Capability data to display (null hides panel) */
  capability: CapabilityData | null;
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
  "#FFB86F", "#FF6B6B", "#4ECDC4", "#FFE66D",
  "#95E1D3", "#F38181", "#AA96DA", "#FCBAD3",
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
export default function CodePanel({
  capability,
  onClose,
  onToolClick,
  getServerColor,
}: CodePanelProps) {
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      // Ctrl/Cmd+C to copy when panel is focused
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && capability?.codeSnippet) {
        // Only copy if no text is selected
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
          handleCopy();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, capability]);

  // Reset copied state when capability changes
  useEffect(() => {
    setCopied(false);
  }, [capability?.id]);

  if (!capability) return null;

  /**
   * Copy code to clipboard
   */
  const handleCopy = async () => {
    if (!capability.codeSnippet) return;

    try {
      await navigator.clipboard.writeText(capability.codeSnippet);
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

  /**
   * Parse tool ID to extract server and tool name
   */
  const parseToolId = (toolId: string): { server: string; name: string } => {
    const match = toolId.match(/^([^:]+):(.+)$/);
    if (match) {
      return { server: match[1], name: match[2] };
    }
    return { server: "unknown", name: toolId };
  };

  // Detect language from code
  const language = capability.codeSnippet ? detectLanguage(capability.codeSnippet) : "typescript";

  // Split code into lines for line numbers
  const codeLines = capability.codeSnippet?.split("\n") || [];

  return (
    <>
      {/* Inject syntax highlighting styles */}
      <style>{syntaxHighlightStyles}</style>

      {/* Slide-up animation */}
      <style>{`
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
      `}</style>

      <div
        class="code-panel"
        role="region"
        aria-labelledby="code-panel-title"
        tabIndex={0}
        style={{
          width: "100%",
          height: "35vh",
          minHeight: "200px",
          maxHeight: "400px",
          background: "var(--bg-elevated, #12110f)",
          borderTop: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
          display: "flex",
          flexDirection: "column",
          animation: "slideUp 300ms ease-out",
          position: "relative",
          zIndex: 100,
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          class="panel-header"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
            <h3
              id="code-panel-title"
              style={{
                margin: 0,
                color: "var(--text, #f5f0ea)",
                fontSize: "1rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={capability.label}
            >
              {capability.label}
            </h3>

            {/* Inline stats */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                fontSize: "0.8125rem",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  color: capability.successRate >= 0.8
                    ? "var(--success, #22c55e)"
                    : capability.successRate >= 0.5
                    ? "var(--warning, #f59e0b)"
                    : "var(--error, #ef4444)",
                  fontWeight: 600,
                }}
                title="Success rate"
              >
                {(capability.successRate * 100).toFixed(0)}%
              </span>
              <span style={{ color: "var(--text-muted, #d5c3b5)" }} title="Usage count">
                {capability.usageCount}x
              </span>
              <span style={{ color: "var(--text-dim, #8a8078)" }} title="Tools count">
                {capability.toolsCount} tools
              </span>
              {capability.communityId !== undefined && (
                <span
                  style={{
                    color: "var(--accent, #FFB86F)",
                    fontSize: "0.75rem",
                    padding: "2px 6px",
                    background: "var(--accent-dim, rgba(255, 184, 111, 0.1))",
                    borderRadius: "4px",
                  }}
                  title="Community cluster"
                >
                  C{capability.communityId}
                </span>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-dim, #8a8078)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: "1.25rem",
              lineHeight: 1,
              borderRadius: "4px",
              transition: "all 0.15s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "var(--bg-surface, #1a1816)";
              e.currentTarget.style.color = "var(--text, #f5f0ea)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-dim, #8a8078)";
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Code Section */}
          <div
            style={{
              background: "var(--bg, #0a0908)",
              borderRadius: "8px",
              border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
              overflow: "hidden",
              flex: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Code header with line numbers toggle */}
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.75rem",
                color: "var(--text-dim, #8a8078)",
              }}
            >
              <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {language}
              </span>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={showLineNumbers}
                  onChange={(e) => setShowLineNumbers((e.target as HTMLInputElement).checked)}
                  style={{ accentColor: "var(--accent, #FFB86F)" }}
                />
                Line numbers
              </label>
            </div>

            {/* Code content */}
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "12px",
              }}
            >
              {capability.codeSnippet ? (
                <pre
                  class="code-block"
                  style={{
                    margin: 0,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    fontSize: "13px",
                    lineHeight: "1.5",
                    color: "var(--text, #f5f0ea)",
                    whiteSpace: "pre",
                    overflowX: "auto",
                  }}
                >
                  <code style={{ display: "table", width: "100%" }}>
                    {codeLines.map((line, index) => (
                      <div
                        key={index}
                        style={{
                          display: "table-row",
                        }}
                      >
                        {showLineNumbers && (
                          <span
                            style={{
                              display: "table-cell",
                              paddingRight: "16px",
                              textAlign: "right",
                              color: "var(--text-dim, #8a8078)",
                              userSelect: "none",
                              width: "1%",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {index + 1}
                          </span>
                        )}
                        <span style={{ display: "table-cell" }}>
                          {highlightCode(line || " ", language)}
                        </span>
                      </div>
                    ))}
                  </code>
                </pre>
              ) : (
                <div
                  style={{
                    color: "var(--text-dim, #8a8078)",
                    fontStyle: "italic",
                    padding: "24px",
                    textAlign: "center",
                  }}
                >
                  No code snippet available
                </div>
              )}
            </div>
          </div>

          {/* Actions + Tools Row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {/* Actions */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleCopy}
                disabled={!capability.codeSnippet}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: copied
                    ? "var(--success, #22c55e)"
                    : "var(--accent, #FFB86F)",
                  color: "var(--bg, #0a0908)",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: capability.codeSnippet ? "pointer" : "not-allowed",
                  opacity: capability.codeSnippet ? 1 : 0.5,
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {copied ? (
                  <>
                    <span>✓</span> Copied!
                  </>
                ) : (
                  <>
                    <span>📋</span> Copy Code
                  </>
                )}
              </button>

              <button
                disabled
                title="Coming soon - Story 8.5"
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
                  background: "var(--bg-surface, #1a1816)",
                  color: "var(--text-dim, #8a8078)",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  cursor: "not-allowed",
                  opacity: 0.6,
                }}
              >
                ▶ Try This
              </button>
            </div>

            {/* Tools used */}
            {capability.toolIds && capability.toolIds.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  flexWrap: "wrap",
                  alignItems: "center",
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
                  Tools:
                </span>
                {capability.toolIds.map((toolId) => {
                  const { server, name } = parseToolId(toolId);
                  const color = getColor(server);

                  return (
                    <button
                      key={toolId}
                      onClick={() => onToolClick?.(toolId)}
                      title={`${server}:${name} - Click to highlight in graph`}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: `1px solid ${color}40`,
                        background: `${color}15`,
                        color: color,
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        cursor: onToolClick ? "pointer" : "default",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
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
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: color,
                        }}
                      />
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Additional metadata (last used, created) */}
          {(capability.lastUsedAt || capability.createdAt) && (
            <div
              style={{
                display: "flex",
                gap: "16px",
                fontSize: "0.75rem",
                color: "var(--text-dim, #8a8078)",
                paddingTop: "8px",
                borderTop: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
              }}
            >
              {capability.lastUsedAt && (
                <span>Last used: {formatRelativeTime(capability.lastUsedAt)}</span>
              )}
              {capability.createdAt && (
                <span>Created: {formatRelativeTime(capability.createdAt)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
