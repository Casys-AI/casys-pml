/**
 * Onshape Parts Tools
 *
 * MCP tools for Part-level operations: listing parts, body details,
 * mass properties, bounding boxes, shaded views, bend tables, faces.
 *
 * @module lib/onshape/tools/parts
 */

import type { OnshapeTool } from "./types.ts";

export const partTools: OnshapeTool[] = [
  // ── List Parts ──────────────────────────────────────────────────────────

  {
    name: "onshape_parts_list",
    description:
      "List all parts in a document, or in a specific element (Part Studio). " +
      "Returns part IDs, names, material, appearance, and body type for each part.",
    category: "parts",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wvm_type: {
          type: "string",
          enum: ["w", "v", "m"],
          description: "Workspace (w), Version (v), or Microversion (m)",
        },
        wvm_id: { type: "string", description: "Workspace, Version, or Microversion ID" },
        eid: {
          type: "string",
          description: "Element ID (optional, scope to a specific Part Studio)",
        },
      },
      required: ["did", "wvm_id"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string | undefined;
      if (!did) throw new Error("[onshape_parts_list] 'did' is required");
      if (!wvmId) throw new Error("[onshape_parts_list] 'wvm_id' is required");

      const path = eid
        ? `/parts/d/${did}/${wvm}/${wvmId}/e/${eid}`
        : `/parts/d/${did}/${wvm}/${wvmId}`;

      const result = await ctx.client.get(path);
      return { data: result };
    },
  },

  // ── Single Part Operations ──────────────────────────────────────────────

  {
    name: "onshape_part_body_details",
    description:
      "Get body details for a specific part. Returns topology info (faces, edges, vertices).",
    category: "parts",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wvm_type: {
          type: "string",
          enum: ["w", "v", "m"],
          description: "Workspace (w), Version (v), or Microversion (m)",
        },
        wvm_id: { type: "string", description: "Workspace, Version, or Microversion ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        pid: { type: "string", description: "Part ID" },
      },
      required: ["did", "wvm_id", "eid", "pid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      const pid = input.pid as string;
      if (!did) throw new Error("[onshape_part_body_details] 'did' is required");
      if (!wvmId) throw new Error("[onshape_part_body_details] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_part_body_details] 'eid' is required");
      if (!pid) throw new Error("[onshape_part_body_details] 'pid' is required");

      const result = await ctx.client.get(
        `/parts/d/${did}/${wvm}/${wvmId}/e/${eid}/partid/${pid}/bodydetails`,
      );
      return { data: result };
    },
  },

  {
    name: "onshape_part_mass_properties",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/mass-viewer" } },
    description:
      "Get mass properties for a specific part. Returns volume, mass, density, " +
      "center of mass, and inertia tensor.",
    category: "parts",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wvm_type: {
          type: "string",
          enum: ["w", "v", "m"],
          description: "Workspace (w), Version (v), or Microversion (m)",
        },
        wvm_id: { type: "string", description: "Workspace, Version, or Microversion ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        pid: { type: "string", description: "Part ID" },
      },
      required: ["did", "wvm_id", "eid", "pid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      const pid = input.pid as string;
      if (!did) throw new Error("[onshape_part_mass_properties] 'did' is required");
      if (!wvmId) throw new Error("[onshape_part_mass_properties] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_part_mass_properties] 'eid' is required");
      if (!pid) throw new Error("[onshape_part_mass_properties] 'pid' is required");

      const result = await ctx.client.get(
        `/parts/d/${did}/${wvm}/${wvmId}/e/${eid}/partid/${pid}/massproperties`,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/mass-viewer" } } };
    },
  },

  {
    name: "onshape_part_bounding_boxes",
    description:
      "Get bounding box for a specific part. Returns min/max XYZ coordinates.",
    category: "parts",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wvm_type: {
          type: "string",
          enum: ["w", "v", "m"],
          description: "Workspace (w), Version (v), or Microversion (m)",
        },
        wvm_id: { type: "string", description: "Workspace, Version, or Microversion ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        pid: { type: "string", description: "Part ID" },
      },
      required: ["did", "wvm_id", "eid", "pid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      const pid = input.pid as string;
      if (!did) throw new Error("[onshape_part_bounding_boxes] 'did' is required");
      if (!wvmId) throw new Error("[onshape_part_bounding_boxes] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_part_bounding_boxes] 'eid' is required");
      if (!pid) throw new Error("[onshape_part_bounding_boxes] 'pid' is required");

      const result = await ctx.client.get(
        `/parts/d/${did}/${wvm}/${wvmId}/e/${eid}/partid/${pid}/boundingboxes`,
      );
      return { data: result };
    },
  },

  {
    name: "onshape_part_shaded_views",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/3d-viewer" } },
    description:
      "Get shaded view images of a specific part. Returns base64-encoded PNG images.",
    category: "parts",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wvm_type: {
          type: "string",
          enum: ["w", "v", "m"],
          description: "Workspace (w), Version (v), or Microversion (m)",
        },
        wvm_id: { type: "string", description: "Workspace, Version, or Microversion ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        pid: { type: "string", description: "Part ID" },
        outputHeight: { type: "number", description: "Output image height in pixels (default 500)" },
        outputWidth: { type: "number", description: "Output image width in pixels (default 500)" },
        viewMatrix: {
          type: "string",
          description: "12-number view matrix as comma-separated string (optional)",
        },
      },
      required: ["did", "wvm_id", "eid", "pid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      const pid = input.pid as string;
      if (!did) throw new Error("[onshape_part_shaded_views] 'did' is required");
      if (!wvmId) throw new Error("[onshape_part_shaded_views] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_part_shaded_views] 'eid' is required");
      if (!pid) throw new Error("[onshape_part_shaded_views] 'pid' is required");

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.outputHeight != null) query.outputHeight = input.outputHeight as number;
      if (input.outputWidth != null) query.outputWidth = input.outputWidth as number;
      if (input.viewMatrix) query.viewMatrix = input.viewMatrix as string;

      const result = await ctx.client.get(
        `/parts/d/${did}/${wvm}/${wvmId}/e/${eid}/partid/${pid}/shadedviews`,
        query,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/3d-viewer" } } };
    },
  },

  // ── Sheet Metal & Geometry ──────────────────────────────────────────────

  {
    name: "onshape_part_bend_table",
    description:
      "Get the bend table for a sheet metal part. Returns bend angle, radius, " +
      "deduction/allowance values.",
    category: "parts",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wvm_type: {
          type: "string",
          enum: ["w", "v", "m"],
          description: "Workspace (w), Version (v), or Microversion (m)",
        },
        wvm_id: { type: "string", description: "Workspace, Version, or Microversion ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        pid: { type: "string", description: "Part ID" },
      },
      required: ["did", "wvm_id", "eid", "pid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      const pid = input.pid as string;
      if (!did) throw new Error("[onshape_part_bend_table] 'did' is required");
      if (!wvmId) throw new Error("[onshape_part_bend_table] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_part_bend_table] 'eid' is required");
      if (!pid) throw new Error("[onshape_part_bend_table] 'pid' is required");

      const result = await ctx.client.get(
        `/parts/d/${did}/${wvm}/${wvmId}/e/${eid}/partid/${pid}/bendtable`,
      );
      return { data: result };
    },
  },

  {
    name: "onshape_part_faces",
    description:
      "Get face data for a specific part. Returns face IDs, surface types, and adjacency information.",
    category: "parts",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wvm_type: {
          type: "string",
          enum: ["w", "v", "m"],
          description: "Workspace (w), Version (v), or Microversion (m)",
        },
        wvm_id: { type: "string", description: "Workspace, Version, or Microversion ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        pid: { type: "string", description: "Part ID" },
      },
      required: ["did", "wvm_id", "eid", "pid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      const pid = input.pid as string;
      if (!did) throw new Error("[onshape_part_faces] 'did' is required");
      if (!wvmId) throw new Error("[onshape_part_faces] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_part_faces] 'eid' is required");
      if (!pid) throw new Error("[onshape_part_faces] 'pid' is required");

      const result = await ctx.client.get(
        `/parts/d/${did}/${wvm}/${wvmId}/e/${eid}/partid/${pid}/faces`,
      );
      return { data: result };
    },
  },
];
