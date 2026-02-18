/**
 * Onshape Metadata Tools
 *
 * MCP tools for reading and updating metadata on elements and parts:
 * element-level metadata, part-level metadata, full assembly metadata,
 * and update operations for both.
 *
 * Onshape API Reference:
 *   - Element metadata: GET/POST /metadata/d/{did}/{wvm}/{wvmid}/e/{eid}
 *   - Part metadata: GET/POST /metadata/d/{did}/{wvm}/{wvmid}/e/{eid}/p/{pid}
 *
 * @module lib/onshape/tools/metadata
 */

import type { OnshapeTool } from "./types.ts";

export const metadataTools: OnshapeTool[] = [
  // ── Element Metadata ─────────────────────────────────────────────────────

  {
    name: "onshape_metadata_element",
    description:
      "Get metadata for an element (Part Studio, Assembly, Drawing, etc.). " +
      "Returns properties like name, description, part number, revision, and custom metadata fields.",
    category: "metadata",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_metadata_element] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_metadata_element] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_metadata_element] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.get(
        `/metadata/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}`,
      );

      return { data: result };
    },
  },

  // ── Part Metadata ────────────────────────────────────────────────────────

  {
    name: "onshape_metadata_part",
    description:
      "Get metadata for a specific part within an element. " +
      "Returns part-level properties including material, mass, volume, part number, and custom fields.",
    category: "metadata",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
        pid: { type: "string", description: "Part ID (from parts list or BOM)" },
      },
      required: ["did", "wvm_id", "eid", "pid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_metadata_part] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_metadata_part] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_metadata_part] 'eid' is required");
      if (!input.pid) throw new Error("[onshape_metadata_part] 'pid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.get(
        `/metadata/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/p/${input.pid as string}`,
      );

      return { data: result };
    },
  },

  // ── Full Assembly Metadata ───────────────────────────────────────────────

  {
    name: "onshape_metadata_assembly_full",
    description:
      "Get full metadata for an assembly with deep traversal. Fetches element metadata with " +
      "depth=5 and includeComputedProperties=true. Returns a deep tree of metadata for the assembly " +
      "and all nested sub-assemblies and parts.",
    category: "metadata",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
        depth: {
          type: "number",
          description: "Traversal depth for nested assemblies (default 5)",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_metadata_assembly_full] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_metadata_assembly_full] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_metadata_assembly_full] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";
      const depth = (input.depth as number) ?? 5;

      const result = await ctx.client.get(
        `/metadata/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}`,
        {
          depth,
          includeComputedProperties: true,
        },
      );

      return { data: result };
    },
  },

  // ── Update Element Metadata ──────────────────────────────────────────────

  {
    name: "onshape_metadata_update_element",
    description:
      "Update metadata properties on an element. Provide an array of property updates " +
      "with propertyId and value. Get available propertyIds from onshape_metadata_element first.",
    category: "metadata",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
        properties: {
          type: "array",
          description: "Properties to update: [{propertyId, value}]",
          items: {
            type: "object",
            properties: {
              propertyId: { type: "string", description: "Metadata property ID" },
              value: {
                type: "string",
                description: "New value for the property (string representation)",
              },
            },
            required: ["propertyId", "value"],
          },
        },
      },
      required: ["did", "wvm_id", "eid", "properties"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_metadata_update_element] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_metadata_update_element] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_metadata_update_element] 'eid' is required");
      if (!input.properties || !Array.isArray(input.properties) || input.properties.length === 0) {
        throw new Error(
          "[onshape_metadata_update_element] 'properties' must be a non-empty array",
        );
      }

      const properties = (
        input.properties as Array<{ propertyId: string; value: unknown }>
      ).map((p) => {
        if (!p.propertyId || p.value === undefined) {
          throw new Error(
            "[onshape_metadata_update_element] Each property must have 'propertyId' and 'value'",
          );
        }
        return p;
      });

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.post(
        `/metadata/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}`,
        { properties },
      );

      return {
        data: result,
        message: `Element metadata updated (${properties.length} property/ies)`,
      };
    },
  },

  // ── Update Part Metadata ─────────────────────────────────────────────────

  {
    name: "onshape_metadata_update_part",
    description:
      "Update metadata properties on a specific part. Provide an array of property updates " +
      "with propertyId and value. Get available propertyIds from onshape_metadata_part first.",
    category: "metadata",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
        pid: { type: "string", description: "Part ID" },
        properties: {
          type: "array",
          description: "Properties to update: [{propertyId, value}]",
          items: {
            type: "object",
            properties: {
              propertyId: { type: "string", description: "Metadata property ID" },
              value: {
                type: "string",
                description: "New value for the property (string representation)",
              },
            },
            required: ["propertyId", "value"],
          },
        },
      },
      required: ["did", "wvm_id", "eid", "pid", "properties"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_metadata_update_part] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_metadata_update_part] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_metadata_update_part] 'eid' is required");
      if (!input.pid) throw new Error("[onshape_metadata_update_part] 'pid' is required");
      if (!input.properties || !Array.isArray(input.properties) || input.properties.length === 0) {
        throw new Error(
          "[onshape_metadata_update_part] 'properties' must be a non-empty array",
        );
      }

      const properties = (
        input.properties as Array<{ propertyId: string; value: unknown }>
      ).map((p) => {
        if (!p.propertyId || p.value === undefined) {
          throw new Error(
            "[onshape_metadata_update_part] Each property must have 'propertyId' and 'value'",
          );
        }
        return p;
      });

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.post(
        `/metadata/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/p/${input.pid as string}`,
        { properties },
      );

      return {
        data: result,
        message: `Part metadata updated (${properties.length} property/ies)`,
      };
    },
  },
];
