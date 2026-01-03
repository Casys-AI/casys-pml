/**
 * MCPCatalogCard - Card atom for MCP server display
 *
 * Cloud-only: used by the public MCP catalog page.
 * Uses existing atoms: Badge for type indicator.
 *
 * @module cloud/ui/catalog/MCPCatalogCard
 */

import Badge from "../../../web/components/ui/atoms/Badge.tsx";
import { type MCPCatalogEntry, TYPE_INFO } from "./types.ts";

interface MCPCatalogCardProps {
  entry: MCPCatalogEntry;
  onClick?: () => void;
}

export default function MCPCatalogCard({ entry, onClick }: MCPCatalogCardProps) {
  const typeInfo = TYPE_INFO[entry.type];

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
        {/* Header: Icon + Name + Type */}
        <div class="flex items-start gap-3 mb-2">
          {/* Icon */}
          {entry.icon && (
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
              style={{
                background: `${typeInfo.color}15`,
                border: `1px solid ${typeInfo.color}30`,
              }}
            >
              {entry.icon}
            </div>
          )}

          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
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
                  {entry.fqdn}
                </span>
              </div>
              <Badge color={typeInfo.color} label={typeInfo.label} />
            </div>
          </div>
        </div>

        {/* Description */}
        <p
          class="text-xs leading-relaxed mb-3 line-clamp-2"
          style={{ color: "var(--text-muted)" }}
        >
          {entry.description}
        </p>

        {/* Footer: optional metadata */}
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            {entry.toolCount !== undefined && (
              <span class="text-[11px] font-mono" style={{ color: "var(--text-dim)" }}>
                {entry.toolCount} tools
              </span>
            )}
          </div>

          <div class="flex items-center gap-1">
            {entry.isBuiltin && (
              <span
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(74, 222, 128, 0.15)", color: "#4ade80" }}
              >
                PML
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
