/**
 * Onshape Part Studio Tools
 *
 * MCP tools for Part Studio operations: features, mass properties, views,
 * FeatureScript evaluation, comparison, rollback.
 *
 * @module lib/onshape/tools/partstudios
 */

import type { OnshapeTool } from "./types.ts";

export const partstudioTools: OnshapeTool[] = [
  // ── Part Studio CRUD ────────────────────────────────────────────────────

  {
    name: "onshape_partstudio_create",
    description:
      "Create a new Part Studio in a document workspace. Returns the created element metadata.",
    category: "partstudios",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wid: { type: "string", description: "Workspace ID" },
        name: { type: "string", description: "Name for the new Part Studio" },
      },
      required: ["did", "wid", "name"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wid = input.wid as string;
      const name = input.name as string;
      if (!did) throw new Error("[onshape_partstudio_create] 'did' is required");
      if (!wid) throw new Error("[onshape_partstudio_create] 'wid' is required");
      if (!name) throw new Error("[onshape_partstudio_create] 'name' is required");

      const result = await ctx.client.post(`/partstudios/d/${did}/w/${wid}`, { name });
      return { data: result };
    },
  },

  // ── Features ────────────────────────────────────────────────────────────

  {
    name: "onshape_partstudio_features",
    description:
      "List all features in a Part Studio. Returns the feature list with types, names, " +
      "parameters, and suppression state.",
    category: "partstudios",
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
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      if (!did) throw new Error("[onshape_partstudio_features] 'did' is required");
      if (!wvmId) throw new Error("[onshape_partstudio_features] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_partstudio_features] 'eid' is required");

      const result = await ctx.client.get(`/partstudios/d/${did}/${wvm}/${wvmId}/e/${eid}/features`);
      return { data: result };
    },
  },

  {
    name: "onshape_partstudio_add_feature",
    description:
      "Add a feature to a Part Studio. The feature object must include type, name, and " +
      "feature-specific message parameters (per Onshape feature spec).",
    category: "partstudios",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wid: { type: "string", description: "Workspace ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        feature: {
          type: "object",
          description: "Feature definition: {type, name, ...message parameters}",
          properties: {
            type: { type: "string", description: "Feature type (e.g. extrude, fillet)" },
            name: { type: "string", description: "Feature name" },
          },
          required: ["type", "name"],
        },
      },
      required: ["did", "wid", "eid", "feature"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wid = input.wid as string;
      const eid = input.eid as string;
      const feature = input.feature as Record<string, unknown>;
      if (!did) throw new Error("[onshape_partstudio_add_feature] 'did' is required");
      if (!wid) throw new Error("[onshape_partstudio_add_feature] 'wid' is required");
      if (!eid) throw new Error("[onshape_partstudio_add_feature] 'eid' is required");
      if (!feature) throw new Error("[onshape_partstudio_add_feature] 'feature' is required");

      const result = await ctx.client.post(
        `/partstudios/d/${did}/w/${wid}/e/${eid}/features`,
        { feature },
      );
      return { data: result };
    },
  },

  {
    name: "onshape_partstudio_update_feature",
    description:
      "Update an existing feature in a Part Studio by feature ID. Provide the updated feature object.",
    category: "partstudios",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wid: { type: "string", description: "Workspace ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        fid: { type: "string", description: "Feature ID to update" },
        feature: {
          type: "object",
          description: "Updated feature definition",
        },
      },
      required: ["did", "wid", "eid", "fid", "feature"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wid = input.wid as string;
      const eid = input.eid as string;
      const fid = input.fid as string;
      const feature = input.feature as Record<string, unknown>;
      if (!did) throw new Error("[onshape_partstudio_update_feature] 'did' is required");
      if (!wid) throw new Error("[onshape_partstudio_update_feature] 'wid' is required");
      if (!eid) throw new Error("[onshape_partstudio_update_feature] 'eid' is required");
      if (!fid) throw new Error("[onshape_partstudio_update_feature] 'fid' is required");
      if (!feature) throw new Error("[onshape_partstudio_update_feature] 'feature' is required");

      const result = await ctx.client.post(
        `/partstudios/d/${did}/w/${wid}/e/${eid}/features/featureid/${fid}`,
        { feature },
      );
      return { data: result };
    },
  },

  {
    name: "onshape_partstudio_delete_feature",
    description: "Delete a feature from a Part Studio by feature ID.",
    category: "partstudios",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wid: { type: "string", description: "Workspace ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        fid: { type: "string", description: "Feature ID to delete" },
      },
      required: ["did", "wid", "eid", "fid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wid = input.wid as string;
      const eid = input.eid as string;
      const fid = input.fid as string;
      if (!did) throw new Error("[onshape_partstudio_delete_feature] 'did' is required");
      if (!wid) throw new Error("[onshape_partstudio_delete_feature] 'wid' is required");
      if (!eid) throw new Error("[onshape_partstudio_delete_feature] 'eid' is required");
      if (!fid) throw new Error("[onshape_partstudio_delete_feature] 'fid' is required");

      const result = await ctx.client.del(
        `/partstudios/d/${did}/w/${wid}/e/${eid}/features/featureid/${fid}`,
      );
      return { data: result };
    },
  },

  // ── Geometry & Properties ───────────────────────────────────────────────

  {
    name: "onshape_partstudio_body_details",
    description:
      "Get body details for all parts in a Part Studio. Returns topology info " +
      "(faces, edges, vertices) for each body.",
    category: "partstudios",
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
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      if (!did) throw new Error("[onshape_partstudio_body_details] 'did' is required");
      if (!wvmId) throw new Error("[onshape_partstudio_body_details] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_partstudio_body_details] 'eid' is required");

      const result = await ctx.client.get(
        `/partstudios/d/${did}/${wvm}/${wvmId}/e/${eid}/bodydetails`,
      );
      return { data: result };
    },
  },

  {
    name: "onshape_partstudio_mass_properties",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/mass-viewer" } },
    description:
      "Get mass properties for all parts in a Part Studio. Returns volume, mass, " +
      "density, center of mass, inertia for each part.",
    category: "partstudios",
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
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      if (!did) throw new Error("[onshape_partstudio_mass_properties] 'did' is required");
      if (!wvmId) throw new Error("[onshape_partstudio_mass_properties] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_partstudio_mass_properties] 'eid' is required");

      const result = await ctx.client.get(
        `/partstudios/d/${did}/${wvm}/${wvmId}/e/${eid}/massproperties`,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/mass-viewer" } } };
    },
  },

  {
    name: "onshape_partstudio_bounding_boxes",
    description:
      "Get bounding boxes for all parts in a Part Studio. Returns min/max XYZ coordinates.",
    category: "partstudios",
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
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      if (!did) throw new Error("[onshape_partstudio_bounding_boxes] 'did' is required");
      if (!wvmId) throw new Error("[onshape_partstudio_bounding_boxes] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_partstudio_bounding_boxes] 'eid' is required");

      const result = await ctx.client.get(
        `/partstudios/d/${did}/${wvm}/${wvmId}/e/${eid}/boundingboxes`,
      );
      return { data: result };
    },
  },

  // ── Views ───────────────────────────────────────────────────────────────

  {
    name: "onshape_partstudio_shaded_views",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/3d-viewer" } },
    description:
      "Get shaded view images of a Part Studio. Returns base64-encoded PNG images. " +
      "Optionally specify output size and view matrix.",
    category: "partstudios",
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
        outputHeight: { type: "number", description: "Output image height in pixels (default 500)" },
        outputWidth: { type: "number", description: "Output image width in pixels (default 500)" },
        viewMatrix: {
          type: "string",
          description: "12-number view matrix as comma-separated string (optional)",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      if (!did) throw new Error("[onshape_partstudio_shaded_views] 'did' is required");
      if (!wvmId) throw new Error("[onshape_partstudio_shaded_views] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_partstudio_shaded_views] 'eid' is required");

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.outputHeight != null) query.outputHeight = input.outputHeight as number;
      if (input.outputWidth != null) query.outputWidth = input.outputWidth as number;
      if (input.viewMatrix) query.viewMatrix = input.viewMatrix as string;

      const result = await ctx.client.get(
        `/partstudios/d/${did}/${wvm}/${wvmId}/e/${eid}/shadedviews`,
        query,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/3d-viewer" } } };
    },
  },

  {
    name: "onshape_partstudio_named_views",
    description:
      "Get named views defined in a Part Studio (e.g. Front, Back, Isometric, custom views).",
    category: "partstudios",
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
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      if (!did) throw new Error("[onshape_partstudio_named_views] 'did' is required");
      if (!wvmId) throw new Error("[onshape_partstudio_named_views] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_partstudio_named_views] 'eid' is required");

      const result = await ctx.client.get(
        `/partstudios/d/${did}/${wvm}/${wvmId}/e/${eid}/namedViews`,
      );
      return { data: result };
    },
  },

  // ── FeatureScript ───────────────────────────────────────────────────────

  {
    name: "onshape_partstudio_eval_featurescript",
    description:
      "Evaluate a FeatureScript expression in a Part Studio. The script should be a " +
      "lambda expression string. Returns the evaluation result.",
    category: "partstudios",
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
        script: {
          type: "string",
          description: "FeatureScript lambda expression to evaluate",
        },
      },
      required: ["did", "wvm_id", "eid", "script"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      const script = input.script as string;
      if (!did) throw new Error("[onshape_partstudio_eval_featurescript] 'did' is required");
      if (!wvmId) throw new Error("[onshape_partstudio_eval_featurescript] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_partstudio_eval_featurescript] 'eid' is required");
      if (!script) throw new Error("[onshape_partstudio_eval_featurescript] 'script' is required");

      const result = await ctx.client.post(
        `/partstudios/d/${did}/${wvm}/${wvmId}/e/${eid}/featurescript`,
        { script },
      );
      return { data: result };
    },
  },

  // ── Compare & Rollback ──────────────────────────────────────────────────

  {
    name: "onshape_partstudio_compare",
    description:
      "Compare a Part Studio against another workspace or version. Returns the diff of " +
      "features and geometry changes.",
    category: "partstudios",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wid: { type: "string", description: "Workspace ID (source)" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        workspaceId: {
          type: "string",
          description: "Target workspace ID to compare against (mutually exclusive with versionId)",
        },
        versionId: {
          type: "string",
          description: "Target version ID to compare against (mutually exclusive with workspaceId)",
        },
      },
      required: ["did", "wid", "eid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wid = input.wid as string;
      const eid = input.eid as string;
      if (!did) throw new Error("[onshape_partstudio_compare] 'did' is required");
      if (!wid) throw new Error("[onshape_partstudio_compare] 'wid' is required");
      if (!eid) throw new Error("[onshape_partstudio_compare] 'eid' is required");
      if (!input.workspaceId && !input.versionId) {
        throw new Error(
          "[onshape_partstudio_compare] Either 'workspaceId' or 'versionId' is required",
        );
      }

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.workspaceId) query.workspaceId = input.workspaceId as string;
      if (input.versionId) query.versionId = input.versionId as string;

      const result = await ctx.client.get(
        `/partstudios/d/${did}/w/${wid}/e/${eid}/compare`,
        query,
      );
      return { data: result };
    },
  },

  {
    name: "onshape_partstudio_rollback",
    description:
      "Rollback the feature list in a Part Studio to a specific index. Features after " +
      "that index become suppressed (rolled back). Use -1 to roll forward to the end.",
    category: "partstudios",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID" },
        wid: { type: "string", description: "Workspace ID" },
        eid: { type: "string", description: "Element ID (Part Studio)" },
        rollbackIndex: {
          type: "number",
          description: "Feature index to roll back to (-1 = roll forward to end)",
        },
      },
      required: ["did", "wid", "eid", "rollbackIndex"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wid = input.wid as string;
      const eid = input.eid as string;
      const rollbackIndex = input.rollbackIndex as number;
      if (!did) throw new Error("[onshape_partstudio_rollback] 'did' is required");
      if (!wid) throw new Error("[onshape_partstudio_rollback] 'wid' is required");
      if (!eid) throw new Error("[onshape_partstudio_rollback] 'eid' is required");
      if (rollbackIndex == null) {
        throw new Error("[onshape_partstudio_rollback] 'rollbackIndex' is required");
      }

      const result = await ctx.client.post(
        `/partstudios/d/${did}/w/${wid}/e/${eid}/features/rollback`,
        { rollbackIndex },
      );
      return { data: result };
    },
  },

  // ── Feature Specs ───────────────────────────────────────────────────────

  {
    name: "onshape_partstudio_feature_specs",
    description:
      "Get the feature specification definitions available in a Part Studio. " +
      "Returns schemas for all feature types (extrude, fillet, etc.) and their parameters.",
    category: "partstudios",
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
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = input.did as string;
      const wvm = (input.wvm_type as string) ?? "w";
      const wvmId = input.wvm_id as string;
      const eid = input.eid as string;
      if (!did) throw new Error("[onshape_partstudio_feature_specs] 'did' is required");
      if (!wvmId) throw new Error("[onshape_partstudio_feature_specs] 'wvm_id' is required");
      if (!eid) throw new Error("[onshape_partstudio_feature_specs] 'eid' is required");

      const result = await ctx.client.get(
        `/partstudios/d/${did}/${wvm}/${wvmId}/e/${eid}/featurespecs`,
      );
      return { data: result };
    },
  },
];
