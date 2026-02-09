/**
 * TryPlaygroundIsland - Conversational UI Composer
 *
 * Chat with PML serve (MCP tools), UIs appear as draggable widgets.
 *
 * Architecture:
 * - Chat bar at bottom (compact, 2-3 messages visible)
 * - Widget zone takes most of the screen
 * - PML serve decides which tools to call, tools return _meta.ui for widgets
 *
 * @module web/islands/TryPlaygroundIsland
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

interface Widget {
  id: string;
  resourceUri: string;
  title: string;
  data: unknown;
  position: { x: number; y: number };
  size: { width: number; height: number };
  // Agent chat support
  isAgentChat?: boolean;
  agentHistory?: AgentMessage[];
  agentContext?: string;
  initialMessage?: string;
}

interface UiCommand {
  action: "show" | "update" | "remove";
  resourceUri: string;
  title?: string;
  data?: unknown;
}

// Observability event types
interface ObsEvent {
  id: string;
  timestamp: number;
  type: "pml-call" | "pml-response" | "pml-error" | "ui-command" | "widget-created" | "widget-closed" | "meta-ui-widget" | "agent-sampling" | "error";
  summary: string;
  details?: string;
}

// Agent chat resource URI constant
const AGENT_CHAT_URI = "ui://mcp-std/agent-chat";

/**
 * Unwrap nested MCP envelope(s) to extract the actual message text.
 * PML returns: { _meta?, content?: [{type, text}], result?: {...}, message?: "..." }
 */
function unwrapMcpEnvelope(obj: Record<string, unknown>): string {
  // Direct message field
  if (typeof obj.message === "string") return obj.message;

  // MCP envelope: content[0].text
  const content = obj.content as Array<{ type: string; text?: string }> | undefined;
  if (Array.isArray(content) && content[0]?.text) {
    try {
      const parsed = JSON.parse(content[0].text);
      if (typeof parsed === "object" && parsed !== null) {
        return unwrapMcpEnvelope(parsed);
      }
      return String(parsed);
    } catch {
      return content[0].text;
    }
  }

  // Nested result field
  if (obj.result && typeof obj.result === "object") {
    return unwrapMcpEnvelope(obj.result as Record<string, unknown>);
  }
  if (typeof obj.result === "string") return obj.result;

  return JSON.stringify(obj);
}

/** CSS classes for observability event types (avoids nested ternaries in JSX). */
function obsEventClass(type: ObsEvent["type"]): string {
  switch (type) {
    case "error":
    case "pml-error":
      return "bg-red-500/10 text-red-400";
    case "pml-call":
      return "bg-blue-500/10 text-blue-400";
    case "pml-response":
      return "bg-green-500/10 text-green-400";
    case "ui-command":
    case "meta-ui-widget":
      return "bg-purple-500/10 text-purple-400";
    case "widget-created":
      return "bg-pml-accent/10 text-pml-accent";
    case "agent-sampling":
      return "bg-cyan-500/10 text-cyan-400";
    default:
      return "bg-stone-500/10 text-stone-400";
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function TryPlaygroundIsland() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const widgetsRef = useRef<Widget[]>([]);

  // HIL approval state
  const [pendingApproval, setPendingApproval] = useState<{
    workflowId: string;
    description: string;
    options?: string[];
  } | null>(null);

  // Observability panel state
  const [obsEvents, setObsEvents] = useState<ObsEvent[]>([]);
  const [obsOpen, setObsOpen] = useState(true);

  // Keep widgetsRef in sync for stable reads outside React render cycle
  useEffect(() => { widgetsRef.current = widgets; }, [widgets]);

  // Add observability event
  const addObsEvent = useCallback((type: ObsEvent["type"], summary: string, details?: string) => {
    const event: ObsEvent = {
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type,
      summary,
      details,
    };
    setObsEvents((prev) => [...prev, event].slice(-50));
  }, []);

  // Parse PML result for UI commands and text
  const parsePmlResult = useCallback((result: Record<string, unknown>): { message: string; uis: UiCommand[] } => {
    // PML execute returns { status, result: { ... } }
    if (!result.result) {
      console.warn("[parsePmlResult] No 'result' field in PML response, using raw response", Object.keys(result));
    }
    const inner = (result.result ?? result) as Record<string, unknown>;

    // Check for widgets array (agent tunnel — multiple tool results, each with its own viewer)
    const widgetsArr = inner.widgets as Array<{ resourceUri: string; title: string; data: unknown }> | undefined;
    if (Array.isArray(widgetsArr) && widgetsArr.length > 0) {
      return {
        message: (inner.message as string) || "",
        uis: widgetsArr.map((w) => ({
          action: "show" as const,
          resourceUri: w.resourceUri,
          title: w.title || "Widget",
          data: w.data,
        })),
      };
    }

    // Check for _meta.ui (MCP Apps pattern — tool declares UI in definition)
    const meta = inner._meta as Record<string, unknown> | undefined;
    if (meta?.ui) {
      const uiMeta = meta.ui as Record<string, unknown>;
      return {
        message: (inner.message as string) || "",
        uis: [{
          action: "show",
          resourceUri: uiMeta.resourceUri as string,
          title: (uiMeta.title as string) || (inner.message as string) || "Widget",
          data: uiMeta.context ?? uiMeta.data ?? inner,
        }],
      };
    }

    // Check for ui field (legacy LLM JSON format with datasetId resolved)
    if (inner.ui) {
      const ui = inner.ui as Record<string, unknown>;
      return {
        message: (inner.message as string) || "",
        uis: [{
          action: (ui.action as "show") || "show",
          resourceUri: ui.resourceUri as string,
          title: (ui.title as string) || "Widget",
          data: ui.data,
        }],
      };
    }

    // Plain message
    const message = (inner.message as string) || (inner.result as string) || JSON.stringify(inner);
    return { message, uis: [] };
  }, []);

  // Add widget from UI command
  const addWidget = useCallback((command: UiCommand, agentContext?: string) => {
    const id = `widget-${Date.now()}`;
    const isAgent = command.resourceUri === AGENT_CHAT_URI;

    // For agent-chat: extract context and initialMessage from data
    let resolvedContext = agentContext;
    let initialMessage: string | undefined;
    if (isAgent && command.data && typeof command.data === "object") {
      const d = command.data as Record<string, unknown>;
      if (typeof d.context === "string") resolvedContext = d.context;
      if (typeof d.initialMessage === "string") initialMessage = d.initialMessage;
    }

    const newWidget: Widget = {
      id,
      resourceUri: command.resourceUri,
      title: command.title || "Widget",
      data: command.data,
      position: {
        x: 20 + (widgets.length % 3) * 320,
        y: 20 + Math.floor(widgets.length / 3) * 280,
      },
      size: isAgent ? { width: 380, height: 420 } : { width: 400, height: 300 },
      isAgentChat: isAgent,
      agentHistory: isAgent ? [] : undefined,
      agentContext: isAgent ? resolvedContext : undefined,
      initialMessage: isAgent ? initialMessage : undefined,
    };
    setWidgets((prev) => [...prev, newWidget]);
    addObsEvent("widget-created", `+ ${command.title || "Widget"}`, command.resourceUri);
  }, [widgets.length, addObsEvent]);

  // Remove widget
  const removeWidget = useCallback((id: string, title?: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    addObsEvent("widget-closed", `\u00d7 ${title || "Widget"}`);
  }, [addObsEvent]);

  // Handle agent chat message: route through PML serve → agent_help
  const handleAgentMessage = useCallback(async (widgetId: string, userText: string) => {
    // Read widget state from ref (stable, avoids stale closure in setWidgets updater)
    const widget = widgetsRef.current.find((w) => w.id === widgetId);
    if (!widget || !widget.isAgentChat) {
      console.error(`[AgentChat] Widget ${widgetId} not found or not an agent chat`);
      return null;
    }

    const currentHistory: AgentMessage[] = [...(widget.agentHistory || []), { role: "user", content: userText }];
    const agentContext = widget.agentContext;

    // Update widget with user message added to history
    setWidgets((prev) =>
      prev.map((w) => w.id === widgetId ? { ...w, agentHistory: currentHistory } : w)
    );

    addObsEvent("agent-sampling", `Agent: ${userText.slice(0, 30)}...`);

    try {
      const response = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetId,
          message: userText,
          history: currentHistory.slice(-10),
          context: agentContext,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "PML agent error");
      }

      const data = await response.json();
      const agentReply = unwrapMcpEnvelope(data);

      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== widgetId) return w;
          return { ...w, agentHistory: [...(w.agentHistory || []), { role: "assistant" as const, content: agentReply }] };
        })
      );

      addObsEvent("agent-sampling", `Agent reply: ${agentReply.slice(0, 30)}...`);
      return agentReply;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Agent error";
      addObsEvent("error", `Agent error: ${errorMsg}`);
      return `Erreur: ${errorMsg}`;
    }
  }, [addObsEvent]);

  // Send message via PML serve proxy
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      addObsEvent("pml-call", `\u2192 ${userMessage.content.slice(0, 40)}...`);

      const response = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "PML error");
      }

      const result = await response.json();

      // Handle HIL approval required — store for UI buttons
      if (result.status === "approval_required") {
        setPendingApproval({
          workflowId: result.workflowId as string,
          description: (result.description as string) || "PML demande une confirmation",
          options: result.options as string[] | undefined,
        });
        const approvalMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: result.description as string || "PML demande une confirmation avant de continuer.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, approvalMsg]);
        addObsEvent("pml-response", "HIL: approval required", result.workflowId as string);
        return;
      }

      const { message, uis } = parsePmlResult(result);

      addObsEvent("pml-response", `\u2190 ${message.slice(0, 40)}...`);

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: message,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Handle UI commands — one widget per tool result
      for (const ui of uis) {
        addObsEvent("meta-ui-widget", `UI: ${ui.title || ui.resourceUri}`, ui.resourceUri);
        if (ui.action === "show") {
          addWidget(ui, userMessage.content);
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to get response";
      setError(errorMsg);
      addObsEvent("pml-error", `\u26a0 ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, parsePmlResult, addWidget, addObsEvent]);

  // Handle HIL approval/rejection
  const handleApproval = useCallback(async (approved: boolean) => {
    if (!pendingApproval) return;

    const { workflowId } = pendingApproval;
    setPendingApproval(null);
    setIsLoading(true);

    const label = approved ? "Approuv\u00e9" : "Rejet\u00e9";
    addObsEvent("pml-call", `HIL ${label} (${workflowId.slice(0, 8)}...)`);

    setMessages((prev) => [...prev, {
      id: `msg-${Date.now()}`,
      role: "user" as const,
      content: approved ? "Approuv\u00e9" : "Rejet\u00e9",
      timestamp: Date.now(),
    }]);

    try {
      const response = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          continueWorkflow: { workflowId, approved },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erreur HIL");
      }

      const result = await response.json();
      const { message, uis } = parsePmlResult(result);

      addObsEvent("pml-response", `HIL result: ${message.slice(0, 40)}...`);

      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}`,
        role: "assistant" as const,
        content: message,
        timestamp: Date.now(),
      }]);

      for (const ui of uis) {
        if (ui.action === "show") {
          addWidget(ui);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erreur HIL";
      setError(errorMsg);
      addObsEvent("pml-error", `HIL error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  }, [pendingApproval, parsePmlResult, addWidget, addObsEvent]);

  // Handle key press
  const handleKeyDown = useCallback(
    (e: Event) => {
      const keyEvent = e as unknown as KeyboardEvent;
      if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // Format timestamp for obs panel
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  };

  return (
    <div class="h-screen flex bg-[#08080a]">
      {/* Main Area */}
      <div class="flex-1 flex flex-col min-w-0">
        {/* Widget Zone */}
        <div class="flex-1 relative overflow-hidden">
        {/* Empty state - minimal, just suggestions above chat */}
        {widgets.length === 0 && messages.length === 0 && (
          <div class="absolute inset-0 flex items-end justify-center pb-40 pointer-events-none" style={{ paddingRight: obsOpen ? "256px" : "40px" }}>
            <div class="text-center max-w-lg px-6 pointer-events-auto">
              <p class="text-sm text-stone-600 mb-4">
                Essayez par exemple :
              </p>
              <div class="flex flex-wrap gap-2 justify-center">
                {[
                  "Montre-moi les ventes du trimestre",
                  "\u00c9tat des serveurs",
                  "Aide-moi \u00e0 analyser ce projet"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    class="px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.06] text-xs text-stone-500 hover:bg-white/[0.06] hover:text-stone-300 hover:border-white/[0.1] transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Widgets */}
        {widgets.map((widget) => (
          <WidgetFrame
            key={widget.id}
            widget={widget}
            onRemove={() => removeWidget(widget.id, widget.title)}
            onAgentMessage={widget.isAgentChat ? handleAgentMessage : undefined}
          />
        ))}
      </div>

      {/* Chat Tunnel - Centered at bottom */}
      <div class="absolute bottom-0 left-0 right-0 flex flex-col items-center pointer-events-none" style={{ paddingRight: obsOpen ? "256px" : "40px" }}>
        {/* Messages tunnel - fade upward */}
        {messages.length > 0 && (
          <div class="w-full max-w-sm px-4 mb-3">
            <div class="relative">
              {/* Gradient mask for tunnel effect */}
              <div class="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-[#08080a] pointer-events-none z-10" style={{ top: "-20px" }} />

              <div class="space-y-1.5 max-h-32 overflow-hidden">
                {messages.slice(-5).map((msg, idx, arr) => {
                  const age = arr.length - 1 - idx;
                  const opacity = Math.max(0.15, 1 - age * 0.3);

                  return (
                    <div
                      key={msg.id}
                      class="transition-opacity duration-500"
                      style={{ opacity }}
                    >
                      <span class={`text-xs ${msg.role === "user" ? "text-stone-500" : "text-stone-400"}`}>
                        {msg.content.slice(0, 80)}{msg.content.length > 80 ? "..." : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* HIL Approval buttons */}
        {pendingApproval && (
          <div class="w-full max-w-sm px-4 mb-2 pointer-events-auto">
            <div class="bg-white/[0.03] border border-pml-accent/20 rounded-lg px-3 py-2">
              <p class="text-xs text-stone-400 mb-2">{pendingApproval.description}</p>
              <div class="flex gap-2">
                <button
                  onClick={() => handleApproval(true)}
                  disabled={isLoading}
                  class="flex-1 px-3 py-1.5 text-xs rounded-md bg-pml-accent/20 text-pml-accent border border-pml-accent/30 hover:bg-pml-accent/30 transition-colors disabled:opacity-50"
                >
                  Approuver
                </button>
                <button
                  onClick={() => handleApproval(false)}
                  disabled={isLoading}
                  class="flex-1 px-3 py-1.5 text-xs rounded-md bg-white/[0.03] text-stone-400 border border-white/[0.08] hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                >
                  Rejeter
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div class="w-full max-w-2xl px-4 mb-2 pointer-events-auto">
            <div class="text-center text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-1">
              {error}
            </div>
          </div>
        )}

        {/* Input - minimal, transparent */}
        <div class="w-full max-w-sm px-4 pb-8 pointer-events-auto">
          <div class="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown as any}
              placeholder={messages.length === 0 ? "D\u00e9crivez ce que vous voulez voir..." : "..."}
              disabled={isLoading}
              class="w-full px-0 py-2 bg-transparent border-0 border-b border-white/[0.1] text-stone-300 placeholder:text-stone-700 focus:outline-none focus:border-pml-accent/40 disabled:opacity-50 text-sm transition-colors"
            />
            {isLoading && (
              <div class="absolute right-0 top-1/2 -translate-y-1/2">
                <div class="w-3 h-3 border border-stone-700 border-t-pml-accent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Observability Panel */}
      <div
        class={`${obsOpen ? "w-64" : "w-10"} flex-shrink-0 border-l border-white/[0.06] bg-[#0a0a0c] flex flex-col transition-all duration-200`}
      >
        {/* Header */}
        <button
          onClick={() => setObsOpen(!obsOpen)}
          class="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            class={`text-pml-accent transition-transform ${obsOpen ? "" : "rotate-180"}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          {obsOpen && <span class="text-xs font-medium text-stone-400">Observabilit\u00e9</span>}
        </button>

        {/* Events */}
        {obsOpen && (
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            {obsEvents.length === 0 ? (
              <div class="text-[0.65rem] text-stone-600 text-center py-4">
                Les \u00e9v\u00e9nements appara\u00eetront ici
              </div>
            ) : (
              obsEvents.map((evt) => (
                <div
                  key={evt.id}
                  class={`text-[0.65rem] px-2 py-1 rounded ${obsEventClass(evt.type)}`}
                >
                  <div class="flex items-center gap-1">
                    <span class="text-stone-600">{formatTime(evt.timestamp)}</span>
                    <span class="truncate">{evt.summary}</span>
                  </div>
                  {evt.details && (
                    <div class="text-[0.6rem] text-stone-500 truncate mt-0.5">{evt.details}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Widget Frame Component
// ============================================================================

interface WidgetFrameProps {
  widget: Widget;
  onRemove: () => void;
  onAgentMessage?: (widgetId: string, text: string) => Promise<string | null>;
}

function WidgetFrame({ widget, onRemove, onAgentMessage }: WidgetFrameProps) {
  const [position, setPosition] = useState(widget.position);
  const [size, setSize] = useState(widget.size);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");
  const [agentLoading, setAgentLoading] = useState(!!widget.initialMessage);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const initialMessageSentRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });

  // Setup MCP AppBridge
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const bridge = new AppBridge(
      null,
      { name: "Playground Widget", version: "1.0.0" },
      { openLinks: {}, logging: {} },
      { hostContext: { theme: "dark", displayMode: "inline" } }
    );

    bridge.oninitialized = () => {
      setStatus("connected");
      // Send data to the UI
      bridge.sendToolResult({
        content: [{ type: "text", text: JSON.stringify(widget.data) }],
        isError: false,
      });

      // Auto-send initial message for agent-chat widgets (tool results without _meta.ui)
      if (widget.isAgentChat && widget.initialMessage && onAgentMessage && !initialMessageSentRef.current) {
        initialMessageSentRef.current = true;
        const msg = widget.initialMessage;
        setTimeout(async () => {
          const reply = await onAgentMessage(widget.id, msg);
          setAgentLoading(false);
          if (reply && bridgeRef.current) {
            bridgeRef.current.sendToolResult({
              content: [{ type: "text", text: JSON.stringify({ message: reply }) }],
              isError: false,
            });
          }
        }, 300);
      }
    };

    // Handle agent chat messages: route through PML serve → agent_help
    if (widget.isAgentChat && onAgentMessage) {
      bridge.onupdatemodelcontext = async (params) => {
        const structured = params.structuredContent as Record<string, unknown> | undefined;
        if (structured?.event !== "message") return {};
        const userText = (structured?.text as string) || "";
        if (!userText) return {};

        // Route to PML via backend
        const reply = await onAgentMessage(widget.id, userText);

        // Send response back to agent-chat iframe
        if (reply && bridgeRef.current) {
          bridgeRef.current.sendToolResult({
            content: [{ type: "text", text: JSON.stringify({ message: reply }) }],
            isError: false,
          });
        }

        return {};
      };
    }

    bridgeRef.current = bridge;

    // Wait for iframe to be ready
    const setupTransport = () => {
      if (!iframe.contentWindow) {
        setTimeout(setupTransport, 50);
        return;
      }

      const transport = new PostMessageTransport(
        iframe.contentWindow,
        iframe.contentWindow
      );

      bridge.connect(transport).then(() => {
        iframe.src = `/api/ui/resource?uri=${encodeURIComponent(widget.resourceUri)}`;
      }).catch(() => {
        setStatus("error");
      });
    };

    setupTransport();

    return () => {
      if (bridgeRef.current) {
        bridgeRef.current.close().catch(() => {});
        bridgeRef.current = null;
      }
    };
  }, [widget.resourceUri, widget.data, widget.isAgentChat, onAgentMessage]);

  // Drag handlers
  const handleDragStart = useCallback((e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(".widget-close")) return;
    if ((e.target as HTMLElement).closest(".widget-resize")) return;
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  // Resize handlers
  const handleResizeStart = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = {
      width: size.width,
      height: size.height,
      x: e.clientX,
      y: e.clientY,
    };
  }, [size]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: Math.max(0, e.clientX - dragOffset.current.x),
          y: Math.max(0, e.clientY - dragOffset.current.y),
        });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.current.x;
        const deltaY = e.clientY - resizeStart.current.y;
        setSize({
          width: Math.max(200, resizeStart.current.width + deltaX),
          height: Math.max(150, resizeStart.current.height + deltaY),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing]);

  return (
    <div
      class="absolute rounded-xl overflow-hidden bg-[#0a0a0c] border border-white/[0.08] shadow-2xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: isDragging ? 999 : 10,
      }}
    >
      {/* Title bar */}
      <div
        class="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06] cursor-move select-none"
        onMouseDown={handleDragStart as any}
      >
        <div class="flex items-center gap-2 min-w-0">
          {status === "loading" && (
            <div class="w-2 h-2 bg-yellow-500 rounded-full animate-pulse flex-shrink-0" />
          )}
          {status === "connected" && (
            <div class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
          )}
          {status === "error" && (
            <div class="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
          )}
          <span class="text-xs text-stone-400 truncate">{widget.title}</span>
        </div>
        <button
          class="widget-close text-stone-600 hover:text-stone-300 transition-colors p-0.5"
          onClick={onRemove}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div class="relative" style={{ height: `calc(100% - 28px)` }}>
        <iframe
          ref={iframeRef}
          class="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
          style={{ pointerEvents: isDragging || isResizing ? "none" : "auto" }}
        />
        {agentLoading && (
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0c] gap-3">
            <div class="w-5 h-5 border-2 border-pml-accent/30 border-t-pml-accent rounded-full animate-spin" />
            <span class="text-xs text-stone-500">Analyse en cours...</span>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        class="widget-resize absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
        onMouseDown={handleResizeStart as any}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" class="absolute bottom-0.5 right-0.5 text-stone-700">
          <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}
