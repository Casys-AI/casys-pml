/**
 * ToolDetailPanel - Tool detail view with schema and UI preview
 *
 * Split layout component:
 * - Left: Tool info, UI capabilities, input schema
 * - Right: Live UI preview (if tool has UI)
 *
 * @module web/components/shared/ToolDetailPanel
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { getMockData } from "../../data/ui-mock-data.ts";
import SchemaViewer from "./SchemaViewer.tsx";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ToolData {
  name: string;
  description: string | null;
  routing?: "local" | "cloud";
  inputSchema: Record<string, unknown> | null;
  uiMeta: {
    resourceUri: string;
    emits?: string[];
    accepts?: string[];
  } | null;
}

interface ToolDetailPanelProps {
  tool: ToolData;
  onClose: () => void;
  /** Optional link to full page */
  detailHref?: string;
  /** Show loading state for schema */
  schemaLoading?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UI PREVIEW COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function UiPreviewWithBridge({
  resourceUri,
  toolName,
}: {
  resourceUri: string;
  toolName: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");

  const resultToMcpContent = useCallback((result: unknown): Array<{ type: "text"; text: string }> => {
    if (result === null || result === undefined) {
      return [{ type: "text", text: "null" }];
    }
    if (typeof result === "string") {
      return [{ type: "text", text: result }];
    }
    return [{ type: "text", text: JSON.stringify(result, null, 2) }];
  }, []);

  const setupBridge = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    if (bridgeRef.current) {
      bridgeRef.current.close().catch(() => {});
    }

    const bridge = new AppBridge(
      null,
      { name: "Tool Detail Preview", version: "1.0.0" },
      { openLinks: {}, logging: {} },
      { hostContext: { theme: "dark", displayMode: "inline" } },
    );

    const mockData = getMockData(resourceUri);

    bridge.oninitialized = () => {
      setStatus("connected");
      bridge.sendToolResult({
        content: resultToMcpContent(mockData),
        isError: false,
      });
    };

    bridgeRef.current = bridge;

    const transport = new PostMessageTransport(
      iframe.contentWindow,
      iframe.contentWindow,
    );

    bridge.connect(transport).then(() => {
      iframe.src = `/api/ui/resource?uri=${encodeURIComponent(resourceUri)}`;
    }).catch(() => {
      setStatus("error");
    });
  }, [resourceUri, toolName, resultToMcpContent]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      setupBridge();
    }

    return () => {
      if (bridgeRef.current) {
        bridgeRef.current.close().catch(() => {});
        bridgeRef.current = null;
      }
    };
  }, [resourceUri]);

  return (
    <div class="tdp-preview-container">
      <iframe
        ref={iframeRef}
        title={`UI Preview: ${toolName}`}
        sandbox="allow-scripts allow-same-origin"
        class="tdp-iframe"
      />
      {status === "loading" && (
        <div class="tdp-preview-status loading">
          <span class="tdp-status-dot pulse" />
          Connecting...
        </div>
      )}
      {status === "error" && (
        <div class="tdp-preview-status error">
          Connection failed
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ToolDetailPanel({
  tool,
  onClose,
  detailHref,
  schemaLoading = false,
}: ToolDetailPanelProps) {
  const hasUi = !!tool.uiMeta?.resourceUri;

  return (
    <>
      <div class={`tdp-panel ${hasUi ? "with-ui" : ""}`}>
        {/* Left column: Info + Schema */}
        <div class="tdp-info">
          <div class="tdp-header">
            <div class="tdp-title-row">
              <code class="tdp-name">{tool.name}</code>
              <div class="tdp-badges">
                {hasUi && (
                  <span class="tdp-badge ui" title="Has UI Component">
                    <span class="tdp-badge-dot">◉</span> UI
                  </span>
                )}
                {tool.routing === "cloud" && (
                  <span class="tdp-badge cloud">☁ Cloud</span>
                )}
              </div>
              <button type="button" class="tdp-close" onClick={onClose}>
                ×
              </button>
            </div>
            <p class="tdp-desc">{tool.description || "No description"}</p>
          </div>

          {/* UI Capabilities (emits/accepts) */}
          {tool.uiMeta && (tool.uiMeta.emits?.length || tool.uiMeta.accepts?.length) && (
            <div class="tdp-capabilities">
              {tool.uiMeta.emits && tool.uiMeta.emits.length > 0 && (
                <div class="tdp-cap-group">
                  <span class="tdp-cap-label">Emits</span>
                  <div class="tdp-cap-tags">
                    {tool.uiMeta.emits.map((e) => (
                      <span key={e} class="tdp-cap-tag emit">{e}</span>
                    ))}
                  </div>
                </div>
              )}
              {tool.uiMeta.accepts && tool.uiMeta.accepts.length > 0 && (
                <div class="tdp-cap-group">
                  <span class="tdp-cap-label">Accepts</span>
                  <div class="tdp-cap-tags">
                    {tool.uiMeta.accepts.map((a) => (
                      <span key={a} class="tdp-cap-tag accept">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Schema */}
          <div class="tdp-schema-section">
            <div class="tdp-schema-header">
              <span class="tdp-schema-label">Input Schema</span>
              {tool.inputSchema && (
                <span class="tdp-schema-params">
                  {Object.keys((tool.inputSchema as any).properties || {}).length} params
                </span>
              )}
            </div>
            {schemaLoading ? (
              <div class="tdp-schema-loading">
                <div class="tdp-spinner" />
                Loading schema...
              </div>
            ) : tool.inputSchema ? (
              <SchemaViewer schema={tool.inputSchema} />
            ) : (
              <div class="tdp-schema-empty">No parameters required</div>
            )}
          </div>

          {/* Link to full page */}
          {detailHref && (
            <div class="tdp-actions">
              <a href={detailHref} class="tdp-link">
                Voir la page complète →
              </a>
            </div>
          )}
        </div>

        {/* Right column: UI Preview */}
        {hasUi && tool.uiMeta?.resourceUri && (
          <div class="tdp-preview">
            <div class="tdp-preview-header">
              <span class="tdp-preview-label">Component Preview</span>
              <code class="tdp-preview-uri">{tool.uiMeta.resourceUri.replace("ui://mcp-std/", "")}</code>
            </div>
            <div class="tdp-preview-frame">
              <UiPreviewWithBridge
                resourceUri={tool.uiMeta.resourceUri}
                toolName={tool.name}
              />
              <div class="tdp-preview-overlay">
                <span class="tdp-preview-hint">Live component preview</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>
        {`
        /* ━━━━━━━━ Tool Detail Panel ━━━━━━━━ */
        .tdp-panel {
          background: #0f0f12;
          border: 1px solid rgba(255, 184, 111, 0.08);
          border-radius: 10px;
          overflow: hidden;
          animation: tdpSlideUp 0.2s ease-out;
        }

        .tdp-panel.with-ui {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-color: rgba(78, 205, 196, 0.15);
        }

        @media (max-width: 900px) {
          .tdp-panel.with-ui {
            grid-template-columns: 1fr;
          }
        }

        @keyframes tdpSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .tdp-info {
          display: flex;
          flex-direction: column;
        }

        .tdp-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(255, 184, 111, 0.06);
        }

        .tdp-title-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .tdp-name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #FFB86F;
        }

        .tdp-badges {
          display: flex;
          gap: 0.375rem;
          flex: 1;
        }

        .tdp-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.125rem 0.5rem;
          font-size: 0.625rem;
          font-family: 'Geist Mono', monospace;
          font-weight: 500;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .tdp-badge.ui {
          background: rgba(78, 205, 196, 0.12);
          color: #4ECDC4;
          border: 1px solid rgba(78, 205, 196, 0.25);
        }

        .tdp-badge.ui .tdp-badge-dot {
          font-size: 0.5rem;
        }

        .tdp-badge.cloud {
          background: rgba(96, 165, 250, 0.1);
          color: #60a5fa;
          border: 1px solid rgba(96, 165, 250, 0.2);
        }

        .tdp-close {
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

        .tdp-close:hover {
          background: rgba(255, 184, 111, 0.1);
          color: #FFB86F;
        }

        .tdp-desc {
          font-size: 0.8125rem;
          color: #a8a29e;
          line-height: 1.5;
          margin: 0;
        }

        /* UI Capabilities */
        .tdp-capabilities {
          display: flex;
          gap: 1.5rem;
          padding: 0.75rem 1.25rem;
          background: rgba(78, 205, 196, 0.03);
          border-bottom: 1px solid rgba(78, 205, 196, 0.08);
        }

        .tdp-cap-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tdp-cap-label {
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
        }

        .tdp-cap-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
        }

        .tdp-cap-tag {
          font-size: 0.625rem;
          font-family: 'Geist Mono', monospace;
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
        }

        .tdp-cap-tag.emit {
          background: rgba(255, 184, 111, 0.1);
          color: #FFB86F;
        }

        .tdp-cap-tag.accept {
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
        }

        /* Schema section */
        .tdp-schema-section {
          padding: 1rem 1.25rem;
          flex: 1;
          overflow-y: auto;
          max-height: 350px;
        }

        .tdp-schema-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .tdp-schema-label {
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
        }

        .tdp-schema-params {
          font-size: 0.625rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
          background: rgba(255, 184, 111, 0.04);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
        }

        .tdp-schema-empty {
          padding: 1rem;
          text-align: center;
          font-size: 0.75rem;
          color: #6b6560;
          background: rgba(255, 184, 111, 0.02);
          border-radius: 6px;
        }

        .tdp-schema-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1.5rem;
          font-size: 0.75rem;
          color: #6b6560;
        }

        .tdp-spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid #2a2a2e;
          border-top-color: #FFB86F;
          animation: tdpSpin 0.8s linear infinite;
        }

        @keyframes tdpSpin { to { transform: rotate(360deg); } }

        /* Actions */
        .tdp-actions {
          padding: 0.75rem 1.25rem;
          border-top: 1px solid rgba(255, 184, 111, 0.06);
          display: flex;
          justify-content: flex-end;
        }

        .tdp-link {
          font-family: 'Geist Mono', monospace;
          font-size: 0.6875rem;
          color: #FFB86F;
          text-decoration: none;
          padding: 0.375rem 0.75rem;
          border: 1px solid rgba(255, 184, 111, 0.25);
          border-radius: 4px;
          transition: all 0.15s;
        }

        .tdp-link:hover {
          background: rgba(255, 184, 111, 0.1);
          border-color: rgba(255, 184, 111, 0.4);
        }

        /* UI Preview section */
        .tdp-preview {
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, rgba(78, 205, 196, 0.03) 0%, rgba(78, 205, 196, 0.01) 100%);
          border-left: 1px solid rgba(78, 205, 196, 0.1);
        }

        .tdp-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(78, 205, 196, 0.08);
          background: rgba(78, 205, 196, 0.04);
        }

        .tdp-preview-label {
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #4ECDC4;
        }

        .tdp-preview-uri {
          font-size: 0.625rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
          background: rgba(0, 0, 0, 0.2);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
        }

        .tdp-preview-frame {
          flex: 1;
          position: relative;
          min-height: 280px;
          display: flex;
          align-items: stretch;
        }

        .tdp-preview-container {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 280px;
        }

        .tdp-iframe {
          width: 100%;
          height: 100%;
          min-height: 280px;
          border: none;
          background: #1a1a1a;
        }

        .tdp-preview-status {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 0.75rem;
          font-family: 'Geist Mono', monospace;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.8);
        }

        .tdp-preview-status.loading { color: #4ECDC4; }
        .tdp-preview-status.error { color: #f87171; }

        .tdp-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .tdp-status-dot.pulse {
          animation: tdpPulse 1.5s ease-in-out infinite;
        }

        @keyframes tdpPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }

        .tdp-preview-overlay {
          position: absolute;
          bottom: 0.5rem;
          right: 0.5rem;
          pointer-events: none;
        }

        .tdp-preview-hint {
          font-size: 0.5625rem;
          font-family: 'Geist Mono', monospace;
          color: #4a4540;
          background: rgba(0, 0, 0, 0.6);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        `}
      </style>
    </>
  );
}
