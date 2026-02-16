/**
 * Tests for Change Management tools (ECR, ECO, Impact, Approval)
 *
 * Pure data tests — SysON-dependent tools (plm_change_impact) are tested
 * separately with integration tests against a live SysON instance.
 */

import { assertEquals, assertThrows } from "@std/assert";
import { changeTools } from "../../src/tools/change.ts";
import type {
  ApprovalResult,
  ECO,
  ECR,
} from "../../src/data/change-types.ts";

function getHandler(name: string) {
  const tool = changeTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

// ============================================================================
// Tool registration tests
// ============================================================================

Deno.test("changeTools - exports 4 tools", () => {
  assertEquals(changeTools.length, 4);
});

Deno.test("changeTools - all have category 'change'", () => {
  for (const tool of changeTools) {
    assertEquals(tool.category, "change");
  }
});

Deno.test("changeTools - correct names", () => {
  const names = changeTools.map((t) => t.name);
  assertEquals(names, [
    "plm_ecr_create",
    "plm_eco_create",
    "plm_change_impact",
    "plm_change_approve",
  ]);
});

// ============================================================================
// plm_ecr_create tests
// ============================================================================

Deno.test("plm_ecr_create - creates ECR with required fields", async () => {
  const result = await getHandler("plm_ecr_create")({
    title: "Replace motor bearings",
    description: "Current bearings have high failure rate under vibration",
    reason: "defect",
  }) as ECR;

  assertEquals(result.title, "Replace motor bearings");
  assertEquals(result.reason, "defect");
  assertEquals(result.priority, "medium"); // default
  assertEquals(result.status, "draft");
  assertEquals(result.requestedBy, "system"); // default
  assertEquals(result.approvalHistory.length, 0);
  assertEquals(typeof result.id, "string");
  assertEquals(result.id.startsWith("ECR-"), true);
});

Deno.test("plm_ecr_create - accepts optional fields", async () => {
  const result = await getHandler("plm_ecr_create")({
    title: "Cost reduction: switch to aluminum frame",
    description: "Replace steel frame with aluminum to save weight and cost",
    reason: "cost_reduction",
    priority: "high",
    requested_by: "eng-team-lead",
    affected_element_ids: ["elem-001", "elem-002"],
  }) as ECR;

  assertEquals(result.priority, "high");
  assertEquals(result.requestedBy, "eng-team-lead");
  assertEquals(result.affectedElements.length, 2);
});

Deno.test("plm_ecr_create - affected elements without editing context show unresolved", async () => {
  const result = await getHandler("plm_ecr_create")({
    title: "Change propeller material",
    description: "Switch from CFRP to GFRP",
    reason: "cost_reduction",
    affected_element_ids: ["id-123"],
  }) as ECR;

  assertEquals(result.affectedElements.length, 1);
  assertEquals(result.affectedElements[0].elementId, "id-123");
  // Without editing_context_id, name is not resolved
  assertEquals(result.affectedElements[0].name.includes("not resolved"), true);
});

// ============================================================================
// plm_eco_create tests
// ============================================================================

Deno.test("plm_eco_create - creates ECO from ECR", async () => {
  const ecr: ECR = {
    id: "ECR-TEST001",
    title: "Replace bearings",
    description: "Replace motor bearings",
    reason: "defect",
    priority: "high",
    status: "approved",
    editingContextId: "ec-001",
    affectedElements: [],
    requestedBy: "test",
    createdAt: "2026-02-16T00:00:00Z",
    updatedAt: "2026-02-16T00:00:00Z",
    approvalHistory: [],
  };

  const result = await getHandler("plm_eco_create")({
    ecr,
    actions: [
      { description: "Remove old bearings", action_type: "delete", element_name: "SKF-6203" },
      { description: "Install ceramic bearings", action_type: "create", element_name: "SKF-6203C" },
    ],
    estimated_cost_impact: 12.50,
    estimated_mass_impact: -0.01,
  }) as ECO;

  assertEquals(result.ecrId, "ECR-TEST001");
  assertEquals(result.status, "draft");
  assertEquals(result.actions.length, 2);
  assertEquals(result.actions[0].step, 10);
  assertEquals(result.actions[1].step, 20);
  assertEquals(result.estimatedCostImpact, 12.50);
  assertEquals(result.estimatedMassImpact, -0.01);
  assertEquals(result.id.startsWith("ECO-"), true);
});

Deno.test("plm_eco_create - actions have correct types", async () => {
  const ecr: ECR = {
    id: "ECR-X", title: "X", description: "X", reason: "defect",
    priority: "medium", status: "approved", editingContextId: "",
    affectedElements: [], requestedBy: "test",
    createdAt: "", updatedAt: "", approvalHistory: [],
  };

  const result = await getHandler("plm_eco_create")({
    ecr,
    actions: [
      { description: "Modify geometry", action_type: "modify" },
      { description: "Replace material spec", action_type: "replace" },
    ],
  }) as ECO;

  assertEquals(result.actions[0].actionType, "modify");
  assertEquals(result.actions[1].actionType, "replace");
});

Deno.test("plm_eco_create - rejects non-approved ECR", () => {
  const ecr: ECR = {
    id: "ECR-DRAFT", title: "Draft ECR", description: "Not approved",
    reason: "defect", priority: "medium", status: "draft",
    affectedElements: [], requestedBy: "test",
    createdAt: "", updatedAt: "", approvalHistory: [],
  };

  assertThrows(
    () => getHandler("plm_eco_create")({
      ecr,
      actions: [{ description: "Do something", action_type: "modify" }],
    }),
    Error,
    "expected 'approved'",
  );
});

// ============================================================================
// plm_change_approve tests
// ============================================================================

function makeDraftEcr(): ECR {
  return {
    id: "ECR-DRAFT001",
    title: "Test ECR",
    description: "Test change request",
    reason: "defect",
    priority: "medium",
    status: "draft",
    editingContextId: "",
    affectedElements: [],
    requestedBy: "test",
    createdAt: "2026-02-16T00:00:00Z",
    updatedAt: "2026-02-16T00:00:00Z",
    approvalHistory: [],
  };
}

Deno.test("plm_change_approve - approve changes status", async () => {
  const ecr = makeDraftEcr();
  const result = await getHandler("plm_change_approve")({
    ecr,
    action: "approve",
    actor: "chief-engineer",
    comment: "Approved for implementation",
  }) as { approval: ApprovalResult; ecr: ECR };

  assertEquals(result.approval.newStatus, "approved");
  assertEquals(result.ecr.status, "approved");
  assertEquals(result.ecr.approvalHistory.length, 1);
  assertEquals(result.ecr.approvalHistory[0].actor, "chief-engineer");
  assertEquals(result.ecr.approvalHistory[0].action, "approve");
});

Deno.test("plm_change_approve - reject changes status", async () => {
  const ecr = makeDraftEcr();
  ecr.status = "submitted";

  const result = await getHandler("plm_change_approve")({
    ecr,
    action: "reject",
    actor: "quality-lead",
    comment: "Insufficient test data",
  }) as { approval: ApprovalResult; ecr: ECR };

  assertEquals(result.approval.newStatus, "rejected");
  assertEquals(result.ecr.status, "rejected");
});

Deno.test("plm_change_approve - defer changes status", async () => {
  const ecr = makeDraftEcr();
  ecr.status = "under_review"; // defer only allowed from submitted/under_review/deferred
  const result = await getHandler("plm_change_approve")({
    ecr,
    action: "defer",
    actor: "program-manager",
  }) as { approval: ApprovalResult; ecr: ECR };

  assertEquals(result.approval.newStatus, "deferred");
});

Deno.test("plm_change_approve - comment moves draft to under_review", async () => {
  const ecr = makeDraftEcr();
  const result = await getHandler("plm_change_approve")({
    ecr,
    action: "comment",
    actor: "reviewer",
    comment: "Need more details on impact",
  }) as { approval: ApprovalResult; ecr: ECR };

  assertEquals(result.approval.newStatus, "under_review");
});

Deno.test("plm_change_approve - preserves existing approval history", async () => {
  const ecr = makeDraftEcr();
  ecr.approvalHistory = [{
    actor: "first-reviewer",
    action: "comment",
    comment: "Looks good",
    timestamp: "2026-02-15T00:00:00Z",
  }];

  const result = await getHandler("plm_change_approve")({
    ecr,
    action: "approve",
    actor: "chief-engineer",
  }) as { approval: ApprovalResult; ecr: ECR };

  assertEquals(result.ecr.approvalHistory.length, 2);
  assertEquals(result.ecr.approvalHistory[0].actor, "first-reviewer");
  assertEquals(result.ecr.approvalHistory[1].actor, "chief-engineer");
});

// ============================================================================
// State machine tests (F8)
// ============================================================================

Deno.test("plm_change_approve - rejects approve on already approved ECR", () => {
  const ecr = makeDraftEcr();
  ecr.status = "approved";

  assertThrows(
    () => getHandler("plm_change_approve")({
      ecr,
      action: "approve",
      actor: "someone",
    }),
    Error,
    "Invalid transition",
  );
});

Deno.test("plm_change_approve - rejects reject on already rejected ECR", () => {
  const ecr = makeDraftEcr();
  ecr.status = "rejected";

  assertThrows(
    () => getHandler("plm_change_approve")({
      ecr,
      action: "reject",
      actor: "someone",
    }),
    Error,
    "Invalid transition",
  );
});

Deno.test("plm_change_approve - rejects defer on draft ECR", () => {
  const ecr = makeDraftEcr();

  assertThrows(
    () => getHandler("plm_change_approve")({
      ecr,
      action: "defer",
      actor: "someone",
    }),
    Error,
    "Invalid transition",
  );
});

Deno.test("plm_change_approve - allows comment on approved ECR without status change", async () => {
  const ecr = makeDraftEcr();
  ecr.status = "approved";

  const result = await getHandler("plm_change_approve")({
    ecr,
    action: "comment",
    actor: "auditor",
    comment: "Reviewed for compliance",
  }) as { approval: ApprovalResult; ecr: ECR };

  assertEquals(result.ecr.status, "approved"); // stays approved
  assertEquals(result.ecr.approvalHistory.length, 1);
});

Deno.test("plm_change_approve - allows approve on deferred ECR", async () => {
  const ecr = makeDraftEcr();
  ecr.status = "deferred";

  const result = await getHandler("plm_change_approve")({
    ecr,
    action: "approve",
    actor: "chief-engineer",
  }) as { approval: ApprovalResult; ecr: ECR };

  assertEquals(result.ecr.status, "approved");
});
