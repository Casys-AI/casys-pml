/**
 * Change Management types for PLM tools
 *
 * Engineering Change Request (ECR) and Engineering Change Order (ECO) types.
 * Stateless — all state is in the returned documents, not server-side.
 *
 * @module lib/plm/data/change-types
 */

// ============================================================================
// ECR — Engineering Change Request
// ============================================================================

/** Reason categories for an ECR */
export type EcrReason =
  | "defect"
  | "cost_reduction"
  | "performance_improvement"
  | "regulatory_compliance"
  | "customer_request"
  | "obsolescence"
  | "manufacturability";

/** Priority levels for change requests */
export type EcrPriority = "critical" | "high" | "medium" | "low";

/** ECR status in the approval workflow */
export type EcrStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected" | "deferred";

/** A single element affected by the change */
export interface AffectedElement {
  /** SysON element ID */
  elementId: string;
  /** Element name */
  name: string;
  /** Element type (PartUsage, RequirementUsage, etc.) */
  kind: string;
  /** What changes for this element */
  changeDescription: string;
}

/** Engineering Change Request */
export interface ECR {
  /** Unique ECR identifier */
  id: string;
  /** Short title */
  title: string;
  /** Detailed description of the change */
  description: string;
  /** Reason category */
  reason: EcrReason;
  /** Priority */
  priority: EcrPriority;
  /** Current status */
  status: EcrStatus;
  /** SysON project ID (editing context) — undefined if no SysON connection */
  editingContextId?: string;
  /** Elements affected by this change */
  affectedElements: AffectedElement[];
  /** Requester name/ID */
  requestedBy: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update timestamp */
  updatedAt: string;
  /** Approval history */
  approvalHistory: ApprovalEntry[];
}

// ============================================================================
// ECO — Engineering Change Order
// ============================================================================

/** ECO status */
export type EcoStatus = "draft" | "in_progress" | "completed" | "cancelled";

/** A specific action to take as part of the ECO */
export interface EcoAction {
  /** Sequential action number */
  step: number;
  /** What to do */
  description: string;
  /** Which element to modify */
  elementId?: string;
  /** Element name */
  elementName?: string;
  /** Type of action */
  actionType: "create" | "modify" | "delete" | "replace";
}

/** Engineering Change Order */
export interface ECO {
  /** Unique ECO identifier */
  id: string;
  /** Reference to the parent ECR */
  ecrId: string;
  /** Short title */
  title: string;
  /** Planned actions to implement the change */
  actions: EcoAction[];
  /** Current status */
  status: EcoStatus;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update */
  updatedAt: string;
  /** Estimated cost impact in EUR (positive = more expensive) */
  estimatedCostImpact?: number;
  /** Estimated mass impact in kg (positive = heavier) */
  estimatedMassImpact?: number;
}

// ============================================================================
// Impact Analysis
// ============================================================================

/** Severity of an impact finding */
export type ImpactSeverity = "info" | "warning" | "critical";

/** A single impact finding */
export interface ImpactFinding {
  /** What is affected */
  elementId: string;
  /** Element name */
  elementName: string;
  /** Element type */
  kind: string;
  /** Relationship to the changed element */
  relationship: "parent" | "child" | "sibling" | "referenced_by" | "references";
  /** Human-readable impact description */
  description: string;
  /** Severity */
  severity: ImpactSeverity;
}

/** Complete impact analysis result */
export interface ImpactAnalysis {
  /** Element that was analyzed for change */
  sourceElementId: string;
  /** Source element name */
  sourceElementName: string;
  /** All findings */
  findings: ImpactFinding[];
  /** Summary */
  summary: {
    totalAffected: number;
    critical: number;
    warning: number;
    info: number;
  };
  /** ISO 8601 timestamp */
  analyzedAt: string;
}

// ============================================================================
// Approval
// ============================================================================

/** A single approval action */
export interface ApprovalEntry {
  /** Who took the action */
  actor: string;
  /** What action was taken */
  action: "approve" | "reject" | "defer" | "comment";
  /** Comment/rationale */
  comment?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/** Result of an approval action */
export interface ApprovalResult {
  /** ECR ID */
  ecrId: string;
  /** New status after approval */
  newStatus: EcrStatus;
  /** The approval entry that was recorded */
  entry: ApprovalEntry;
}
