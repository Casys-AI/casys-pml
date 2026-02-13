/**
 * PreviewFrame - Iframe wrapper for live UI previews
 *
 * Uses AppBridge protocol (same as ServerDetailIsland) to send
 * mock data to the UI component via postMessage.
 *
 * @module web/components/catalog/atoms/PreviewFrame
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { getMockData } from "../../../data/ui-mock-data.ts";

interface PreviewFrameProps {
  /** MCP Apps resource URI (e.g., "ui://mcp-std/table-viewer") */
  resourceUri: string;
  /** Compact mode for thumbnails */
  compact?: boolean;
  /** Height in pixels (ignored if autoResize is true) */
  height?: number;
  /** Auto-resize based on iframe content height */
  autoResize?: boolean;
  /** Minimum height when autoResize is enabled */
  minHeight?: number;
  /** Whether to load immediately or wait for intersection */
  eager?: boolean;
  /** Callback when iframe loads */
  onLoad?: () => void;
}

export default function PreviewFrame({
  resourceUri,
  compact = false,
  height = 200,
  autoResize = false,
  minHeight = 100,
  eager = false,
  onLoad,
}: PreviewFrameProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [isVisible, setIsVisible] = useState(eager);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);

  // Listen for auto-resize messages from iframe
  useEffect(() => {
    if (!autoResize) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "mcp-app-resize" && typeof event.data.height === "number") {
        const iframe = iframeRef.current;
        if (iframe && event.source === iframe.contentWindow) {
          setContentHeight(Math.max(event.data.height, minHeight));
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [autoResize, minHeight]);

  // Intersection observer for lazy loading
  useEffect(() => {
    if (eager || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [eager]);

  // Convert mock data to MCP content format
  const resultToMcpContent = useCallback((result: unknown): Array<{ type: "text"; text: string }> => {
    if (result === null || result === undefined) {
      return [{ type: "text", text: "null" }];
    }
    if (typeof result === "string") {
      return [{ type: "text", text: result }];
    }
    return [{ type: "text", text: JSON.stringify(result, null, 2) }];
  }, []);

  // Setup bridge when iframe becomes visible
  const setupBridge = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      console.warn("[PreviewFrame] No contentWindow");
      return;
    }

    // Clean up existing bridge
    if (bridgeRef.current) {
      bridgeRef.current.close().catch(() => {});
    }

    setStatus("loading");

    // Create new bridge
    const bridge = new AppBridge(
      null,
      { name: "Catalog Preview", version: "1.0.0" },
      { openLinks: {}, logging: {} },
      { hostContext: { theme: "dark", displayMode: "inline" } },
    );

    // Get mock data for this component
    const mockData = getMockData(resourceUri);

    // When UI initializes, send mock data
    bridge.oninitialized = () => {
      setStatus("connected");
      onLoad?.();

      // Send mock data as tool result
      bridge.sendToolResult({
        content: resultToMcpContent(mockData),
        isError: false,
      });
    };

    bridgeRef.current = bridge;

    // Create transport and connect
    const transport = new PostMessageTransport(
      iframe.contentWindow,
      iframe.contentWindow,
    );

    bridge.connect(transport).then(async () => {
      try {
        const resp = await fetch(`/api/ui/resource?uri=${encodeURIComponent(resourceUri)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        iframe.srcdoc = await resp.text();
      } catch (fetchErr) {
        console.error(`[PreviewFrame] Failed to fetch UI HTML:`, fetchErr);
        setStatus("error");
      }
    }).catch((err) => {
      console.error(`[PreviewFrame] Bridge error:`, err);
      setStatus("error");
    });
  }, [resourceUri, resultToMcpContent, onLoad]);

  // Initialize bridge when visible
  useEffect(() => {
    if (!isVisible) return;

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
  }, [isVisible, resourceUri]);

  // Determine actual height: autoResize uses contentHeight, otherwise fixed height
  const actualHeight = autoResize && contentHeight ? contentHeight : height;

  return (
    <div
      ref={containerRef}
      class="preview-frame"
      style={{
        position: "relative",
        width: "100%",
        height: `${actualHeight}px`,
        minHeight: autoResize ? `${minHeight}px` : undefined,
        background: "#0a0a0c",
        borderRadius: compact ? "6px" : "8px",
        overflow: "hidden",
        transition: autoResize ? "height 0.2s ease-out" : undefined,
      }}
    >
      {/* Loading state */}
      {isVisible && status === "loading" && (
        <div class="preview-status preview-status--loading">
          <div class="preview-spinner" />
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div class="preview-status preview-status--error">
          <span class="preview-error-icon">⚠️</span>
          <span>Preview unavailable</span>
        </div>
      )}

      {/* Iframe (always rendered when visible, but src set by bridge) */}
      {isVisible && (
        <iframe
          ref={iframeRef}
          title={`Preview: ${resourceUri}`}
          sandbox="allow-scripts"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: "#0a0a0c",
            opacity: status === "connected" ? 1 : 0,
            transition: "opacity 0.3s ease-out",
            pointerEvents: compact ? "none" : "auto",
          }}
        />
      )}

      {/* Compact mode overlay for non-interactive thumbnails */}
      {compact && (
        <div
          class="preview-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "transparent",
            cursor: "pointer",
          }}
        />
      )}

      <style>
        {`
          .preview-status {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 0.75rem;
            font-family: 'Geist Mono', monospace;
          }

          .preview-status--loading {
            background: linear-gradient(135deg, #0c0c0e 0%, #111114 100%);
          }

          .preview-status--error {
            color: #6b6560;
          }

          .preview-error-icon {
            font-size: 1.5rem;
            opacity: 0.5;
          }

          .preview-spinner {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 2px solid #2a2a2e;
            border-top-color: #4ECDC4;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .preview-frame::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(
              135deg,
              transparent 0%,
              rgba(78, 205, 196, 0.02) 50%,
              transparent 100%
            );
            pointer-events: none;
            opacity: ${status === "connected" ? 0 : 1};
            transition: opacity 0.5s;
          }
        `}
      </style>
    </div>
  );
}
