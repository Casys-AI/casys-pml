/**
 * CatalogCard - Card molecule for registry entry display
 *
 * Cloud-only: used by the public registry catalog page.
 * Displays both MCP tools and capabilities from pml_registry VIEW.
 * Uses existing atoms: Badge for type indicator.
 *
 * @module cloud/ui/catalog/CatalogCard
 */

import Badge from "../../../web/components/ui/atoms/Badge.tsx";
import { type CatalogEntry, RECORD_TYPE_INFO } from "./types.ts";

interface CatalogCardProps {
  entry: CatalogEntry;
  onClick?: () => void;
}

export default function CatalogCard({ entry, onClick }: CatalogCardProps) {
  const typeInfo = RECORD_TYPE_INFO[entry.recordType];

  // For capabilities, show namespace:action as subtitle
  const subtitle =
    entry.recordType === "capability" && entry.namespace && entry.action
      ? `${entry.namespace}:${entry.action}`
      : entry.serverId || entry.id;

  return (
    <div
      class="rounded-xl transition-all duration-200 cursor-pointer"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
      onClick={onClick}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = typeInfo.color;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 4px 20px ${typeInfo.color}20`;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div class="p-4">
        {/* Header: Name + Type Badge */}
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="min-w-0 flex-1">
            <h3
              class="font-semibold text-sm leading-tight truncate"
              style={{ color: "var(--text)" }}
              title={entry.name}
            >
              {entry.name}
            </h3>
            <span
              class="text-[11px] font-mono truncate block"
              style={{ color: "var(--text-dim)" }}
            >
              {subtitle}
            </span>
          </div>
          <Badge color={typeInfo.color} label={typeInfo.label} />
        </div>

        {/* Description */}
        <p
          class="text-xs leading-relaxed mb-3 line-clamp-2"
          style={{ color: "var(--text-muted)" }}
        >
          {entry.description || "No description available"}
        </p>

        {/* Footer: routing indicator */}
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            {entry.routing === "cloud" && (
              <span
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1"
                style={{ background: "rgba(96, 165, 250, 0.15)", color: "#60a5fa" }}
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeWidth="2"
                    d="M3 15a4 4 0 0 0 4 4h9a5 5 0 1 0-.1-9.999 5.002 5.002 0 0 0-9.78 2.096A4.001 4.001 0 0 0 3 15z"
                  />
                </svg>
                Cloud
              </span>
            )}
            {entry.routing === "local" && (
              <span
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1"
                style={{ background: "rgba(74, 222, 128, 0.15)", color: "#4ade80" }}
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeWidth="2" d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" strokeWidth="2" />
                </svg>
                Local
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
