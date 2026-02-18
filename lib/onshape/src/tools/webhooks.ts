/**
 * Onshape Webhook Tools
 *
 * MCP tools for webhook management: create, list, delete.
 *
 * Onshape API Reference:
 *   - Create: POST /webhooks
 *   - List: GET /webhooks
 *   - Delete: DELETE /webhooks/{wid}
 *
 * @module lib/onshape/tools/webhooks
 */

import type { OnshapeTool } from "./types.ts";

export const webhookTools: OnshapeTool[] = [
  // ── Webhooks ──────────────────────────────────────────────────────────────

  {
    name: "onshape_webhook_create",
    description:
      "Create a new webhook subscription. Requires a callback URL and at least one event type. " +
      "Common events: 'onshape.model.lifecycle.changed', 'onshape.model.translation.complete', " +
      "'onshape.document.lifecycle.statechange'. Options object is optional for extra config.",
    category: "webhooks",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Callback URL that will receive webhook POST requests" },
        events: {
          type: "array",
          description: "Event types to subscribe to (e.g. ['onshape.model.lifecycle.changed'])",
          items: { type: "string" },
        },
        options: {
          type: "object",
          description: "Additional webhook options (e.g. filter, collapseEvents) — optional",
        },
      },
      required: ["url", "events"],
    },
    handler: async (input, ctx) => {
      if (!input.url) {
        throw new Error("[onshape_webhook_create] 'url' is required");
      }
      if (!input.events || !Array.isArray(input.events) || input.events.length === 0) {
        throw new Error("[onshape_webhook_create] 'events' must be a non-empty array");
      }

      const body: Record<string, unknown> = {
        url: input.url as string,
        events: input.events as string[],
      };
      if (input.options !== undefined) body.options = input.options;

      const result = await ctx.client.post<{ id: string }>("/webhooks", body);
      return {
        data: result,
        message: `Webhook ${result.id} created for ${(input.events as string[]).length} event(s)`,
      };
    },
  },

  {
    name: "onshape_webhook_list",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "List all webhook subscriptions. Returns a paginated list with webhook ID, URL, " +
      "events, status, and creation date.",
    category: "webhooks",
    inputSchema: {
      type: "object",
      properties: {
        offset: { type: "number", description: "Pagination offset (default 0)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
    handler: async (input, ctx) => {
      const result = await ctx.client.get<{ items?: unknown[] }>(
        "/webhooks",
        {
          offset: (input.offset as number) ?? 0,
          limit: (input.limit as number) ?? 20,
        },
      );

      const items = result.items ?? (Array.isArray(result) ? result : []);
      return {
        count: items.length,
        data: items,
        _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
      };
    },
  },

  {
    name: "onshape_webhook_delete",
    description:
      "Delete a webhook subscription by its webhook ID. Stops all future event deliveries " +
      "to the registered callback URL. This action cannot be undone.",
    category: "webhooks",
    inputSchema: {
      type: "object",
      properties: {
        wid: { type: "string", description: "Webhook ID to delete" },
      },
      required: ["wid"],
    },
    handler: async (input, ctx) => {
      if (!input.wid) {
        throw new Error("[onshape_webhook_delete] 'wid' is required");
      }

      await ctx.client.del(`/webhooks/${input.wid as string}`);
      return {
        data: { deleted: true, wid: input.wid as string },
        message: `Webhook ${input.wid as string} deleted`,
      };
    },
  },
];
