/**
 * Manufacturing Planning Tools — Routing, Work Instructions, Cycle Time
 *
 * Generates manufacturing process documentation from BOM + material data.
 * Operates on flattened BOM output (from plm_bom_flatten).
 *
 * @module lib/plm/tools/planning
 */

import type { PlmTool } from "./types.ts";
import type { BomFlat } from "../data/bom-types.ts";
import type {
  CycleTimeAnalysis,
  OperationType,
  PartCycleTime,
  Routing,
  RoutingOperation,
  WorkInstruction,
  WorkInstructionStep,
} from "../data/planning-types.ts";
import { getMaterialPrice } from "../data/material-prices.ts";

// ============================================================================
// Helpers — process determination from material properties
// ============================================================================

interface ProcessTemplate {
  operations: Array<{
    name: string;
    type: OperationType;
    workCenter: string;
    setupTime_min: number;
    runTimeFactor: number; // multiplied by base time derived from mass
    tooling?: string[];
    notes?: string;
  }>;
}

/**
 * Determine manufacturing process template from material properties.
 * Uses material category and machining factor — no guessing.
 * Returns undefined if no material → no routing can be generated.
 */
function getProcessTemplate(materialId: string): ProcessTemplate | undefined {
  const mat = getMaterialPrice(materialId);
  if (!mat) return undefined;

  const category = mat.category;
  const factor = mat.machining_factor;

  if (category === "composite") {
    return {
      operations: [
        { name: "Layup", type: "forming", workCenter: "Layup Table", setupTime_min: 30, runTimeFactor: 8 },
        { name: "Autoclave Cure", type: "heat_treatment", workCenter: "Autoclave", setupTime_min: 15, runTimeFactor: 120, notes: "Follow cure cycle spec" },
        { name: "CNC Trim", type: "machining", workCenter: "5-Axis CNC", setupTime_min: 20, runTimeFactor: 3 },
        { name: "NDT Inspection", type: "inspection", workCenter: "NDT Lab", setupTime_min: 10, runTimeFactor: 5 },
      ],
    };
  }

  if (category === "plastic" || category === "elastomer") {
    return {
      operations: [
        { name: "Injection Molding", type: "forming", workCenter: "Injection Press", setupTime_min: 45, runTimeFactor: 0.5 },
        { name: "Deburring", type: "machining", workCenter: "Manual Bench", setupTime_min: 0, runTimeFactor: 1 },
        { name: "Visual Inspection", type: "inspection", workCenter: "QC Station", setupTime_min: 0, runTimeFactor: 0.5 },
      ],
    };
  }

  // Default: metal machining — complexity scales with machining_factor
  if (factor >= 3.0) {
    // Complex machining (titanium, nickel alloys, etc.)
    return {
      operations: [
        { name: "Rough Machining", type: "milling", workCenter: "CNC Mill", setupTime_min: 30, runTimeFactor: 5, tooling: ["Carbide end mill", "Roughing tool"] },
        { name: "Finish Machining", type: "milling", workCenter: "5-Axis CNC", setupTime_min: 20, runTimeFactor: 8, tooling: ["Finishing end mill"] },
        { name: "Deburring", type: "machining", workCenter: "Manual Bench", setupTime_min: 0, runTimeFactor: 2 },
        { name: "Surface Treatment", type: "surface_treatment", workCenter: "Anodize Line", setupTime_min: 15, runTimeFactor: 3 },
        { name: "CMM Inspection", type: "inspection", workCenter: "CMM", setupTime_min: 10, runTimeFactor: 4 },
      ],
    };
  }

  if (factor >= 2.0) {
    // Moderate machining (stainless steel, alloy steel, etc.)
    return {
      operations: [
        { name: "CNC Machining", type: "milling", workCenter: "CNC Mill", setupTime_min: 20, runTimeFactor: 4, tooling: ["Carbide end mill"] },
        { name: "Deburring", type: "machining", workCenter: "Manual Bench", setupTime_min: 0, runTimeFactor: 1 },
        { name: "Inspection", type: "inspection", workCenter: "QC Station", setupTime_min: 5, runTimeFactor: 2 },
      ],
    };
  }

  // Simple machining (aluminum, brass, mild steel, etc.)
  return {
    operations: [
      { name: "CNC Machining", type: "milling", workCenter: "CNC Mill", setupTime_min: 15, runTimeFactor: 2, tooling: ["HSS end mill"] },
      { name: "Deburring", type: "machining", workCenter: "Manual Bench", setupTime_min: 0, runTimeFactor: 0.5 },
      { name: "Inspection", type: "inspection", workCenter: "QC Station", setupTime_min: 0, runTimeFactor: 1 },
    ],
  };
}

/** Estimate base processing time from part mass (minutes) */
function estimateBaseTime(mass_kg: number): number {
  // Rough heuristic: ~10 min per kg for small parts, scales sub-linearly
  if (mass_kg <= 0) return 2; // minimum 2 min for very small parts
  return Math.max(2, Math.round(10 * Math.pow(mass_kg, 0.7) * 10) / 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ============================================================================
// Tool definitions
// ============================================================================

export const planningTools: PlmTool[] = [
  // --------------------------------------------------------------------------
  // plm_routing_create
  // --------------------------------------------------------------------------
  {
    name: "plm_routing_create",
    description:
      "Create a manufacturing routing (gamme de fabrication) for a part. " +
      "Determines the sequence of operations based on the part's material and properties. " +
      "Requires a part from a flattened BOM with an assigned material. " +
      "Parts without material assignment cannot have a routing generated.",
    category: "planning",
    inputSchema: {
      type: "object",
      properties: {
        part_number: {
          type: "string",
          description: "Part number from the flattened BOM",
        },
        part_name: {
          type: "string",
          description: "Part name",
        },
        material_id: {
          type: "string",
          description: "Material ID from the BOM (e.g. 'al6061-t6')",
        },
        mass_kg: {
          type: "number",
          description: "Part mass in kg (for time estimation)",
        },
        base_time_override_min: {
          type: "number",
          description:
            "Override the estimated base processing time (minutes). " +
            "By default, base time is estimated as ~10 × mass^0.7 min (minimum 2 min). " +
            "Provide this to use a known value instead of the heuristic.",
        },
      },
      required: ["part_number", "part_name", "material_id"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/routing-viewer",
      },
    },
    handler: (args) => {
      const partNumber = args.part_number as string;
      const partName = args.part_name as string;
      const materialId = args.material_id as string;
      const mass = (args.mass_kg as number) ?? 0;
      const baseTimeOverride = args.base_time_override_min as number | undefined;

      const template = getProcessTemplate(materialId);
      if (!template) {
        throw new Error(
          `[lib/plm] Cannot create routing: material '${materialId}' not found in database. ` +
          `Provide a valid material ID from the material-prices database.`,
        );
      }

      const baseTime = baseTimeOverride ?? estimateBaseTime(mass);
      let opNumber = 0;

      const operations: RoutingOperation[] = template.operations.map((t) => {
        opNumber += 10;
        const runTime = round1(baseTime * t.runTimeFactor);
        return {
          operationNumber: String(opNumber).padStart(3, "0"),
          name: t.name,
          type: t.type,
          workCenter: t.workCenter,
          setupTime_min: t.setupTime_min,
          runTime_min: runTime,
          tooling: t.tooling,
          notes: t.notes,
        };
      });

      const totalSetup = operations.reduce((s, o) => s + o.setupTime_min, 0);
      const totalRun = operations.reduce((s, o) => s + o.runTime_min, 0);

      const routing: Routing = {
        id: `RT-${Date.now().toString(36).toUpperCase()}`,
        title: `Routing — ${partName} (${partNumber})`,
        partNumber,
        partName,
        materialId,
        operations,
        summary: {
          totalOperations: operations.length,
          totalSetupTime_min: totalSetup,
          totalRunTime_min: round1(totalRun),
          totalCycleTime_min: round1(totalSetup + totalRun),
        },
        generatedAt: new Date().toISOString(),
      };

      return routing;
    },
  },

  // --------------------------------------------------------------------------
  // plm_work_instruction
  // --------------------------------------------------------------------------
  {
    name: "plm_work_instruction",
    description:
      "Generate operator work instructions for a specific operation from a routing. " +
      "Creates step-by-step instructions with safety warnings and quality checkpoints. " +
      "Input: a Routing object (from plm_routing_create) and the operation number to detail.",
    category: "planning",
    inputSchema: {
      type: "object",
      properties: {
        routing: {
          type: "object",
          description: "Routing object from plm_routing_create",
        },
        operation_number: {
          type: "string",
          description: "Operation number to generate instructions for (e.g. '010', '020')",
        },
      },
      required: ["routing", "operation_number"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/work-instruction-viewer",
      },
    },
    handler: (args) => {
      const routing = args.routing as Routing;
      const opNum = args.operation_number as string;

      const operation = routing.operations.find((o) => o.operationNumber === opNum);
      if (!operation) {
        throw new Error(
          `[lib/plm] Operation ${opNum} not found in routing ${routing.id}. ` +
          `Available: ${routing.operations.map((o) => o.operationNumber).join(", ")}`,
        );
      }

      const steps: WorkInstructionStep[] = [];
      let stepNum = 0;

      // Setup step
      if (operation.setupTime_min > 0) {
        stepNum++;
        steps.push({
          step: stepNum,
          instruction: `Set up ${operation.workCenter} for ${operation.name} operation`,
          tools: operation.tooling,
          estimatedTime_min: operation.setupTime_min,
          safetyWarning: needsSafetyWarning(operation.type)
            ? getSafetyWarning(operation.type)
            : undefined,
        });
      }

      // Tool loading (if applicable)
      if (operation.tooling && operation.tooling.length > 0) {
        stepNum++;
        steps.push({
          step: stepNum,
          instruction: `Load tooling: ${operation.tooling.join(", ")}`,
          tools: operation.tooling,
          estimatedTime_min: 5,
        });
      }

      // Material loading
      stepNum++;
      steps.push({
        step: stepNum,
        instruction: `Load workpiece (${routing.partName}, material: ${routing.materialId ?? "see BOM"})`,
        qualityCheck: "Verify material certificate matches BOM specification",
        estimatedTime_min: 2,
      });

      // Execute operation
      stepNum++;
      steps.push({
        step: stepNum,
        instruction: `Execute ${operation.name} per process specification`,
        estimatedTime_min: operation.runTime_min,
        safetyWarning: needsSafetyWarning(operation.type)
          ? getSafetyWarning(operation.type)
          : undefined,
        notes: operation.notes,
      });

      // Cleanup
      stepNum++;
      steps.push({
        step: stepNum,
        instruction: "Remove workpiece, clean work area, return tooling",
        estimatedTime_min: 3,
      });

      // Quality check
      if (operation.type === "inspection" || operation.type === "testing") {
        stepNum++;
        steps.push({
          step: stepNum,
          instruction: "Record measurement results in inspection log",
          qualityCheck: "All measured values must be within specification",
          estimatedTime_min: 2,
        });
      } else {
        stepNum++;
        steps.push({
          step: stepNum,
          instruction: "Visual inspection — check for defects, burrs, damage",
          qualityCheck: "Part must be free of visible defects",
          estimatedTime_min: 1,
        });
      }

      const totalTime = steps.reduce((s, step) => s + (step.estimatedTime_min ?? 0), 0);

      const wi: WorkInstruction = {
        id: `WI-${Date.now().toString(36).toUpperCase()}`,
        title: `Work Instruction — ${operation.name} — ${routing.partName}`,
        partNumber: routing.partNumber,
        partName: routing.partName,
        operationNumber: operation.operationNumber,
        operationName: operation.name,
        steps,
        summary: {
          totalSteps: steps.length,
          estimatedTotalTime_min: totalTime,
          safetyWarnings: steps.filter((s) => s.safetyWarning).length,
          qualityChecks: steps.filter((s) => s.qualityCheck).length,
        },
        generatedAt: new Date().toISOString(),
      };

      return wi;
    },
  },

  // --------------------------------------------------------------------------
  // plm_cycle_time
  // --------------------------------------------------------------------------
  {
    name: "plm_cycle_time",
    description:
      "Estimate manufacturing cycle time for a complete product from a flattened BOM. " +
      "Generates routings for all parts with material assignments, then aggregates " +
      "setup and run times. Parts without materials are excluded (no routing possible). " +
      "Input: BomFlat from plm_bom_flatten.",
    category: "planning",
    inputSchema: {
      type: "object",
      properties: {
        bom_flat: {
          type: "object",
          description: "BomFlat object from plm_bom_flatten",
        },
        batch_size: {
          type: "number",
          description: "Production batch size (setup amortized across batch)",
          default: 1,
        },
        base_time_override_min: {
          type: "number",
          description:
            "Override the estimated base processing time per part (minutes). " +
            "By default, base time is estimated as ~10 × mass^0.7 min (minimum 2 min). " +
            "Provide this to use a known value instead of the heuristic.",
        },
      },
      required: ["bom_flat"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/cycle-time-viewer",
      },
    },
    handler: (args) => {
      const flat = args.bom_flat as BomFlat;
      const batchSize = (args.batch_size as number) ?? 1;
      const baseTimeOverride = args.base_time_override_min as number | undefined;

      const parts: PartCycleTime[] = [];

      for (const row of flat.rows) {
        if (!row.materialId) continue; // No material → no routing → skip

        const template = getProcessTemplate(row.materialId);
        if (!template) continue;

        const unitMass = row.totalQuantity > 0 && row.totalMass_kg
          ? row.totalMass_kg / row.totalQuantity
          : 0;
        const baseTime = baseTimeOverride ?? estimateBaseTime(unitMass);

        let setupTime = 0;
        let runTimePerUnit = 0;

        for (const op of template.operations) {
          setupTime += op.setupTime_min;
          runTimePerUnit += round1(baseTime * op.runTimeFactor);
        }

        parts.push({
          partNumber: row.partNumber,
          partName: row.name,
          quantity: row.totalQuantity,
          setupTime_min: setupTime,
          runTimePerUnit_min: round1(runTimePerUnit),
          totalRunTime_min: round1(runTimePerUnit * row.totalQuantity),
          operationCount: template.operations.length,
        });
      }

      const totalSetup = parts.reduce((s, p) => s + p.setupTime_min, 0);
      const totalRun = parts.reduce((s, p) => s + p.totalRunTime_min, 0);
      // For 1 product: totalCycle = setup + run
      // For N products (batch): setup done once, run done N times
      const totalCycle = totalSetup + totalRun;
      // Per-unit: only setup is amortized across the batch, run is per unit
      const cyclePerUnit = batchSize > 0
        ? round1(totalSetup / batchSize + totalRun)
        : totalCycle;

      const analysis: CycleTimeAnalysis = {
        id: `CT-${Date.now().toString(36).toUpperCase()}`,
        productName: flat.metadata.productName,
        batchSize,
        parts,
        totals: {
          totalSetupTime_min: totalSetup,
          totalRunTime_min: round1(totalRun),
          totalCycleTime_min: round1(totalCycle),
          cycleTimePerUnit_min: cyclePerUnit,
          totalCycleTime_hours: round1(totalCycle / 60),
        },
        generatedAt: new Date().toISOString(),
      };

      return analysis;
    },
  },
];

// ============================================================================
// Safety helpers
// ============================================================================

function needsSafetyWarning(type: OperationType): boolean {
  return [
    "machining", "milling", "turning", "drilling", "grinding",
    "welding", "heat_treatment", "surface_treatment",
  ].includes(type);
}

function getSafetyWarning(type: OperationType): string {
  const warnings: Record<string, string> = {
    machining: "Wear safety glasses and hearing protection. Keep hands clear of moving parts.",
    milling: "Wear safety glasses and hearing protection. Ensure workpiece is clamped securely.",
    turning: "Wear safety glasses. Do not wear loose clothing near rotating chuck.",
    drilling: "Wear safety glasses. Clamp workpiece securely. Use appropriate cutting speed.",
    grinding: "Wear safety glasses and respiratory protection. Check wheel guard.",
    welding: "Wear welding helmet, gloves, and protective clothing. Ensure ventilation.",
    heat_treatment: "Wear heat-resistant gloves. Allow parts to cool before handling.",
    surface_treatment: "Wear chemical-resistant gloves and eye protection. Ensure ventilation.",
  };
  return warnings[type] ?? "Follow standard safety procedures.";
}
