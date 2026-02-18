/**
 * Onshape Drawing Tools
 *
 * MCP tools for drawing operations: create, views, geometry, modify, export.
 *
 * Onshape API paths use:
 *   did = document ID (24 hex), wvm = workspace/version/microversion type,
 *   wvmid = workspace/version/microversion ID, eid = element ID
 *
 * @module lib/onshape/tools/drawings
 */

import type { OnshapeTool } from "./types.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate a required string param, throw with tool name if missing */
function requireString(
  input: Record<string, unknown>,
  key: string,
  toolName: string,
): string {
  const val = input[key];
  if (typeof val !== "string" || val.length === 0) {
    throw new Error(`[${toolName}] '${key}' is required`);
  }
  return val;
}

/** Extract wvm type (w/v/m) from input, default "w" */
function wvm(input: Record<string, unknown>): string {
  const t = (input.wvm_type as string) ?? "w";
  if (!["w", "v", "m"].includes(t)) {
    throw new Error(`[wvm_type] must be 'w', 'v', or 'm', got '${t}'`);
  }
  return t;
}

/** Common JSON schema fragment for wvm_type */
const wvmTypeSchema = {
  type: "string",
  enum: ["w", "v", "m"],
  description: "Workspace (w), version (v), or microversion (m). Default: w",
};

/** Common JSON schema fragment for wvm_id */
const wvmIdSchema = {
  type: "string",
  description: "Workspace, version, or microversion ID (24 hex)",
};

export const drawingTools: OnshapeTool[] = [
  // ── Create Drawing ────────────────────────────────────────────────────────

  {
    name: "onshape_drawing_create",
    description:
      "Create a new Drawing tab in an Onshape document workspace. " +
      "The body is a flexible JSON object that can specify template, sheet size, " +
      "views, and other drawing creation parameters. See Onshape API docs for full schema.",
    category: "drawings",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wid: { type: "string", description: "Workspace ID (24 hex)" },
        body: {
          type: "object",
          description:
            "Drawing creation body (JSON object). Can include template, " +
            "sheet size, views to auto-create, etc.",
        },
      },
      required: ["did", "wid", "body"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_drawing_create");
      const wid = requireString(input, "wid", "onshape_drawing_create");

      if (!input.body || typeof input.body !== "object") {
        throw new Error("[onshape_drawing_create] 'body' must be a JSON object");
      }

      const result = await ctx.client.post(
        `/drawings/d/${did}/w/${wid}/create`,
        input.body,
      );
      return {
        data: result,
        message: `Drawing created in document ${did}`,
      };
    },
  },

  // ── List Views ────────────────────────────────────────────────────────────

  {
    name: "onshape_drawing_views",
    description:
      "List all views in a drawing (front, top, section, detail, isometric, etc.). " +
      "Returns each view's ID, name, type, position, and scale.",
    category: "drawings",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Drawing element ID (24 hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_drawing_views");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_drawing_views");
      const eid = requireString(input, "eid", "onshape_drawing_views");

      const result = await ctx.client.get(
        `/drawings/d/${did}/${wvmType}/${wvmId}/e/${eid}/views`,
      );
      return { data: result };
    },
  },

  // ── View Geometry ─────────────────────────────────────────────────────────

  {
    name: "onshape_drawing_geometry",
    description:
      "Get the JSON geometry for a specific drawing view. Returns edges, vertices, " +
      "annotations, dimensions, and other geometric data in the view.",
    category: "drawings",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Drawing element ID (24 hex)" },
        viewId: {
          type: "string",
          description: "View ID within the drawing (from onshape_drawing_views)",
        },
      },
      required: ["did", "wvm_id", "eid", "viewId"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_drawing_geometry");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_drawing_geometry");
      const eid = requireString(input, "eid", "onshape_drawing_geometry");
      const viewId = requireString(input, "viewId", "onshape_drawing_geometry");

      const result = await ctx.client.get(
        `/drawings/d/${did}/${wvmType}/${wvmId}/e/${eid}/views/${viewId}/jsongeometry`,
      );
      return { data: result };
    },
  },

  // ── Modify Drawing ────────────────────────────────────────────────────────

  {
    name: "onshape_drawing_modify",
    description:
      "Modify a drawing: add/update/delete annotations, dimensions, notes, views. " +
      "Accepts a flexible JSON body — see Onshape API docs for the drawing modify schema.",
    category: "drawings",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wid: { type: "string", description: "Workspace ID (24 hex)" },
        eid: { type: "string", description: "Drawing element ID (24 hex)" },
        body: {
          type: "object",
          description:
            "Modify request body (JSON object). See Onshape API reference for full schema.",
        },
      },
      required: ["did", "wid", "eid", "body"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_drawing_modify");
      const wid = requireString(input, "wid", "onshape_drawing_modify");
      const eid = requireString(input, "eid", "onshape_drawing_modify");

      if (!input.body || typeof input.body !== "object") {
        throw new Error("[onshape_drawing_modify] 'body' must be a JSON object");
      }

      const result = await ctx.client.post(
        `/drawings/d/${did}/w/${wid}/e/${eid}/modify`,
        input.body,
      );
      return { data: result };
    },
  },

  // ── Export Drawing ────────────────────────────────────────────────────────

  {
    name: "onshape_drawing_export",
    description:
      "Export a drawing to PDF, DXF, or DWG format. Initiates an asynchronous translation. " +
      "Returns a translation ID that can be polled for completion and download URL.",
    category: "drawings",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Drawing element ID (24 hex)" },
        formatName: {
          type: "string",
          enum: ["PDF", "DXF", "DWG"],
          description: "Target export format: PDF, DXF, or DWG",
        },
        options: {
          type: "object",
          description:
            "Additional export options (e.g. colorMethod, destinationName). " +
            "Varies by format — see Onshape API docs.",
        },
      },
      required: ["did", "wvm_id", "eid", "formatName"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_drawing_export");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_drawing_export");
      const eid = requireString(input, "eid", "onshape_drawing_export");
      const formatName = requireString(input, "formatName", "onshape_drawing_export");

      if (!["PDF", "DXF", "DWG"].includes(formatName)) {
        throw new Error(
          `[onshape_drawing_export] 'formatName' must be PDF, DXF, or DWG, got '${formatName}'`,
        );
      }

      const body: Record<string, unknown> = { formatName };
      if (input.options && typeof input.options === "object") {
        Object.assign(body, input.options);
      }

      const result = await ctx.client.post(
        `/drawings/d/${did}/${wvmType}/${wvmId}/e/${eid}/translations`,
        body,
      );
      return {
        data: result,
        message: `Drawing export to ${formatName} initiated. Poll the translation ID for completion.`,
      };
    },
  },
];
