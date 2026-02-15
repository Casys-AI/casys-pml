/**
 * PLM BOM Tools
 *
 * Bill of Materials generation, flattening, costing, where-used analysis.
 *
 * @module lib/plm/tools/bom
 */

import type { PlmTool } from "./types.ts";

export const bomTools: PlmTool[] = [
  {
    name: "plm_bom_generate",
    description:
      "Generate a Bill of Materials (BOM) from a STEP assembly file. " +
      "Extracts part hierarchy, quantities, and optional material/weight data.",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        assembly_path: { type: "string", description: "Path to STEP assembly file" },
        include_materials: {
          type: "boolean",
          description: "Include material info per part. Default: true",
        },
        include_mass: {
          type: "boolean",
          description: "Calculate mass for each part. Default: false",
        },
        format: {
          type: "string",
          enum: ["hierarchical", "flat", "indented"],
          description: "BOM output format. Default: hierarchical",
        },
      },
      required: ["assembly_path"],
    },
    handler: async ({ assembly_path, include_materials = true, include_mass = false, format = "hierarchical" }) => {
      throw new Error(
        `[plm_bom_generate] Not yet implemented. ` +
        `assembly_path=${assembly_path}, include_materials=${include_materials}, ` +
        `include_mass=${include_mass}, format=${format}`
      );
    },
  },
  {
    name: "plm_bom_flatten",
    description:
      "Flatten a hierarchical BOM into a single-level parts list with total quantities. " +
      "Aggregates quantities across all assembly levels.",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        bom: {
          type: "object",
          description: "Hierarchical BOM object (from plm_bom_generate)",
        },
        assembly_path: {
          type: "string",
          description: "Path to STEP assembly (alternative to bom parameter)",
        },
        group_by: {
          type: "string",
          enum: ["part_number", "material", "supplier"],
          description: "Grouping criterion. Default: part_number",
        },
      },
    },
    handler: async ({ bom, assembly_path, group_by = "part_number" }) => {
      throw new Error(
        `[plm_bom_flatten] Not yet implemented. ` +
        `bom=${!!bom}, assembly_path=${assembly_path}, group_by=${group_by}`
      );
    },
  },
  {
    name: "plm_bom_cost",
    description:
      "Estimate costs for a BOM using specified costing model. " +
      "Calculates raw material, machining, and overhead costs per part and total.",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        assembly_path: { type: "string", description: "Path to STEP assembly file" },
        costing_model: {
          type: "string",
          enum: ["raw_material", "machining", "additive", "injection", "composite"],
          description: "Cost estimation model. Default: raw_material",
        },
        quantity: {
          type: "number",
          description: "Production quantity for cost scaling. Default: 1",
        },
        currency: {
          type: "string",
          enum: ["USD", "EUR", "GBP"],
          description: "Currency for cost output. Default: EUR",
        },
      },
      required: ["assembly_path"],
    },
    handler: async ({ assembly_path, costing_model = "raw_material", quantity = 1, currency = "EUR" }) => {
      throw new Error(
        `[plm_bom_cost] Not yet implemented. ` +
        `assembly_path=${assembly_path}, costing_model=${costing_model}, ` +
        `quantity=${quantity}, currency=${currency}`
      );
    },
  },
  {
    name: "plm_bom_where_used",
    description:
      "Find all assemblies and products where a specific part is used. " +
      "Returns usage tree with quantities and assembly levels.",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        part_number: { type: "string", description: "Part number to search for" },
        search_path: { type: "string", description: "Root directory to search for assemblies" },
        max_depth: { type: "number", description: "Maximum assembly depth to report. Default: unlimited" },
      },
      required: ["part_number"],
    },
    handler: async ({ part_number, search_path, max_depth }) => {
      throw new Error(
        `[plm_bom_where_used] Not yet implemented. ` +
        `part_number=${part_number}, search_path=${search_path}, max_depth=${max_depth}`
      );
    },
  },
];
