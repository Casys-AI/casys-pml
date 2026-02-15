/**
 * PLM Planning Tools
 *
 * Manufacturing routing, work instructions, process plans, cycle time.
 *
 * @module lib/plm/tools/planning
 */

import type { PlmTool } from "./types.ts";

export const planningTools: PlmTool[] = [
  {
    name: "plm_routing_create",
    description:
      "Create a manufacturing routing (sequence of operations) for a part. " +
      "Defines work centers, setup/run times, and tooling requirements.",
    category: "planning",
    inputSchema: {
      type: "object",
      properties: {
        part_number: { type: "string", description: "Part number" },
        file_path: { type: "string", description: "Path to CAD file for process analysis" },
        material: { type: "string", description: "Material designation (e.g., 'AL6061-T6')" },
        process_type: {
          type: "string",
          enum: ["machining", "sheet_metal", "casting", "additive", "composite", "assembly"],
          description: "Primary manufacturing process",
        },
        quantity: {
          type: "number",
          description: "Production quantity (affects process selection). Default: 1",
        },
      },
      required: ["part_number", "process_type"],
    },
    handler: async ({ part_number, file_path, material, process_type, quantity = 1 }) => {
      throw new Error(
        `[plm_routing_create] Not yet implemented. ` +
        `part_number=${part_number}, file_path=${file_path}, ` +
        `material=${material}, process_type=${process_type}, quantity=${quantity}`
      );
    },
  },
  {
    name: "plm_work_instruction",
    description:
      "Generate work instructions for a specific manufacturing operation. " +
      "Includes step-by-step instructions, tooling, parameters, and safety notes.",
    category: "planning",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "Operation name (e.g., 'CNC Milling Op 10')" },
        part_number: { type: "string", description: "Part number" },
        file_path: { type: "string", description: "Path to CAD file" },
        detail_level: {
          type: "string",
          enum: ["overview", "standard", "detailed"],
          description: "Level of detail. Default: standard",
        },
        include_images: {
          type: "boolean",
          description: "Include placeholder image references. Default: true",
        },
      },
      required: ["operation", "part_number"],
    },
    handler: async ({ operation, part_number, file_path, detail_level = "standard", include_images = true }) => {
      throw new Error(
        `[plm_work_instruction] Not yet implemented. ` +
        `operation=${operation}, part_number=${part_number}, ` +
        `file_path=${file_path}, detail_level=${detail_level}`
      );
    },
  },
  {
    name: "plm_cycle_time",
    description:
      "Estimate manufacturing cycle time for a part based on features and process. " +
      "Returns setup time, machining time, and total lead time per operation.",
    category: "planning",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to CAD file" },
        material: { type: "string", description: "Material designation" },
        process_type: {
          type: "string",
          enum: ["machining", "sheet_metal", "casting", "additive", "composite"],
          description: "Manufacturing process type",
        },
        quantity: { type: "number", description: "Batch quantity. Default: 1" },
        include_setup: {
          type: "boolean",
          description: "Include setup time in estimate. Default: true",
        },
      },
      required: ["file_path", "process_type"],
    },
    handler: async ({ file_path, material, process_type, quantity = 1, include_setup = true }) => {
      throw new Error(
        `[plm_cycle_time] Not yet implemented. ` +
        `file_path=${file_path}, material=${material}, ` +
        `process_type=${process_type}, quantity=${quantity}, include_setup=${include_setup}`
      );
    },
  },
];
