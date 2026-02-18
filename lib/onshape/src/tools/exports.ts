/**
 * Onshape Export & Import Tools
 *
 * MCP tools for file translation: STEP, STL, glTF, OBJ, SOLIDWORKS, Parasolid exports,
 * generic format export, file import, translation status, and format listing.
 *
 * Onshape API Reference:
 *   - Part Studio exports: GET/POST /partstudios/d/{did}/{wvm}/{wvmid}/e/{eid}/...
 *   - Assembly exports: POST /assemblies/d/{did}/{wvm}/{wvmid}/e/{eid}/translations
 *   - Import: POST /translations/d/{did}/w/{wid}
 *   - Status: GET /translations/{tid}
 *   - Formats: GET /translations/translationformats
 *
 * @module lib/onshape/tools/exports
 */

import type { OnshapeTool } from "./types.ts";

export const exportTools: OnshapeTool[] = [
  // ── STEP Export ──────────────────────────────────────────────────────────

  {
    name: "onshape_export_step",
    description:
      "Export a Part Studio or Assembly to STEP format (async translation). " +
      "Returns a translation ID — poll with onshape_translation_status to get the download URL. " +
      "Use source_type to pick 'partstudio' or 'assembly' endpoint.",
    category: "export",
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
        source_type: {
          type: "string",
          description: "Source element type: 'partstudio' or 'assembly' (default 'partstudio')",
          enum: ["partstudio", "assembly"],
        },
        part_ids: {
          type: "string",
          description: "Comma-separated part IDs to export (partstudio only, default: all parts)",
        },
        version: {
          type: "string",
          description: "STEP version: 'AP203' or 'AP214' (default AP214)",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_export_step] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_export_step] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_export_step] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";
      const sourceType = (input.source_type as string) ?? "partstudio";
      const endpoint = sourceType === "assembly" ? "assemblies" : "partstudios";

      const body: Record<string, unknown> = {
        formatName: "STEP",
      };
      if (input.part_ids) body.partIds = (input.part_ids as string);
      if (input.version) body.versionString = input.version as string;

      const result = await ctx.client.post<{ id: string; requestState: string }>(
        `/${endpoint}/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/translations`,
        body,
      );

      return {
        data: result,
        message: `STEP translation started (id: ${result.id}, state: ${result.requestState})`,
      };
    },
  },

  // ── STL Export ───────────────────────────────────────────────────────────

  {
    name: "onshape_export_stl",
    description:
      "Export a Part Studio to STL format (synchronous). Returns the STL data directly. " +
      "Supports text or binary mode, custom scale, and unit settings.",
    category: "export",
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
        mode: {
          type: "string",
          description: "STL mode: 'text' or 'binary' (default 'text')",
          enum: ["text", "binary"],
        },
        scale: { type: "number", description: "Scale factor for the output (default 1.0)" },
        units: {
          type: "string",
          description: "Output units: 'meter', 'centimeter', 'millimeter', 'inch', 'foot', 'yard'",
        },
        part_ids: {
          type: "string",
          description: "Comma-separated part IDs to export (default: all parts)",
        },
        angle_tolerance: {
          type: "number",
          description: "Angle tolerance in radians for tessellation",
        },
        chord_tolerance: {
          type: "number",
          description: "Chord tolerance for tessellation",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_export_stl] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_export_stl] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_export_stl] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.mode) query.mode = input.mode as string;
      if (input.scale !== undefined) query.scale = input.scale as number;
      if (input.units) query.units = input.units as string;
      if (input.part_ids) query.partIds = input.part_ids as string;
      if (input.angle_tolerance !== undefined) query.angleTolerance = input.angle_tolerance as number;
      if (input.chord_tolerance !== undefined) query.chordTolerance = input.chord_tolerance as number;

      const result = await ctx.client.get(
        `/partstudios/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/stl`,
        query,
      );

      return { data: result };
    },
  },

  // ── glTF Export ──────────────────────────────────────────────────────────

  {
    name: "onshape_export_gltf",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/3d-viewer" } },
    description:
      "Export a Part Studio to glTF format (synchronous). Returns the glTF JSON directly. " +
      "Useful for 3D web viewers and AR/VR applications.",
    category: "export",
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
        part_ids: {
          type: "string",
          description: "Comma-separated part IDs to export (default: all parts)",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_export_gltf] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_export_gltf] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_export_gltf] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.part_ids) query.partIds = input.part_ids as string;

      const result = await ctx.client.get(
        `/partstudios/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/gltf`,
        query,
      );

      return { data: result, _meta: { ui: { resourceUri: "ui://mcp-onshape/3d-viewer" } } };
    },
  },

  // ── OBJ Export ───────────────────────────────────────────────────────────

  {
    name: "onshape_export_obj",
    description:
      "Export an Assembly to OBJ format (async translation). " +
      "Returns a translation ID — poll with onshape_translation_status to get the download URL.",
    category: "export",
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
      if (!input.did) throw new Error("[onshape_export_obj] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_export_obj] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_export_obj] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.post<{ id: string; requestState: string }>(
        `/assemblies/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/translations`,
        { formatName: "OBJ" },
      );

      return {
        data: result,
        message: `OBJ translation started (id: ${result.id}, state: ${result.requestState})`,
      };
    },
  },

  // ── SOLIDWORKS Export ────────────────────────────────────────────────────

  {
    name: "onshape_export_solidworks",
    description:
      "Export an Assembly to SOLIDWORKS format (async translation). " +
      "Returns a translation ID — poll with onshape_translation_status to get the download URL.",
    category: "export",
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
      if (!input.did) throw new Error("[onshape_export_solidworks] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_export_solidworks] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_export_solidworks] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.post<{ id: string; requestState: string }>(
        `/assemblies/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/translations`,
        { formatName: "SOLIDWORKS" },
      );

      return {
        data: result,
        message: `SOLIDWORKS translation started (id: ${result.id}, state: ${result.requestState})`,
      };
    },
  },

  // ── Parasolid Export ─────────────────────────────────────────────────────

  {
    name: "onshape_export_parasolid",
    description:
      "Export a Part Studio to Parasolid format (synchronous). " +
      "Returns the Parasolid data directly.",
    category: "export",
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
        part_ids: {
          type: "string",
          description: "Comma-separated part IDs to export (default: all parts)",
        },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_export_parasolid] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_export_parasolid] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_export_parasolid] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const query: Record<string, string | number | boolean | undefined> = {};
      if (input.part_ids) query.partIds = input.part_ids as string;

      const result = await ctx.client.get(
        `/partstudios/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/parasolid`,
        query,
      );

      return { data: result };
    },
  },

  // ── Generic Export ───────────────────────────────────────────────────────

  {
    name: "onshape_export_generic",
    description:
      "Export a Part Studio or Assembly to any supported format (async translation). " +
      "Accepts an arbitrary format name (e.g. IGES, ACIS, CATIA). " +
      "Returns a translation ID — poll with onshape_translation_status. " +
      "Use onshape_translator_formats to list all available format names.",
    category: "export",
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
        source_type: {
          type: "string",
          description: "Source element type: 'partstudios' or 'assemblies' (default 'partstudios')",
          enum: ["partstudios", "assemblies"],
        },
        format_name: {
          type: "string",
          description: "Translation format name (e.g. STEP, IGES, ACIS, CATIA, etc.)",
        },
        options: {
          type: "object",
          description: "Additional format-specific options merged into the translation request body",
        },
      },
      required: ["did", "wvm_id", "eid", "format_name"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_export_generic] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_export_generic] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_export_generic] 'eid' is required");
      if (!input.format_name) throw new Error("[onshape_export_generic] 'format_name' is required");

      const wvm = (input.wvm_type as string) ?? "w";
      const source = (input.source_type as string) ?? "partstudios";

      const body: Record<string, unknown> = {
        formatName: input.format_name as string,
        ...(input.options as Record<string, unknown> ?? {}),
      };

      const result = await ctx.client.post<{ id: string; requestState: string }>(
        `/${source}/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/translations`,
        body,
      );

      return {
        data: result,
        message: `${input.format_name as string} translation started (id: ${result.id}, state: ${result.requestState})`,
      };
    },
  },

  // ── Import File ──────────────────────────────────────────────────────────

  {
    name: "onshape_import_file",
    description:
      "Import a file into an Onshape document workspace (async translation). " +
      "Creates a new element from the imported file. Supports STEP, IGES, SOLIDWORKS, etc. " +
      "Returns a translation ID — poll with onshape_translation_status to track progress.",
    category: "export",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Workspace ID (24-char hex)" },
        name: { type: "string", description: "Name for the imported element" },
        format_name: {
          type: "string",
          description: "Source file format (e.g. STEP, IGES, SOLIDWORKS, ACIS, etc.)",
        },
        file_url: {
          type: "string",
          description: "URL of the file to import (must be publicly accessible or a pre-signed URL)",
        },
        flatten_assemblies: {
          type: "boolean",
          description: "Whether to flatten assemblies into a single Part Studio (default false)",
        },
        create_composite: {
          type: "boolean",
          description: "Whether to create a composite part (default false)",
        },
        y_axis_is_up: {
          type: "boolean",
          description: "Whether the Y axis is the up direction (default false, Z is up)",
        },
      },
      required: ["did", "wid", "name", "format_name"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_import_file] 'did' is required");
      if (!input.wid) throw new Error("[onshape_import_file] 'wid' is required");
      if (!input.name) throw new Error("[onshape_import_file] 'name' is required");
      if (!input.format_name) throw new Error("[onshape_import_file] 'format_name' is required");

      const body: Record<string, unknown> = {
        name: input.name as string,
        formatName: input.format_name as string,
      };
      if (input.file_url) body.url = input.file_url as string;
      if (input.flatten_assemblies !== undefined) body.flattenAssemblies = input.flatten_assemblies as boolean;
      if (input.create_composite !== undefined) body.createComposite = input.create_composite as boolean;
      if (input.y_axis_is_up !== undefined) body.yAxisIsUp = input.y_axis_is_up as boolean;

      const result = await ctx.client.post<{ id: string; requestState: string }>(
        `/translations/d/${input.did as string}/w/${input.wid as string}`,
        body,
      );

      return {
        data: result,
        message: `Import translation started (id: ${result.id}, state: ${result.requestState})`,
      };
    },
  },

  // ── Translation Status ───────────────────────────────────────────────────

  {
    name: "onshape_translation_status",
    description:
      "Check the status of an async import/export translation. " +
      "Returns requestState ('ACTIVE', 'DONE', 'FAILED'), progress info, and download URL when complete.",
    category: "export",
    inputSchema: {
      type: "object",
      properties: {
        tid: { type: "string", description: "Translation ID returned by an export or import call" },
      },
      required: ["tid"],
    },
    handler: async (input, ctx) => {
      if (!input.tid) throw new Error("[onshape_translation_status] 'tid' is required");

      const result = await ctx.client.get<{
        id: string;
        requestState: string;
        failureReason?: string;
        resultExternalDataIds?: string[];
      }>(
        `/translations/${input.tid as string}`,
      );

      return { data: result };
    },
  },

  // ── Translator Formats ───────────────────────────────────────────────────

  {
    name: "onshape_translator_formats",
    description:
      "List all available translation formats (import and export). " +
      "Returns format names, supported directions (import/export), and valid source types.",
    category: "export",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_input, ctx) => {
      const result = await ctx.client.get<unknown[]>(
        "/translations/translationformats",
      );

      const formats = Array.isArray(result) ? result : [];
      return {
        count: formats.length,
        data: formats,
      };
    },
  },
];
