/**
 * Shared UI types for the dashboard
 *
 * Single source of truth for UI orchestration types used across:
 * - CytoscapeGraph (island)
 * - CompositeUiViewer (component)
 * - /api/capabilities/[id]/uis (route handler)
 *
 * Based on packages/pml/src/types/ui-orchestration.ts but extended
 * with dashboard-specific fields (toolId, panelOrder).
 *
 * @module web/types/ui-types
 */

/**
 * Collected UI resource from MCP Apps.
 *
 * Represents a single UI panel collected during capability execution.
 * Extended with `toolId` for trace matching in the dashboard.
 */
export interface CollectedUiResource {
  /** Tool that returned this UI - short format (e.g., "std:docker_ps") */
  source: string;
  /** Full tool ID for trace matching - long format (e.g., "pml.mcp.std.docker_ps.06bd") */
  toolId?: string;
  /** URI of the UI resource (e.g., "ui://postgres/table/abc123") */
  resourceUri: string;
  /** Optional context data for the UI */
  context?: Record<string, unknown>;
  /** Execution order slot (0-based index) */
  slot: number;
}

/**
 * UI orchestration state stored per capability.
 *
 * Controls layout, event routing, and panel ordering in the dashboard.
 */
export interface UiOrchestrationState {
  /** Layout mode: split, tabs, grid, stack */
  layout: "split" | "tabs" | "grid" | "stack";
  /** Sync rules for cross-UI event routing (tool names as from/to) */
  sync?: Array<{
    from: string;
    event: string;
    to: string | "*";
    action: string;
  }>;
  /** Current panel order (slot indices in display order) */
  panelOrder?: number[];
}
