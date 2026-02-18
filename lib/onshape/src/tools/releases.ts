/**
 * Onshape Release & Revision Tools
 *
 * MCP tools for release management: release packages, revisions, revision history.
 *
 * Onshape API Reference:
 *   - Release Packages: POST /releasepackages, GET /releasepackages/{rpid}
 *   - Revisions: GET /revisions/companies/{cid}
 *   - Revision by Part Number: GET /revisions/{cid}/partnumber/{pnum}
 *   - Revision History: GET /revisions/{cid}/partnumber/{pnum}/all
 *
 * @module lib/onshape/tools/releases
 */

import type { OnshapeTool } from "./types.ts";

export const releaseTools: OnshapeTool[] = [
  // ── Release Packages ──────────────────────────────────────────────────────

  {
    name: "onshape_release_create",
    description:
      "Create a new release package. Requires a documentId and at least one item to release. " +
      "Each item needs documentId and elementId; partId and versionId are optional.",
    category: "releases",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID (24-char hex)" },
        items: {
          type: "array",
          description: "Items to release: [{documentId, elementId, partId?, versionId?}]",
          items: {
            type: "object",
            properties: {
              documentId: { type: "string", description: "Document ID for the item" },
              elementId: { type: "string", description: "Element ID for the item" },
              partId: { type: "string", description: "Part ID (optional)" },
              versionId: { type: "string", description: "Version ID (optional)" },
            },
            required: ["documentId", "elementId"],
          },
        },
      },
      required: ["documentId", "items"],
    },
    handler: async (input, ctx) => {
      if (!input.documentId) {
        throw new Error("[onshape_release_create] 'documentId' is required");
      }
      if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("[onshape_release_create] 'items' must be a non-empty array");
      }

      const items = (
        input.items as Array<{
          documentId: string;
          elementId: string;
          partId?: string;
          versionId?: string;
        }>
      ).map((item) => {
        if (!item.documentId || !item.elementId) {
          throw new Error(
            "[onshape_release_create] Each item must have 'documentId' and 'elementId'",
          );
        }
        const mapped: Record<string, string> = {
          documentId: item.documentId,
          elementId: item.elementId,
        };
        if (item.partId) mapped.partId = item.partId;
        if (item.versionId) mapped.versionId = item.versionId;
        return mapped;
      });

      const result = await ctx.client.post<{ id: string }>("/releasepackages", {
        documentId: input.documentId as string,
        items,
      });

      return {
        data: result,
        message: `Release package ${result.id} created`,
      };
    },
  },

  {
    name: "onshape_release_get",
    description:
      "Get a release package by its ID (rpid). Returns the full release package object " +
      "including status, items, properties, and approval workflow state.",
    category: "releases",
    inputSchema: {
      type: "object",
      properties: {
        rpid: { type: "string", description: "Release package ID" },
      },
      required: ["rpid"],
    },
    handler: async (input, ctx) => {
      if (!input.rpid) {
        throw new Error("[onshape_release_get] 'rpid' is required");
      }
      const result = await ctx.client.get(`/releasepackages/${input.rpid as string}`);
      return { data: result };
    },
  },

  {
    name: "onshape_release_update",
    description:
      "Update a release package's properties. Requires the release package ID and an array " +
      "of property objects to update (e.g. name, description, part number).",
    category: "releases",
    inputSchema: {
      type: "object",
      properties: {
        rpid: { type: "string", description: "Release package ID" },
        properties: {
          type: "array",
          description: "Properties to update: [{propertyId, value}]",
          items: {
            type: "object",
            properties: {
              propertyId: { type: "string", description: "Property identifier" },
              value: { type: "string", description: "New property value" },
            },
            required: ["propertyId", "value"],
          },
        },
      },
      required: ["rpid", "properties"],
    },
    handler: async (input, ctx) => {
      if (!input.rpid) {
        throw new Error("[onshape_release_update] 'rpid' is required");
      }
      if (!input.properties || !Array.isArray(input.properties) || input.properties.length === 0) {
        throw new Error("[onshape_release_update] 'properties' must be a non-empty array");
      }

      const properties = (
        input.properties as Array<{ propertyId: string; value: string }>
      ).map((prop) => {
        if (!prop.propertyId || prop.value === undefined) {
          throw new Error(
            "[onshape_release_update] Each property must have 'propertyId' and 'value'",
          );
        }
        return { propertyId: prop.propertyId, value: prop.value };
      });

      const result = await ctx.client.post(
        `/releasepackages/${input.rpid as string}`,
        { properties },
      );

      return { data: result };
    },
  },

  // ── Revisions ─────────────────────────────────────────────────────────────

  {
    name: "onshape_revision_list",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "List revisions for a company. Filterable by element type (PARTSTUDIO, ASSEMBLY, DRAWING). " +
      "Returns a paginated list of revisions with part number, revision, status.",
    category: "releases",
    inputSchema: {
      type: "object",
      properties: {
        cid: { type: "string", description: "Company ID" },
        elementType: {
          type: "string",
          description: "Filter by element type (e.g. PARTSTUDIO, ASSEMBLY, DRAWING)",
        },
        limit: { type: "number", description: "Max results (default 20)" },
        offset: { type: "number", description: "Pagination offset (default 0)" },
      },
      required: ["cid"],
    },
    handler: async (input, ctx) => {
      if (!input.cid) {
        throw new Error("[onshape_revision_list] 'cid' is required");
      }

      const result = await ctx.client.get<{ items?: unknown[] }>(
        `/revisions/companies/${input.cid as string}`,
        {
          elementType: input.elementType as string | undefined,
          limit: (input.limit as number) ?? 20,
          offset: (input.offset as number) ?? 0,
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
    name: "onshape_revision_by_part_number",
    description:
      "Get the latest revision for a specific part number within a company. " +
      "Returns the revision details including status, release date, and element references.",
    category: "releases",
    inputSchema: {
      type: "object",
      properties: {
        cid: { type: "string", description: "Company ID" },
        pnum: { type: "string", description: "Part number" },
      },
      required: ["cid", "pnum"],
    },
    handler: async (input, ctx) => {
      if (!input.cid) {
        throw new Error("[onshape_revision_by_part_number] 'cid' is required");
      }
      if (!input.pnum) {
        throw new Error("[onshape_revision_by_part_number] 'pnum' is required");
      }

      const result = await ctx.client.get(
        `/revisions/${input.cid as string}/partnumber/${input.pnum as string}`,
      );
      return { data: result };
    },
  },

  {
    name: "onshape_revision_history",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "Get the full revision history for a part number within a company. " +
      "Returns all revisions (A, B, C, ...) with dates, status, and element references.",
    category: "releases",
    inputSchema: {
      type: "object",
      properties: {
        cid: { type: "string", description: "Company ID" },
        pnum: { type: "string", description: "Part number" },
      },
      required: ["cid", "pnum"],
    },
    handler: async (input, ctx) => {
      if (!input.cid) {
        throw new Error("[onshape_revision_history] 'cid' is required");
      }
      if (!input.pnum) {
        throw new Error("[onshape_revision_history] 'pnum' is required");
      }

      const result = await ctx.client.get<unknown[]>(
        `/revisions/${input.cid as string}/partnumber/${input.pnum as string}/all`,
      );

      const items = Array.isArray(result) ? result : [];
      return {
        count: items.length,
        data: items,
        _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
      };
    },
  },
];
