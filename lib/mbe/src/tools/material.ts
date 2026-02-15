/**
 * MBE Material Tools
 *
 * Material database lookups, property queries, equivalents, compliance.
 *
 * @module lib/mbe/tools/material
 */

import type { MbeTool } from "./types.ts";

export const materialTools: MbeTool[] = [
  {
    name: "mbe_material_lookup",
    description:
      "Look up a material by designation (e.g., 'AL6061-T6', 'AISI 316L', 'Ti-6Al-4V'). " +
      "Returns full material card with mechanical, thermal, and physical properties.",
    category: "material",
    inputSchema: {
      type: "object",
      properties: {
        designation: {
          type: "string",
          description: "Material designation (e.g., 'AL6061-T6', '316L', 'Inconel 718')",
        },
        standard: {
          type: "string",
          enum: ["ams", "astm", "din", "en", "jis", "auto"],
          description: "Material standard. Default: auto (detect from designation)",
        },
      },
      required: ["designation"],
    },
    handler: async ({ designation, standard = "auto" }) => {
      throw new Error(
        `[mbe_material_lookup] Not yet implemented. designation=${designation}, standard=${standard}`
      );
    },
  },
  {
    name: "mbe_material_properties",
    description:
      "Query specific material properties with optional temperature/condition parameters. " +
      "Returns density, yield strength, UTS, elongation, thermal conductivity, etc.",
    category: "material",
    inputSchema: {
      type: "object",
      properties: {
        designation: { type: "string", description: "Material designation" },
        properties: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "density", "yield_strength", "ultimate_tensile_strength",
              "elongation", "hardness", "elastic_modulus", "poisson_ratio",
              "thermal_conductivity", "specific_heat", "thermal_expansion",
              "melting_point", "fatigue_strength",
            ],
          },
          description: "Properties to retrieve. Default: all",
        },
        temperature_c: {
          type: "number",
          description: "Temperature in Celsius for temperature-dependent properties. Default: 20",
        },
      },
      required: ["designation"],
    },
    handler: async ({ designation, properties, temperature_c = 20 }) => {
      throw new Error(
        `[mbe_material_properties] Not yet implemented. ` +
        `designation=${designation}, properties=${JSON.stringify(properties)}, temperature_c=${temperature_c}`
      );
    },
  },
  {
    name: "mbe_material_equivalent",
    description:
      "Find equivalent materials across standards (e.g., AMS ↔ DIN ↔ EN ↔ JIS). " +
      "Returns cross-reference table with compatibility notes.",
    category: "material",
    inputSchema: {
      type: "object",
      properties: {
        designation: { type: "string", description: "Source material designation" },
        target_standards: {
          type: "array",
          items: { type: "string", enum: ["ams", "astm", "din", "en", "jis"] },
          description: "Target standards for equivalence. Default: all",
        },
      },
      required: ["designation"],
    },
    handler: async ({ designation, target_standards }) => {
      throw new Error(
        `[mbe_material_equivalent] Not yet implemented. ` +
        `designation=${designation}, target_standards=${JSON.stringify(target_standards)}`
      );
    },
  },
  {
    name: "mbe_material_compliance",
    description:
      "Check material compliance against regulations (REACH, RoHS, ITAR, conflict minerals). " +
      "Returns compliance status and restricted substances.",
    category: "material",
    inputSchema: {
      type: "object",
      properties: {
        designation: { type: "string", description: "Material designation" },
        regulations: {
          type: "array",
          items: { type: "string", enum: ["reach", "rohs", "itar", "conflict_minerals", "prop65"] },
          description: "Regulations to check against. Default: all",
        },
      },
      required: ["designation"],
    },
    handler: async ({ designation, regulations }) => {
      throw new Error(
        `[mbe_material_compliance] Not yet implemented. ` +
        `designation=${designation}, regulations=${JSON.stringify(regulations)}`
      );
    },
  },
];
