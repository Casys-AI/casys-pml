/**
 * Change Management Tools — ECR, ECO, Impact Analysis, Approval
 *
 * Manages Engineering Change Requests and Orders against SysON models.
 * Stateless tools — all state is in the returned documents.
 * Uses SysON AQL for impact analysis when a model is connected.
 *
 * @module lib/plm/tools/change
 */

import type { PlmTool } from "./types.ts";
import type {
  AffectedElement,
  ApprovalEntry,
  ApprovalResult,
  ECO,
  EcoAction,
  ECR,
  EcrPriority,
  EcrReason,
  EcrStatus,
  ImpactAnalysis,
  ImpactFinding,
  ImpactSeverity,
} from "../data/change-types.ts";

// ============================================================================
// SysON GraphQL integration (same pattern as bom.ts)
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

async function getSysonClientLazy() {
  const mod = await import("@casys/mcp-syson");
  return mod.getSysonClient();
}

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

async function getChildren(ecId: string, elementId: string): Promise<GqlObj[]> {
  const result = await evalAql(ecId, elementId, "aql:self.ownedElement");
  if (result.__typename === "ObjectsExpressionResult") return result.objsValue;
  if (result.__typename === "ObjectExpressionResult") return [result.objValue];
  return [];
}

async function getParent(ecId: string, elementId: string): Promise<GqlObj | null> {
  try {
    const result = await evalAql(ecId, elementId, "aql:self.eContainer()");
    if (result.__typename === "ObjectExpressionResult") return result.objValue;
  } catch { /* may not have parent */ }
  return null;
}

// ============================================================================
// Tool definitions
// ============================================================================

export const changeTools: PlmTool[] = [
  // --------------------------------------------------------------------------
  // plm_ecr_create
  // --------------------------------------------------------------------------
  {
    name: "plm_ecr_create",
    description:
      "Create an Engineering Change Request (ECR) documenting a proposed change " +
      "to a SysON model. Optionally queries the model to identify affected elements. " +
      "Returns a structured ECR document in 'draft' status.",
    category: "change",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title for the change request",
        },
        description: {
          type: "string",
          description: "Detailed description of the proposed change",
        },
        reason: {
          type: "string",
          enum: [
            "defect",
            "cost_reduction",
            "performance_improvement",
            "regulatory_compliance",
            "customer_request",
            "obsolescence",
            "manufacturability",
          ],
          description: "Reason category for the change",
        },
        priority: {
          type: "string",
          enum: ["critical", "high", "medium", "low"],
          description: "Priority level (default: medium)",
          default: "medium",
        },
        requested_by: {
          type: "string",
          description: "Name or ID of the requester",
          default: "system",
        },
        editing_context_id: {
          type: "string",
          description: "SysON editing context ID (optional — for auto-detecting affected elements)",
        },
        affected_element_ids: {
          type: "array",
          items: { type: "string" },
          description: "SysON element IDs directly affected by this change (optional)",
        },
      },
      required: ["title", "description", "reason"],
    },
    handler: async (args) => {
      const title = args.title as string;
      const description = args.description as string;
      const reason = args.reason as EcrReason;
      const priority = (args.priority as EcrPriority) || "medium";
      const requestedBy = (args.requested_by as string) || "system";
      const ecId = args.editing_context_id as string | undefined;
      const elementIds = (args.affected_element_ids as string[] | undefined) ?? [];

      const now = new Date().toISOString();
      const ecrId = `ECR-${Date.now().toString(36).toUpperCase()}`;

      // Resolve affected elements from SysON if editing context provided
      const affectedElements: AffectedElement[] = [];

      if (ecId && elementIds.length > 0) {
        for (const elId of elementIds) {
          try {
            const result = await evalAql(ecId, elId, "aql:self");
            if (result.__typename === "ObjectExpressionResult") {
              affectedElements.push({
                elementId: elId,
                name: result.objValue.label,
                kind: result.objValue.kind,
                changeDescription: `Affected by: ${title}`,
              });
            }
          } catch {
            // Element might not exist — include with unknown info
            affectedElements.push({
              elementId: elId,
              name: "(unresolved)",
              kind: "unknown",
              changeDescription: `Affected by: ${title}`,
            });
          }
        }
      } else {
        // No SysON context — populate from IDs only
        for (const elId of elementIds) {
          affectedElements.push({
            elementId: elId,
            name: "(not resolved — no editing_context_id)",
            kind: "unknown",
            changeDescription: `Affected by: ${title}`,
          });
        }
      }

      const ecr: ECR = {
        id: ecrId,
        title,
        description,
        reason,
        priority,
        status: "draft",
        editingContextId: ecId,
        affectedElements,
        requestedBy,
        createdAt: now,
        updatedAt: now,
        approvalHistory: [],
      };

      return ecr;
    },
  },

  // --------------------------------------------------------------------------
  // plm_eco_create
  // --------------------------------------------------------------------------
  {
    name: "plm_eco_create",
    description:
      "Create an Engineering Change Order (ECO) from an approved ECR. " +
      "An ECO defines the specific actions to implement the change: " +
      "create, modify, delete, or replace elements in the model. " +
      "Takes an ECR object and a list of planned actions.",
    category: "change",
    inputSchema: {
      type: "object",
      properties: {
        ecr: {
          type: "object",
          description: "ECR object (from plm_ecr_create or plm_change_approve)",
        },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              element_id: { type: "string" },
              element_name: { type: "string" },
              action_type: {
                type: "string",
                enum: ["create", "modify", "delete", "replace"],
              },
            },
            required: ["description", "action_type"],
          },
          description: "List of actions to implement",
        },
        estimated_cost_impact: {
          type: "number",
          description: "Estimated cost impact in EUR (positive = more expensive)",
        },
        estimated_mass_impact: {
          type: "number",
          description: "Estimated mass impact in kg (positive = heavier)",
        },
      },
      required: ["ecr", "actions"],
    },
    handler: (args) => {
      const ecr = args.ecr as ECR;
      const rawActions = args.actions as Array<{
        description: string;
        element_id?: string;
        element_name?: string;
        action_type: string;
      }>;
      const estimatedCostImpact = args.estimated_cost_impact as number | undefined;
      const estimatedMassImpact = args.estimated_mass_impact as number | undefined;

      // Validate ECR status — ECO should only be created from approved ECRs
      if (ecr.status !== "approved") {
        throw new Error(
          `[lib/plm] Cannot create ECO: ECR '${ecr.id}' has status '${ecr.status}', ` +
          `expected 'approved'. Approve the ECR first with plm_change_approve.`,
        );
      }

      const now = new Date().toISOString();
      const ecoId = `ECO-${Date.now().toString(36).toUpperCase()}`;

      const actions: EcoAction[] = rawActions.map((a, i) => ({
        step: (i + 1) * 10,
        description: a.description,
        elementId: a.element_id,
        elementName: a.element_name,
        actionType: a.action_type as EcoAction["actionType"],
      }));

      const eco: ECO = {
        id: ecoId,
        ecrId: ecr.id,
        title: `ECO for ${ecr.title}`,
        actions,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        estimatedCostImpact,
        estimatedMassImpact,
      };

      return eco;
    },
  },

  // --------------------------------------------------------------------------
  // plm_change_impact
  // --------------------------------------------------------------------------
  {
    name: "plm_change_impact",
    description:
      "Analyze the impact of changing a SysON model element. " +
      "Queries the model to find parent, children, and referencing elements. " +
      "Each finding is classified by severity (info, warning, critical). " +
      "Requires a live SysON connection.",
    category: "change",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON editing context ID",
        },
        element_id: {
          type: "string",
          description: "ID of the element being changed",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-plm/impact-viewer",
      },
    },
    handler: async (args) => {
      const ecId = args.editing_context_id as string;
      const elementId = args.element_id as string;

      const findings: ImpactFinding[] = [];

      // Get the source element info
      const selfResult = await evalAql(ecId, elementId, "aql:self");
      let sourceName = "(unknown)";
      if (selfResult.__typename === "ObjectExpressionResult") {
        sourceName = selfResult.objValue.label;
      }

      // 1. Parent — changing this element affects the parent assembly
      const parent = await getParent(ecId, elementId);
      if (parent) {
        findings.push({
          elementId: parent.id,
          elementName: parent.label,
          kind: parent.kind,
          relationship: "parent",
          description: `Parent assembly "${parent.label}" contains the changed element`,
          severity: "warning",
        });
      }

      // 2. Children — changing this element affects all children
      const children = await getChildren(ecId, elementId);
      for (const child of children) {
        const kind = child.kind || "";
        // Requirements/constraints impacted by parent change are critical
        const severity: ImpactSeverity =
          kind.includes("Requirement") || kind.includes("Constraint")
            ? "critical"
            : "info";

        findings.push({
          elementId: child.id,
          elementName: child.label,
          kind: child.kind,
          relationship: "child",
          description: `Child element "${child.label}" is owned by the changed element`,
          severity,
        });
      }

      // 3. Siblings — other children of the same parent
      if (parent) {
        const siblings = await getChildren(ecId, parent.id);
        for (const sib of siblings) {
          if (sib.id === elementId) continue;
          findings.push({
            elementId: sib.id,
            elementName: sib.label,
            kind: sib.kind,
            relationship: "sibling",
            description: `Sibling "${sib.label}" shares parent "${parent.label}" with the changed element`,
            severity: "info",
          });
        }
      }

      const critical = findings.filter((f) => f.severity === "critical").length;
      const warning = findings.filter((f) => f.severity === "warning").length;
      const info = findings.filter((f) => f.severity === "info").length;

      const analysis: ImpactAnalysis = {
        sourceElementId: elementId,
        sourceElementName: sourceName,
        findings,
        summary: {
          totalAffected: findings.length,
          critical,
          warning,
          info,
        },
        analyzedAt: new Date().toISOString(),
      };

      return analysis;
    },
  },

  // --------------------------------------------------------------------------
  // plm_change_approve
  // --------------------------------------------------------------------------
  {
    name: "plm_change_approve",
    description:
      "Record an approval action on an ECR (approve, reject, defer, or comment). " +
      "Updates the ECR status based on the action taken. " +
      "Returns the updated ECR with the new approval entry.",
    category: "change",
    inputSchema: {
      type: "object",
      properties: {
        ecr: {
          type: "object",
          description: "ECR object to approve/reject",
        },
        action: {
          type: "string",
          enum: ["approve", "reject", "defer", "comment"],
          description: "Approval action to take",
        },
        actor: {
          type: "string",
          description: "Name or ID of the person taking the action",
        },
        comment: {
          type: "string",
          description: "Rationale or comment for the action",
        },
      },
      required: ["ecr", "action", "actor"],
    },
    handler: (args) => {
      const ecr = args.ecr as ECR;
      const action = args.action as ApprovalEntry["action"];
      const actor = args.actor as string;
      const comment = args.comment as string | undefined;

      // State machine: validate transition
      const VALID_ACTIONS: Record<EcrStatus, ApprovalEntry["action"][]> = {
        draft: ["comment", "approve", "reject"],
        submitted: ["comment", "approve", "reject", "defer"],
        under_review: ["comment", "approve", "reject", "defer"],
        approved: ["comment"],
        rejected: ["comment"],
        deferred: ["comment", "approve", "reject"],
      };

      const allowed = VALID_ACTIONS[ecr.status];
      if (!allowed || !allowed.includes(action)) {
        throw new Error(
          `[lib/plm] Invalid transition: cannot '${action}' an ECR in status '${ecr.status}'. ` +
          `Allowed actions: ${allowed?.join(", ") ?? "none"}.`,
        );
      }

      const now = new Date().toISOString();

      const entry: ApprovalEntry = {
        actor,
        action,
        comment,
        timestamp: now,
      };

      // Determine new status based on action
      let newStatus: EcrStatus = ecr.status;
      switch (action) {
        case "approve":
          newStatus = "approved";
          break;
        case "reject":
          newStatus = "rejected";
          break;
        case "defer":
          newStatus = "deferred";
          break;
        case "comment":
          // Move to under_review if still draft/submitted; terminal states stay unchanged
          if (ecr.status === "draft" || ecr.status === "submitted") {
            newStatus = "under_review";
          }
          break;
      }

      const result: ApprovalResult = {
        ecrId: ecr.id,
        newStatus,
        entry,
      };

      // Return both the result and the updated ECR for chaining
      const updatedEcr: ECR = {
        ...ecr,
        status: newStatus,
        updatedAt: now,
        approvalHistory: [...ecr.approvalHistory, entry],
      };

      return { approval: result, ecr: updatedEcr };
    },
  },
];
