/**
 * Debug Test: Trace the exact flow
 *
 * Trace où le code passe pour comprendre le problème
 */

import { assertEquals, assertExists } from "@std/assert";
import { CapabilityLoader } from "../../src/loader/capability-loader.ts";
import type { ApprovalRequiredResult } from "../../src/loader/types.ts";

// Mock server avec logs détaillés
async function createMockServer(port: number): Promise<{ url: string; close: () => void }> {
  const handler = (req: Request): Response => {
    const url = new URL(req.url);
    console.log(`\n[MockServer] ${req.method} ${url.pathname}`);

    // Registry fetch
    if (url.pathname.startsWith("/api/registry/")) {
      const requestedFqdn = url.pathname.replace("/api/registry/", "");
      console.log(`[MockServer] Registry request for FQDN: ${requestedFqdn}`);

      // Parse le FQDN: pml.mcp.memory.create_entities → memory
      const parts = requestedFqdn.split(".");
      const serverName = parts.length >= 3 ? parts[2] : requestedFqdn;
      console.log(`[MockServer] Extracted serverName from FQDN: ${serverName}`);

      // Simule une capability STDIO (comme memory, filesystem, etc.)
      const response = {
        fqdn: requestedFqdn,
        type: "stdio",  // ← Type stdio
        routing: "client",
        description: "Test stdio capability",
        tools: [requestedFqdn],
        // Install info pour le MCP stdio lui-même
        install: {
          command: "npx",
          args: [`@anthropic/mcp-${serverName}`],
          envRequired: [],
        },
        // PAS de mcpDeps pour un MCP stdio simple
        // (le MCP est lui-même le "dependency")
        mcpDeps: [],
      };

      console.log(`[MockServer] Returning:`, JSON.stringify(response, null, 2));
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  };

  const server = Deno.serve({ port, hostname: "127.0.0.1" }, handler);
  return { url: `http://127.0.0.1:${port}`, close: () => server.shutdown() };
}

Deno.test({
  name: "Trace: stdio capability with ask permission",
  async fn() {
    const server = await createMockServer(19878);
    const tempDir = await Deno.makeTempDir();

    try {
      console.log("\n========================================");
      console.log("TEST: Stdio capability with ask permission");
      console.log("========================================\n");

      const loader = await CapabilityLoader.create({
        cloudUrl: server.url,
        workspace: tempDir,
        permissions: {
          allow: [],
          deny: [],
          ask: ["*"],
        },
        sandboxEnabled: false,
        tracingEnabled: false,
      });

      console.log("\n>>> Calling memory:create_entities...\n");
      const result = await loader.call("memory:create_entities", { test: true });

      console.log("\n>>> Result:");
      console.log(JSON.stringify(result, null, 2));

      if (CapabilityLoader.isApprovalRequired(result)) {
        const approval = result as ApprovalRequiredResult;
        console.log(`\n>>> Approval required!`);
        console.log(`    approvalType: ${approval.approvalType}`);
        if ("toolId" in approval) {
          console.log(`    toolId: ${(approval as any).toolId}`);
        }
        if ("namespace" in approval) {
          console.log(`    namespace: ${(approval as any).namespace}`);
        }
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

Deno.test({
  name: "Trace: stdio capability with allow permission",
  async fn() {
    const server = await createMockServer(19879);
    const tempDir = await Deno.makeTempDir();

    try {
      console.log("\n========================================");
      console.log("TEST: Stdio capability with allow permission");
      console.log("Expecting: auto-install (no approval)");
      console.log("========================================\n");

      const loader = await CapabilityLoader.create({
        cloudUrl: server.url,
        workspace: tempDir,
        permissions: {
          allow: ["memory:*"],  // ← Allow memory namespace
          deny: [],
          ask: [],
        },
        sandboxEnabled: false,
        tracingEnabled: false,
      });

      console.log("\n>>> Calling memory:create_entities...\n");

      try {
        const result = await loader.call("memory:create_entities", { test: true });
        console.log("\n>>> Result:");
        console.log(JSON.stringify(result, null, 2));

        const isApproval = CapabilityLoader.isApprovalRequired(result);
        console.log(`\n>>> isApprovalRequired: ${isApproval}`);

        if (isApproval) {
          console.log("❌ UNEXPECTED: Got approval_required when should be allowed!");
          const approval = result as any;
          console.log(`    toolId: ${approval.toolId}`);
          console.log(`    Permission should match: memory:* vs ${approval.toolId}`);
        } else {
          console.log("✓ No approval required (as expected)");
        }
      } catch (error) {
        console.log("\n>>> Error (may be expected - install will fail):");
        console.log((error as Error).message);
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
