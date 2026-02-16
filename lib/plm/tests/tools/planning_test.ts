/**
 * Tests for Planning tools (Routing, Work Instruction, Cycle Time)
 *
 * Uses BomFlat fixtures and direct args — no SysON dependency.
 */

import { assertEquals, assertThrows } from "@std/assert";
import { planningTools } from "../../src/tools/planning.ts";
import type { BomFlat } from "../../src/data/bom-types.ts";
import type {
  CycleTimeAnalysis,
  Routing,
  WorkInstruction,
} from "../../src/data/planning-types.ts";

function getHandler(name: string) {
  const tool = planningTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

// ============================================================================
// Test fixtures
// ============================================================================

function makeDroneFlat(): BomFlat {
  return {
    rows: [
      { partNumber: "PRT-001", name: "Brushless Motor", totalQuantity: 4, unit: "pcs", materialId: "cu-etp", totalMass_kg: 0.6, totalCost: 5.1, usedIn: ["Propulsion"] },
      { partNumber: "PRT-002", name: "Frame Plate", totalQuantity: 2, unit: "pcs", materialId: "al6061-t6", totalMass_kg: 0.5, totalCost: 1.75, usedIn: ["Structure"] },
      { partNumber: "PRT-003", name: "Carbon Propeller", totalQuantity: 4, unit: "pcs", materialId: "cfrp-woven", totalMass_kg: 0.12, totalCost: 9.12, usedIn: ["Propulsion"] },
      { partNumber: "PRT-004", name: "M3 Screws", totalQuantity: 24, unit: "pcs", usedIn: ["Structure"] }, // No material
    ],
    metadata: {
      productName: "Drone X-400",
      revision: "A",
      generatedAt: "2026-02-16T10:00:00Z",
      uniquePartsCount: 4,
      totalItemsCount: 34,
    },
    totals: { totalMass_kg: 1.22, totalCost: 15.97, uniqueParts: 4, totalItems: 34 },
  };
}

// ============================================================================
// Tool registration tests
// ============================================================================

Deno.test("planningTools - exports 3 tools", () => {
  assertEquals(planningTools.length, 3);
});

Deno.test("planningTools - all have category 'planning'", () => {
  for (const tool of planningTools) {
    assertEquals(tool.category, "planning");
  }
});

Deno.test("planningTools - correct names", () => {
  const names = planningTools.map((t) => t.name);
  assertEquals(names, [
    "plm_routing_create",
    "plm_work_instruction",
    "plm_cycle_time",
  ]);
});

// ============================================================================
// plm_routing_create tests
// ============================================================================

Deno.test("plm_routing_create - generates routing for aluminum part", () => {
  const result = getHandler("plm_routing_create")({
    part_number: "PRT-002",
    part_name: "Frame Plate",
    material_id: "al6061-t6",
    mass_kg: 0.25,
  }) as Routing;

  assertEquals(result.partNumber, "PRT-002");
  assertEquals(result.partName, "Frame Plate");
  assertEquals(result.materialId, "al6061-t6");
  if (result.operations.length === 0) {
    throw new Error("Should have at least one operation");
  }
  assertEquals(result.id.startsWith("RT-"), true);
});

Deno.test("plm_routing_create - operations have sequential numbers", () => {
  const result = getHandler("plm_routing_create")({
    part_number: "PRT-001",
    part_name: "Motor Housing",
    material_id: "cu-etp",
    mass_kg: 0.15,
  }) as Routing;

  for (let i = 0; i < result.operations.length; i++) {
    const expected = String((i + 1) * 10).padStart(3, "0");
    assertEquals(result.operations[i].operationNumber, expected);
  }
});

Deno.test("plm_routing_create - composite material gets layup process", () => {
  const result = getHandler("plm_routing_create")({
    part_number: "PRT-003",
    part_name: "Carbon Propeller",
    material_id: "cfrp-woven",
    mass_kg: 0.03,
  }) as Routing;

  const opNames = result.operations.map((o) => o.name);
  assertEquals(opNames.includes("Layup"), true, "Composite should include Layup operation");
  assertEquals(opNames.includes("Autoclave Cure"), true, "Composite should include Autoclave Cure");
});

Deno.test("plm_routing_create - summary totals are consistent", () => {
  const result = getHandler("plm_routing_create")({
    part_number: "PRT-002",
    part_name: "Frame Plate",
    material_id: "al6061-t6",
    mass_kg: 0.25,
  }) as Routing;

  const computedSetup = result.operations.reduce((s, o) => s + o.setupTime_min, 0);
  const computedRun = result.operations.reduce((s, o) => s + o.runTime_min, 0);

  assertEquals(result.summary.totalSetupTime_min, computedSetup);
  assertEquals(result.summary.totalOperations, result.operations.length);
  // Cycle = setup + run (allow small rounding)
  const diff = Math.abs(result.summary.totalCycleTime_min - (computedSetup + computedRun));
  if (diff > 0.2) {
    throw new Error(`Cycle time mismatch: ${result.summary.totalCycleTime_min} vs ${computedSetup + computedRun}`);
  }
});

Deno.test("plm_routing_create - base_time_override_min overrides heuristic", () => {
  const defaultResult = getHandler("plm_routing_create")({
    part_number: "PRT-002",
    part_name: "Frame Plate",
    material_id: "al6061-t6",
    mass_kg: 0.25,
  }) as Routing;

  const overrideResult = getHandler("plm_routing_create")({
    part_number: "PRT-002",
    part_name: "Frame Plate",
    material_id: "al6061-t6",
    mass_kg: 0.25,
    base_time_override_min: 100, // Much larger than the heuristic
  }) as Routing;

  // With a larger base time, total run time should be much larger
  if (overrideResult.summary.totalRunTime_min <= defaultResult.summary.totalRunTime_min) {
    throw new Error("Override with larger base time should produce longer run time");
  }
});

Deno.test("plm_routing_create - throws for unknown material", () => {
  assertThrows(
    () => {
      getHandler("plm_routing_create")({
        part_number: "PRT-X",
        part_name: "Mystery Part",
        material_id: "unobtanium-42",
      });
    },
    Error,
    "not found in database",
  );
});

// ============================================================================
// plm_work_instruction tests
// ============================================================================

Deno.test("plm_work_instruction - generates steps for an operation", () => {
  const routing = getHandler("plm_routing_create")({
    part_number: "PRT-002",
    part_name: "Frame Plate",
    material_id: "al6061-t6",
    mass_kg: 0.25,
  }) as Routing;

  const firstOp = routing.operations[0].operationNumber;
  const result = getHandler("plm_work_instruction")({
    routing,
    operation_number: firstOp,
  }) as WorkInstruction;

  assertEquals(result.partNumber, "PRT-002");
  assertEquals(result.operationNumber, firstOp);
  if (result.steps.length < 3) {
    throw new Error("Should have at least 3 steps (setup, execute, cleanup)");
  }
  assertEquals(result.id.startsWith("WI-"), true);
});

Deno.test("plm_work_instruction - steps have sequential numbers", () => {
  const routing = getHandler("plm_routing_create")({
    part_number: "PRT-002",
    part_name: "Frame Plate",
    material_id: "al6061-t6",
  }) as Routing;

  const result = getHandler("plm_work_instruction")({
    routing,
    operation_number: routing.operations[0].operationNumber,
  }) as WorkInstruction;

  for (let i = 0; i < result.steps.length; i++) {
    assertEquals(result.steps[i].step, i + 1);
  }
});

Deno.test("plm_work_instruction - includes safety warnings for machining", () => {
  const routing = getHandler("plm_routing_create")({
    part_number: "PRT-002",
    part_name: "Frame Plate",
    material_id: "al6061-t6",
    mass_kg: 0.25,
  }) as Routing;

  // Find a machining operation
  const machiningOp = routing.operations.find((o) =>
    ["machining", "milling", "turning", "drilling", "grinding"].includes(o.type)
  );

  if (machiningOp) {
    const result = getHandler("plm_work_instruction")({
      routing,
      operation_number: machiningOp.operationNumber,
    }) as WorkInstruction;

    assertEquals(result.summary.safetyWarnings > 0, true, "Machining should have safety warnings");
  }
});

Deno.test("plm_work_instruction - throws for invalid operation number", () => {
  const routing = getHandler("plm_routing_create")({
    part_number: "PRT-002",
    part_name: "Frame Plate",
    material_id: "al6061-t6",
  }) as Routing;

  assertThrows(
    () => {
      getHandler("plm_work_instruction")({
        routing,
        operation_number: "999",
      });
    },
    Error,
    "not found in routing",
  );
});

Deno.test("plm_work_instruction - summary matches step content", () => {
  const routing = getHandler("plm_routing_create")({
    part_number: "PRT-001",
    part_name: "Motor Housing",
    material_id: "cu-etp",
  }) as Routing;

  const result = getHandler("plm_work_instruction")({
    routing,
    operation_number: routing.operations[0].operationNumber,
  }) as WorkInstruction;

  assertEquals(result.summary.totalSteps, result.steps.length);

  const actualSafetyCount = result.steps.filter((s) => s.safetyWarning).length;
  assertEquals(result.summary.safetyWarnings, actualSafetyCount);

  const actualQualityCount = result.steps.filter((s) => s.qualityCheck).length;
  assertEquals(result.summary.qualityChecks, actualQualityCount);
});

// ============================================================================
// plm_cycle_time tests
// ============================================================================

Deno.test("plm_cycle_time - estimates from flat BOM", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_cycle_time")({ bom_flat: flat }) as CycleTimeAnalysis;

  assertEquals(result.productName, "Drone X-400");
  assertEquals(result.batchSize, 1); // default
  if (result.parts.length === 0) {
    throw new Error("Should have at least one part");
  }
  assertEquals(result.id.startsWith("CT-"), true);
});

Deno.test("plm_cycle_time - skips parts without material", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_cycle_time")({ bom_flat: flat }) as CycleTimeAnalysis;

  // PRT-004 (M3 Screws) has no material → should be excluded
  const screws = result.parts.find((p) => p.partNumber === "PRT-004");
  assertEquals(screws, undefined, "Parts without material should be excluded");

  // Should have 3 parts (motor, frame, propeller)
  assertEquals(result.parts.length, 3);
});

Deno.test("plm_cycle_time - totals are positive", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_cycle_time")({ bom_flat: flat }) as CycleTimeAnalysis;

  if (result.totals.totalSetupTime_min <= 0) {
    throw new Error("Total setup time should be positive");
  }
  if (result.totals.totalRunTime_min <= 0) {
    throw new Error("Total run time should be positive");
  }
  if (result.totals.totalCycleTime_min <= 0) {
    throw new Error("Total cycle time should be positive");
  }
});

Deno.test("plm_cycle_time - cycle time = setup + run", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_cycle_time")({ bom_flat: flat }) as CycleTimeAnalysis;

  const expected = result.totals.totalSetupTime_min + result.totals.totalRunTime_min;
  const diff = Math.abs(result.totals.totalCycleTime_min - expected);
  if (diff > 0.2) {
    throw new Error(`Cycle time should be setup + run: ${result.totals.totalCycleTime_min} vs ${expected}`);
  }
});

Deno.test("plm_cycle_time - batch size affects per-unit time", () => {
  const flat = makeDroneFlat();

  const single = getHandler("plm_cycle_time")({
    bom_flat: flat,
    batch_size: 1,
  }) as CycleTimeAnalysis;

  const batch = getHandler("plm_cycle_time")({
    bom_flat: flat,
    batch_size: 100,
  }) as CycleTimeAnalysis;

  // Per-unit time should be lower with larger batch (setup amortized)
  if (batch.totals.cycleTimePerUnit_min >= single.totals.cycleTimePerUnit_min) {
    throw new Error("Larger batch should have lower per-unit cycle time");
  }

  // F9 fix: only setup is amortized, NOT run time
  // cyclePerUnit = setup/batchSize + totalRun
  const expectedPerUnit = Math.round(
    (single.totals.totalSetupTime_min / 100 + single.totals.totalRunTime_min) * 10,
  ) / 10;
  assertEquals(batch.totals.cycleTimePerUnit_min, expectedPerUnit);
});

Deno.test("plm_cycle_time - base_time_override_min overrides heuristic", () => {
  const flat = makeDroneFlat();

  const defaultResult = getHandler("plm_cycle_time")({ bom_flat: flat }) as CycleTimeAnalysis;

  const overrideResult = getHandler("plm_cycle_time")({
    bom_flat: flat,
    base_time_override_min: 100,
  }) as CycleTimeAnalysis;

  // With a much larger base time, total run time should be much larger
  if (overrideResult.totals.totalRunTime_min <= defaultResult.totals.totalRunTime_min) {
    throw new Error("Override with larger base time should produce longer run time");
  }
});

Deno.test("plm_cycle_time - hours conversion is correct", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_cycle_time")({ bom_flat: flat }) as CycleTimeAnalysis;

  const expectedHours = Math.round(result.totals.totalCycleTime_min / 60 * 10) / 10;
  assertEquals(result.totals.totalCycleTime_hours, expectedHours);
});
