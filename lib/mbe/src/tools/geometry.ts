/**
 * MBE Geometry Tools
 *
 * STEP/IGES parsing, BRep queries, feature extraction, mass properties.
 *
 * @module lib/mbe/tools/geometry
 */

import type { MbeTool } from "./types.ts";

export const geometryTools: MbeTool[] = [
  {
    name: "mbe_step_parse",
    description:
      "Parse a STEP AP203/AP214 file and return structured feature tree with topology. " +
      "Extracts solid bodies, surfaces, edges, and assembly structure.",
    category: "geometry",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to .stp/.step file" },
        include_topology: {
          type: "boolean",
          description: "Include BRep topology (faces, edges, vertices). Default: true",
        },
        coordinate_system: {
          type: "string",
          enum: ["global", "local"],
          description: "Coordinate system reference. Default: global",
        },
        max_depth: {
          type: "number",
          description: "Maximum assembly tree depth to traverse. Default: unlimited",
        },
      },
      required: ["file_path"],
    },
    handler: async ({ file_path, include_topology = true, coordinate_system = "global", max_depth }) => {
      // TODO: Implement STEP parsing (opencascade.js or native FFI)
      throw new Error(
        `[mbe_step_parse] Not yet implemented. ` +
        `file_path=${file_path}, include_topology=${include_topology}, ` +
        `coordinate_system=${coordinate_system}, max_depth=${max_depth}`
      );
    },
  },
  {
    name: "mbe_iges_parse",
    description:
      "Parse an IGES file and return entity list with geometry data. " +
      "Supports curves, surfaces, and annotations.",
    category: "geometry",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to .igs/.iges file" },
        entity_filter: {
          type: "array",
          items: { type: "number" },
          description: "IGES entity type codes to include (e.g., [110, 128, 314]). Default: all",
        },
      },
      required: ["file_path"],
    },
    handler: async ({ file_path, entity_filter }) => {
      throw new Error(
        `[mbe_iges_parse] Not yet implemented. file_path=${file_path}, entity_filter=${JSON.stringify(entity_filter)}`
      );
    },
  },
  {
    name: "mbe_feature_tree",
    description:
      "Extract feature tree from a parsed CAD model. Returns hierarchical structure " +
      "of features (holes, fillets, chamfers, pockets, etc.) with parameters.",
    category: "geometry",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to CAD file (STEP or IGES)" },
        feature_types: {
          type: "array",
          items: {
            type: "string",
            enum: ["hole", "fillet", "chamfer", "pocket", "boss", "rib", "slot", "groove"],
          },
          description: "Feature types to extract. Default: all",
        },
      },
      required: ["file_path"],
    },
    handler: async ({ file_path, feature_types }) => {
      throw new Error(
        `[mbe_feature_tree] Not yet implemented. file_path=${file_path}, feature_types=${JSON.stringify(feature_types)}`
      );
    },
  },
  {
    name: "mbe_bounding_box",
    description:
      "Compute axis-aligned bounding box (AABB) for a CAD model or assembly. " +
      "Returns min/max coordinates and dimensions.",
    category: "geometry",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to CAD file" },
        unit: {
          type: "string",
          enum: ["mm", "in", "m"],
          description: "Output unit. Default: mm",
        },
      },
      required: ["file_path"],
    },
    handler: async ({ file_path, unit = "mm" }) => {
      throw new Error(
        `[mbe_bounding_box] Not yet implemented. file_path=${file_path}, unit=${unit}`
      );
    },
  },
  {
    name: "mbe_mass_properties",
    description:
      "Compute mass properties (volume, surface area, center of gravity, inertia) " +
      "for a solid model with material assignment.",
    category: "geometry",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to CAD file" },
        material: { type: "string", description: "Material name for density lookup (e.g., 'AL6061-T6')" },
        density: { type: "number", description: "Override density in kg/m^3 (takes precedence over material)" },
        unit: {
          type: "string",
          enum: ["mm", "in", "m"],
          description: "Output unit. Default: mm",
        },
      },
      required: ["file_path"],
    },
    handler: async ({ file_path, material, density, unit = "mm" }) => {
      throw new Error(
        `[mbe_mass_properties] Not yet implemented. ` +
        `file_path=${file_path}, material=${material}, density=${density}, unit=${unit}`
      );
    },
  },
];
