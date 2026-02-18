/**
 * Onshape Assembly Tools
 *
 * MCP tools for assembly operations: definition, BOM, instances, mates,
 * features, mass properties, views.
 *
 * Onshape API paths use:
 *   did = document ID (24 hex), wvm = workspace/version/microversion type,
 *   wvmid = workspace/version/microversion ID, eid = element ID, nid = node ID
 *
 * @module lib/onshape/tools/assemblies
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

export const assemblyTools: OnshapeTool[] = [
  // ── Create ────────────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_create",
    description:
      "Create a new Assembly tab in an Onshape document workspace. " +
      "Returns the new element metadata including the element ID.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wid: { type: "string", description: "Workspace ID (24 hex)" },
        name: { type: "string", description: "Name for the new assembly tab" },
      },
      required: ["did", "wid", "name"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_create");
      const wid = requireString(input, "wid", "onshape_assembly_create");
      const name = requireString(input, "name", "onshape_assembly_create");

      const result = await ctx.client.post(`/assemblies/d/${did}/w/${wid}`, {
        name,
      });
      return {
        data: result,
        message: `Assembly '${name}' created in document ${did}`,
      };
    },
  },

  // ── Definition ────────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_definition",
    description:
      "Get the assembly definition tree: root instances, occurrences, sub-assemblies, " +
      "parts, and optionally mate features/connectors. This is the primary tool to " +
      "understand the structure of an assembly.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Element ID of the assembly (24 hex)" },
        includeMateFeatures: {
          type: "boolean",
          description: "Include mate features in the response (default false)",
        },
        includeMateConnectors: {
          type: "boolean",
          description: "Include mate connectors in the response (default false)",
        },
        includeNonSolids: {
          type: "boolean",
          description: "Include non-solid bodies (surfaces, wires) in the response (default false)",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_definition");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_assembly_definition");
      const eid = requireString(input, "eid", "onshape_assembly_definition");

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.includeMateFeatures !== undefined) {
        query.includeMateFeatures = input.includeMateFeatures as boolean;
      }
      if (input.includeMateConnectors !== undefined) {
        query.includeMateConnectors = input.includeMateConnectors as boolean;
      }
      if (input.includeNonSolids !== undefined) {
        query.includeNonSolids = input.includeNonSolids as boolean;
      }

      const result = await ctx.client.get(
        `/assemblies/d/${did}/${wvmType}/${wvmId}/e/${eid}`,
        query,
      );
      return { data: result };
    },
  },

  // ── Modify ────────────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_modify",
    description:
      "Modify an assembly: transform instances, suppress/unsuppress, change configuration. " +
      "Accepts a complex JSON body — see Onshape API docs for the modify request schema.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wid: { type: "string", description: "Workspace ID (24 hex)" },
        eid: { type: "string", description: "Element ID of the assembly (24 hex)" },
        body: {
          type: "object",
          description:
            "Modify request body (JSON object). See Onshape API reference for full schema.",
        },
      },
      required: ["did", "wid", "eid", "body"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_modify");
      const wid = requireString(input, "wid", "onshape_assembly_modify");
      const eid = requireString(input, "eid", "onshape_assembly_modify");

      if (!input.body || typeof input.body !== "object") {
        throw new Error("[onshape_assembly_modify] 'body' must be a JSON object");
      }

      const result = await ctx.client.post(
        `/assemblies/d/${did}/w/${wid}/e/${eid}/modify`,
        input.body,
      );
      return { data: result };
    },
  },

  // ── Insert Instance ───────────────────────────────────────────────────────

  {
    name: "onshape_assembly_insert_instance",
    description:
      "Insert a part or sub-assembly instance into an assembly. " +
      "The source can be a part, an assembly, or a whole part studio from any document.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Target document ID (24 hex)" },
        wid: { type: "string", description: "Target workspace ID (24 hex)" },
        eid: { type: "string", description: "Target assembly element ID (24 hex)" },
        documentId: {
          type: "string",
          description: "Source document ID containing the part/assembly to insert",
        },
        elementId: {
          type: "string",
          description: "Source element ID (part studio or assembly tab)",
        },
        partId: {
          type: "string",
          description: "Specific part ID within the part studio (optional if isWholePartStudio)",
        },
        isAssembly: {
          type: "boolean",
          description: "True if inserting a sub-assembly (default false)",
        },
        isWholePartStudio: {
          type: "boolean",
          description: "True to insert the entire part studio as a composite (default false)",
        },
      },
      required: ["did", "wid", "eid", "documentId", "elementId"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_insert_instance");
      const wid = requireString(input, "wid", "onshape_assembly_insert_instance");
      const eid = requireString(input, "eid", "onshape_assembly_insert_instance");
      const documentId = requireString(input, "documentId", "onshape_assembly_insert_instance");
      const elementId = requireString(input, "elementId", "onshape_assembly_insert_instance");

      const body: Record<string, unknown> = { documentId, elementId };
      if (input.partId) body.partId = input.partId as string;
      if (input.isAssembly !== undefined) body.isAssembly = input.isAssembly as boolean;
      if (input.isWholePartStudio !== undefined) {
        body.isWholePartStudio = input.isWholePartStudio as boolean;
      }

      const result = await ctx.client.post(
        `/assemblies/d/${did}/w/${wid}/e/${eid}/instances`,
        body,
      );
      return { data: result, message: "Instance inserted into assembly" };
    },
  },

  // ── Delete Instance ───────────────────────────────────────────────────────

  {
    name: "onshape_assembly_delete_instance",
    description:
      "Delete a single instance (occurrence) from an assembly by its node ID.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wid: { type: "string", description: "Workspace ID (24 hex)" },
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
        nid: { type: "string", description: "Node ID of the instance to delete" },
      },
      required: ["did", "wid", "eid", "nid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_delete_instance");
      const wid = requireString(input, "wid", "onshape_assembly_delete_instance");
      const eid = requireString(input, "eid", "onshape_assembly_delete_instance");
      const nid = requireString(input, "nid", "onshape_assembly_delete_instance");

      const result = await ctx.client.del(
        `/assemblies/d/${did}/w/${wid}/e/${eid}/instance/nodeid/${nid}`,
      );
      return { data: result, message: `Instance ${nid} deleted` };
    },
  },

  // ── Add Feature ───────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_add_feature",
    description:
      "Add a feature (mate, relation, pattern, etc.) to an assembly. " +
      "The feature object must follow the Onshape feature definition schema.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wid: { type: "string", description: "Workspace ID (24 hex)" },
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
        feature: {
          type: "object",
          description:
            "Feature definition object with type, name, and parameters. " +
            "See Onshape API docs for feature schema (mate types, patterns, etc.)",
        },
      },
      required: ["did", "wid", "eid", "feature"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_add_feature");
      const wid = requireString(input, "wid", "onshape_assembly_add_feature");
      const eid = requireString(input, "eid", "onshape_assembly_add_feature");

      if (!input.feature || typeof input.feature !== "object") {
        throw new Error("[onshape_assembly_add_feature] 'feature' must be a JSON object");
      }

      const result = await ctx.client.post(
        `/assemblies/d/${did}/w/${wid}/e/${eid}/features`,
        { feature: input.feature },
      );
      return { data: result };
    },
  },

  // ── Features (list) ───────────────────────────────────────────────────────

  {
    name: "onshape_assembly_features",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "List all features (mates, relations, patterns) defined in an assembly.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_features");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_assembly_features");
      const eid = requireString(input, "eid", "onshape_assembly_features");

      const result = await ctx.client.get(
        `/assemblies/d/${did}/${wvmType}/${wvmId}/e/${eid}/features`,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } } };
    },
  },

  // ── BOM ───────────────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_bom",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/bom-viewer" } },
    description:
      "Get the Bill of Materials (BOM) for an assembly. This is the KEY tool for extracting " +
      "structured BOM data from an Onshape assembly. Returns a hierarchical or flat list of " +
      "parts with quantities, part numbers, descriptions, and material info. " +
      "Use indented=true for a hierarchical BOM that preserves sub-assembly structure. " +
      "Use multiLevel=true for a fully expanded multi-level BOM. " +
      "Set generateIfAbsent=true to auto-generate the BOM if it has not been created yet.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
        indented: {
          type: "boolean",
          description:
            "If true, return an indented (hierarchical) BOM preserving sub-assembly nesting. Default false.",
        },
        multiLevel: {
          type: "boolean",
          description:
            "If true, return a multi-level BOM (fully expanded tree). Default false.",
        },
        generateIfAbsent: {
          type: "boolean",
          description:
            "If true, generate the BOM on the fly if it does not exist yet. Default false.",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_bom");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_assembly_bom");
      const eid = requireString(input, "eid", "onshape_assembly_bom");

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.indented !== undefined) query.indented = input.indented as boolean;
      if (input.multiLevel !== undefined) query.multiLevel = input.multiLevel as boolean;
      if (input.generateIfAbsent !== undefined) {
        query.generateIfAbsent = input.generateIfAbsent as boolean;
      }

      const result = await ctx.client.get(
        `/assemblies/d/${did}/${wvmType}/${wvmId}/e/${eid}/bom`,
        query,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/bom-viewer" } } };
    },
  },

  // ── Mass Properties ───────────────────────────────────────────────────────

  {
    name: "onshape_assembly_mass_properties",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/mass-viewer" } },
    description:
      "Get mass properties (mass, volume, density, center of mass, inertia) " +
      "for an assembly and its parts.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_mass_properties");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_assembly_mass_properties");
      const eid = requireString(input, "eid", "onshape_assembly_mass_properties");

      const result = await ctx.client.get(
        `/assemblies/d/${did}/${wvmType}/${wvmId}/e/${eid}/massproperties`,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/mass-viewer" } } };
    },
  },

  // ── Bounding Boxes ────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_bounding_boxes",
    description:
      "Get axis-aligned bounding boxes for the assembly and each occurrence.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_bounding_boxes");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_assembly_bounding_boxes");
      const eid = requireString(input, "eid", "onshape_assembly_bounding_boxes");

      const result = await ctx.client.get(
        `/assemblies/d/${did}/${wvmType}/${wvmId}/e/${eid}/boundingboxes`,
      );
      return { data: result };
    },
  },

  // ── Mate Values (read) ────────────────────────────────────────────────────

  {
    name: "onshape_assembly_mate_values",
    description:
      "Get current mate parameter values for all mates in an assembly. " +
      "Returns each mate's ID and its current DOF values (translation, rotation).",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_mate_values");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_assembly_mate_values");
      const eid = requireString(input, "eid", "onshape_assembly_mate_values");

      const result = await ctx.client.get(
        `/assemblies/d/${did}/${wvmType}/${wvmId}/e/${eid}/matevalues`,
      );
      return { data: result };
    },
  },

  // ── Update Mates ──────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_update_mates",
    description:
      "Update mate parameter values in an assembly. Allows changing DOF values " +
      "(translation offsets, rotation angles) on existing mates.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wid: { type: "string", description: "Workspace ID (24 hex)" },
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
        mateValues: {
          type: "array",
          description: "Array of mate value updates: [{mateId, value}]",
          items: {
            type: "object",
            properties: {
              mateId: { type: "string", description: "ID of the mate to update" },
              value: {
                type: "number",
                description: "New DOF value (translation in meters, rotation in radians)",
              },
            },
            required: ["mateId", "value"],
          },
        },
      },
      required: ["did", "wid", "eid", "mateValues"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_update_mates");
      const wid = requireString(input, "wid", "onshape_assembly_update_mates");
      const eid = requireString(input, "eid", "onshape_assembly_update_mates");

      if (!Array.isArray(input.mateValues) || input.mateValues.length === 0) {
        throw new Error(
          "[onshape_assembly_update_mates] 'mateValues' must be a non-empty array",
        );
      }

      const result = await ctx.client.post(
        `/assemblies/d/${did}/w/${wid}/e/${eid}/matevalues`,
        { mateValues: input.mateValues },
      );
      return { data: result };
    },
  },

  // ── Shaded Views ──────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_shaded_views",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/3d-viewer" } },
    description:
      "Get shaded rendered views (images) of an assembly. " +
      "Returns base64-encoded PNG images from the specified viewpoint.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
        outputHeight: {
          type: "number",
          description: "Image height in pixels (default 500)",
        },
        outputWidth: {
          type: "number",
          description: "Image width in pixels (default 500)",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_shaded_views");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_assembly_shaded_views");
      const eid = requireString(input, "eid", "onshape_assembly_shaded_views");

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.outputHeight !== undefined) query.outputHeight = input.outputHeight as number;
      if (input.outputWidth !== undefined) query.outputWidth = input.outputWidth as number;

      const result = await ctx.client.get(
        `/assemblies/d/${did}/${wvmType}/${wvmId}/e/${eid}/shadedviews`,
        query,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/3d-viewer" } } };
    },
  },

  // ── Exploded Views ────────────────────────────────────────────────────────

  {
    name: "onshape_assembly_exploded_views",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "List all exploded view configurations defined for an assembly.",
    category: "assemblies",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24 hex)" },
        wvm_type: wvmTypeSchema,
        wvm_id: wvmIdSchema,
        eid: { type: "string", description: "Assembly element ID (24 hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      const did = requireString(input, "did", "onshape_assembly_exploded_views");
      const wvmType = wvm(input);
      const wvmId = requireString(input, "wvm_id", "onshape_assembly_exploded_views");
      const eid = requireString(input, "eid", "onshape_assembly_exploded_views");

      const result = await ctx.client.get(
        `/assemblies/d/${did}/${wvmType}/${wvmId}/e/${eid}/explodedviews`,
      );
      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } } };
    },
  },
];
