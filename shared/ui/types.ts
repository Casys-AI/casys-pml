/**
 * Shared UI types — MCP Apps UI metadata contract.
 *
 * Used by both PML client (tool loading) and server (UI orchestration).
 *
 * @module @casys/pml-types/ui
 */

/**
 * UI metadata from MCP Apps (SEP-1865).
 *
 * Previously triplicated in:
 * - packages/pml/src/discovery/mcp-discovery.ts
 * - src/api/types.ts
 * - src/services/ui-collector.ts
 */
export interface ToolUiMeta {
  /** Resource URI for the UI component */
  resourceUri?: string;

  /** Visibility scope */
  visibility?: Array<"model" | "app">;

  /** Events this UI emits */
  emits?: string[];

  /** Events this UI accepts */
  accepts?: string[];
}

/**
 * Fetched UI HTML content for viewer rendering.
 */
export interface FetchedUiHtml {
  /** Resource URI (e.g., "ui://mcp-std/table-viewer") */
  resourceUri: string;

  /** HTML content */
  content: string;

  /** MIME type */
  mimeType: string;
}
