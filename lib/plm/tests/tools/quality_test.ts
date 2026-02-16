/**
 * Tests for Quality tools (Inspection Plan, FAIR, Control Plan)
 *
 * Uses BomFlat fixtures — no SysON dependency.
 */

import { assertEquals } from "@std/assert";
import { qualityTools } from "../../src/tools/quality.ts";
import type { BomFlat } from "../../src/data/bom-types.ts";
import type {
  ControlPlan,
  FairReport,
  InspectionPlan,
} from "../../src/data/quality-types.ts";

function getHandler(name: string) {
  const tool = qualityTools.find((t) => t.name === name);
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
      { partNumber: "PRT-004", name: "ESC Module", totalQuantity: 4, unit: "pcs", materialId: "pcb-fr4", totalMass_kg: 0.08, totalCost: 0.8, usedIn: ["Electronics"] },
      { partNumber: "PRT-005", name: "M3 Screws", totalQuantity: 24, unit: "pcs", usedIn: ["Structure"] }, // No material
    ],
    metadata: {
      productName: "Drone X-400",
      revision: "A",
      generatedAt: "2026-02-16T10:00:00Z",
      uniquePartsCount: 5,
      totalItemsCount: 38,
    },
    totals: { totalMass_kg: 1.30, totalCost: 16.77, uniqueParts: 5, totalItems: 38 },
  };
}

// ============================================================================
// Tool registration tests
// ============================================================================

Deno.test("qualityTools - exports 3 tools", () => {
  assertEquals(qualityTools.length, 3);
});

Deno.test("qualityTools - all have category 'quality'", () => {
  for (const tool of qualityTools) {
    assertEquals(tool.category, "quality");
  }
});

Deno.test("qualityTools - correct names", () => {
  const names = qualityTools.map((t) => t.name);
  assertEquals(names, [
    "plm_inspection_plan",
    "plm_fair_generate",
    "plm_control_plan",
  ]);
});

// ============================================================================
// plm_inspection_plan tests
// ============================================================================

Deno.test("plm_inspection_plan - generates characteristics from BOM", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;

  assertEquals(result.productName, "Drone X-400");
  assertEquals(result.bomRevision, "A");
  if (result.characteristics.length === 0) {
    throw new Error("Should produce at least one characteristic");
  }
  assertEquals(result.id.startsWith("IP-"), true);
});

Deno.test("plm_inspection_plan - skips parts without material", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;

  // M3 Screws (PRT-005) has no material → should be skipped
  const screwChars = result.characteristics.filter((c) => c.partNumber === "PRT-005");
  for (const c of screwChars) {
    assertEquals(c.level, "skip", "Parts without material should be 'skip' level");
  }
});

Deno.test("plm_inspection_plan - material cert verification for parts with materials", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;

  // Parts with materials should have material cert verification
  const certChars = result.characteristics.filter(
    (c) => c.characteristicName === "Material certificate verification",
  );
  if (certChars.length === 0) {
    throw new Error("Should have material cert verification characteristics");
  }
});

Deno.test("plm_inspection_plan - respects explicit CTQ parts", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_inspection_plan")({
    bom_flat: flat,
    ctq_part_numbers: ["PRT-002"],
  }) as InspectionPlan;

  const frameChars = result.characteristics.filter((c) => c.partNumber === "PRT-002");
  const hasCTQ = frameChars.some((c) => c.ctq);
  assertEquals(hasCTQ, true, "PRT-002 should be marked as CTQ");
});

Deno.test("plm_inspection_plan - summary counts are consistent", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;

  const total = result.summary.fullInspection + result.summary.samplingInspection + result.summary.skipped;
  assertEquals(total, result.summary.totalCharacteristics);
});

Deno.test("plm_inspection_plan - custom CTQ thresholds override defaults", () => {
  const flat = makeDroneFlat();

  // With very high thresholds, nothing should be auto-detected as CTQ
  const noCtq = getHandler("plm_inspection_plan")({
    bom_flat: flat,
    ctq_cost_threshold: 999999,
    ctq_machining_threshold: 999,
  }) as InspectionPlan;

  assertEquals(noCtq.summary.ctqCount, 0, "No parts should be CTQ with very high thresholds");

  // With very low thresholds, most parts should be CTQ
  const allCtq = getHandler("plm_inspection_plan")({
    bom_flat: flat,
    ctq_cost_threshold: 0,
    ctq_machining_threshold: 0,
  }) as InspectionPlan;

  if (allCtq.summary.ctqCount <= noCtq.summary.ctqCount) {
    throw new Error("Low thresholds should detect more CTQ parts than high thresholds");
  }
});

Deno.test("plm_inspection_plan - accepts standard parameter", () => {
  const flat = makeDroneFlat();
  const result = getHandler("plm_inspection_plan")({
    bom_flat: flat,
    standard: "AS9102",
  }) as InspectionPlan;

  assertEquals(result.standard, "AS9102");
});

// ============================================================================
// plm_fair_generate tests
// ============================================================================

Deno.test("plm_fair_generate - creates FAIR from inspection plan", () => {
  const flat = makeDroneFlat();
  const plan = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;
  const result = getHandler("plm_fair_generate")({
    inspection_plan: plan,
    serial_number: "FA-42",
  }) as FairReport;

  assertEquals(result.serialNumber, "FA-42");
  assertEquals(result.inspectionPlanId, plan.id);
  assertEquals(result.verdict, "pending");
  assertEquals(result.id.startsWith("FAIR-"), true);
});

Deno.test("plm_fair_generate - all measurements start as pending", () => {
  const flat = makeDroneFlat();
  const plan = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;
  const result = getHandler("plm_fair_generate")({ inspection_plan: plan }) as FairReport;

  for (const m of result.measurements) {
    assertEquals(m.status, "pending");
  }
  assertEquals(result.summary.pending, result.summary.total);
  assertEquals(result.summary.pass, 0);
  assertEquals(result.summary.fail, 0);
});

Deno.test("plm_fair_generate - excludes skipped characteristics", () => {
  const flat = makeDroneFlat();
  const plan = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;
  const result = getHandler("plm_fair_generate")({ inspection_plan: plan }) as FairReport;

  const activeChars = plan.characteristics.filter((c) => c.level !== "skip");
  assertEquals(result.measurements.length, activeChars.length);
});

// ============================================================================
// plm_control_plan tests
// ============================================================================

Deno.test("plm_control_plan - generates entries from inspection plan", () => {
  const flat = makeDroneFlat();
  const plan = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;
  const result = getHandler("plm_control_plan")({ inspection_plan: plan }) as ControlPlan;

  assertEquals(result.productName, "Drone X-400");
  if (result.entries.length === 0) {
    throw new Error("Should produce at least one control entry");
  }
  assertEquals(result.id.startsWith("CP-"), true);
});

Deno.test("plm_control_plan - entries have required fields", () => {
  const flat = makeDroneFlat();
  const plan = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;
  const result = getHandler("plm_control_plan")({ inspection_plan: plan }) as ControlPlan;

  for (const entry of result.entries) {
    if (!entry.id || !entry.operationNumber || !entry.processDescription) {
      throw new Error(`Entry ${entry.id} missing required fields`);
    }
    if (!entry.frequency || !entry.controlMethod || !entry.reactionPlan) {
      throw new Error(`Entry ${entry.id} missing control fields`);
    }
  }
});

Deno.test("plm_control_plan - production volume affects frequency", () => {
  const flat = makeDroneFlat();
  const plan = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;

  const proto = getHandler("plm_control_plan")({
    inspection_plan: plan,
    production_volume: "prototype",
  }) as ControlPlan;

  const highVol = getHandler("plm_control_plan")({
    inspection_plan: plan,
    production_volume: "high_volume",
  }) as ControlPlan;

  // Prototype should have "every part" for most entries
  const protoEveryPart = proto.entries.filter((e) => e.frequency === "every part").length;
  const highVolEveryPart = highVol.entries.filter((e) => e.frequency === "every part").length;

  // High volume should have fewer "every part" entries
  if (highVolEveryPart >= protoEveryPart && protoEveryPart > 0) {
    throw new Error("High volume should have fewer 'every part' entries than prototype");
  }
});

Deno.test("plm_control_plan - summary counts are correct", () => {
  const flat = makeDroneFlat();
  const plan = getHandler("plm_inspection_plan")({ bom_flat: flat }) as InspectionPlan;
  const result = getHandler("plm_control_plan")({ inspection_plan: plan }) as ControlPlan;

  assertEquals(result.summary.totalEntries, result.entries.length);

  const uniqueParts = new Set(result.entries.map((e) => e.partNumber)).size;
  assertEquals(result.summary.uniqueParts, uniqueParts);

  const stopCount = result.entries.filter((e) => e.reactionPlan === "stop_production").length;
  assertEquals(result.summary.stopProductionCount, stopCount);
});
