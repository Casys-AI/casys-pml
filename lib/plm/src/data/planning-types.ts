/**
 * Manufacturing Planning types for PLM tools
 *
 * Routing (gamme de fabrication), work instructions, and cycle time estimation.
 *
 * @module lib/plm/data/planning-types
 */

// ============================================================================
// Routing (gamme de fabrication)
// ============================================================================

/** Type of manufacturing operation */
export type OperationType =
  | "machining"
  | "turning"
  | "milling"
  | "drilling"
  | "grinding"
  | "welding"
  | "assembly"
  | "inspection"
  | "surface_treatment"
  | "heat_treatment"
  | "forming"
  | "casting"
  | "additive"
  | "testing"
  | "packaging"
  | "other";

/** A single operation in a routing */
export interface RoutingOperation {
  /** Operation number (10, 20, 30... by convention) */
  operationNumber: string;
  /** Operation name */
  name: string;
  /** Operation type */
  type: OperationType;
  /** Work center / machine */
  workCenter: string;
  /** Setup time in minutes */
  setupTime_min: number;
  /** Run time per unit in minutes */
  runTime_min: number;
  /** Required tooling (if any) */
  tooling?: string[];
  /** Special instructions */
  notes?: string;
}

/** Complete manufacturing routing */
export interface Routing {
  /** Routing ID */
  id: string;
  /** Routing title */
  title: string;
  /** Part number this routing is for */
  partNumber: string;
  /** Part name */
  partName: string;
  /** Material ID (determines process parameters) */
  materialId?: string;
  /** Ordered list of operations */
  operations: RoutingOperation[];
  /** Summary */
  summary: {
    totalOperations: number;
    totalSetupTime_min: number;
    totalRunTime_min: number;
    totalCycleTime_min: number;
  };
  /** ISO 8601 generation timestamp */
  generatedAt: string;
}

// ============================================================================
// Work Instructions
// ============================================================================

/** A single step in a work instruction */
export interface WorkInstructionStep {
  /** Step number */
  step: number;
  /** Instruction text (clear, actionable) */
  instruction: string;
  /** Safety warnings (if any) */
  safetyWarning?: string;
  /** Required tools/equipment */
  tools?: string[];
  /** Quality checkpoint (if this step requires verification) */
  qualityCheck?: string;
  /** Estimated time in minutes */
  estimatedTime_min?: number;
  /** Additional notes (e.g. from routing operation) */
  notes?: string;
}

/** Complete work instruction document */
export interface WorkInstruction {
  /** Document ID */
  id: string;
  /** Document title */
  title: string;
  /** Part number */
  partNumber: string;
  /** Part name */
  partName: string;
  /** Operation this instruction belongs to (from routing) */
  operationNumber: string;
  /** Operation name */
  operationName: string;
  /** Ordered steps */
  steps: WorkInstructionStep[];
  /** Summary */
  summary: {
    totalSteps: number;
    estimatedTotalTime_min: number;
    safetyWarnings: number;
    qualityChecks: number;
  };
  /** ISO 8601 generation timestamp */
  generatedAt: string;
}

// ============================================================================
// Cycle Time Estimation
// ============================================================================

/** Time breakdown for a single part */
export interface PartCycleTime {
  /** Part number */
  partNumber: string;
  /** Part name */
  partName: string;
  /** Quantity in BOM */
  quantity: number;
  /** Setup time per batch in minutes */
  setupTime_min: number;
  /** Run time per unit in minutes */
  runTimePerUnit_min: number;
  /** Total run time (run * quantity) in minutes */
  totalRunTime_min: number;
  /** Number of operations */
  operationCount: number;
}

/** Complete cycle time analysis */
export interface CycleTimeAnalysis {
  /** Analysis ID */
  id: string;
  /** Product name */
  productName: string;
  /** Batch size used for calculation */
  batchSize: number;
  /** Per-part breakdown */
  parts: PartCycleTime[];
  /** Aggregated totals */
  totals: {
    /** Total setup time for the batch (sum of all unique setups) */
    totalSetupTime_min: number;
    /** Total run time for the batch (sum of run * qty) */
    totalRunTime_min: number;
    /** Total cycle time (setup + run) */
    totalCycleTime_min: number;
    /** Cycle time per unit (totalCycleTime / batchSize) */
    cycleTimePerUnit_min: number;
    /** Formatted total time */
    totalCycleTime_hours: number;
  };
  /** ISO 8601 generation timestamp */
  generatedAt: string;
}
