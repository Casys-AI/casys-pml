/**
 * CodeToUiCarousel - Hero-style showcase section
 *
 * Split 50/50 layout:
 * - Left: Marketing content (H1, description, CTAs, install command)
 * - Right: Fake chat showing UI output, click to reveal code
 *
 * @module web/islands/CodeToUiCarousel
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CODE_TO_UI_DEMOS, type CodeToUiDemo } from "../content/code-to-ui-demos.ts";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { colors, fonts, rgba } from "../styles/catalog-theme.ts";

/**
 * Simple syntax highlighter for TypeScript/JavaScript
 */
function highlightCode(code: string): string {
  return code
    .replace(/`([^`]*)`/g, '<span class="hl-str">`$1`</span>')
    .replace(/"([^"]*)"/g, '<span class="hl-str">"$1"</span>')
    .replace(/'([^']*)'/g, "<span class=\"hl-str\">'$1'</span>")
    .replace(/\b(const|let|var|await|async|return|for|if|of|in)\b/g, '<span class="hl-kw">$1</span>')
    .replace(/(\w+)\s*\(/g, '<span class="hl-fn">$1</span>(')
    .replace(/(\w+):/g, '<span class="hl-key">$1</span>:')
    .replace(/\b(\d+)\b/g, '<span class="hl-num">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="hl-cm">$1</span>');
}

export default function CodeToUiCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDemo = CODE_TO_UI_DEMOS[activeIndex];

  const highlightedCode = useMemo(
    () => highlightCode(activeDemo.code),
    [activeDemo.code]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
      }
    };
  }, []);

  // Auto-rotate every 12 seconds (pause when showing code)
  useEffect(() => {
    if (isPaused || showCode) return;

    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % CODE_TO_UI_DEMOS.length);
    }, 12000);

    return () => clearInterval(interval);
  }, [isPaused, showCode]);

  const handleDemoSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setShowCode(false);
    setIsPaused(true);

    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
    }
    resumeTimeoutRef.current = setTimeout(() => setIsPaused(false), 20000);
  }, []);

  const toggleCode = useCallback(() => {
    setShowCode((v) => !v);
  }, []);

  return (
    <section
      class="ctu-hero"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div class="ctu-container">
        {/* LEFT: Marketing content */}
        <div class="ctu-left">
          <p class="ctu-eyebrow">MCP Apps</p>

          <h1 class="ctu-title">
            <span class="ctu-title-line">From Code</span>
            <span class="ctu-title-accent">to Interface.</span>
          </h1>

          <p class="ctu-desc">
            Write a few lines of code, get rich interactive dashboards.
            Chain MCP tools, visualize results instantly.
          </p>

          {/* CTA Buttons */}
          <div class="ctu-ctas">
            <a href="/catalog" class="ctu-btn-primary">
              Explorer le catalogue
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </a>
            <a href="https://github.com/anthropics/mcp-apps" class="ctu-btn-secondary" target="_blank" rel="noopener">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </div>

          {/* Install command */}
          <div class="ctu-install">
            <code>npx @anthropic/mcp-apps init</code>
            <button type="button" class="ctu-install-copy" title="Copier">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>

          {/* Demo selector pills */}
          <div class="ctu-demos">
            {CODE_TO_UI_DEMOS.map((demo, i) => (
              <button
                key={demo.id}
                type="button"
                class={`ctu-demo-pill ${i === activeIndex ? "active" : ""}`}
                onClick={() => handleDemoSelect(i)}
              >
                <span class="ctu-demo-icon">{demo.icon}</span>
                <span class="ctu-demo-label">{demo.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: Fake chat with UI output */}
        <div class="ctu-right">
          <div class="ctu-chat-window">
            {/* Chat header */}
            <div class="ctu-chat-header">
              <div class="ctu-chat-dots">
                <span class="dot red" />
                <span class="dot yellow" />
                <span class="dot green" />
              </div>
              <span class="ctu-chat-title">MCP Chat</span>
            </div>

            {/* Chat content - toggles between UI and Code */}
            <div class="ctu-chat-body">
              {showCode ? (
                // Code view
                <div class="ctu-code-view">
                  <div class="ctu-code-header">
                    <span class="ctu-code-filename">workflow.ts</span>
                    <button type="button" class="ctu-code-close" onClick={toggleCode}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  <pre class="ctu-code">
                    <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
                  </pre>
                  <div class="ctu-tools">
                    {activeDemo.tools.map((tool, i) => (
                      <span key={tool} class="ctu-tool">
                        <span class="ctu-tool-check">✓</span>
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                // UI view
                <div class="ctu-ui-view" onClick={toggleCode} title="Cliquer pour voir le code">
                  {/* Assistant message bubble */}
                  <div class="ctu-msg">
                    <div class="ctu-msg-avatar">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                      </svg>
                    </div>
                    <div class="ctu-msg-bubble">
                      <span class="ctu-msg-label">{activeDemo.icon} {activeDemo.title}</span>
                    </div>
                  </div>

                  {/* UI components grid */}
                  <div class="ctu-ui-grid">
                    <UiPreviewGrid demo={activeDemo} />
                  </div>

                  {/* Hint to click */}
                  <div class="ctu-click-hint">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                    Cliquer pour voir le code
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>
        {`
          .ctu-hero {
            min-height: 90vh;
            display: flex;
            align-items: center;
            padding: 6rem 2rem 4rem;
            background: #08080a;
          }

          .ctu-container {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4rem;
            align-items: center;
          }

          @media (max-width: 1024px) {
            .ctu-container {
              grid-template-columns: 1fr;
              gap: 3rem;
            }
            .ctu-left {
              text-align: center;
            }
            .ctu-ctas, .ctu-demos {
              justify-content: center;
            }
          }

          /* === LEFT SIDE === */
          .ctu-left {
            max-width: 520px;
          }

          @media (max-width: 1024px) {
            .ctu-left {
              max-width: 100%;
            }
          }

          .ctu-eyebrow {
            font-family: ${fonts.mono};
            font-size: 0.7rem;
            font-weight: 500;
            color: ${colors.accent};
            text-transform: uppercase;
            letter-spacing: 0.2em;
            margin: 0 0 1.25rem 0;
            opacity: 0;
            animation: fadeUp 0.5s ease forwards;
          }

          .ctu-title {
            font-family: ${fonts.display};
            font-size: clamp(2.25rem, 4.5vw, 3.25rem);
            font-weight: 400;
            line-height: 1.15;
            margin: 0 0 1.5rem 0;
            opacity: 0;
            animation: fadeUp 0.5s ease 0.1s forwards;
          }

          .ctu-title-line {
            display: block;
            color: ${colors.textPrimary};
          }

          .ctu-title-accent {
            display: block;
            color: ${colors.accent};
            font-style: italic;
          }

          .ctu-desc {
            font-size: 1.1rem;
            line-height: 1.7;
            color: #888;
            margin: 0 0 2rem 0;
            opacity: 0;
            animation: fadeUp 0.5s ease 0.2s forwards;
          }

          /* CTAs */
          .ctu-ctas {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 1.5rem;
            opacity: 0;
            animation: fadeUp 0.5s ease 0.3s forwards;
          }

          .ctu-btn-primary {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.875rem 1.5rem;
            font-size: 0.9rem;
            font-weight: 600;
            font-family: 'Geist', sans-serif;
            text-decoration: none;
            border-radius: 8px;
            background: ${colors.accent};
            color: #08080a;
            transition: all 0.2s;
          }

          .ctu-btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px ${rgba(colors.accent, 0.25)};
          }

          .ctu-btn-secondary {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.875rem 1.5rem;
            font-size: 0.9rem;
            font-weight: 500;
            font-family: 'Geist', sans-serif;
            text-decoration: none;
            border-radius: 8px;
            color: #a8a29e;
            border: 1px solid ${rgba(colors.accent, 0.2)};
            transition: all 0.2s;
          }

          .ctu-btn-secondary:hover {
            border-color: ${colors.accent};
            color: ${colors.textPrimary};
          }

          /* Install command */
          .ctu-install {
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.625rem 1rem;
            background: #0f0f12;
            border: 1px solid ${colors.borderSubtle};
            border-radius: 8px;
            margin-bottom: 2rem;
            opacity: 0;
            animation: fadeUp 0.5s ease 0.35s forwards;
          }

          .ctu-install code {
            font-family: ${fonts.mono};
            font-size: 0.8125rem;
            color: ${colors.textSecondary};
          }

          .ctu-install-copy {
            padding: 4px;
            background: transparent;
            border: none;
            color: ${colors.textMuted};
            cursor: pointer;
            transition: color 0.2s;
          }

          .ctu-install-copy:hover {
            color: ${colors.accent};
          }

          /* Demo selector */
          .ctu-demos {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            opacity: 0;
            animation: fadeUp 0.5s ease 0.4s forwards;
          }

          .ctu-demo-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 6px;
            font-family: ${fonts.mono};
            font-size: 0.7rem;
            color: ${colors.textMuted};
            cursor: pointer;
            transition: all 0.2s;
          }

          .ctu-demo-pill:hover {
            color: ${colors.textSecondary};
            background: ${rgba(colors.accent, 0.05)};
          }

          .ctu-demo-pill.active {
            color: ${colors.accent};
            border-color: ${rgba(colors.accent, 0.25)};
            background: ${rgba(colors.accent, 0.08)};
          }

          .ctu-demo-icon {
            font-size: 0.875rem;
          }

          .ctu-demo-label {
            display: none;
          }

          @media (min-width: 600px) {
            .ctu-demo-label {
              display: inline;
            }
          }

          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }

          /* === RIGHT SIDE: Chat Window === */
          .ctu-right {
            opacity: 0;
            animation: fadeUp 0.5s ease 0.3s forwards;
          }

          .ctu-chat-window {
            background: #0a0a0c;
            border: 1px solid ${colors.borderSubtle};
            border-radius: 12px;
            overflow: hidden;
            height: 440px;
            display: flex;
            flex-direction: column;
          }

          .ctu-chat-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            background: #08080a;
            border-bottom: 1px solid ${colors.borderSubtle};
          }

          .ctu-chat-dots {
            display: flex;
            gap: 6px;
          }

          .ctu-chat-dots .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
          }

          .ctu-chat-dots .dot.red { background: #ff5f57; }
          .ctu-chat-dots .dot.yellow { background: #ffbd2e; }
          .ctu-chat-dots .dot.green { background: #28c840; }

          .ctu-chat-title {
            font-family: ${fonts.mono};
            font-size: 0.75rem;
            color: ${colors.textMuted};
            margin-left: auto;
          }

          .ctu-chat-body {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }

          /* === UI VIEW === */
          .ctu-ui-view {
            flex: 1;
            display: flex;
            flex-direction: column;
            cursor: pointer;
            transition: background 0.2s;
          }

          .ctu-ui-view:hover {
            background: ${rgba(colors.accent, 0.02)};
          }

          .ctu-msg {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 12px 16px;
          }

          .ctu-msg-avatar {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            background: ${rgba(colors.accent, 0.15)};
            color: ${colors.accent};
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .ctu-msg-bubble {
            padding: 8px 12px;
            background: #0f0f12;
            border-radius: 8px;
            border: 1px solid ${colors.borderSubtle};
          }

          .ctu-msg-label {
            font-family: ${fonts.mono};
            font-size: 0.75rem;
            color: ${colors.textSecondary};
          }

          .ctu-ui-grid {
            flex: 1;
            padding: 0 12px 12px;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            grid-auto-rows: auto;
            gap: 8px;
            overflow: auto;
            align-content: start;
          }

          .ctu-click-hint {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px;
            font-family: ${fonts.mono};
            font-size: 0.6875rem;
            color: ${colors.textDim};
            border-top: 1px solid ${colors.borderSubtle};
            background: #08080a;
            transition: color 0.2s;
          }

          .ctu-ui-view:hover .ctu-click-hint {
            color: ${colors.accent};
          }

          /* === CODE VIEW === */
          .ctu-code-view {
            flex: 1;
            display: flex;
            flex-direction: column;
            animation: slideIn 0.25s ease;
          }

          @keyframes slideIn {
            from { opacity: 0; transform: translateX(20px); }
            to { opacity: 1; transform: translateX(0); }
          }

          .ctu-code-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 16px;
            background: #0c0c0e;
            border-bottom: 1px solid ${colors.borderSubtle};
          }

          .ctu-code-filename {
            font-family: ${fonts.mono};
            font-size: 0.6875rem;
            color: ${colors.textMuted};
          }

          .ctu-code-close {
            padding: 4px;
            background: transparent;
            border: none;
            color: ${colors.textMuted};
            cursor: pointer;
            transition: color 0.2s;
          }

          .ctu-code-close:hover {
            color: ${colors.accent};
          }

          .ctu-code {
            flex: 1;
            margin: 0;
            padding: 12px 16px;
            font-family: ${fonts.mono};
            font-size: 0.6875rem;
            line-height: 1.7;
            color: ${colors.textSecondary};
            overflow: auto;
            background: #050506;
          }

          .ctu-code code {
            color: inherit;
          }

          /* Syntax highlighting */
          .hl-kw { color: #c792ea; }
          .hl-fn { color: #82aaff; }
          .hl-str { color: #c3e88d; }
          .hl-key { color: #ffcb6b; }
          .hl-num { color: #f78c6c; }
          .hl-cm { color: #546e7a; font-style: italic; }

          .ctu-tools {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 10px 16px;
            background: #08080a;
            border-top: 1px solid ${colors.borderSubtle};
          }

          .ctu-tool {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-family: ${fonts.mono};
            font-size: 0.6rem;
            color: ${colors.textMuted};
            background: ${rgba(colors.accent, 0.08)};
            padding: 3px 8px;
            border-radius: 4px;
            border: 1px solid ${rgba(colors.accent, 0.12)};
          }

          .ctu-tool-check {
            color: #4ade80;
          }

          /* Responsive */
          @media (max-width: 600px) {
            .ctu-hero {
              padding: 5rem 1.25rem 2rem;
              min-height: auto;
            }
            .ctu-chat-window {
              height: 380px;
            }
            .ctu-ui-grid {
              grid-template-columns: 1fr;
            }
            .ctu-ctas {
              flex-direction: column;
            }
            .ctu-btn-primary,
            .ctu-btn-secondary {
              width: 100%;
              justify-content: center;
            }
          }
        `}
      </style>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UI Preview Grid
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface UiPreviewGridProps {
  demo: CodeToUiDemo;
}

function UiPreviewGrid({ demo }: UiPreviewGridProps) {
  return (
    <>
      {demo.uiComponents.map((comp, i) => (
        <UiPreviewItem
          key={`${demo.id}-${i}`}
          resourceUri={comp.resourceUri}
          mockData={comp.mockData}
          size={comp.size}
          index={i}
        />
      ))}
    </>
  );
}

interface UiPreviewItemProps {
  resourceUri: string;
  mockData: unknown;
  size?: "small" | "medium" | "large";
  index: number;
}

function UiPreviewItem({ resourceUri, mockData, size = "medium", index }: UiPreviewItemProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);

  // Listen for auto-resize messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "mcp-app-resize" && typeof event.data.height === "number") {
        const iframe = iframeRef.current;
        if (iframe && event.source === iframe.contentWindow) {
          // Clamp height between reasonable bounds for the landing page grid
          const minHeight = 80;
          const maxHeight = size === "large" ? 200 : 150;
          setContentHeight(Math.min(Math.max(event.data.height, minHeight), maxHeight));
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [size]);

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

    setStatus("loading");

    const bridge = new AppBridge(
      null,
      { name: "Landing Preview", version: "1.0.0" },
      { openLinks: {}, logging: {} },
      { hostContext: { theme: "dark", displayMode: "inline" } },
    );

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
  }, [resourceUri, mockData, resultToMcpContent]);

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
  }, [setupBridge]);

  // Large items span full width
  const gridSpan = size === "large" ? "1 / -1" : "auto";

  // Use content height if available, otherwise use defaults based on size
  const defaultHeight = size === "large" ? 160 : size === "small" ? 80 : 100;
  const actualHeight = contentHeight ?? defaultHeight;

  return (
    <div
      class="ctu-preview-item"
      style={{
        gridColumn: gridSpan,
        height: `${actualHeight}px`,
        animationDelay: `${index * 50}ms`,
      }}
    >
      {status === "loading" && (
        <div class="ctu-preview-loading">
          <div class="ctu-preview-spinner" />
        </div>
      )}

      {status === "error" && (
        <div class="ctu-preview-error">Preview unavailable</div>
      )}

      <iframe
        ref={iframeRef}
        title="UI Preview"
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: "6px",
          background: "#0c0c0e",
          opacity: status === "connected" ? 1 : 0,
          transition: "opacity 0.3s",
        }}
      />

      <style>
        {`
          .ctu-preview-item {
            position: relative;
            border-radius: 6px;
            overflow: hidden;
            background: #0c0c0e;
            border: 1px solid ${colors.borderSubtle};
            animation: itemFadeIn 0.3s ease-out both;
            transition: height 0.2s ease-out;
          }

          @keyframes itemFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }

          .ctu-preview-loading,
          .ctu-preview-error {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.625rem;
            color: ${colors.textMuted};
          }

          .ctu-preview-spinner {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid ${colors.borderMuted};
            border-top-color: ${colors.accent};
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
