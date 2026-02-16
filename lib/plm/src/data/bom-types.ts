/**
 * BOM (Bill of Materials) types for PLM tools
 *
 * Covers hierarchical BOM structures, flattening, costing, and diff/compare.
 *
 * @module lib/plm/data/bom-types
 */

// ============================================================================
// Material assignment
// ============================================================================

/** Liaison between a part and its material from the material database */
export interface MaterialAssignment {
  /** Material ID from material-prices database (e.g. "al6061-t6") */
  materialId: string;
  /** Mass in kilograms */
  mass_kg: number;
  /** Optional manufacturing process override (e.g. "cast", "machined", "3d-printed") */
  process?: string;
}

// ============================================================================
// BOM items and hierarchy
// ============================================================================

/** A single line in a Bill of Materials */
export interface BomItem {
  /** Unique identifier within this BOM */
  id: string;
  /** Part number (e.g. "ASM-001-A", "PCB-CTRL-03") */
  partNumber: string;
  /** Human-readable name */
  name: string;
  /** Quantity required at this level */
  quantity: number;
  /** Unit of measure */
  unit: "pcs" | "kg" | "m" | "m2" | "L";
  /** Material assignment (undefined for assemblies with no direct material) */
  material?: MaterialAssignment;
  /** Unit cost in EUR (computed or manually set) */
  unitCost?: number;
  /** Reference to SysON element ID if generated from a model */
  sysonElementId?: string;
  /** Level in the hierarchy (0 = root assembly) */
  level: number;
  /** Whether this item is a leaf part or an assembly */
  type: "part" | "assembly";
}

/** Recursive BOM tree node */
export interface BomTreeNode {
  item: BomItem;
  children: BomTreeNode[];
}

/** Complete hierarchical BOM */
export interface BomTree {
  /** Root assembly node */
  root: BomTreeNode;
  /** BOM metadata */
  metadata: BomMetadata;
}

/** BOM metadata */
export interface BomMetadata {
  /** Name of the product/assembly */
  productName: string;
  /** BOM revision or variant label */
  revision: string;
  /** ISO 8601 generation timestamp */
  generatedAt: string;
  /** Source model (e.g. SysON project ID) */
  sourceModel?: string;
  /** Total unique parts count */
  uniquePartsCount: number;
  /** Total items count (with quantities) */
  totalItemsCount: number;
}

// ============================================================================
// Flattened BOM
// ============================================================================

/** A row in the flattened BOM view */
export interface BomFlatRow {
  /** Part number */
  partNumber: string;
  /** Part name */
  name: string;
  /** Total quantity across all levels */
  totalQuantity: number;
  /** Unit of measure */
  unit: BomItem["unit"];
  /** Material ID if assigned */
  materialId?: string;
  /** Total mass in kg (quantity * unit mass) */
  totalMass_kg?: number;
  /** Total cost in EUR (quantity * unit cost) */
  totalCost?: number;
  /** List of parent assemblies referencing this part */
  usedIn: string[];
}

/** Complete flattened BOM */
export interface BomFlat {
  rows: BomFlatRow[];
  metadata: BomMetadata;
  /** Totals */
  totals: {
    totalMass_kg: number;
    totalCost: number;
    uniqueParts: number;
    totalItems: number;
  };
}

// ============================================================================
// BOM comparison / diff
// ============================================================================

/** Severity of a BOM change */
export type BomDiffSeverity = "info" | "warning" | "critical";

/** Type of change detected between two BOMs */
export type BomDiffChangeType = "added" | "removed" | "quantity_changed" | "material_changed" | "cost_changed";

/** A single change between two BOMs */
export interface BomDiffEntry {
  /** Part number affected */
  partNumber: string;
  /** Part name */
  name: string;
  /** Type of change */
  changeType: BomDiffChangeType;
  /** Severity assessment */
  severity: BomDiffSeverity;
  /** Value in baseline BOM (undefined if added) */
  baselineValue?: string | number;
  /** Value in comparison BOM (undefined if removed) */
  comparisonValue?: string | number;
  /** Human-readable description of the change */
  description: string;
}

/** Complete diff result between two BOMs */
export interface BomDiff {
  /** Baseline BOM revision */
  baselineRevision: string;
  /** Comparison BOM revision */
  comparisonRevision: string;
  /** All detected changes */
  changes: BomDiffEntry[];
  /** Summary counts */
  summary: {
    added: number;
    removed: number;
    modified: number;
    totalChanges: number;
  };
  /** Impact assessment */
  impact: {
    /** Mass delta in kg (positive = heavier) */
    massDelta_kg: number;
    /** Cost delta in EUR (positive = more expensive) */
    costDelta: number;
    /** Highest severity across all changes */
    maxSeverity: BomDiffSeverity;
  };
}

// ============================================================================
// Costing
// ============================================================================

/** Available costing models */
export type CostingModelType =
  | "raw_material"      // Material cost only: mass * price_per_kg
  | "should_cost"       // Material + machining factor + overhead
  | "parametric";       // Regression-based on part characteristics

/** Costing model configuration */
export interface CostingModel {
  type: CostingModelType;
  /** Overhead multiplier for should_cost (e.g. 1.15 = 15% overhead) */
  overheadMultiplier?: number;
  /** Labor rate in EUR/hour for should_cost */
  laborRate?: number;
  /** Batch size for amortizing setup costs */
  batchSize?: number;
}

/** Cost breakdown for a single part */
export interface PartCostBreakdown {
  partNumber: string;
  name: string;
  quantity: number;
  /** Raw material cost per unit */
  materialCostPerUnit: number;
  /** Machining/processing cost per unit */
  machiningCostPerUnit: number;
  /** Overhead cost per unit */
  overheadCostPerUnit: number;
  /** Total cost per unit */
  unitCost: number;
  /** Total cost (unitCost * quantity) */
  totalCost: number;
}

/** Complete costing result for a BOM */
export interface CostResult {
  /** Costing model used */
  model: CostingModelType;
  /** Per-part breakdown */
  parts: PartCostBreakdown[];
  /** Aggregated totals */
  totals: {
    materialCost: number;
    machiningCost: number;
    overheadCost: number;
    totalCost: number;
  };
  /** Cost distribution by category (percentage) */
  distribution: {
    material_pct: number;
    machining_pct: number;
    overhead_pct: number;
  };
  /** Currency used */
  currency: "EUR";
  /** ISO 8601 timestamp */
  computedAt: string;
}
