/**
 * CatalogPageIsland - Unified MCP Catalog
 *
 * Sidebar + Bento Grid layout inspired by Flowbite/shadcn.
 * - UI Components: Bento grid with live previews
 * - Tools/Capabilities: Compact chips
 *
 * @module web/islands/CatalogPageIsland
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import VitrineHeader from "../components/layout/VitrineHeader.tsx";
import type { CatalogEntry } from "../../cloud/ui/catalog/types.ts";
import {
  buildComponentMeta,
  getComponentBentoSize,
  BENTO_SIZE_CONFIGS,
} from "../data/ui-component-categories.ts";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { getMockData } from "../data/ui-mock-data.ts";
import ToolDetailPanel from "../components/shared/ToolDetailPanel.tsx";
import CapabilityDetailPanel from "../components/shared/CapabilityDetailPanel.tsx";

interface CatalogPageIslandProps {
  entries: CatalogEntry[];
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ItemType = "tool" | "capability" | "ui";

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  type: ItemType;
  category: string;
  href: string;
  hasUi?: boolean;
  resourceUri?: string;
  bentoSize?: string;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  items: CatalogItem[];
  isUiCategory?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CATEGORY DEFINITIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const UI_CATEGORIES: Record<string, { label: string; icon: string }> = {
  "data-display": { label: "Data Display", icon: "📊" },
  "charts": { label: "Charts", icon: "📈" },
  "code": { label: "Code & Diffs", icon: "💻" },
  "forms": { label: "Forms", icon: "📝" },
  "visualization": { label: "Visualization", icon: "🗺️" },
  "media": { label: "Media", icon: "🖼️" },
  "system": { label: "System", icon: "⚙️" },
  "security": { label: "Security", icon: "🔐" },
};

const TOOL_CATEGORIES: Record<string, { label: string; icon: string; prefixes: string[] }> = {
  docker: { label: "Docker", icon: "🐳", prefixes: ["docker"] },
  git: { label: "Git", icon: "📦", prefixes: ["git"] },
  database: { label: "Database", icon: "🐘", prefixes: ["psql", "pglite", "mongo", "mysql", "redis"] },
  network: { label: "Network", icon: "🌐", prefixes: ["http", "ssh", "dns", "ip", "cidr", "mac", "ping", "netstat", "netcat", "nslookup", "dig", "port"] },
  kubernetes: { label: "Kubernetes", icon: "☸️", prefixes: ["k8s", "kubectl"] },
  browser: { label: "Browser", icon: "🌍", prefixes: ["browser"] },
  color: { label: "Colors", icon: "🎨", prefixes: ["color"] },
  geo: { label: "Geolocation", icon: "📍", prefixes: ["geo"] },
  faker: { label: "Mock Data", icon: "🎲", prefixes: ["faker", "data"] },
  array: { label: "Collections", icon: "📚", prefixes: ["array"] },
  diff: { label: "Diff & Compare", icon: "↔️", prefixes: ["diff", "compare"] },
  encode: { label: "Encoding", icon: "🔣", prefixes: ["encode", "base"] },
  text: { label: "Text & Format", icon: "📝", prefixes: ["text", "json", "format", "transform", "string"] },
  file: { label: "Files", icon: "📄", prefixes: ["read", "write", "edit", "list", "move", "directory", "chmod", "chown"] },
  process: { label: "Process", icon: "⚙️", prefixes: ["process", "ps", "kill", "free", "df", "du", "lsof", "memory"] },
  utils: { label: "Utilities", icon: "🔧", prefixes: ["datetime", "crypto", "math", "path", "algo", "cron", "duration", "hash", "password", "random", "regex", "roman"] },
  resilience: { label: "Resilience", icon: "🛡️", prefixes: ["resilience"] },
  barcode: { label: "Barcodes & QR", icon: "📱", prefixes: ["barcode", "qr"] },
  agent: { label: "AI Agents", icon: "🤖", prefixes: ["agent"] },
  cloud: { label: "Cloud CLI", icon: "☁️", prefixes: ["aws", "gcloud", "az"] },
  python: { label: "Python", icon: "🐍", prefixes: ["python", "pip"] },
  media: { label: "Media", icon: "🎬", prefixes: ["media", "image", "ffmpeg", "ffprobe", "imagemagick"] },
  archive: { label: "Archive", icon: "📦", prefixes: ["archive", "vfs", "rsync"] },
  devtools: { label: "DevTools", icon: "🔧", prefixes: ["click", "fill", "hover", "drag", "navigate", "emulate", "evaluate", "press", "take", "new", "close", "list", "select", "resize", "wait", "handle", "performance", "get"] },
  validation: { label: "Validation", icon: "✓", prefixes: ["validation", "schema"] },
  env: { label: "Environment", icon: "🔐", prefixes: ["env"] },
  jwt: { label: "JWT & Auth", icon: "🔑", prefixes: ["jwt"] },
  other: { label: "Other Tools", icon: "🔨", prefixes: [] },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getToolCategory(name: string): string {
  const prefix = name.split("_")[0]?.toLowerCase() ?? "";
  for (const [catId, cat] of Object.entries(TOOL_CATEGORIES)) {
    if (cat.prefixes.includes(prefix)) return catId;
  }
  return "other";
}

function getServerRouteId(serverId: string, toolName: string): string {
  if (serverId === "std") {
    const idx = toolName.indexOf("_");
    if (idx > 0) return `std-${toolName.substring(0, idx)}`;
    return "std";
  }
  return serverId;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BENTO PREVIEW COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface BentoPreviewProps {
  item: CatalogItem;
  index: number;
}

function BentoPreview({ item, index }: BentoPreviewProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [isVisible, setIsVisible] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLAnchorElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);

  // Listen for auto-resize messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "mcp-app-resize" && typeof event.data.height === "number") {
        const iframe = iframeRef.current;
        if (iframe && event.source === iframe.contentWindow) {
          // Add padding for label bar (36px) + some margin
          setContentHeight(event.data.height + 48);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Intersection observer for lazy loading
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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
    if (!iframe?.contentWindow || !item.resourceUri) return;

    if (bridgeRef.current) {
      bridgeRef.current.close().catch(() => {});
    }

    setStatus("loading");

    const bridge = new AppBridge(
      null,
      { name: "Catalog Preview", version: "1.0.0" },
      { openLinks: {}, logging: {} },
      { hostContext: { theme: "dark", displayMode: "inline" } },
    );

    const mockData = getMockData(item.resourceUri);

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

    bridge.connect(transport).then(async () => {
      try {
        const resp = await fetch(`/api/ui/resource?uri=${encodeURIComponent(item.resourceUri!)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        iframe.srcdoc = await resp.text();
      } catch { setStatus("error"); }
    }).catch(() => {
      setStatus("error");
    });
  }, [item.resourceUri, resultToMcpContent]);

  // Initialize bridge when visible
  useEffect(() => {
    if (!isVisible || !item.resourceUri) return;

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
  }, [isVisible, item.resourceUri, setupBridge]);

  const animDelay = Math.min(index * 30, 400);
  const size = item.bentoSize || "medium";
  const config = BENTO_SIZE_CONFIGS[size as keyof typeof BENTO_SIZE_CONFIGS];
  const minHeight = config?.minHeight || 280;
  const maxHeight = 400; // Prevent excessive heights

  // Use content height if available, clamped between min and max
  const actualHeight = contentHeight
    ? Math.min(Math.max(contentHeight, minHeight), maxHeight)
    : minHeight;

  // Determine grid span classes based on size
  const sizeClasses = size === "large" || size === "wide" ? "lg:col-span-2" : "";

  return (
    <a
      id={item.id}
      ref={containerRef}
      href={item.href}
      class={`relative bg-[#0a0a0c] border border-[rgba(78,205,196,0.12)] rounded-lg overflow-hidden no-underline cursor-pointer transition-all duration-200 ease-out animate-[bentoIn_0.3s_ease-out_both] hover:border-[rgba(78,205,196,0.5)] hover:-translate-y-[3px] hover:shadow-[0_12px_32px_-8px_rgba(78,205,196,0.25),0_0_0_1px_rgba(78,205,196,0.1)] ${sizeClasses}`}
      style={{
        minHeight: `${minHeight}px`,
        height: `${actualHeight}px`,
        animationDelay: `${animDelay}ms`,
      }}
    >
      {/* Preview area */}
      <div class="absolute inset-0 bottom-9">
        {isVisible && status === "loading" && (
          <div class="flex items-center justify-center bg-gradient-to-br from-[#0c0c0e] to-[#111114] absolute inset-0">
            <div class="w-6 h-6 rounded-full border-2 border-[#2a2a2e] border-t-[#4ECDC4] animate-spin" />
          </div>
        )}

        {status === "error" && (
          <div class="absolute inset-0 flex items-center justify-center text-xs text-pml-text-dim bg-[#0a0a0c]">
            <span>Preview unavailable</span>
          </div>
        )}

        {isVisible && item.resourceUri && (
          <iframe
            ref={iframeRef}
            title={`Preview: ${item.name}`}
            sandbox="allow-scripts"
            class="w-full h-full border-none bg-[#0a0a0c] transition-opacity duration-400 ease-out"
            style={{
              opacity: status === "connected" ? 1 : 0,
            }}
          />
        )}
      </div>

      {/* Label overlay */}
      <div class="absolute bottom-0 left-0 right-0 h-9 px-3 bg-[#0f0f12] border-t border-[rgba(78,205,196,0.08)] flex items-center justify-between">
        <span class="font-mono text-xs font-medium text-pml-text group-hover:text-[#4ECDC4]">{item.name}</span>
        <span class="text-[0.5625rem] font-semibold text-[#4ECDC4] bg-[rgba(78,205,196,0.12)] px-1.5 py-0.5 rounded border border-[rgba(78,205,196,0.2)]">UI</span>
      </div>
    </a>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DETAIL PANEL - uses shared ToolDetailPanel component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ToolDetailFromApi {
  id: string;
  name: string;
  description: string | null;
  routing: "local" | "cloud";
  serverId: string;
  inputSchema: Record<string, unknown> | null;
  uiMeta: {
    resourceUri: string;
    emits?: string[];
    accepts?: string[];
  } | null;
}

interface CapabilityDetailFromApi {
  id: string;
  name: string;
  action: string | null;
  namespace: string | null;
  description: string | null;
  routing: "local" | "cloud";
  code: string | null;
  toolsUsed: string[];
  inputSchema: {
    type: string;
    properties?: Record<string, {
      type: string;
      examples?: unknown[];
      description?: string;
    }>;
    required?: string[];
  } | null;
}

interface DetailPanelProps {
  item: CatalogItem;
  onClose: () => void;
}

function DetailPanel({ item, onClose }: DetailPanelProps) {
  const [toolDetail, setToolDetail] = useState<ToolDetailFromApi | null>(null);
  const [capabilityDetail, setCapabilityDetail] = useState<CapabilityDetailFromApi | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch tool details when item changes (only for tools)
  useEffect(() => {
    if (item.type !== "tool") {
      setToolDetail(null);
      return;
    }

    const toolId = item.id.replace("tool-", "");

    setDetailLoading(true);
    fetch(`/api/catalog/tool/${encodeURIComponent(toolId)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        setToolDetail(data);
        setDetailLoading(false);
      })
      .catch(() => {
        setToolDetail(null);
        setDetailLoading(false);
      });
  }, [item.id, item.type]);

  // Fetch capability details when item changes (only for capabilities)
  useEffect(() => {
    if (item.type !== "capability") {
      setCapabilityDetail(null);
      return;
    }

    const capId = item.id.replace("cap-", "");

    setDetailLoading(true);
    fetch(`/api/catalog/capability/${encodeURIComponent(capId)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        setCapabilityDetail(data);
        setDetailLoading(false);
      })
      .catch(() => {
        setCapabilityDetail(null);
        setDetailLoading(false);
      });
  }, [item.id, item.type]);

  // For capabilities, use CapabilityDetailPanel with fetched data
  if (item.type === "capability") {
    if (detailLoading) {
      return (
        <div class="mt-3 bg-[#0f0f12] border border-[rgba(74,222,128,0.08)] rounded-[10px] p-8 flex flex-col items-center justify-center gap-3 text-xs text-pml-text-dim animate-[slideUp_0.2s_ease-out]">
          <div class="w-6 h-6 rounded-full border-2 border-[#2a2a2e] border-t-[#4ade80] animate-spin" />
          <span>Chargement...</span>
        </div>
      );
    }

    if (!capabilityDetail) {
      return (
        <div class="mt-3 bg-[#0f0f12] border border-[rgba(74,222,128,0.08)] rounded-[10px] p-8 flex flex-col items-center justify-center gap-3 text-xs text-pml-text-dim animate-[slideUp_0.2s_ease-out]">
          <span>Impossible de charger les details</span>
          <button
            type="button"
            onClick={onClose}
            class="font-mono text-[0.6875rem] text-pml-text-dim bg-transparent border border-[rgba(74,222,128,0.2)] px-3 py-1.5 rounded cursor-pointer transition-all duration-150 hover:border-[rgba(74,222,128,0.4)] hover:text-[#4ade80]"
          >
            Fermer
          </button>
        </div>
      );
    }

    return (
      <CapabilityDetailPanel
        capability={{
          name: capabilityDetail.name,
          action: capabilityDetail.action,
          namespace: capabilityDetail.namespace,
          description: capabilityDetail.description,
          routing: capabilityDetail.routing,
          code: capabilityDetail.code,
          toolsUsed: capabilityDetail.toolsUsed,
          inputSchema: capabilityDetail.inputSchema,
        }}
        onClose={onClose}
        detailHref={item.href}
        loading={detailLoading}
      />
    );
  }

  // For tools, use ToolDetailPanel with fetched data
  if (!toolDetail && detailLoading) {
    return (
      <div class="mt-3 bg-[#0f0f12] border border-[rgba(255,184,111,0.08)] rounded-[10px] p-8 flex flex-col items-center justify-center gap-3 text-xs text-pml-text-dim animate-[slideUp_0.2s_ease-out]">
        <div class="w-6 h-6 rounded-full border-2 border-[#2a2a2e] border-t-pml-accent animate-spin" />
        <span>Loading tool details...</span>
      </div>
    );
  }

  if (!toolDetail) {
    return (
      <div class="mt-3 bg-[#0f0f12] border border-[rgba(255,184,111,0.08)] rounded-[10px] p-8 flex flex-col items-center justify-center gap-3 text-xs text-pml-text-dim animate-[slideUp_0.2s_ease-out]">
        <span>Could not load tool details</span>
        <button
          type="button"
          onClick={onClose}
          class="font-mono text-[0.6875rem] text-pml-text-dim bg-transparent border border-[rgba(255,184,111,0.2)] px-3 py-1.5 rounded cursor-pointer transition-all duration-150 hover:border-[rgba(255,184,111,0.4)] hover:text-pml-accent"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <ToolDetailPanel
      tool={{
        name: toolDetail.name,
        description: toolDetail.description,
        routing: toolDetail.routing,
        inputSchema: toolDetail.inputSchema,
        uiMeta: toolDetail.uiMeta,
      }}
      onClose={onClose}
      detailHref={item.href}
      schemaLoading={detailLoading}
    />
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CatalogPageIsland({
  entries,
  user: _user,
  isCloudMode: _isCloudMode,
}: CatalogPageIslandProps) {
  void _user;
  void _isCloudMode;

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  // Build UI components
  const uiComponents = useMemo(() => buildComponentMeta(), []);

  // Build categories with items
  const categories = useMemo(() => {
    const cats: Category[] = [];

    // 1. UI Component categories
    for (const [catId, catInfo] of Object.entries(UI_CATEGORIES)) {
      const catComponents = uiComponents.filter((c) => c.category === catId);
      if (catComponents.length === 0) continue;

      cats.push({
        id: `ui-${catId}`,
        label: catInfo.label,
        icon: catInfo.icon,
        isUiCategory: true,
        items: catComponents.map((comp) => ({
          id: `ui-${comp.id}`,
          name: comp.name,
          description: comp.description,
          type: "ui" as ItemType,
          category: `ui-${catId}`,
          href: `#ui-${comp.id}`,
          hasUi: true,
          resourceUri: comp.resourceUri,
          bentoSize: getComponentBentoSize(comp.id),
        })),
      });
    }

    // 2. Tool categories
    const toolEntries = entries.filter((e) => e.recordType === "mcp-tool");
    const toolsByCategory = new Map<string, CatalogItem[]>();

    for (const entry of toolEntries) {
      const catId = getToolCategory(entry.name);
      if (!toolsByCategory.has(catId)) {
        toolsByCategory.set(catId, []);
      }
      const entryUiMeta = (entry as any).uiMeta;
      toolsByCategory.get(catId)!.push({
        id: `tool-${entry.id}`,
        name: entry.name,
        description: entry.description,
        type: "tool",
        category: catId,
        href: `/catalog/${getServerRouteId(entry.serverId || "std", entry.name)}#${entry.name}`,
        hasUi: !!entryUiMeta?.resourceUri,
        resourceUri: entryUiMeta?.resourceUri,
      });
    }

    for (const [catId, catInfo] of Object.entries(TOOL_CATEGORIES)) {
      const items = toolsByCategory.get(catId) || [];
      if (items.length === 0) continue;

      items.sort((a, b) => a.name.localeCompare(b.name));
      cats.push({
        id: catId,
        label: catInfo.label,
        icon: catInfo.icon,
        items,
      });
    }

    // 3. Capabilities
    const capEntries = entries.filter((e) => e.recordType === "capability");
    if (capEntries.length > 0) {
      cats.push({
        id: "capabilities",
        label: "Capabilities",
        icon: "⚡",
        items: capEntries.map((entry) => ({
          id: `cap-${entry.id}`,
          name: entry.action || entry.name,
          description: entry.description,
          type: "capability" as ItemType,
          category: "capabilities",
          href: `/catalog/ns/${encodeURIComponent(entry.namespace || "default")}#${entry.name}`,
        })),
      });
    }

    return cats;
  }, [entries, uiComponents]);

  // Filter items
  const filteredCategories = useMemo(() => {
    if (!search && !activeCategory) return categories;

    return categories
      .filter((cat) => !activeCategory || cat.id === activeCategory)
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          if (!search) return true;
          const q = search.toLowerCase();
          return (
            item.name.toLowerCase().includes(q) ||
            item.description?.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, search, activeCategory]);

  // Stats
  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const filteredCount = filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0);

  // Auto-select first tool when category changes (only for non-UI categories)
  useEffect(() => {
    if (!activeCategory) {
      setSelectedItem(null);
      return;
    }

    const cat = categories.find((c) => c.id === activeCategory);
    if (cat && !cat.isUiCategory && cat.items.length > 0) {
      // Select first tool/capability in the category
      setSelectedItem(cat.items[0]);
    } else {
      setSelectedItem(null);
    }
  }, [activeCategory, categories]);

  return (
    <div class="min-h-screen bg-pml-bg text-pml-text font-sans pt-[60px] flex flex-col">
      <VitrineHeader activePage="catalog" />

      <div class="flex flex-1 max-w-[1600px] mx-auto w-full max-md:flex-col">
        {/* Sidebar */}
        <aside class="w-[200px] flex-shrink-0 bg-[#0f0f12] border-r border-[rgba(255,184,111,0.06)] py-4 sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto max-md:w-full max-md:relative max-md:top-0 max-md:h-auto max-md:border-r-0 max-md:border-b max-md:border-[rgba(255,184,111,0.06)] max-md:p-2">
          <div class="flex items-center justify-between px-3 pb-3 border-b border-[rgba(255,184,111,0.06)] mb-2">
            <h2 class="font-serif text-base font-normal m-0">Catalogue</h2>
            <span class="font-mono text-[0.625rem] text-pml-text-dim bg-[rgba(255,184,111,0.08)] px-1.5 py-0.5 rounded">{totalItems}</span>
          </div>

          <nav class="flex flex-col gap-0.5 px-1.5 max-md:flex-row max-md:flex-wrap max-md:gap-1">
            <button
              type="button"
              class={`flex items-center gap-1.5 px-2 py-1.5 text-xs bg-transparent border-none rounded cursor-pointer transition-all duration-100 text-left w-full max-md:py-1 max-md:px-1.5 max-md:text-[0.6875rem] ${
                !activeCategory
                  ? "bg-[rgba(255,184,111,0.1)] text-pml-accent"
                  : "text-stone-400 hover:bg-[rgba(255,184,111,0.06)] hover:text-pml-text"
              }`}
              onClick={() => setActiveCategory(null)}
            >
              <span class="text-[0.8125rem] w-[1.125rem] text-center">📚</span>
              <span class="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">Tous</span>
              <span class="font-mono text-[0.5625rem] text-pml-text-dim bg-[rgba(255,255,255,0.04)] px-1 py-0.5 rounded-sm">{totalItems}</span>
            </button>

            <div class="py-2.5 px-1.5 text-[0.5625rem] font-mono uppercase tracking-wider text-[#4a4540] max-md:w-full max-md:p-1"><span>UI Components</span></div>

            {categories.filter((c) => c.isUiCategory).map((cat) => (
              <button
                key={cat.id}
                type="button"
                class={`flex items-center gap-1.5 px-2 py-1.5 text-xs bg-transparent border-none rounded cursor-pointer transition-all duration-100 text-left w-full max-md:py-1 max-md:px-1.5 max-md:text-[0.6875rem] ${
                  activeCategory === cat.id
                    ? "bg-[rgba(255,184,111,0.1)] text-pml-accent"
                    : "text-stone-400 hover:bg-[rgba(255,184,111,0.06)] hover:text-pml-text"
                }`}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              >
                <span class="text-[0.8125rem] w-[1.125rem] text-center">{cat.icon}</span>
                <span class="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{cat.label}</span>
                <span class="font-mono text-[0.5625rem] text-pml-text-dim bg-[rgba(255,255,255,0.04)] px-1 py-0.5 rounded-sm">{cat.items.length}</span>
              </button>
            ))}

            <div class="py-2.5 px-1.5 text-[0.5625rem] font-mono uppercase tracking-wider text-[#4a4540] max-md:w-full max-md:p-1"><span>MCP Tools</span></div>

            {categories.filter((c) => !c.isUiCategory && c.id !== "capabilities").map((cat) => (
              <button
                key={cat.id}
                type="button"
                class={`flex items-center gap-1.5 px-2 py-1.5 text-xs bg-transparent border-none rounded cursor-pointer transition-all duration-100 text-left w-full max-md:py-1 max-md:px-1.5 max-md:text-[0.6875rem] ${
                  activeCategory === cat.id
                    ? "bg-[rgba(255,184,111,0.1)] text-pml-accent"
                    : "text-stone-400 hover:bg-[rgba(255,184,111,0.06)] hover:text-pml-text"
                }`}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              >
                <span class="text-[0.8125rem] w-[1.125rem] text-center">{cat.icon}</span>
                <span class="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{cat.label}</span>
                <span class="font-mono text-[0.5625rem] text-pml-text-dim bg-[rgba(255,255,255,0.04)] px-1 py-0.5 rounded-sm">{cat.items.length}</span>
              </button>
            ))}

            {categories.find((c) => c.id === "capabilities") && (
              <>
                <div class="py-2.5 px-1.5 text-[0.5625rem] font-mono uppercase tracking-wider text-[#4a4540] max-md:w-full max-md:p-1"><span>Workflows</span></div>
                <button
                  type="button"
                  class={`flex items-center gap-1.5 px-2 py-1.5 text-xs bg-transparent border-none rounded cursor-pointer transition-all duration-100 text-left w-full max-md:py-1 max-md:px-1.5 max-md:text-[0.6875rem] ${
                    activeCategory === "capabilities"
                      ? "bg-[rgba(255,184,111,0.1)] text-pml-accent"
                      : "text-stone-400 hover:bg-[rgba(255,184,111,0.06)] hover:text-pml-text"
                  }`}
                  onClick={() => setActiveCategory(activeCategory === "capabilities" ? null : "capabilities")}
                >
                  <span class="text-[0.8125rem] w-[1.125rem] text-center">⚡</span>
                  <span class="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">Capabilities</span>
                  <span class="font-mono text-[0.5625rem] text-pml-text-dim bg-[rgba(255,255,255,0.04)] px-1 py-0.5 rounded-sm">
                    {categories.find((c) => c.id === "capabilities")?.items.length || 0}
                  </span>
                </button>
              </>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main class="flex-1 p-4 px-5 overflow-y-auto">
          {/* Search bar */}
          <div class="flex items-center gap-4 mb-4">
            <div class="flex-1 relative max-w-[320px]">
              <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-pml-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="11" cy="11" r="8" strokeWidth="2" />
                <path strokeWidth="2" d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={search}
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                placeholder="Rechercher..."
                class="w-full py-2 px-2.5 pl-8 font-mono text-xs text-pml-text bg-[#141418] border border-[rgba(255,184,111,0.08)] rounded outline-none focus:border-[rgba(255,184,111,0.25)] placeholder:text-pml-text-dim"
              />
              {search && (
                <button
                  type="button"
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 bg-transparent border-none text-pml-text-dim cursor-pointer text-sm p-1"
                  onClick={() => setSearch("")}
                >
                  x
                </button>
              )}
            </div>
            <div class="flex items-center gap-1 text-[0.6875rem]">
              <span class="font-mono font-semibold text-pml-text">{filteredCount}</span>
              <span class="text-pml-text-dim">resultats</span>
              {activeCategory && (
                <button
                  type="button"
                  class="ml-1.5 text-pml-accent bg-transparent border-none cursor-pointer text-[0.625rem]"
                  onClick={() => setActiveCategory(null)}
                >
                  Effacer
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div class="flex flex-col gap-5">
            {filteredCategories.map((cat) => (
              <section key={cat.id} class="bg-[#0f0f12] border border-[rgba(255,184,111,0.06)] rounded-md p-3.5">
                <h3 class="flex items-center gap-1.5 m-0 mb-3 text-xs font-medium">
                  <span class="text-sm">{cat.icon}</span>
                  <span class="text-pml-text">{cat.label}</span>
                  <span class="font-mono text-[0.5625rem] text-pml-text-dim bg-[rgba(255,255,255,0.04)] px-1 py-0.5 rounded-sm ml-auto">{cat.items.length}</span>
                </h3>

                {/* UI Categories: Bento Grid with Previews */}
                {cat.isUiCategory ? (
                  <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 items-start max-lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-md:grid-cols-1">
                    {cat.items.map((item, i) => (
                      <BentoPreview key={item.id} item={item} index={i} />
                    ))}
                  </div>
                ) : (
                  /* Tools/Capabilities: Chips + Detail Panel */
                  <>
                    <div class="flex flex-wrap gap-1">
                      {cat.items.map((item, i) => (
                        <button
                          key={item.id}
                          type="button"
                          class={`inline-flex items-center gap-1 px-2 py-1 font-mono text-[0.625rem] bg-[#141418] border rounded-sm no-underline cursor-pointer transition-all duration-100 animate-[chipIn_0.15s_ease-out_both] ${
                            selectedItem?.id === item.id
                              ? item.type === "capability"
                                ? "bg-[rgba(74,222,128,0.15)] border-[rgba(74,222,128,0.4)] text-[#4ade80] shadow-[0_0_0_1px_rgba(74,222,128,0.2)]"
                                : "bg-[rgba(255,184,111,0.15)] border-[rgba(255,184,111,0.4)] text-pml-accent shadow-[0_0_0_1px_rgba(255,184,111,0.2)]"
                              : item.type === "capability"
                                ? "text-stone-400 border-[rgba(74,222,128,0.1)] hover:bg-[rgba(74,222,128,0.08)] hover:border-[rgba(74,222,128,0.3)] hover:text-[#4ade80]"
                                : "text-stone-400 border-[rgba(255,184,111,0.06)] hover:bg-[rgba(255,184,111,0.08)] hover:border-[rgba(255,184,111,0.3)] hover:text-pml-accent"
                          }`}
                          style={{ animationDelay: `${Math.min(i * 10, 200)}ms` }}
                          onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                        >
                          <span class="whitespace-nowrap overflow-hidden text-ellipsis max-w-[160px]">{item.name}</span>
                          {item.type === "capability" && <span class="text-[0.5rem] opacity-70 text-[#4ade80]">⚡</span>}
                          {item.hasUi && item.type === "tool" && <span class="text-[0.5rem] opacity-70 text-[#4ECDC4]">◉</span>}
                        </button>
                      ))}
                    </div>

                    {/* Detail Panel - shows when an item from this category is selected */}
                    {selectedItem && cat.items.some(item => item.id === selectedItem.id) && (
                      <DetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
                    )}
                  </>
                )}
              </section>
            ))}

            {filteredCategories.length === 0 && (
              <div class="flex flex-col items-center p-8 text-center bg-[#0f0f12] border border-dashed border-[rgba(255,184,111,0.1)] rounded-md">
                <span class="text-2xl opacity-50 mb-2">🔍</span>
                <p class="text-xs text-pml-text-dim m-0 mb-3">Aucun resultat</p>
                <button
                  type="button"
                  class="font-mono text-[0.625rem] text-pml-accent bg-transparent border border-[rgba(255,184,111,0.3)] px-3 py-1.5 rounded-sm cursor-pointer"
                  onClick={() => { setSearch(""); setActiveCategory(null); }}
                >
                  Reinitialiser
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer class="bg-pml-bg border-t border-[rgba(255,184,111,0.06)] px-6 py-4">
        <div class="max-w-[1600px] mx-auto flex items-center justify-between">
          <div class="flex flex-col gap-0.5">
            <span class="font-serif text-sm text-pml-accent">Casys PML</span>
            <span class="text-[0.625rem] text-pml-text-dim">Procedural Memory Layer</span>
          </div>
          <div class="flex gap-4">
            <a href="https://casys.ai" target="_blank" rel="noopener" class="text-[0.625rem] text-pml-text-dim no-underline hover:text-pml-accent">Casys.ai</a>
            <a href="https://github.com/Casys-AI/casys-pml" target="_blank" rel="noopener" class="text-[0.625rem] text-pml-text-dim no-underline hover:text-pml-accent">GitHub</a>
          </div>
        </div>
      </footer>

      {/* Minimal style block for keyframe animations only */}
      <style>
        {`
        @keyframes bentoIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes chipIn {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        `}
      </style>
    </div>
  );
}
