/**
 * Tests for BOM tools (flatten, cost, compare)
 *
 * These tests use pure data — no SysON mocking needed.
 * plm_bom_generate is tested separately since it requires SysON GraphQL.
 */

import { assertEquals } from "@std/assert";
import { bomTools } from "../../src/tools/bom.ts";
import type {
  BomDiff,
  BomFlat,
  BomTree,
  BomTreeNode,
  CostResult,
} from "../../src/data/bom-types.ts";

function getHandler(name: string) {
  const tool = bomTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

// ============================================================================
// Test fixtures
// ============================================================================

/** A simple BOM tree: Drone assembly with 2 sub-assemblies */
function makeDroneTree(): BomTree {
  const motor: BomTreeNode = {
    item: {
      id: "BOM-003",
      partNumber: "PRT-003",
      name: "Brushless Motor",
      quantity: 4,
      unit: "pcs",
      material: { materialId: "cu-etp", mass_kg: 0.15 },
      level: 2,
      type: "part",
    },
    children: [],
  };

  const propeller: BomTreeNode = {
    item: {
      id: "BOM-004",
      partNumber: "PRT-004",
      name: "Carbon Propeller",
      quantity: 4,
      unit: "pcs",
      material: { materialId: "cfrp-woven", mass_kg: 0.03 },
      level: 2,
      type: "part",
    },
    children: [],
  };

  const esc: BomTreeNode = {
    item: {
      id: "BOM-005",
      partNumber: "PRT-005",
      name: "ESC Module",
      quantity: 4,
      unit: "pcs",
      material: { materialId: "pcb-fr4", mass_kg: 0.02 },
      level: 2,
      type: "part",
    },
    children: [],
  };

  const propulsionAsm: BomTreeNode = {
    item: {
      id: "BOM-002",
      partNumber: "ASM-002",
      name: "Propulsion Assembly",
      quantity: 1,
      unit: "pcs",
      level: 1,
      type: "assembly",
    },
    children: [motor, propeller, esc],
  };

  const frame: BomTreeNode = {
    item: {
      id: "BOM-006",
      partNumber: "PRT-006",
      name: "Frame Plate",
      quantity: 2,
      unit: "pcs",
      material: { materialId: "al6061-t6", mass_kg: 0.25 },
      level: 2,
      type: "part",
    },
    children: [],
  };

  const screws: BomTreeNode = {
    item: {
      id: "BOM-007",
      partNumber: "PRT-007",
      name: "M3 Screws",
      quantity: 24,
      unit: "pcs",
      material: { materialId: "screw-m3-ss", mass_kg: 0.002 },
      level: 2,
      type: "part",
    },
    children: [],
  };

  const structureAsm: BomTreeNode = {
    item: {
      id: "BOM-008",
      partNumber: "ASM-008",
      name: "Structure Assembly",
      quantity: 1,
      unit: "pcs",
      level: 1,
      type: "assembly",
    },
    children: [frame, screws],
  };

  const root: BomTreeNode = {
    item: {
      id: "BOM-001",
      partNumber: "ASM-001",
      name: "Drone X-400",
      quantity: 1,
      unit: "pcs",
      level: 0,
      type: "assembly",
    },
    children: [propulsionAsm, structureAsm],
  };

  return {
    root,
    metadata: {
      productName: "Drone X-400",
      revision: "A",
      generatedAt: "2026-02-16T10:00:00Z",
      uniquePartsCount: 8,
      totalItemsCount: 40,
    },
  };
}

// ============================================================================
// Tool registration tests
// ============================================================================

Deno.test("bomTools - exports 4 tools", () => {
  assertEquals(bomTools.length, 4);
});

Deno.test("bomTools - all have category 'bom'", () => {
  for (const tool of bomTools) {
    assertEquals(tool.category, "bom");
  }
});

Deno.test("bomTools - all have _meta.ui", () => {
  for (const tool of bomTools) {
    if (!tool._meta?.ui) {
      throw new Error(`Tool ${tool.name} missing _meta.ui`);
    }
  }
});

Deno.test("bomTools - correct names", () => {
  const names = bomTools.map((t) => t.name);
  assertEquals(names, [
    "plm_bom_generate",
    "plm_bom_flatten",
    "plm_bom_cost",
    "plm_bom_compare",
  ]);
});

// ============================================================================
// plm_bom_flatten tests
// ============================================================================

Deno.test("plm_bom_flatten - produces correct flat rows", () => {
  const tree = makeDroneTree();
  const result = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;

  // Should have all unique part numbers
  const partNumbers = result.rows.map((r) => r.partNumber);
  assertEquals(partNumbers.includes("PRT-003"), true, "Should include motor");
  assertEquals(partNumbers.includes("PRT-004"), true, "Should include propeller");
  assertEquals(partNumbers.includes("PRT-006"), true, "Should include frame");
  assertEquals(partNumbers.includes("PRT-007"), true, "Should include screws");
});

Deno.test("plm_bom_flatten - aggregates quantities correctly", () => {
  const tree = makeDroneTree();
  const result = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;

  const motor = result.rows.find((r) => r.partNumber === "PRT-003");
  assertEquals(motor?.totalQuantity, 4, "Motor quantity should be 4");

  const screws = result.rows.find((r) => r.partNumber === "PRT-007");
  assertEquals(screws?.totalQuantity, 24, "Screw quantity should be 24");
});

Deno.test("plm_bom_flatten - computes total mass", () => {
  const tree = makeDroneTree();
  const result = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;

  // Motor: 4 × 0.15 = 0.6 kg
  const motor = result.rows.find((r) => r.partNumber === "PRT-003");
  assertEquals(motor?.totalMass_kg, 0.6);

  // Frame: 2 × 0.25 = 0.5 kg
  const frame = result.rows.find((r) => r.partNumber === "PRT-006");
  assertEquals(frame?.totalMass_kg, 0.5);

  // Totals should be sum of all
  if (result.totals.totalMass_kg <= 0) {
    throw new Error("Total mass should be positive");
  }
});

Deno.test("plm_bom_flatten - tracks usedIn parent assemblies", () => {
  const tree = makeDroneTree();
  const result = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;

  const motor = result.rows.find((r) => r.partNumber === "PRT-003");
  assertEquals(motor?.usedIn, ["Propulsion Assembly"]);

  const frame = result.rows.find((r) => r.partNumber === "PRT-006");
  assertEquals(frame?.usedIn, ["Structure Assembly"]);
});

Deno.test("plm_bom_flatten - sort by totalQuantity", () => {
  const tree = makeDroneTree();
  const result = getHandler("plm_bom_flatten")({
    bom_tree: tree,
    sort_by: "totalQuantity",
  }) as BomFlat;

  // First row should have highest quantity (screws = 24)
  assertEquals(result.rows[0].partNumber, "PRT-007");
});

// ============================================================================
// plm_bom_cost tests
// ============================================================================

Deno.test("plm_bom_cost - raw_material model", () => {
  const tree = makeDroneTree();
  const flat = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;
  const result = getHandler("plm_bom_cost")({
    bom_flat: flat,
    costing_model: "raw_material",
  }) as CostResult;

  assertEquals(result.model, "raw_material");
  assertEquals(result.currency, "EUR");
  assertEquals(result.totals.machiningCost, 0, "raw_material should have zero machining");
  assertEquals(result.totals.overheadCost, 0, "raw_material should have zero overhead");

  if (result.totals.totalCost <= 0) {
    throw new Error("Total cost should be positive");
  }
  if (result.totals.materialCost !== result.totals.totalCost) {
    throw new Error("raw_material: total should equal material cost");
  }
});

Deno.test("plm_bom_cost - should_cost model adds machining and overhead", () => {
  const tree = makeDroneTree();
  const flat = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;
  const result = getHandler("plm_bom_cost")({
    bom_flat: flat,
    costing_model: "should_cost",
    overhead_multiplier: 1.15,
  }) as CostResult;

  assertEquals(result.model, "should_cost");

  if (result.totals.machiningCost <= 0) {
    throw new Error("should_cost machining cost should be positive");
  }
  if (result.totals.overheadCost <= 0) {
    throw new Error("should_cost overhead should be positive");
  }
  if (result.totals.totalCost <= result.totals.materialCost) {
    throw new Error("should_cost total should exceed raw material cost");
  }
});

Deno.test("plm_bom_cost - parametric model with batch size", () => {
  const tree = makeDroneTree();
  const flat = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;

  const small = getHandler("plm_bom_cost")({
    bom_flat: flat,
    costing_model: "parametric",
    batch_size: 10,
  }) as CostResult;

  const large = getHandler("plm_bom_cost")({
    bom_flat: flat,
    costing_model: "parametric",
    batch_size: 10000,
  }) as CostResult;

  // Larger batch should have lower per-unit machining due to batch factor
  if (large.totals.totalCost >= small.totals.totalCost) {
    throw new Error("Larger batch should reduce cost through scaling");
  }
});

Deno.test("plm_bom_cost - distribution percentages sum to ~100", () => {
  const tree = makeDroneTree();
  const flat = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;
  const result = getHandler("plm_bom_cost")({
    bom_flat: flat,
    costing_model: "should_cost",
  }) as CostResult;

  const sum = result.distribution.material_pct +
    result.distribution.machining_pct +
    result.distribution.overhead_pct;

  // Allow small rounding tolerance
  if (Math.abs(sum - 100) > 1) {
    throw new Error(`Distribution sum ${sum}% should be ~100%`);
  }
});

Deno.test("plm_bom_cost - per-part breakdown has all parts", () => {
  const tree = makeDroneTree();
  const flat = getHandler("plm_bom_flatten")({ bom_tree: tree }) as BomFlat;
  const result = getHandler("plm_bom_cost")({
    bom_flat: flat,
    costing_model: "should_cost",
  }) as CostResult;

  assertEquals(result.parts.length, flat.rows.length);
});

// ============================================================================
// plm_bom_compare tests
// ============================================================================

function makeBaseFlat(): BomFlat {
  return {
    rows: [
      { partNumber: "PRT-001", name: "Motor", totalQuantity: 4, unit: "pcs", materialId: "cu-etp", totalMass_kg: 0.6, totalCost: 5.1, usedIn: ["Propulsion"] },
      { partNumber: "PRT-002", name: "Frame", totalQuantity: 2, unit: "pcs", materialId: "al6061-t6", totalMass_kg: 0.5, totalCost: 1.75, usedIn: ["Structure"] },
      { partNumber: "PRT-003", name: "PCB", totalQuantity: 1, unit: "pcs", materialId: "pcb-fr4", totalMass_kg: 0.02, totalCost: 10.0, usedIn: ["Electronics"] },
    ],
    metadata: {
      productName: "Drone",
      revision: "A",
      generatedAt: "2026-01-01T00:00:00Z",
      uniquePartsCount: 3,
      totalItemsCount: 7,
    },
    totals: { totalMass_kg: 1.12, totalCost: 16.85, uniqueParts: 3, totalItems: 7 },
  };
}

Deno.test("plm_bom_compare - identical BOMs produce no changes", () => {
  const flat = makeBaseFlat();
  const result = getHandler("plm_bom_compare")({
    baseline: flat,
    comparison: flat,
  }) as BomDiff;

  assertEquals(result.changes.length, 0);
  assertEquals(result.summary.totalChanges, 0);
  assertEquals(result.impact.massDelta_kg, 0);
  assertEquals(result.impact.costDelta, 0);
});

Deno.test("plm_bom_compare - detects added part", () => {
  const baseline = makeBaseFlat();
  const comparison = makeBaseFlat();
  comparison.rows.push({
    partNumber: "PRT-NEW",
    name: "GPS Module",
    totalQuantity: 1,
    unit: "pcs",
    materialId: "sensor-generic",
    totalMass_kg: 0.05,
    totalCost: 15.0,
    usedIn: ["Electronics"],
  });
  comparison.totals.totalMass_kg += 0.05;
  comparison.totals.totalCost += 15.0;

  const result = getHandler("plm_bom_compare")({
    baseline,
    comparison,
  }) as BomDiff;

  assertEquals(result.summary.added, 1);
  const addedChange = result.changes.find((c) => c.changeType === "added");
  assertEquals(addedChange?.partNumber, "PRT-NEW");
  assertEquals(addedChange?.name, "GPS Module");
});

Deno.test("plm_bom_compare - detects removed part", () => {
  const baseline = makeBaseFlat();
  const comparison = makeBaseFlat();
  comparison.rows = comparison.rows.filter((r) => r.partNumber !== "PRT-003");
  comparison.totals.totalMass_kg -= 0.02;
  comparison.totals.totalCost -= 10.0;

  const result = getHandler("plm_bom_compare")({
    baseline,
    comparison,
  }) as BomDiff;

  assertEquals(result.summary.removed, 1);
  const removedChange = result.changes.find((c) => c.changeType === "removed");
  assertEquals(removedChange?.partNumber, "PRT-003");
  assertEquals(removedChange?.severity, "critical");
});

Deno.test("plm_bom_compare - detects quantity change", () => {
  const baseline = makeBaseFlat();
  const comparison = makeBaseFlat();
  comparison.rows[0].totalQuantity = 6; // Motor 4 → 6

  const result = getHandler("plm_bom_compare")({
    baseline,
    comparison,
  }) as BomDiff;

  const qtyChange = result.changes.find((c) => c.changeType === "quantity_changed");
  assertEquals(qtyChange?.partNumber, "PRT-001");
  assertEquals(qtyChange?.baselineValue, 4);
  assertEquals(qtyChange?.comparisonValue, 6);
});

Deno.test("plm_bom_compare - detects material change as critical", () => {
  const baseline = makeBaseFlat();
  const comparison = makeBaseFlat();
  comparison.rows[1].materialId = "al7075-t6"; // Frame: 6061 → 7075

  const result = getHandler("plm_bom_compare")({
    baseline,
    comparison,
  }) as BomDiff;

  const matChange = result.changes.find((c) => c.changeType === "material_changed");
  assertEquals(matChange?.partNumber, "PRT-002");
  assertEquals(matChange?.severity, "critical");
  assertEquals(matChange?.baselineValue, "al6061-t6");
  assertEquals(matChange?.comparisonValue, "al7075-t6");
});

Deno.test("plm_bom_compare - cost delta in impact", () => {
  const baseline = makeBaseFlat();
  const comparison = makeBaseFlat();
  comparison.rows[0].totalCost = 8.0; // Motor cost 5.1 → 8.0
  comparison.totals.totalCost += 2.9;

  const result = getHandler("plm_bom_compare")({
    baseline,
    comparison,
  }) as BomDiff;

  assertEquals(result.impact.costDelta, 2.9);
});

Deno.test("plm_bom_compare - revisions are preserved", () => {
  const baseline = makeBaseFlat();
  baseline.metadata.revision = "Rev.1";
  const comparison = makeBaseFlat();
  comparison.metadata.revision = "Rev.2";

  const result = getHandler("plm_bom_compare")({
    baseline,
    comparison,
  }) as BomDiff;

  assertEquals(result.baselineRevision, "Rev.1");
  assertEquals(result.comparisonRevision, "Rev.2");
});
