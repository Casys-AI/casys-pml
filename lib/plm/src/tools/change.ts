/**
 * PLM Change Management Tools
 *
 * ECR/ECO workflows, impact analysis, approval tracking.
 *
 * @module lib/plm/tools/change
 */

import type { PlmTool } from "./types.ts";

export const changeTools: PlmTool[] = [
  {
    name: "plm_ecr_create",
    description:
      "Create an Engineering Change Request (ECR) with reason, affected parts, and proposed solution. " +
      "Returns ECR number and initiates review workflow.",
    category: "change",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "ECR title" },
        reason: {
          type: "string",
          enum: ["defect", "cost_reduction", "performance", "compliance", "customer_request", "supplier_change"],
          description: "Change reason category",
        },
        description: { type: "string", description: "Detailed description of requested change" },
        affected_parts: {
          type: "array",
          items: { type: "string" },
          description: "Part numbers affected by the change",
        },
        priority: {
          type: "string",
          enum: ["critical", "high", "medium", "low"],
          description: "Priority level. Default: medium",
        },
        requestor: { type: "string", description: "Name or ID of the requestor" },
      },
      required: ["title", "reason", "description"],
    },
    handler: async ({ title, reason, description, affected_parts, priority = "medium", requestor }) => {
      throw new Error(
        `[plm_ecr_create] Not yet implemented. ` +
        `title=${title}, reason=${reason}, priority=${priority}`
      );
    },
  },
  {
    name: "plm_eco_create",
    description:
      "Create an Engineering Change Order (ECO) from an approved ECR. " +
      "Defines implementation plan, affected documents, and effectivity.",
    category: "change",
    inputSchema: {
      type: "object",
      properties: {
        ecr_number: { type: "string", description: "Source ECR number" },
        title: { type: "string", description: "ECO title" },
        implementation_plan: { type: "string", description: "Description of implementation steps" },
        effectivity: {
          type: "string",
          enum: ["immediate", "next_lot", "next_serial", "date_based"],
          description: "When the change takes effect",
        },
        effectivity_date: { type: "string", description: "ISO date for date-based effectivity" },
        affected_documents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              doc_number: { type: "string" },
              doc_type: { type: "string", enum: ["drawing", "model", "spec", "procedure", "bom"] },
              action: { type: "string", enum: ["revise", "add", "obsolete"] },
            },
            required: ["doc_number", "doc_type", "action"],
          },
          description: "Documents affected by the change",
        },
      },
      required: ["title"],
    },
    handler: async ({ ecr_number, title, implementation_plan, effectivity, effectivity_date, affected_documents }) => {
      throw new Error(
        `[plm_eco_create] Not yet implemented. ` +
        `ecr_number=${ecr_number}, title=${title}, effectivity=${effectivity}`
      );
    },
  },
  {
    name: "plm_change_impact",
    description:
      "Analyze the impact of a proposed change across assemblies, BOMs, and processes. " +
      "Returns affected items, cost impact, and schedule impact.",
    category: "change",
    inputSchema: {
      type: "object",
      properties: {
        part_numbers: {
          type: "array",
          items: { type: "string" },
          description: "Part numbers being changed",
        },
        change_type: {
          type: "string",
          enum: ["dimensional", "material", "process", "supplier", "design"],
          description: "Type of change being made",
        },
        include_cost: {
          type: "boolean",
          description: "Include cost impact analysis. Default: true",
        },
        include_schedule: {
          type: "boolean",
          description: "Include schedule impact analysis. Default: true",
        },
      },
      required: ["part_numbers", "change_type"],
    },
    handler: async ({ part_numbers, change_type, include_cost = true, include_schedule = true }) => {
      throw new Error(
        `[plm_change_impact] Not yet implemented. ` +
        `part_numbers=${JSON.stringify(part_numbers)}, change_type=${change_type}, ` +
        `include_cost=${include_cost}, include_schedule=${include_schedule}`
      );
    },
  },
];
