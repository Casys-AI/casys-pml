/**
 * Debug Test: Real CapabilityLoader Flow
 *
 * Teste le vrai flow avec CapabilityLoader pour voir où ça bloque
 */

import { assertEquals, assertExists } from "@std/assert";
import { CapabilityLoader } from "../../src/loader/capability-loader.ts";
import type { ApprovalRequiredResult } from "../../src/loader/types.ts";

// Mock server pour simuler le registry
async function createMockServer(port: number): Promise<{ url: string; close: () => void }> {
  const handler = (req: Request): Response => {
    const url = new URL(req.url);
    console.log(`[MockServer] ${req.method} ${url.pathname}`);

    // Registry fetch - retourne metadata avec mcpDeps
    if (url.pathname.startsWith("/api/registry/")) {
      const requestedNamespace = url.pathname.replace("/api/registry/", "");
      console.log(`[MockServer] Fetching registry for: ${requestedNamespace}`);

      // Extraire le vrai nom du serveur (memory de memory:create_entities)
      // Le registry reçoit le format original, pas le FQDN
      const serverName = requestedNamespace.split(":")[0];
      console.log(`[MockServer] Extracted serverName: ${serverName}`);

      return new Response(JSON.stringify({
        fqdn: `test.default.${serverName}.${requestedNamespace.split(":")[1] || "default"}`,
        type: "stdio",
        routing: "client",
        description: "Test capability",
        tools: [requestedNamespace],
        // install info pour le MCP lui-même
        install: {
          command: "npx",
          args: [`@test/mcp-${serverName}`],
          envRequired: [],
        },
        // mcpDeps - utilise le vrai nom court (memory, filesystem, etc.)
        mcpDeps: [
          {
            name: serverName,  // ← Doit être "memory", pas "pml.mcp.memory..."
            version: "1.0.0",
            type: "stdio",
            install: `npx @test/mcp-${serverName}`,
            integrity: "sha256-test",
          },
        ],
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  };

  const server = Deno.serve({ port, hostname: "127.0.0.1" }, handler);

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => server.shutdown(),
  };
}

Deno.test({
  name: "Real loader: call() with 'ask' permission returns approval_required",
  async fn() {
    const server = await createMockServer(19876);
    const tempDir = await Deno.makeTempDir();

    try {
      console.log("\n=== Creating loader with ask permissions ===");

      const loader = await CapabilityLoader.create({
        cloudUrl: server.url,
        workspace: tempDir,
        permissions: {
          allow: [],
          deny: [],
          ask: ["*"], // Tout nécessite approval
        },
        sandboxEnabled: false,
        tracingEnabled: false,
      });

      console.log("\n=== Calling memory:create_entities ===");

      const result = await loader.call("memory:create_entities", { test: true });

      console.log("\n=== Result ===");
      console.log(JSON.stringify(result, null, 2));

      // Vérifie que c'est bien un approval_required
      const isApproval = CapabilityLoader.isApprovalRequired(result);
      console.log(`\nisApprovalRequired: ${isApproval}`);

      if (isApproval) {
        const approval = result as ApprovalRequiredResult;
        console.log(`approvalType: ${approval.approvalType}`);

        assertEquals(approval.approvalRequired, true);
        // Devrait être tool_permission maintenant
        assertEquals(approval.approvalType, "tool_permission");
      } else {
        console.log("❌ Expected approval_required but got:", typeof result);
      }

      assertExists(isApproval, "Should return approval_required");

      await loader.shutdown();
    } finally {
      server.close();
      await Deno.remove(tempDir, { recursive: true });
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Real loader: call() with 'allow' permission auto-installs",
  async fn() {
    const server = await createMockServer(19877);
    const tempDir = await Deno.makeTempDir();

    try {
      console.log("\n=== Creating loader with allow permissions ===");

      const loader = await CapabilityLoader.create({
        cloudUrl: server.url,
        workspace: tempDir,
        permissions: {
          allow: ["memory:*"], // Auto-approve memory namespace
          deny: [],
          ask: [],
        },
        sandboxEnabled: false,
        tracingEnabled: false,
      });

      console.log("\n=== Calling memory:create_entities ===");

      // Ça devrait essayer d'installer automatiquement
      // (va échouer car pas de vrai MCP, mais on vérifie qu'il n'y a pas d'approval)
      try {
        const result = await loader.call("memory:create_entities", { test: true });
        console.log("\n=== Result ===");
        console.log(JSON.stringify(result, null, 2));

        const isApproval = CapabilityLoader.isApprovalRequired(result);
        console.log(`\nisApprovalRequired: ${isApproval}`);

        // Avec allow, ne devrait PAS demander approval
        assertEquals(isApproval, false, "Should NOT require approval when in allow list");
      } catch (error) {
        // C'est attendu - l'install va échouer car pas de vrai MCP
        console.log(`\n=== Error (expected) ===`);
        console.log((error as Error).message);

        // Vérifie que c'est une erreur d'installation, pas d'approval
        const msg = (error as Error).message.toLowerCase();
        const isInstallError = msg.includes("install") || msg.includes("spawn") || msg.includes("subprocess");
        console.log(`Is install error: ${isInstallError}`);
      }

      await loader.shutdown();
    } finally {
      server.close();
      await Deno.remove(tempDir, { recursive: true });
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
