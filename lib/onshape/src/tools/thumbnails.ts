/**
 * Onshape Thumbnail Tools
 *
 * MCP tools for retrieving document and element thumbnails.
 *
 * Onshape API Reference:
 *   - Document thumbnail: GET /thumbnails/d/{did}/w/{wid}
 *   - Element thumbnail: GET /thumbnails/d/{did}/w/{wid}/e/{eid}
 *   - Configured element thumbnail: GET /thumbnails/d/{did}/{wvm}/{wvmid}/e/{eid}
 *
 * @module lib/onshape/tools/thumbnails
 */

import type { OnshapeTool } from "./types.ts";

export const thumbnailTools: OnshapeTool[] = [
  // ── Thumbnails ────────────────────────────────────────────────────────────

  {
    name: "onshape_thumbnail_document",
    description:
      "Get a thumbnail for an Onshape document workspace. Returns thumbnail metadata " +
      "including available sizes and URLs. Use the 's' param to request a specific size (e.g. '300x170').",
    category: "thumbnails",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Workspace ID (24-char hex)" },
        s: {
          type: "string",
          description: "Thumbnail size (e.g. '300x170', '600x340') — optional",
        },
      },
      required: ["did", "wid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_thumbnail_document] 'did' is required");
      }
      if (!input.wid) {
        throw new Error("[onshape_thumbnail_document] 'wid' is required");
      }

      const result = await ctx.client.get(
        `/thumbnails/d/${input.did as string}/w/${input.wid as string}`,
        {
          s: input.s as string | undefined,
        },
      );
      return { data: result };
    },
  },

  {
    name: "onshape_thumbnail_element",
    description:
      "Get a thumbnail for a specific element (Part Studio, Assembly, Drawing) in a workspace. " +
      "Requires document ID, workspace ID, and element ID.",
    category: "thumbnails",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Workspace ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
        s: {
          type: "string",
          description: "Thumbnail size (e.g. '300x170', '600x340') — optional",
        },
      },
      required: ["did", "wid", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_thumbnail_element] 'did' is required");
      }
      if (!input.wid) {
        throw new Error("[onshape_thumbnail_element] 'wid' is required");
      }
      if (!input.eid) {
        throw new Error("[onshape_thumbnail_element] 'eid' is required");
      }

      const result = await ctx.client.get(
        `/thumbnails/d/${input.did as string}/w/${input.wid as string}/e/${input.eid as string}`,
        {
          s: input.s as string | undefined,
        },
      );
      return { data: result };
    },
  },

  {
    name: "onshape_thumbnail_element_config",
    description:
      "Get a thumbnail for a configured element. Uses workspace/version/microversion (wvm) " +
      "path and supports a configuration string for parametric variants.",
    category: "thumbnails",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm: {
          type: "string",
          description: "Workspace/Version/Microversion selector: 'w', 'v', or 'm'",
          enum: ["w", "v", "m"],
        },
        wvmid: { type: "string", description: "Workspace, Version, or Microversion ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
        s: {
          type: "string",
          description: "Thumbnail size (e.g. '300x170', '600x340') — optional",
        },
        configuration: {
          type: "string",
          description: "URL-encoded configuration string for parametric variants — optional",
        },
      },
      required: ["did", "wvm", "wvmid", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_thumbnail_element_config] 'did' is required");
      }
      if (!input.wvm) {
        throw new Error("[onshape_thumbnail_element_config] 'wvm' is required");
      }
      if (!input.wvmid) {
        throw new Error("[onshape_thumbnail_element_config] 'wvmid' is required");
      }
      if (!input.eid) {
        throw new Error("[onshape_thumbnail_element_config] 'eid' is required");
      }

      const result = await ctx.client.get(
        `/thumbnails/d/${input.did as string}/${input.wvm as string}/${input.wvmid as string}/e/${input.eid as string}`,
        {
          s: input.s as string | undefined,
          configuration: input.configuration as string | undefined,
        },
      );
      return { data: result };
    },
  },
];
