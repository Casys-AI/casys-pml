/**
 * Quality Tools — Inspection Plans, FAIR, Control Plans
 *
 * Generates quality documentation from BOM data and model constraints.
 * Operates on flattened BOM output (from plm_bom_flatten) — no SysON dependency.
 *
 * @module lib/plm/tools/quality
 */

import type { PlmTool } from "./types.ts";
import type { BomFlat, BomFlatRow } from "../data/bom-types.ts";
import type {
  ControlPlan,
  ControlPlanEntry,
  FairMeasurement,
  FairReport,
  InspectionCharacteristic,
  InspectionLevel,
  InspectionPlan,
  MeasurementMethod,
  ReactionPlan,
} from "../data/quality-types.ts";
import { getMaterialPrice } from "../data/material-prices.ts";

// ============================================================================
// Helpers
// ============================================================================

/** Determine inspection level based on part characteristics */
function determineInspectionLevel(row: BomFlatRow): InspectionLevel {
  // No material → skip (likely a fastener/COTS component)
  if (!row.materialId) return "skip";

  const mat = getMaterialPrice(row.materialId);
  if (!mat) return "sampling";

  // High-value or high machining factor parts get full inspection
  if (mat.machining_factor >= 2.5 || (row.totalCost ?? 0) > 500) return "full";

  return "sampling";
}

/** Determine measurement method based on material type */
function determineMeasurementMethod(materialId?: string): MeasurementMethod {
  if (!materialId) return "visual";

  const mat = getMaterialPrice(materialId);
  if (!mat) return "caliper";

  // Precision materials → CMM
  if (mat.machining_factor >= 3.0) return "cmm";
  // Composite/special → functional test
  if (mat.category === "composite") return "functional_test";

  return "caliper";
}

/** Determine reaction plan based on inspection level */
function determineReactionPlan(level: InspectionLevel, ctq: boolean): ReactionPlan {
  if (ctq) return "stop_production";
  if (level === "full") return "quarantine";
  return "document_only";
}

// ============================================================================
// Tool definitions
// ============================================================================

export const qualityTools: PlmTool[] = [
  // --------------------------------------------------------------------------
  // plm_inspection_plan
  // --------------------------------------------------------------------------
  {
    name: "plm_inspection_plan",
    description:
      "Generate an inspection plan from a flattened BOM. " +
      "Creates inspection characteristics for each part based on material properties " +
      "and estimated criticality. Parts without material assignments are skipped. " +
      "Input: BomFlat from plm_bom_flatten.",
    category: "quality",
    inputSchema: {
      type: "object",
      properties: {
        bom_flat: {
          type: "object",
          description: "BomFlat object from plm_bom_flatten",
        },
        standard: {
          type: "string",
          description: "Applicable standard (e.g. 'AS9102', 'ISO 2859-1', 'IATF 16949')",
        },
        ctq_part_numbers: {
          type: "array",
          items: { type: "string" },
          description: "Part numbers designated as Critical-to-Quality (CTQ). If empty, auto-detected from material/cost.",
        },
        ctq_cost_threshold: {
          type: "number",
          description:
            "Cost threshold above which a part is auto-detected as CTQ (default: 500 EUR). " +
            "Set to Infinity to disable cost-based CTQ detection.",
          default: 500,
        },
        ctq_machining_threshold: {
          type: "number",
          description:
            "Machining factor threshold at/above which a part is auto-detected as CTQ (default: 2.5). " +
            "Set to Infinity to disable machining-based CTQ detection.",
          default: 2.5,
        },
      },
      required: ["bom_flat"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/inspection-viewer",
      },
    },
    handler: (args) => {
      const flat = args.bom_flat as BomFlat;
      const standard = args.standard as string | undefined;
      const ctqParts = new Set((args.ctq_part_numbers as string[] | undefined) ?? []);
      const ctqCostThreshold = (args.ctq_cost_threshold as number) ?? 500;
      const ctqMachiningThreshold = (args.ctq_machining_threshold as number) ?? 2.5;

      const characteristics: InspectionCharacteristic[] = [];
      let charCounter = 0;

      for (const row of flat.rows) {
        const level = determineInspectionLevel(row);
        const method = determineMeasurementMethod(row.materialId);

        // Auto-detect CTQ: high-cost or high-machining parts (thresholds are explicit parameters)
        const mat = row.materialId ? getMaterialPrice(row.materialId) : undefined;
        const isCtq = ctqParts.has(row.partNumber) ||
          (mat && mat.machining_factor >= ctqMachiningThreshold) ||
          (row.totalCost != null && row.totalCost > ctqCostThreshold);

        charCounter++;
        characteristics.push({
          id: `INSP-${String(charCounter).padStart(3, "0")}`,
          partNumber: row.partNumber,
          partName: row.name,
          characteristicName: "Dimensional conformity",
          nominal: undefined, // From model constraints — undefined if not in model
          tolerance: undefined,
          method,
          level,
          sampleSize: level === "sampling" ? `${Math.min(5, row.totalQuantity)} per lot` : undefined,
          ctq: !!isCtq,
          source: mat ? `Material: ${mat.name}` : undefined,
        });

        // Add material verification for parts with assigned materials
        if (row.materialId && level !== "skip") {
          charCounter++;
          characteristics.push({
            id: `INSP-${String(charCounter).padStart(3, "0")}`,
            partNumber: row.partNumber,
            partName: row.name,
            characteristicName: "Material certificate verification",
            nominal: row.materialId,
            method: "visual",
            level: "full",
            ctq: !!isCtq,
            source: "Material assignment",
          });
        }
      }

      const fullCount = characteristics.filter((c) => c.level === "full").length;
      const samplingCount = characteristics.filter((c) => c.level === "sampling").length;
      const skipCount = characteristics.filter((c) => c.level === "skip").length;

      const plan: InspectionPlan = {
        id: `IP-${Date.now().toString(36).toUpperCase()}`,
        title: `Inspection Plan — ${flat.metadata.productName} Rev.${flat.metadata.revision}`,
        productName: flat.metadata.productName,
        bomRevision: flat.metadata.revision,
        characteristics,
        summary: {
          totalCharacteristics: characteristics.length,
          ctqCount: characteristics.filter((c) => c.ctq).length,
          fullInspection: fullCount,
          samplingInspection: samplingCount,
          skipped: skipCount,
        },
        generatedAt: new Date().toISOString(),
        standard,
      };

      return plan;
    },
  },

  // --------------------------------------------------------------------------
  // plm_fair_generate
  // --------------------------------------------------------------------------
  {
    name: "plm_fair_generate",
    description:
      "Generate a First Article Inspection Report (FAIR) template from an inspection plan. " +
      "Creates measurement rows for each inspection characteristic with 'pending' status. " +
      "The report is a template — actual values are filled during inspection. " +
      "Input: InspectionPlan from plm_inspection_plan.",
    category: "quality",
    inputSchema: {
      type: "object",
      properties: {
        inspection_plan: {
          type: "object",
          description: "InspectionPlan object from plm_inspection_plan",
        },
        serial_number: {
          type: "string",
          description: "Serial number of the first article being inspected",
          default: "FA-001",
        },
      },
      required: ["inspection_plan"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/fair-viewer",
      },
    },
    handler: (args) => {
      const plan = args.inspection_plan as InspectionPlan;
      const serialNumber = (args.serial_number as string) || "FA-001";

      // Only include non-skipped characteristics
      const activeChars = plan.characteristics.filter((c) => c.level !== "skip");

      const measurements: FairMeasurement[] = activeChars.map((c) => ({
        characteristicId: c.id,
        partNumber: c.partNumber,
        partName: c.partName,
        characteristicName: c.characteristicName,
        nominal: c.nominal,
        tolerance: c.tolerance,
        status: "pending" as const,
        method: c.method,
      }));

      const report: FairReport = {
        id: `FAIR-${Date.now().toString(36).toUpperCase()}`,
        title: `FAIR — ${plan.productName} — S/N ${serialNumber}`,
        productName: plan.productName,
        inspectionPlanId: plan.id,
        serialNumber,
        measurements,
        summary: {
          total: measurements.length,
          pass: 0,
          fail: 0,
          pending: measurements.length,
          waived: 0,
        },
        verdict: "pending",
        generatedAt: new Date().toISOString(),
      };

      return report;
    },
  },

  // --------------------------------------------------------------------------
  // plm_control_plan
  // --------------------------------------------------------------------------
  {
    name: "plm_control_plan",
    description:
      "Generate a control plan for ongoing production quality control. " +
      "Defines what to check, how often, and what to do when out of spec. " +
      "Based on an inspection plan — turns one-time inspection characteristics " +
      "into ongoing process controls. Input: InspectionPlan from plm_inspection_plan.",
    category: "quality",
    inputSchema: {
      type: "object",
      properties: {
        inspection_plan: {
          type: "object",
          description: "InspectionPlan object from plm_inspection_plan",
        },
        production_volume: {
          type: "string",
          enum: ["prototype", "low_volume", "medium_volume", "high_volume"],
          description: "Production volume level (affects sampling frequency)",
          default: "low_volume",
        },
      },
      required: ["inspection_plan"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/control-plan-viewer",
      },
    },
    handler: (args) => {
      const plan = args.inspection_plan as InspectionPlan;
      const volume = (args.production_volume as string) || "low_volume";

      // Determine frequencies based on volume
      const frequencyMap: Record<string, Record<InspectionLevel, string>> = {
        prototype: { full: "every part", sampling: "every part", skip: "none" },
        low_volume: { full: "every part", sampling: "1 per lot", skip: "none" },
        medium_volume: { full: "first and last", sampling: "1 per hour", skip: "none" },
        high_volume: { full: "SPC (Cp ≥ 1.33)", sampling: "1 per shift", skip: "none" },
      };

      const frequencies = frequencyMap[volume] ?? frequencyMap["low_volume"];
      let entryCounter = 0;

      const entries: ControlPlanEntry[] = [];

      // Group characteristics by part
      const activeChars = plan.characteristics.filter((c) => c.level !== "skip");

      for (const c of activeChars) {
        entryCounter++;
        const frequency = frequencies[c.level];
        const reactionPlan = determineReactionPlan(c.level, c.ctq);

        const controlMethod = c.ctq
          ? "SPC chart + 100% if Cpk < 1.33"
          : c.level === "full"
          ? "Go/no-go gauge"
          : "Visual standard";

        entries.push({
          id: `CP-${String(entryCounter).padStart(3, "0")}`,
          operationNumber: `OP${String(entryCounter * 10).padStart(3, "0")}`,
          processDescription: `Inspect ${c.characteristicName}`,
          partNumber: c.partNumber,
          partName: c.partName,
          characteristic: c.characteristicName,
          specification: c.nominal,
          method: c.method,
          frequency,
          controlMethod,
          reactionPlan,
        });
      }

      const controlPlan: ControlPlan = {
        id: `CP-${Date.now().toString(36).toUpperCase()}`,
        title: `Control Plan — ${plan.productName} Rev.${plan.bomRevision}`,
        productName: plan.productName,
        bomRevision: plan.bomRevision,
        entries,
        summary: {
          totalEntries: entries.length,
          uniqueParts: new Set(entries.map((e) => e.partNumber)).size,
          stopProductionCount: entries.filter((e) => e.reactionPlan === "stop_production").length,
        },
        generatedAt: new Date().toISOString(),
        standard: plan.standard,
      };

      return controlPlan;
    },
  },
];
