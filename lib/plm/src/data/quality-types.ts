/**
 * Quality & Inspection types for PLM tools
 *
 * Inspection plans, First Article Inspection Reports (FAIR), and control plans.
 * Generated from BOM + model constraint data.
 *
 * @module lib/plm/data/quality-types
 */

// ============================================================================
// Inspection Plan
// ============================================================================

/** Inspection level determines sampling strategy */
export type InspectionLevel = "full" | "sampling" | "skip";

/** Measurement method */
export type MeasurementMethod = "cmm" | "caliper" | "micrometer" | "visual" | "gauge" | "functional_test" | "other";

/** A single inspection characteristic to check */
export interface InspectionCharacteristic {
  /** Sequential ID within the plan */
  id: string;
  /** Part number being inspected */
  partNumber: string;
  /** Part name */
  partName: string;
  /** What to inspect (dimension, surface, functional, etc.) */
  characteristicName: string;
  /** Nominal value (as string to support ranges like "10.0 ± 0.1 mm") */
  nominal?: string;
  /** Tolerance (if separate from nominal) */
  tolerance?: string;
  /** Measurement method */
  method: MeasurementMethod;
  /** Inspection level */
  level: InspectionLevel;
  /** Sampling size if level=sampling (e.g. "5 per lot") */
  sampleSize?: string;
  /** Is this a critical-to-quality (CTQ) characteristic? */
  ctq: boolean;
  /** Source: where this requirement comes from */
  source?: string;
}

/** Complete inspection plan */
export interface InspectionPlan {
  /** Plan ID */
  id: string;
  /** Plan title */
  title: string;
  /** Product/assembly name */
  productName: string;
  /** BOM revision this plan is based on */
  bomRevision: string;
  /** All characteristics to inspect */
  characteristics: InspectionCharacteristic[];
  /** Summary */
  summary: {
    totalCharacteristics: number;
    ctqCount: number;
    fullInspection: number;
    samplingInspection: number;
    skipped: number;
  };
  /** ISO 8601 generation timestamp */
  generatedAt: string;
  /** Applicable standard (if specified) */
  standard?: string;
}

// ============================================================================
// First Article Inspection Report (FAIR)
// ============================================================================

/** FAIR status for a single characteristic */
export type FairCharacteristicStatus = "pending" | "pass" | "fail" | "waived";

/** A FAIR measurement row */
export interface FairMeasurement {
  /** Characteristic ID (references InspectionCharacteristic.id) */
  characteristicId: string;
  /** Part number */
  partNumber: string;
  /** Part name */
  partName: string;
  /** What was measured */
  characteristicName: string;
  /** Nominal value */
  nominal?: string;
  /** Tolerance */
  tolerance?: string;
  /** Actual measured value (blank = pending) */
  actualValue?: string;
  /** Status */
  status: FairCharacteristicStatus;
  /** Method used */
  method: MeasurementMethod;
  /** Operator notes */
  notes?: string;
}

/** Complete FAIR report */
export interface FairReport {
  /** Report ID */
  id: string;
  /** Report title */
  title: string;
  /** Product name */
  productName: string;
  /** Inspection plan this FAIR is based on */
  inspectionPlanId: string;
  /** Serial number of the first article */
  serialNumber: string;
  /** All measurements */
  measurements: FairMeasurement[];
  /** Summary */
  summary: {
    total: number;
    pass: number;
    fail: number;
    pending: number;
    waived: number;
  };
  /** Overall verdict (computed from measurements) */
  verdict: "pending" | "accepted" | "rejected" | "conditional";
  /** ISO 8601 generation timestamp */
  generatedAt: string;
}

// ============================================================================
// Control Plan
// ============================================================================

/** Reaction strategy when out of spec */
export type ReactionPlan = "stop_production" | "quarantine" | "rework" | "scrap" | "notify_engineering" | "document_only";

/** A control plan entry */
export interface ControlPlanEntry {
  /** Sequential ID */
  id: string;
  /** Process step / operation number */
  operationNumber: string;
  /** Process description */
  processDescription: string;
  /** Part number */
  partNumber: string;
  /** Part name */
  partName: string;
  /** Characteristic to control */
  characteristic: string;
  /** Specification / tolerance */
  specification?: string;
  /** Measurement method */
  method: MeasurementMethod;
  /** Sampling frequency (e.g. "every part", "1 per hour", "first and last") */
  frequency: string;
  /** Control method ("SPC chart", "go/no-go gauge", "visual standard", etc.) */
  controlMethod: string;
  /** What to do when out of spec */
  reactionPlan: ReactionPlan;
}

/** Complete control plan */
export interface ControlPlan {
  /** Plan ID */
  id: string;
  /** Plan title */
  title: string;
  /** Product name */
  productName: string;
  /** BOM revision */
  bomRevision: string;
  /** All control entries */
  entries: ControlPlanEntry[];
  /** Summary */
  summary: {
    totalEntries: number;
    uniqueParts: number;
    stopProductionCount: number;
  };
  /** ISO 8601 generation timestamp */
  generatedAt: string;
  /** Applicable standard */
  standard?: string;
}
