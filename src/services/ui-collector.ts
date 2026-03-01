/**
 * UI Collector Service
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * Collects UI resources for tools that were called during execution.
 * This replaces the previous in-sandbox collection approach.
 *
 * ## Architecture
 *
 * Per MCP Apps spec (SEP-1865), `_meta.ui.resourceUri` is defined in `tools/list`
 * (during server discovery), NOT in `tools/call` responses. Therefore:
 *
 * 1. **Discovery time**: `schema-extractor.ts` extracts `_meta.ui` from `tools/list`
 *    and stores it in `tool_schema.ui_meta` (PostgreSQL)
 *
 * 2. **Execution time**: Sandbox executes code and returns `toolsCalled[]`
 *
 * 3. **Collection time** (this service): Look up `tool_schema.ui_meta` for each
 *    called tool and build `CollectedUiResource[]`
 *
 * This separation keeps the sandbox pure (just execution) and centralizes
 * UI metadata in the database where it can be queried and cached.
 *
 * ## Usage
 *
 * ```typescript
 * import { UiCollector } from "./services/ui-collector.ts";
 *
 * const collector = new UiCollector(db);
 * const collectedUis = await collector.collectFromToolsCalled(
 *   ["postgres:query", "viz:render", "std:echo"],
 *   { workflowId: "wf-123" }
 * );
 * // Returns CollectedUiResource[] for tools that have ui_meta
 * ```
 *
 * @module services/ui-collector
 */

import * as log from "@std/log";
import type { DbClient } from "../db/client.ts";

/**
 * Collected UI resource from MCP tool execution.
 * Compatible with packages/pml CollectedUiResource type.
 */
export interface CollectedUiResource {
  /** Tool that has this UI (e.g., "postgres:query") */
  source: string;
  /** URI of the UI resource (e.g., "ui://postgres/table") */
  resourceUri: string;
  /** Optional context for the UI */
  context?: Record<string, unknown>;
  /** Slot index for ordering in composite UI */
  slot: number;
}

// ToolUiMeta — imported from shared types
import type { ToolUiMeta } from "@casys/pml-types";

/**
 * Options for UI collection
 */
export interface CollectUiOptions {
  /** Workflow/trace ID for context */
  workflowId?: string;
  /** Tool call arguments (for UI context) */
  toolArgs?: Map<string, unknown>;
  /** Tool call results (for UI context) */
  toolResults?: Map<string, unknown>;
}

/**
 * Service for collecting UI resources based on tools called during execution.
 *
 * This service queries `tool_schema.ui_meta` to determine which tools have
 * associated UIs and builds the `CollectedUiResource[]` array.
 */
export class UiCollector {
  constructor(private readonly db: DbClient) {}

  /**
   * Collect UI resources for tools that were called.
   *
   * @param toolsCalled - Array of tool IDs that were called (e.g., ["postgres:query", "std:echo"])
   * @param options - Optional context (workflowId, args, results)
   * @returns Array of CollectedUiResource for tools that have UI metadata
   *
   * @example
   * ```typescript
   * const uis = await collector.collectFromToolsCalled(
   *   ["postgres:query", "viz:render"],
   *   { workflowId: "wf-123" }
   * );
   * // Returns: [
   * //   { source: "postgres:query", resourceUri: "ui://postgres/table", slot: 0 },
   * //   { source: "viz:render", resourceUri: "ui://viz/chart", slot: 1 }
   * // ]
   * ```
   */
  async collectFromToolsCalled(
    toolsCalled: string[],
    options: CollectUiOptions = {},
  ): Promise<CollectedUiResource[]> {
    if (!toolsCalled || toolsCalled.length === 0) {
      return [];
    }

    // Deduplicate while preserving order (first occurrence)
    const uniqueTools = [...new Set(toolsCalled)];

    log.debug(
      `[UiCollector] Looking up ui_meta for tools: ${JSON.stringify(uniqueTools)}`,
    );

    // Query tool_schema for ui_meta of called tools
    const toolsWithUi = await this.queryToolUiMetas(uniqueTools);

    if (toolsWithUi.length === 0) {
      log.debug(`[UiCollector] No tools with UI found`);
      return [];
    }

    // Build CollectedUiResource array
    const collectedUis: CollectedUiResource[] = [];
    let slotCounter = 0;

    for (const toolId of uniqueTools) {
      const rawUiMeta = toolsWithUi.find((t) => t.toolId === toolId)?.uiMeta;
      log.debug(`[UiCollector] Tool ${toolId} rawUiMeta type=${typeof rawUiMeta}, value=${JSON.stringify(rawUiMeta)}`);
      // Parse if string (PostgreSQL may return jsonb as string)
      const uiMeta = typeof rawUiMeta === "string" ? JSON.parse(rawUiMeta) : rawUiMeta;
      if (!uiMeta?.resourceUri) {
        continue;
      }

      const context: Record<string, unknown> = {};

      // Add workflow ID to context if provided
      if (options.workflowId) {
        context._workflowId = options.workflowId;
      }

      // Add tool args if provided
      if (options.toolArgs?.has(toolId)) {
        context._args = options.toolArgs.get(toolId);
      }

      // Add tool result if provided
      if (options.toolResults?.has(toolId)) {
        context._result = options.toolResults.get(toolId);
      }

      collectedUis.push({
        source: toolId,
        resourceUri: uiMeta.resourceUri,
        context: Object.keys(context).length > 0 ? context : undefined,
        slot: slotCounter++,
      });

      log.debug(
        `[UiCollector] Collected UI from ${toolId}: ${uiMeta.resourceUri}`,
      );
    }

    log.info(
      `[UiCollector] Collected ${collectedUis.length} UIs from ${uniqueTools.length} tools`,
    );

    return collectedUis;
  }

  /**
   * Query tool_schema for ui_meta of specified tools.
   *
   * @param toolIds - Tool IDs to query (e.g., ["postgres:query", "std:echo"])
   * @returns Array of {toolId, uiMeta} for tools that have ui_meta
   */
  private async queryToolUiMetas(
    toolIds: string[],
  ): Promise<Array<{ toolId: string; uiMeta: ToolUiMeta | null }>> {
    if (toolIds.length === 0) {
      return [];
    }

    // Build tool_id list for IN clause
    // Tool IDs are in format "server:name", tool_id in DB is "server:name"
    const placeholders = toolIds.map((_, i) => `$${i + 1}`).join(", ");

    log.debug(`[UiCollector] Query: tool_id IN (${toolIds.join(", ")})`);
    const rows = await this.db.query(
      `SELECT tool_id, ui_meta
       FROM tool_schema
       WHERE tool_id IN (${placeholders})
         AND ui_meta IS NOT NULL`,
      toolIds,
    );
    log.debug(`[UiCollector] Query returned ${rows.length} rows`);

    return rows.map((row) => ({
      toolId: row.tool_id as string,
      uiMeta: row.ui_meta as ToolUiMeta | null,
    }));
  }

  /**
   * Check if any of the given tools have UI metadata.
   *
   * @param toolIds - Tool IDs to check
   * @returns true if at least one tool has ui_meta
   */
  async hasAnyUi(toolIds: string[]): Promise<boolean> {
    if (!toolIds || toolIds.length === 0) {
      return false;
    }

    const placeholders = toolIds.map((_, i) => `$${i + 1}`).join(", ");

    const result = await this.db.queryOne(
      `SELECT COUNT(*) as count
       FROM tool_schema
       WHERE tool_id IN (${placeholders})
         AND ui_meta IS NOT NULL`,
      toolIds,
    );

    return Number(result?.count ?? 0) > 0;
  }
}
