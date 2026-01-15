/**
 * Debug Test: Tool Permission Flow
 *
 * Teste le flow approval_required avec tool_permission vs dependency
 */

import { assertEquals, assertExists } from "@std/assert";

// Mock les types directement
interface McpDependency {
  name: string;
  version: string;
  type: "stdio" | "deno" | "http";
  install: string;
  integrity: string;
  envRequired?: string[];
}

interface ToolPermissionApprovalRequired {
  approvalRequired: true;
  approvalType: "tool_permission";
  workflowId: string;
  toolId: string;
  namespace: string;
  needsInstallation: boolean;
  dependency?: McpDependency;
  description: string;
}

interface DependencyApprovalRequired {
  approvalRequired: true;
  approvalType: "dependency";
  workflowId: string;
  dependency: McpDependency;
  description: string;
}

type ApprovalResult = ToolPermissionApprovalRequired | DependencyApprovalRequired;

// Simule ensureDependency AVANT le changement (avec "dependency")
function ensureDependencyOLD(
  dep: McpDependency,
  isInstalled: boolean,
  permission: "allowed" | "denied" | "ask"
): ApprovalResult | null {
  if (isInstalled) {
    console.log(`[OLD] Dependency ${dep.name} already installed`);
    return null;
  }

  if (permission === "denied") {
    throw new Error(`Dependency ${dep.name} is in deny list`);
  }

  if (permission === "allowed") {
    console.log(`[OLD] Auto-installing ${dep.name}`);
    return null;
  }

  // permission === "ask" → return approval_required
  console.log(`[OLD] Dependency ${dep.name} requires approval`);
  return {
    approvalRequired: true,
    approvalType: "dependency",
    workflowId: crypto.randomUUID(),
    dependency: dep,
    description: `Install ${dep.name}@${dep.version} to execute this capability`,
  };
}

// Simule ensureDependency APRÈS le changement (avec "tool_permission")
function ensureDependencyNEW(
  dep: McpDependency,
  isInstalled: boolean,
  permission: "allowed" | "denied" | "ask",
  toolId: string
): ApprovalResult | null {
  if (isInstalled) {
    console.log(`[NEW] Dependency ${dep.name} already installed`);
    return null;
  }

  if (permission === "denied") {
    throw new Error(`Tool ${toolId} is in deny list`);
  }

  if (permission === "allowed") {
    console.log(`[NEW] Auto-installing ${dep.name}`);
    return null;
  }

  // permission === "ask" → return tool_permission approval
  console.log(`[NEW] Tool ${toolId} requires approval (will install ${dep.name})`);
  return {
    approvalRequired: true,
    approvalType: "tool_permission",
    workflowId: crypto.randomUUID(),
    toolId,
    namespace: dep.name,
    needsInstallation: true,
    dependency: dep,
    description: `Allow ${toolId}? (will install ${dep.name}@${dep.version})`,
  };
}

// =============================================================================
// Tests
// =============================================================================

Deno.test("OLD flow: dependency approval works", () => {
  const dep: McpDependency = {
    name: "memory",
    version: "1.0.0",
    type: "stdio",
    install: "npx @anthropic/mcp-memory",
    integrity: "sha256-xxx",
  };

  const result = ensureDependencyOLD(dep, false, "ask");

  console.log("\n[OLD] Result:", JSON.stringify(result, null, 2));

  assertExists(result);
  assertEquals(result.approvalRequired, true);
  assertEquals(result.approvalType, "dependency");
  assertExists((result as DependencyApprovalRequired).dependency);
});

Deno.test("NEW flow: tool_permission approval works", () => {
  const dep: McpDependency = {
    name: "memory",
    version: "1.0.0",
    type: "stdio",
    install: "npx @anthropic/mcp-memory",
    integrity: "sha256-xxx",
  };

  const result = ensureDependencyNEW(dep, false, "ask", "memory:create_entities");

  console.log("\n[NEW] Result:", JSON.stringify(result, null, 2));

  assertExists(result);
  assertEquals(result.approvalRequired, true);
  assertEquals(result.approvalType, "tool_permission");
  assertEquals((result as ToolPermissionApprovalRequired).toolId, "memory:create_entities");
  assertEquals((result as ToolPermissionApprovalRequired).needsInstallation, true);
});

Deno.test("Compare OLD vs NEW format", () => {
  const dep: McpDependency = {
    name: "filesystem",
    version: "1.0.0",
    type: "stdio",
    install: "npx @anthropic/mcp-filesystem",
    integrity: "sha256-yyy",
  };

  const oldResult = ensureDependencyOLD(dep, false, "ask");
  const newResult = ensureDependencyNEW(dep, false, "ask", "filesystem:read_file");

  console.log("\n=== COMPARISON ===");
  console.log("\nOLD format:");
  console.log(JSON.stringify(oldResult, null, 2));
  console.log("\nNEW format:");
  console.log(JSON.stringify(newResult, null, 2));

  // Les deux doivent avoir approvalRequired: true
  assertExists(oldResult);
  assertExists(newResult);
  assertEquals(oldResult.approvalRequired, true);
  assertEquals(newResult.approvalRequired, true);

  // Mais approvalType est différent
  assertEquals(oldResult.approvalType, "dependency");
  assertEquals(newResult.approvalType, "tool_permission");
});

// =============================================================================
// Test du vrai problème: stdio-command.ts formatApprovalRequired
// =============================================================================

Deno.test("formatApprovalRequired handles tool_permission", () => {
  // Simule ce que fait formatApprovalRequired dans stdio-command.ts

  const approvalResult: ToolPermissionApprovalRequired = {
    approvalRequired: true,
    approvalType: "tool_permission",
    workflowId: "test-uuid-123",
    toolId: "memory:create_entities",
    namespace: "memory",
    needsInstallation: true,
    dependency: {
      name: "memory",
      version: "1.0.0",
      type: "stdio",
      install: "npx @anthropic/mcp-memory",
      integrity: "sha256-xxx",
    },
    description: "Allow memory:create_entities? (will install memory@1.0.0)",
  };

  // Vérifie que le format de sortie est correct
  if (approvalResult.approvalType === "tool_permission") {
    const data = {
      status: "approval_required",
      approval_type: "tool_permission",
      workflow_id: approvalResult.workflowId,
      description: approvalResult.description,
      context: {
        tool: "pml_execute",
        tool_id: approvalResult.toolId,
        namespace: approvalResult.namespace,
        needs_installation: approvalResult.needsInstallation,
        dependency: approvalResult.dependency ? {
          name: approvalResult.dependency.name,
          version: approvalResult.dependency.version,
          install: approvalResult.dependency.install,
        } : undefined,
      },
      options: ["continue", "abort"],
    };

    console.log("\n=== FORMATTED OUTPUT ===");
    console.log(JSON.stringify(data, null, 2));

    assertEquals(data.status, "approval_required");
    assertEquals(data.approval_type, "tool_permission");
    assertEquals(data.context.tool_id, "memory:create_entities");
    assertEquals(data.context.needs_installation, true);
  }
});
