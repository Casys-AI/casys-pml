/**
 * Capability UIs Route Handler
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * GET /api/capabilities/:id/uis - Get collected UIs for a capability
 * PUT /api/capabilities/:id/uis - Update UI orchestration state (layout, sync rules, order)
 *
 * ## Architecture
 *
 * UI collection follows MCP Apps spec (SEP-1865):
 * - `_meta.ui.resourceUri` is in `tools/list` (tool definition), not in `tools/call` response
 * - UIs are collected based on which tools a capability uses (from `tools_used`)
 * - `UiCollector` service looks up `tool_schema.ui_meta` for each tool
 *
 * This approach is static (based on capability definition) rather than dynamic
 * (based on execution trace). For dynamic UIs, we'd need to store `collectedUis`
 * in execution traces and query the most recent one.
 *
 * @module web/routes/api/capabilities/[id]/uis
 */

import type { Context } from "fresh";
import type { AuthState } from "../../../_middleware.ts";
import { getDb } from "../../../../../db/mod.ts";
import { UiCollector } from "../../../../../services/ui-collector.ts";
import { getToolDisplayName } from "../../../../../capabilities/tool-id-utils.ts";
import type { UiOrchestrationState } from "../../../../types/ui-types.ts";
import * as log from "@std/log";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handler = {
  /**
   * GET /api/capabilities/:id/uis
   *
   * Returns collected UIs and orchestration state for a capability.
   *
   * UI collection is based on the tools used by the capability (from `tools_used`).
   * For each tool, we look up `tool_schema.ui_meta` to see if it has an associated UI.
   */
  async GET(ctx: Context<AuthState>) {
    const { isCloudMode, user } = ctx.state;
    const capabilityId = ctx.params.id;

    if (!capabilityId) {
      return json({ error: "Capability ID is required" }, 400);
    }

    // Cloud mode requires auth
    if (isCloudMode && (!user || user.id === "local")) {
      return json({ error: "Authentication required in cloud mode" }, 401);
    }

    try {
      const db = await getDb();

      // Get capability with UI orchestration and tools_used (from workflow_pattern.dag_structure)
      // Support both capability_records.id AND workflow_pattern.pattern_id as lookup key
      // (frontend may pass either depending on the source)
      const capability = await db.queryOne(
        `SELECT cr.id, cr.ui_orchestration,
                wp.dag_structure->'tools_used' as tools_used
         FROM capability_records cr
         LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
         WHERE cr.id = $1 OR wp.pattern_id = $1`,
        [capabilityId],
      ) as { id: string; ui_orchestration: UiOrchestrationState | null; tools_used: string[] | null } | null;

      if (!capability) {
        return json({ error: "Capability not found" }, 404);
      }

      // Collect UIs based on tools used by this capability
      // This uses tool_schema.ui_meta which is populated during MCP discovery
      // Tools in dag_structure.tools_used may be FQDNs - convert to "namespace:action" for DB lookup
      // but keep original toolId for trace matching
      const rawTools = capability.tools_used ?? [];
      log.debug(`[uis] rawTools type=${typeof rawTools}, isArray=${Array.isArray(rawTools)}, value=${JSON.stringify(rawTools)}`);

      // Build mapping: shortId -> longId for trace matching
      const toolIdMapping = new Map<string, string>();
      for (const longId of rawTools) {
        const shortId = getToolDisplayName(longId);
        toolIdMapping.set(shortId, longId);
      }

      const toolsUsed = rawTools.map((toolId: string) => getToolDisplayName(toolId));
      log.debug(`[uis] toolsUsed=${JSON.stringify(toolsUsed)}`);
      const uiCollector = new UiCollector(db);
      const collectedUisRaw = await uiCollector.collectFromToolsCalled(toolsUsed);

      // Add original toolId (long format) for trace matching
      const collectedUis = collectedUisRaw.map(ui => ({
        ...ui,
        toolId: toolIdMapping.get(ui.source) ?? ui.source, // Long format for trace matching
      }));

      const uiOrchestration = capability.ui_orchestration ?? {
        layout: "stack" as const,
        sync: [],
        panelOrder: collectedUis.map((_, i) => i),
      };

      // Enrich UIs with tool metadata (description, emits, accepts) - single batch query
      let enrichedUis = collectedUis;
      if (collectedUis.length > 0) {
        // Build batch query: WHERE (server_id, name) IN (($1,$2), ($3,$4), ...)
        const pairs = collectedUis.map((ui) => ui.source.split(":"));
        const placeholders = pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
        const params = pairs.flat();

        const toolInfoRows = await db.query(
          `SELECT server_id, name, description, ui_meta
           FROM tool_schema
           WHERE (server_id, name) IN (${placeholders})`,
          params,
        ) as Array<{ server_id: string; name: string; description: string | null; ui_meta: { emits?: string[]; accepts?: string[] } | null }>;

        // Index by "server:name" for O(1) lookup
        const toolInfoMap = new Map(
          toolInfoRows.map((row) => [`${row.server_id}:${row.name}`, row]),
        );

        enrichedUis = collectedUis.map((ui) => {
          const toolInfo = toolInfoMap.get(ui.source);
          return {
            ...ui,
            toolDescription: toolInfo?.description,
            emits: toolInfo?.ui_meta?.emits,
            accepts: toolInfo?.ui_meta?.accepts,
          };
        });
      }

      return json({
        capabilityId,
        collectedUis: enrichedUis,
        uiOrchestration,
        hasUis: enrichedUis.length > 0,
      });
    } catch (error) {
      log.error(
        `[GET /api/capabilities/${capabilityId}/uis] Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return json({ error: "Failed to get capability UIs" }, 500);
    }
  },

  /**
   * PUT /api/capabilities/:id/uis
   *
   * Update UI orchestration state (layout, sync rules, panel order)
   */
  async PUT(ctx: Context<AuthState>) {
    const { isCloudMode, user } = ctx.state;
    const capabilityId = ctx.params.id;

    if (!capabilityId) {
      return json({ error: "Capability ID is required" }, 400);
    }

    // Cloud mode requires auth
    if (isCloudMode && (!user || user.id === "local")) {
      return json({ error: "Authentication required in cloud mode" }, 401);
    }

    try {
      const body = await ctx.req.json() as Partial<UiOrchestrationState>;

      // Validate layout
      const validLayouts = ["split", "tabs", "grid", "stack"];
      if (body.layout && !validLayouts.includes(body.layout)) {
        return json(
          { error: `Invalid layout. Must be one of: ${validLayouts.join(", ")}` },
          400,
        );
      }

      // Validate sync rules structure
      if (body.sync) {
        for (const rule of body.sync) {
          if (!rule.from || !rule.event || !rule.to || !rule.action) {
            return json(
              { error: "Each sync rule must have: from, event, to, action" },
              400,
            );
          }
        }
      }

      const db = await getDb();

      // Check capability exists - support both capability_records.id and workflow_pattern.pattern_id
      const exists = await db.queryOne(
        `SELECT cr.id
         FROM capability_records cr
         LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
         WHERE cr.id = $1 OR wp.pattern_id = $1`,
        [capabilityId],
      ) as { id: string } | null;

      if (!exists) {
        return json({ error: "Capability not found" }, 404);
      }

      // Use the actual capability_records.id for updates
      const actualCapabilityId = exists.id;

      // Get current orchestration state
      const current = await db.queryOne(
        `SELECT ui_orchestration FROM capability_records WHERE id = $1`,
        [actualCapabilityId],
      ) as { ui_orchestration: UiOrchestrationState | null } | null;

      // Merge with existing state
      const merged: UiOrchestrationState = {
        layout: body.layout ?? current?.ui_orchestration?.layout ?? "stack",
        sync: body.sync ?? current?.ui_orchestration?.sync ?? [],
        panelOrder: body.panelOrder ?? current?.ui_orchestration?.panelOrder,
      };

      // Update using the actual capability_records.id
      await db.exec(
        `UPDATE capability_records
         SET ui_orchestration = $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [actualCapabilityId, JSON.stringify(merged)],
      );

      log.info(
        `[PUT /api/capabilities/${capabilityId}/uis] Updated orchestration: layout=${merged.layout}`,
      );

      return json({
        success: true,
        uiOrchestration: merged,
      });
    } catch (error) {
      log.error(
        `[PUT /api/capabilities/${capabilityId}/uis] Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return json({ error: "Failed to update capability UIs" }, 500);
    }
  },
};
