import { useEffect, useRef, useState } from "preact/hooks";
import Badge from "../components/ui/atoms/Badge.tsx";
import Divider from "../components/ui/atoms/Divider.tsx";

export type ViewMode = "capabilities" | "emergence" | "graph";
export type SortBy = "date" | "usage" | "success";
export type SuccessFilter = "all" | "high" | "medium" | "low";
export type CardDensity = "compact" | "normal" | "extended";

interface ExplorerSidebarProps {
  servers: Set<string>;
  hiddenServers: Set<string>;
  getServerColor: (server: string) => string;
  onToggleServer: (server: string) => void;
  onExportJson: () => void;
  onExportPng: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  sortBy?: SortBy;
  onSortChange?: (sort: SortBy) => void;
  successFilter?: SuccessFilter;
  onSuccessFilterChange?: (filter: SuccessFilter) => void;
  density?: CardDensity;
  onDensityChange?: (density: CardDensity) => void;
  highlightDepth?: number;
  onDepthChange?: (depth: number) => void;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;

export default function ExplorerSidebar({
  servers,
  hiddenServers,
  getServerColor,
  onToggleServer,
  onExportJson,
  onExportPng,
  viewMode = "capabilities",
  onViewModeChange,
  sortBy = "date",
  onSortChange,
  successFilter = "all",
  onSuccessFilterChange,
  density = "normal",
  onDensityChange,
  highlightDepth = 1,
  onDepthChange,
}: ExplorerSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("explorer-sidebar-collapsed");
    return saved === "true";
  });

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = localStorage.getItem("explorer-sidebar-width");
    return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10))) : DEFAULT_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("explorer-sidebar-collapsed", String(collapsed));
    }
  }, [collapsed]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("explorer-sidebar-width", String(panelWidth));
    }
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  if (collapsed) {
    return (
      <div
        class="flex items-center justify-center cursor-pointer h-full transition-all hover:bg-white/5 bg-gradient-to-b from-stone-900 to-stone-950 border-r border-pml-accent/[0.08]"
        style={{ width: "40px" }}
        onClick={() => setCollapsed(false)}
        title="Ouvrir le panneau"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="text-stone-500"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      class="flex flex-col h-full relative overflow-hidden bg-gradient-to-b from-stone-900 to-stone-950 border-r border-pml-accent/[0.08]"
      style={{
        width: `${panelWidth}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
      }}
    >
      <div
        class={`absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize z-10 group ${
          isResizing ? "bg-pml-accent" : "bg-transparent"
        }`}
        onMouseDown={() => setIsResizing(true)}
        onMouseOver={(e) => {
          if (!isResizing) e.currentTarget.style.background = "rgba(255, 184, 111, 0.3)";
        }}
        onMouseOut={(e) => {
          if (!isResizing) e.currentTarget.style.background = "transparent";
        }}
      >
        <div class="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-16 rounded-full bg-pml-accent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div class="flex items-center justify-between px-3 py-3 shrink-0 border-b border-pml-accent/[0.08]">
        <h2 class="text-sm font-semibold text-stone-100">
          Explorer
        </h2>
        <button
          type="button"
          class="p-1.5 rounded-lg transition-all hover:bg-white/10"
          onClick={() => setCollapsed(true)}
          title="Réduire"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-stone-500"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-4">
        {onViewModeChange && (
          <div>
            <h3 class="text-[10px] font-semibold uppercase tracking-widest mb-2 text-stone-500">
              Mode
            </h3>
            <div class="flex gap-1">
              <button
                type="button"
                class={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center border ${
                  viewMode === "capabilities"
                    ? "bg-pml-accent text-stone-950 border-pml-accent"
                    : "bg-stone-800 text-stone-400 border-pml-accent/[0.08]"
                }`}
                onClick={() => onViewModeChange("capabilities")}
                title="Capabilities"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                class={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center border ${
                  viewMode === "emergence"
                    ? "bg-pml-accent text-stone-950 border-pml-accent"
                    : "bg-stone-800 text-stone-400 border-pml-accent/[0.08]"
                }`}
                onClick={() => onViewModeChange("emergence")}
                title="Emergence - CAS metrics"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              </button>
              <button
                type="button"
                class={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center border ${
                  viewMode === "graph"
                    ? "bg-pml-accent text-stone-950 border-pml-accent"
                    : "bg-stone-800 text-stone-400 border-pml-accent/[0.08]"
                }`}
                onClick={() => onViewModeChange("graph")}
                title="Graph"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="12" cy="12" r="2" />
                  <line x1="8" y1="8" x2="10" y2="10" />
                  <line x1="14" y1="14" x2="16" y2="16" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <Divider />

        {viewMode === "capabilities" && onDensityChange && (
          <>
            <div>
              <h3 class="text-[10px] font-semibold uppercase tracking-widest mb-2 text-stone-500">
                Densité
              </h3>
              <div class="flex gap-1">
                {[
                  { key: "compact" as CardDensity, label: "Compact", icon: "≡" },
                  { key: "normal" as CardDensity, label: "Normal", icon: "☰" },
                  { key: "extended" as CardDensity, label: "Étendu", icon: "▤" },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    class={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 border ${
                      density === key
                        ? "bg-pml-accent text-stone-950 border-pml-accent"
                        : "bg-stone-800 text-stone-400 border-pml-accent/[0.08]"
                    }`}
                    onClick={() => onDensityChange(key)}
                    title={label}
                  >
                    <span>{icon}</span>
                  </button>
                ))}
              </div>
            </div>
            <Divider />
          </>
        )}

        {viewMode === "capabilities" && onSortChange && (
          <>
            <div>
              <h3 class="text-[10px] font-semibold uppercase tracking-widest mb-2 text-stone-500">
                Trier par
              </h3>
              <div class="flex gap-1">
                {(["date", "usage", "success"] as SortBy[]).map((sort) => (
                  <button
                    key={sort}
                    type="button"
                    class={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      sortBy === sort
                        ? "bg-pml-accent text-stone-950 border-pml-accent"
                        : "bg-stone-800 text-stone-400 border-pml-accent/[0.08]"
                    }`}
                    onClick={() => onSortChange(sort)}
                  >
                    {sort === "date" ? "Date" : sort === "usage" ? "Usage" : "Succès"}
                  </button>
                ))}
              </div>
            </div>
            <Divider />
          </>
        )}

        {viewMode === "capabilities" && onSuccessFilterChange && (
          <>
            <div>
              <h3 class="text-[10px] font-semibold uppercase tracking-widest mb-2 text-stone-500">
                Taux de succès
              </h3>
              <div class="flex flex-wrap gap-1">
                {[
                  { key: "all" as SuccessFilter, label: "Tous" },
                  { key: "high" as SuccessFilter, label: ">80%" },
                  { key: "medium" as SuccessFilter, label: "50-80%" },
                  { key: "low" as SuccessFilter, label: "<50%" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    class={`px-2 py-1 rounded-md text-xs font-medium transition-all border ${
                      successFilter === key
                        ? "bg-pml-accent text-stone-950 border-pml-accent"
                        : "bg-stone-800 text-stone-400 border-pml-accent/[0.08]"
                    }`}
                    onClick={() => onSuccessFilterChange(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Divider />
          </>
        )}

        {servers.size > 0 && viewMode !== "graph" && (
          <div>
            <h3 class="text-[10px] font-semibold uppercase tracking-widest mb-2 text-stone-500">
              Serveurs MCP
            </h3>
            <div class="space-y-1">
              {Array.from(servers).map((server) => (
                <Badge
                  key={server}
                  color={getServerColor(server)}
                  label={server}
                  active={!hiddenServers.has(server)}
                  onClick={() => onToggleServer(server)}
                />
              ))}
            </div>
          </div>
        )}

        {viewMode === "graph" && (
          <>
            <Divider />
            {onDepthChange && (
              <div>
                <h3 class="text-[10px] font-semibold uppercase tracking-widest mb-2 text-stone-500">
                  Profondeur
                </h3>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={highlightDepth}
                    onChange={(e) => onDepthChange(parseInt((e.target as HTMLInputElement).value, 10))}
                    class="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-stone-800"
                    style={{
                      background: `linear-gradient(to right, #FFB86F 0%, #FFB86F ${((highlightDepth - 1) / 4) * 100}%, #1a1816 ${((highlightDepth - 1) / 4) * 100}%, #1a1816 100%)`,
                    }}
                  />
                  <span class="text-sm font-semibold w-6 text-center text-pml-accent">
                    {highlightDepth}
                  </span>
                </div>
                <div class="flex justify-between text-[9px] mt-1 text-stone-500">
                  <span>Direct</span>
                  <span>Deep</span>
                </div>
              </div>
            )}

            <Divider />

            <div>
              <h3 class="text-[10px] font-semibold uppercase tracking-widest mb-2 text-stone-500">
                Hiérarchie
              </h3>
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-pml-accent/35" />
                  <span class="text-xs text-stone-400">Tools</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-pml-accent/60" />
                  <span class="text-xs text-stone-400">Capabilities</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-orange-500/90" />
                  <span class="text-xs text-stone-400">Meta-caps</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div class="p-3 shrink-0 flex gap-2 border-t border-pml-accent/[0.08]">
        <button
          type="button"
          class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all bg-stone-800 text-stone-400 border border-pml-accent/[0.08] hover:brightness-110"
          onClick={onExportJson}
        >
          JSON
        </button>
        <button
          type="button"
          class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all bg-stone-800 text-stone-400 border border-pml-accent/[0.08] hover:brightness-110"
          onClick={onExportPng}
        >
          PNG
        </button>
      </div>
    </div>
  );
}
