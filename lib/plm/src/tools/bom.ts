/**
 * BOM Tools — Generate, Cost, Flatten, Compare
 *
 * Operates on SysON SysML v2 models to extract hierarchical Bills of Materials,
 * compute costs using real material prices, flatten for procurement, and diff revisions.
 *
 * @module lib/plm/tools/bom
 */

import type { PlmTool } from "./types.ts";
import type {
  BomDiff,
  BomDiffEntry,
  BomDiffSeverity,
  BomFlat,
  BomFlatRow,
  BomItem,
  BomMetadata,
  BomTree,
  BomTreeNode,
  CostingModel,
  CostingModelType,
  CostResult,
  PartCostBreakdown,
} from "../data/bom-types.ts";
import { getMaterialPrice, lookupMaterialByName } from "../data/material-prices.ts";

// ============================================================================
// SysON GraphQL integration (self-contained — avoids tight coupling to lib/syson internals)
// ============================================================================

const EVALUATE_EXPRESSION = `
  mutation EvaluateExpression($input: EvaluateExpressionInput!) {
    evaluateExpression(input: $input) {
      ... on EvaluateExpressionSuccessPayload {
        __typename
        result {
          ... on ObjectExpressionResult { __typename objValue: value { id kind label } }
          ... on ObjectsExpressionResult { __typename objsValue: value { id kind label } }
          ... on StringExpressionResult { __typename strValue: value }
          ... on BooleanExpressionResult { __typename boolValue: value }
          ... on IntExpressionResult { __typename intValue: value }
          ... on VoidExpressionResult { __typename }
        }
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

interface GqlObj {
  id: string;
  kind: string;
  label: string;
}

interface EvalExprResult {
  evaluateExpression:
    | { __typename: "EvaluateExpressionSuccessPayload"; result: ExprResult }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

type ExprResult =
  | { __typename: "ObjectExpressionResult"; objValue: GqlObj }
  | { __typename: "ObjectsExpressionResult"; objsValue: GqlObj[] }
  | { __typename: "StringExpressionResult"; strValue: string }
  | { __typename: "IntExpressionResult"; intValue: number }
  | { __typename: "BooleanExpressionResult"; boolValue: boolean }
  | { __typename: "VoidExpressionResult" };

/**
 * Lazy import of getSysonClient — avoids hard dependency at module load time.
 * SysON may not be configured if the user only wants offline BOM operations.
 */
async function getSysonClientLazy() {
  const mod = await import("@casys/mcp-syson");
  return mod.getSysonClient();
}

/** Evaluate an AQL expression against a SysON element */
async function evalAql(
  ecId: string,
  elementId: string,
  expression: string,
): Promise<ExprResult> {
  const client = await getSysonClientLazy();
  const data = await client.mutate<EvalExprResult>(EVALUATE_EXPRESSION, {
    input: {
      id: crypto.randomUUID(),
      editingContextId: ecId,
      expression,
      selectedObjectIds: [elementId],
    },
  });

  const result = data.evaluateExpression;
  if (result.__typename === "ErrorPayload") {
    throw new Error(`[lib/plm] AQL evaluation failed: ${result.message}`);
  }
  return result.result;
}

/** Get children of a SysON element via ownedElement AQL */
async function getChildren(ecId: string, elementId: string): Promise<GqlObj[]> {
  const result = await evalAql(ecId, elementId, "aql:self.ownedElement");
  if (result.__typename === "ObjectsExpressionResult") {
    return result.objsValue;
  }
  if (result.__typename === "ObjectExpressionResult") {
    return [result.objValue];
  }
  return [];
}

/** Get an int/float property from a SysON element */
async function getNumProp(ecId: string, elementId: string, prop: string): Promise<number | null> {
  try {
    const result = await evalAql(ecId, elementId, `aql:self.${prop}`);
    if (result.__typename === "IntExpressionResult") {
      return result.intValue;
    }
    if (result.__typename === "StringExpressionResult") {
      const n = parseFloat(result.strValue);
      return isNaN(n) ? null : n;
    }
  } catch { /* property may not exist */ }
  return null;
}

// ============================================================================
// BOM hierarchy traversal
// ============================================================================

/** Counter for BOM item IDs */
let bomItemCounter = 0;

/**
 * Read a named SysML v2 attribute value from an element via AQL.
 *
 * SysML v2: `attribute material = "al6061-t6";` creates an AttributeUsage child
 * with a LiteralString/LiteralRational child holding the value.
 *
 * AQL path: self.ownedElement→select(AttributeUsage named X)→first child→value
 */
async function readAttributeValue(
  ecId: string,
  elementId: string,
  attrName: string,
): Promise<string | null> {
  try {
    // Single AQL call: navigate part → AttributeUsage(name) → Literal → value
    const result = await evalAql(
      ecId,
      elementId,
      `aql:self.ownedElement->select(e | e.oclIsKindOf(sysml::AttributeUsage) and e.declaredName = '${attrName}')->first().ownedElement->first().value.toString()`,
    );
    if (result.__typename === "StringExpressionResult" && result.strValue) {
      return result.strValue;
    }
  } catch { /* attribute may not exist on this element */ }
  return null;
}

/**
 * Extract material and mass attributes from a SysON element.
 * Uses AQL to read SysML v2 native attribute values (2 calls per element).
 */
async function extractPartAttributes(
  ecId: string,
  elementId: string,
): Promise<{ materialId?: string; mass_kg?: number }> {
  let materialId: string | undefined;
  let mass_kg: number | undefined;

  // Read material attribute — try exact ID first, then fuzzy name match
  const materialValue = await readAttributeValue(ecId, elementId, "material");
  if (materialValue) {
    const exact = getMaterialPrice(materialValue);
    if (exact) {
      materialId = exact.id;
    } else {
      const lookup = lookupMaterialByName(materialValue);
      if (lookup.length > 0) materialId = lookup[0].id;
    }
  }

  // Read mass attribute (try mass_kg first, then mass)
  const massValue = await readAttributeValue(ecId, elementId, "mass_kg")
    ?? await readAttributeValue(ecId, elementId, "mass");
  if (massValue) {
    const n = parseFloat(massValue);
    if (!isNaN(n)) mass_kg = n;
  }

  return { materialId, mass_kg };
}

/**
 * Recursively traverse a SysON model tree and build a BomTreeNode.
 * - Elements with structural children → assembly
 * - Elements without structural children → part
 * - Quantity from SysML 'multiplicity' attribute (default 1)
 * - Material/mass from SysML v2 `attribute material`/`attribute mass_kg`
 */
async function traverseHierarchy(
  ecId: string,
  element: GqlObj,
  level: number,
  _parentQuantity: number,
): Promise<BomTreeNode> {
  bomItemCounter++;
  const itemId = `BOM-${String(bomItemCounter).padStart(4, "0")}`;

  // Extract properties from SysON model
  const children = await getChildren(ecId, element.id);
  const quantity = (await getNumProp(ecId, element.id, "multiplicity")) ?? 1;

  // Extract material/mass from SysML v2 attributes (via AQL on element)
  // No heuristic fallback — the model is the single source of truth
  const { materialId, mass_kg } = await extractPartAttributes(ecId, element.id);

  const material = materialId ? getMaterialPrice(materialId) : undefined;

  // Separate structural children from attributes/metadata
  const structuralChildren: GqlObj[] = [];
  for (const child of children) {
    const kind = child.kind || "";
    if (
      kind.includes("AttributeUsage") ||
      kind.includes("Requirement") ||
      kind.includes("Constraint") ||
      kind.includes("Comment")
    ) {
      continue;
    }
    structuralChildren.push(child);
  }

  const isAssembly = structuralChildren.length > 0;

  const item: BomItem = {
    id: itemId,
    partNumber: `${isAssembly ? "ASM" : "PRT"}-${String(bomItemCounter).padStart(3, "0")}`,
    name: element.label || "Unnamed",
    quantity,
    unit: "pcs",
    level,
    type: isAssembly ? "assembly" : "part",
    sysonElementId: element.id,
    ...(material && mass_kg != null && {
      material: {
        materialId: material.id,
        mass_kg,
      },
    }),
  };

  // Recurse into structural children only
  const childNodes: BomTreeNode[] = [];
  for (const child of structuralChildren) {
    childNodes.push(await traverseHierarchy(ecId, child, level + 1, quantity));
  }

  return { item, children: childNodes };
}

/** Count all items in a tree */
function countItems(node: BomTreeNode): { unique: number; total: number } {
  let unique = 1;
  let total = node.item.quantity;
  for (const child of node.children) {
    const sub = countItems(child);
    unique += sub.unique;
    total += sub.total;
  }
  return { unique, total };
}

// ============================================================================
// Flatten logic
// ============================================================================

/** Flatten a BomTreeNode hierarchy into aggregated rows */
function flattenNode(
  node: BomTreeNode,
  parentQuantity: number,
  parentName: string | null,
  rows: Map<string, BomFlatRow>,
): void {
  const effectiveQty = node.item.quantity * parentQuantity;

  const existing = rows.get(node.item.partNumber);
  if (existing) {
    existing.totalQuantity += effectiveQty;
    if (parentName && !existing.usedIn.includes(parentName)) {
      existing.usedIn.push(parentName);
    }
  } else {
    const mat = node.item.material;
    const matPrice = mat ? getMaterialPrice(mat.materialId) : undefined;

    rows.set(node.item.partNumber, {
      partNumber: node.item.partNumber,
      name: node.item.name,
      totalQuantity: effectiveQty,
      unit: node.item.unit,
      materialId: mat?.materialId,
      totalMass_kg: mat ? round2(mat.mass_kg * effectiveQty) : undefined,
      totalCost: matPrice ? round2(matPrice.price_per_kg * (mat?.mass_kg ?? 0) * effectiveQty) : undefined,
      usedIn: parentName ? [parentName] : [],
    });
  }

  for (const child of node.children) {
    flattenNode(child, effectiveQty, node.item.name, rows);
  }
}

// ============================================================================
// Costing logic
// ============================================================================

/** Apply a costing model to a flat BOM row */
function costPart(row: BomFlatRow, model: CostingModel): PartCostBreakdown {
  const mat = row.materialId ? getMaterialPrice(row.materialId) : undefined;
  const mass = row.totalMass_kg ?? 0;
  const qty = row.totalQuantity;

  let materialCostPerUnit = 0;
  let machiningCostPerUnit = 0;
  let overheadCostPerUnit = 0;
  let warning: string | undefined;

  if (mat) {
    const unitMass = qty > 0 ? mass / qty : 0;
    materialCostPerUnit = unitMass * mat.price_per_kg;

    switch (model.type) {
      case "raw_material":
        // Material cost only
        break;

      case "should_cost":
        // Material + machining + overhead
        machiningCostPerUnit = materialCostPerUnit * (mat.machining_factor - 1);
        overheadCostPerUnit = (materialCostPerUnit + machiningCostPerUnit) *
          ((model.overheadMultiplier ?? 1.15) - 1);
        break;

      case "parametric": {
        // Simplified parametric: scale by machining factor + batch size effect
        const batchFactor = model.batchSize ? Math.max(0.7, 1 - Math.log10(model.batchSize) * 0.1) : 1;
        machiningCostPerUnit = materialCostPerUnit * (mat.machining_factor - 1) * batchFactor;
        overheadCostPerUnit = (materialCostPerUnit + machiningCostPerUnit) *
          ((model.overheadMultiplier ?? 1.2) - 1);
        break;
      }
    }
  } else if (row.totalCost != null && qty > 0) {
    // Fallback: use existing unit cost (e.g. for fasteners/electronics priced per unit)
    materialCostPerUnit = row.totalCost / qty;
  } else {
    // No material, no pre-existing cost → explicitly warn
    if (!row.materialId && mass > 0) {
      warning = `No material attribute — cost cannot be calculated. Add 'attribute material = "material-id";' to the SysML model.`;
    } else if (!row.materialId) {
      warning = "No material and no mass — cost is zero.";
    }
  }

  const unitCost = materialCostPerUnit + machiningCostPerUnit + overheadCostPerUnit;

  return {
    partNumber: row.partNumber,
    name: row.name,
    quantity: qty,
    materialCostPerUnit: round2(materialCostPerUnit),
    machiningCostPerUnit: round2(machiningCostPerUnit),
    overheadCostPerUnit: round2(overheadCostPerUnit),
    unitCost: round2(unitCost),
    totalCost: round2(unitCost * qty),
    ...(warning && { warning }),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// Compare logic
// ============================================================================

function compareBoms(baseline: BomFlat, comparison: BomFlat): BomDiff {
  const baseMap = new Map(baseline.rows.map((r) => [r.partNumber, r]));
  const compMap = new Map(comparison.rows.map((r) => [r.partNumber, r]));
  const changes: BomDiffEntry[] = [];

  // Parts removed in comparison
  for (const [pn, base] of baseMap) {
    if (!compMap.has(pn)) {
      changes.push({
        partNumber: pn,
        name: base.name,
        changeType: "removed",
        severity: "critical",
        baselineValue: base.totalQuantity,
        description: `Part ${pn} (${base.name}) removed — was qty ${base.totalQuantity}`,
      });
    }
  }

  // Parts added in comparison
  for (const [pn, comp] of compMap) {
    if (!baseMap.has(pn)) {
      changes.push({
        partNumber: pn,
        name: comp.name,
        changeType: "added",
        severity: "warning",
        comparisonValue: comp.totalQuantity,
        description: `Part ${pn} (${comp.name}) added — qty ${comp.totalQuantity}`,
      });
    }
  }

  // Parts in both — check for changes
  for (const [pn, base] of baseMap) {
    const comp = compMap.get(pn);
    if (!comp) continue;

    if (base.totalQuantity !== comp.totalQuantity) {
      const delta = comp.totalQuantity - base.totalQuantity;
      const severity: BomDiffSeverity = Math.abs(delta) / base.totalQuantity > 0.5 ? "warning" : "info";
      changes.push({
        partNumber: pn,
        name: base.name,
        changeType: "quantity_changed",
        severity,
        baselineValue: base.totalQuantity,
        comparisonValue: comp.totalQuantity,
        description: `Quantity changed ${base.totalQuantity} → ${comp.totalQuantity} (${delta > 0 ? "+" : ""}${delta})`,
      });
    }

    if (base.materialId !== comp.materialId) {
      changes.push({
        partNumber: pn,
        name: base.name,
        changeType: "material_changed",
        severity: "critical",
        baselineValue: base.materialId ?? "none",
        comparisonValue: comp.materialId ?? "none",
        description: `Material changed ${base.materialId ?? "none"} → ${comp.materialId ?? "none"}`,
      });
    }

    if (base.totalCost != null && comp.totalCost != null && base.totalCost !== comp.totalCost) {
      const costDelta = comp.totalCost - base.totalCost;
      const pctChange = base.totalCost > 0 ? Math.abs(costDelta) / base.totalCost : 0;
      const severity: BomDiffSeverity = pctChange > 0.2 ? "critical" : pctChange > 0.1 ? "warning" : "info";
      changes.push({
        partNumber: pn,
        name: base.name,
        changeType: "cost_changed",
        severity,
        baselineValue: base.totalCost,
        comparisonValue: comp.totalCost,
        description: `Cost changed €${base.totalCost.toFixed(2)} → €${comp.totalCost.toFixed(2)} (${costDelta > 0 ? "+" : ""}€${costDelta.toFixed(2)})`,
      });
    }
  }

  // Compute impact
  const massDelta = (comparison.totals.totalMass_kg) - (baseline.totals.totalMass_kg);
  const costDelta = (comparison.totals.totalCost) - (baseline.totals.totalCost);
  const maxSeverity: BomDiffSeverity = changes.some((c) => c.severity === "critical")
    ? "critical"
    : changes.some((c) => c.severity === "warning")
    ? "warning"
    : "info";

  const added = changes.filter((c) => c.changeType === "added").length;
  const removed = changes.filter((c) => c.changeType === "removed").length;
  const modified = changes.filter((c) =>
    c.changeType !== "added" && c.changeType !== "removed"
  ).length;

  return {
    baselineRevision: baseline.metadata.revision,
    comparisonRevision: comparison.metadata.revision,
    changes,
    summary: { added, removed, modified, totalChanges: changes.length },
    impact: { massDelta_kg: round2(massDelta), costDelta: round2(costDelta), maxSeverity },
  };
}

// ============================================================================
// Tool definitions
// ============================================================================

export const bomTools: PlmTool[] = [
  // --------------------------------------------------------------------------
  // plm_bom_generate
  // --------------------------------------------------------------------------
  {
    name: "plm_bom_generate",
    description:
      "Generate a hierarchical BOM from a SysON model. " +
      "Step 1 of the BOM pipeline: generate → flatten → cost. " +
      "Returns a BomTree object — pass it to plm_bom_flatten as 'bom_tree'.",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON editing context ID (from syson_project_get).",
        },
        root_element_id: {
          type: "string",
          description: "Root PartUsage/PartDefinition UUID to start BOM extraction from.",
        },
        revision: {
          type: "string",
          description: "Revision label for the BOM (e.g. 'A', 'Rev.2')",
          default: "A",
        },
      },
      required: ["editing_context_id", "root_element_id"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/bom-tree-viewer",
      },
    },
    handler: async (args) => {
      const ecId = args.editing_context_id as string;
      const rootId = args.root_element_id as string;
      const revision = (args.revision as string) || "A";

      // Reset counter for this generation
      bomItemCounter = 0;

      const client = await getSysonClientLazy();

      // Get root element info
      const { GET_OBJECT } = await import("@casys/mcp-syson/src/api/queries.ts") as {
        GET_OBJECT: string;
      };
      const rootData = await client.query<{
        viewer: { editingContext: { object: GqlObj } };
      }>(GET_OBJECT, {
        editingContextId: ecId,
        objectId: rootId,
      });

      const rootElement = rootData.viewer.editingContext.object;

      // Traverse the model tree
      const root = await traverseHierarchy(ecId, rootElement, 0, 1);
      const counts = countItems(root);

      const metadata: BomMetadata = {
        productName: rootElement.label,
        revision,
        generatedAt: new Date().toISOString(),
        sourceModel: ecId,
        uniquePartsCount: counts.unique,
        totalItemsCount: counts.total,
      };

      return { root, metadata } satisfies BomTree;
    },
  },

  // --------------------------------------------------------------------------
  // plm_bom_flatten
  // --------------------------------------------------------------------------
  {
    name: "plm_bom_flatten",
    description:
      "Flatten a hierarchical BOM into an aggregated parts list. " +
      "Step 2 of the BOM pipeline: generate → flatten → cost. " +
      "Takes 'bom_tree' (output of plm_bom_generate). " +
      "Returns a BomFlat object — pass it to plm_bom_cost as 'bom_flat'.",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        bom_tree: {
          type: "object",
          description: "BomTree object from plm_bom_generate",
        },
        sort_by: {
          type: "string",
          enum: ["partNumber", "totalQuantity", "totalCost", "totalMass_kg"],
          description: "Sort field for the output rows",
          default: "partNumber",
        },
      },
      required: ["bom_tree"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/table-viewer",
      },
    },
    handler: (args) => {
      const tree = args.bom_tree as BomTree;
      if (!tree?.root || !tree?.metadata) {
        throw new Error("Invalid bom_tree input: expected BomTree with root and metadata");
      }
      const sortBy = (args.sort_by as string) || "partNumber";

      const rows = new Map<string, BomFlatRow>();
      flattenNode(tree.root, 1, null, rows);

      let sortedRows = Array.from(rows.values());

      // Sort
      sortedRows.sort((a, b) => {
        const av = a[sortBy as keyof BomFlatRow];
        const bv = b[sortBy as keyof BomFlatRow];
        if (typeof av === "number" && typeof bv === "number") return bv - av;
        return String(av ?? "").localeCompare(String(bv ?? ""));
      });

      const totalMass = sortedRows.reduce((s, r) => s + (r.totalMass_kg ?? 0), 0);
      const totalCost = sortedRows.reduce((s, r) => s + (r.totalCost ?? 0), 0);

      const flat: BomFlat = {
        rows: sortedRows,
        metadata: tree.metadata,
        totals: {
          totalMass_kg: round2(totalMass),
          totalCost: round2(totalCost),
          uniqueParts: sortedRows.length,
          totalItems: sortedRows.reduce((s, r) => s + r.totalQuantity, 0),
        },
      };

      return flat;
    },
  },

  // --------------------------------------------------------------------------
  // plm_bom_cost
  // --------------------------------------------------------------------------
  {
    name: "plm_bom_cost",
    description:
      "Compute cost analysis for a flattened BOM. " +
      "Step 3 of the BOM pipeline: generate → flatten → cost. " +
      "Takes 'bom_flat' (output of plm_bom_flatten). " +
      "Each item needs 'material' + 'mass' attributes in the SysML model for non-zero costs. " +
      "Models: raw_material, should_cost (default), parametric.",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        bom_flat: {
          type: "object",
          description: "BomFlat object from plm_bom_flatten",
        },
        costing_model: {
          type: "string",
          enum: ["raw_material", "should_cost", "parametric"],
          description: "Costing model to apply",
          default: "should_cost",
        },
        overhead_multiplier: {
          type: "number",
          description: "Overhead multiplier for should_cost/parametric (e.g. 1.15 = 15% overhead)",
          default: 1.15,
        },
        labor_rate: {
          type: "number",
          description: "Labor rate in EUR/hour (for should_cost model)",
          default: 45,
        },
        batch_size: {
          type: "number",
          description: "Production batch size (affects parametric model scaling)",
          default: 100,
        },
      },
      required: ["bom_flat"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/bom-cost-viewer",
      },
    },
    handler: (args) => {
      const flat = args.bom_flat as BomFlat;
      const modelType = (args.costing_model as CostingModelType) || "should_cost";
      const overheadMultiplier = (args.overhead_multiplier as number) ?? 1.15;
      const laborRate = (args.labor_rate as number) ?? 45;
      const batchSize = (args.batch_size as number) ?? 100;

      const model: CostingModel = {
        type: modelType,
        overheadMultiplier,
        laborRate,
        batchSize,
      };

      const parts: PartCostBreakdown[] = flat.rows.map((row) => costPart(row, model));

      const totalMaterial = parts.reduce((s, p) => s + p.materialCostPerUnit * p.quantity, 0);
      const totalMachining = parts.reduce((s, p) => s + p.machiningCostPerUnit * p.quantity, 0);
      const totalOverhead = parts.reduce((s, p) => s + p.overheadCostPerUnit * p.quantity, 0);
      const totalCost = totalMaterial + totalMachining + totalOverhead;

      const itemsWithoutMaterial = parts.filter((p) => p.warning).length;

      const result: CostResult & { itemsWithoutMaterial?: number; warnings?: string[] } = {
        model: modelType,
        parts,
        totals: {
          materialCost: round2(totalMaterial),
          machiningCost: round2(totalMachining),
          overheadCost: round2(totalOverhead),
          totalCost: round2(totalCost),
        },
        distribution: {
          material_pct: totalCost > 0 ? round2((totalMaterial / totalCost) * 100) : 0,
          machining_pct: totalCost > 0 ? round2((totalMachining / totalCost) * 100) : 0,
          overhead_pct: totalCost > 0 ? round2((totalOverhead / totalCost) * 100) : 0,
        },
        currency: "EUR",
        computedAt: new Date().toISOString(),
      };

      if (itemsWithoutMaterial > 0) {
        result.itemsWithoutMaterial = itemsWithoutMaterial;
        result.warnings = [
          `${itemsWithoutMaterial}/${parts.length} items have no material — their cost is 0€. ` +
          `Add 'attribute material = "material-id";' to each part in the SysML model.`,
        ];
      }

      return result;
    },
  },

  // --------------------------------------------------------------------------
  // plm_bom_compare
  // --------------------------------------------------------------------------
  {
    name: "plm_bom_compare",
    description:
      "Compare two flattened BOMs to detect changes between revisions. " +
      "Takes two BomFlat objects (from plm_bom_flatten) as 'baseline' and 'comparison'. " +
      "Returns added/removed parts, quantity and material changes, cost impact with severity.",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        baseline: {
          type: "object",
          description: "Baseline BomFlat (the reference/older revision)",
        },
        comparison: {
          type: "object",
          description: "Comparison BomFlat (the newer revision to compare against baseline)",
        },
      },
      required: ["baseline", "comparison"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/bom-diff-viewer",
      },
    },
    handler: (args) => {
      const baseline = args.baseline as BomFlat;
      const comparison = args.comparison as BomFlat;

      return compareBoms(baseline, comparison);
    },
  },
];
