/**
 * CapabilityDetailPanel - Capability detail view with code and tools
 *
 * Split layout component:
 * - Left: Code implementation
 * - Right: Parameters + Tools used
 *
 * @module web/components/shared/CapabilityDetailPanel
 */

import { useMemo } from "preact/hooks";
import CodeBlock from "../ui/atoms/CodeBlock.tsx";
import InputSchema from "../ui/atoms/InputSchema.tsx";
import ToolBadge from "../ui/atoms/ToolBadge.tsx";
import { parseToolId } from "../../../capabilities/tool-id-utils.ts";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ParametersSchema {
  type: string;
  properties?: Record<string, {
    type: string;
    examples?: unknown[];
    description?: string;
  }>;
  required?: string[];
}

export interface CapabilityData {
  name: string;
  action: string | null;
  namespace: string | null;
  description: string | null;
  routing: "local" | "cloud";
  code: string | null;
  toolsUsed: string[];
  inputSchema: ParametersSchema | null;
}

interface CapabilityDetailPanelProps {
  capability: CapabilityData;
  onClose: () => void;
  detailHref?: string;
  loading?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CapabilityDetailPanel({
  capability,
  onClose,
  detailHref,
  loading = false,
}: CapabilityDetailPanelProps) {
  // Group tools by server
  const groupedTools = useMemo(() => {
    if (!capability.toolsUsed?.length) return new Map<string, string[]>();

    const groups = new Map<string, Set<string>>();
    for (const tool of capability.toolsUsed) {
      const { namespace: server, action } = parseToolId(tool);
      if (!groups.has(server)) {
        groups.set(server, new Set());
      }
      groups.get(server)!.add(action);
    }

    const result = new Map<string, string[]>();
    for (const [server, actions] of groups) {
      result.set(server, [...actions].sort());
    }
    return result;
  }, [capability.toolsUsed]);

  const displayName = capability.namespace && capability.action
    ? `${capability.namespace}:${capability.action}`
    : capability.action || capability.name;

  const hasCode = !!capability.code;
  const hasParams = capability.inputSchema?.properties && Object.keys(capability.inputSchema.properties).length > 0;
  const hasTools = groupedTools.size > 0;
  const hasSidebar = hasParams || hasTools;

  return (
    <>
      <div class={`cdp-panel ${hasSidebar ? "with-sidebar" : ""}`}>
        {/* Header */}
        <div class="cdp-header">
          <div class="cdp-title-row">
            <code class="cdp-name">{displayName}</code>
            <div class="cdp-badges">
              <span class="cdp-badge cap">⚡ Capability</span>
              <span class={`cdp-badge routing ${capability.routing}`}>
                {capability.routing === "cloud" ? "☁️ Cloud" : "💻 Local"}
              </span>
            </div>
            <button type="button" class="cdp-close" onClick={onClose}>
              ×
            </button>
          </div>
          <p class="cdp-desc">{capability.description || "No description"}</p>
        </div>

        {/* Content */}
        <div class="cdp-content">
          {/* Code section */}
          <div class="cdp-code-section">
            <div class="cdp-section-header">
              <span class="cdp-section-label">Implementation</span>
            </div>
            {loading ? (
              <div class="cdp-loading">
                <div class="cdp-spinner" />
                Loading...
              </div>
            ) : hasCode ? (
              <div class="cdp-code-wrapper">
                <CodeBlock code={capability.code!} />
              </div>
            ) : (
              <div class="cdp-empty">No code available</div>
            )}
          </div>

          {/* Sidebar: params + tools */}
          {hasSidebar && (
            <div class="cdp-sidebar">
              {/* Parameters */}
              {hasParams && (
                <div class="cdp-params-section">
                  <div class="cdp-section-header">
                    <span class="cdp-section-label">Parameters</span>
                    <span class="cdp-section-count">
                      {Object.keys(capability.inputSchema!.properties!).length}
                    </span>
                  </div>
                  <div class="cdp-params-content">
                    <InputSchema schema={capability.inputSchema!} />
                  </div>
                </div>
              )}

              {/* Tools used */}
              {hasTools && (
                <div class="cdp-tools-section">
                  <div class="cdp-section-header tools">
                    <span class="cdp-section-label">Tools Used</span>
                    <span class="cdp-section-count">{capability.toolsUsed.length}</span>
                  </div>
                  <div class="cdp-tools-groups">
                    {[...groupedTools.entries()].map(([server, actions]) => (
                      <div key={server} class="cdp-tools-group">
                        <div class="cdp-tools-server">{server}</div>
                        <div class="cdp-tools-list">
                          {actions.map((action) => (
                            <ToolBadge key={`${server}:${action}`} tool={`${server}:${action}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Link to full page */}
        {detailHref && (
          <div class="cdp-actions">
            <a href={detailHref} class="cdp-link">
              Voir la page complète →
            </a>
          </div>
        )}
      </div>

      <style>
        {`
        /* ━━━━━━━━ Capability Detail Panel ━━━━━━━━ */
        .cdp-panel {
          margin-top: 0.75rem;
          background: #0f0f12;
          border: 1px solid rgba(74, 222, 128, 0.15);
          border-radius: 10px;
          overflow: hidden;
          animation: cdpSlideUp 0.2s ease-out;
        }

        @keyframes cdpSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .cdp-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(74, 222, 128, 0.08);
        }

        .cdp-title-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .cdp-name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #4ade80;
        }

        .cdp-badges {
          display: flex;
          gap: 0.375rem;
          flex: 1;
        }

        .cdp-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.125rem 0.5rem;
          font-size: 0.625rem;
          font-family: 'Geist Mono', monospace;
          font-weight: 500;
          border-radius: 4px;
        }

        .cdp-badge.cap {
          background: rgba(74, 222, 128, 0.12);
          color: #4ade80;
          border: 1px solid rgba(74, 222, 128, 0.25);
        }

        .cdp-badge.routing {
          background: rgba(74, 222, 128, 0.08);
          color: #a8a29e;
          border: 1px solid rgba(74, 222, 128, 0.12);
        }

        .cdp-badge.routing.cloud {
          background: rgba(96, 165, 250, 0.1);
          color: #60a5fa;
          border-color: rgba(96, 165, 250, 0.2);
        }

        .cdp-close {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: #6b6560;
          font-size: 1.25rem;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.15s;
          margin-left: auto;
        }

        .cdp-close:hover {
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
        }

        .cdp-desc {
          font-size: 0.8125rem;
          color: #a8a29e;
          line-height: 1.5;
          margin: 0;
        }

        /* Content */
        .cdp-content {
          display: flex;
          flex-direction: column;
        }

        .cdp-panel.with-sidebar .cdp-content {
          display: grid;
          grid-template-columns: 1fr 260px;
          gap: 1px;
          background: rgba(74, 222, 128, 0.06);
        }

        @media (max-width: 800px) {
          .cdp-panel.with-sidebar .cdp-content {
            grid-template-columns: 1fr;
          }
        }

        .cdp-code-section {
          background: #0f0f12;
          display: flex;
          flex-direction: column;
        }

        .cdp-sidebar {
          background: #0f0f12;
          display: flex;
          flex-direction: column;
        }

        .cdp-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.625rem 1rem;
          border-bottom: 1px solid rgba(74, 222, 128, 0.06);
        }

        .cdp-section-header.tools {
          border-color: rgba(255, 184, 111, 0.08);
        }

        .cdp-section-label {
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
        }

        .cdp-section-count {
          font-size: 0.5625rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
          background: rgba(74, 222, 128, 0.06);
          padding: 0.0625rem 0.25rem;
          border-radius: 2px;
        }

        .cdp-code-wrapper {
          max-height: 300px;
          overflow-y: auto;
        }

        .cdp-loading,
        .cdp-empty {
          padding: 2rem;
          text-align: center;
          color: #6b6560;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .cdp-spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid #2a2a2e;
          border-top-color: #4ade80;
          animation: cdpSpin 0.8s linear infinite;
        }

        @keyframes cdpSpin { to { transform: rotate(360deg); } }

        /* Params */
        .cdp-params-section {
          border-bottom: 1px solid rgba(74, 222, 128, 0.06);
        }

        .cdp-params-content {
          padding: 0.5rem;
          max-height: 200px;
          overflow-y: auto;
        }

        /* Tools */
        .cdp-tools-groups {
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-height: 200px;
          overflow-y: auto;
        }

        .cdp-tools-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .cdp-tools-server {
          font-size: 0.5625rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #FFB86F;
          padding-left: 0.25rem;
        }

        .cdp-tools-list {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        /* Actions */
        .cdp-actions {
          padding: 0.75rem 1.25rem;
          border-top: 1px solid rgba(74, 222, 128, 0.06);
          display: flex;
          justify-content: flex-end;
        }

        .cdp-link {
          font-family: 'Geist Mono', monospace;
          font-size: 0.6875rem;
          color: #4ade80;
          text-decoration: none;
          padding: 0.375rem 0.75rem;
          border: 1px solid rgba(74, 222, 128, 0.25);
          border-radius: 4px;
          transition: all 0.15s;
        }

        .cdp-link:hover {
          background: rgba(74, 222, 128, 0.1);
          border-color: rgba(74, 222, 128, 0.4);
        }
        `}
      </style>
    </>
  );
}
