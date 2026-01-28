/**
 * Debug Script: Nested Capability Execution Flow
 *
 * Ce script teste le flow de routing pour les nested capabilities.
 * Exécuter avec: deno run --allow-all tests/debug/nested-capability-debug.ts
 *
 * Problème investigué (tech-spec 2026-01-22):
 * - `mcp.code.exec_*()` retourne `{ state: { deps: {}, data: "a,b,c" } }`
 * - Au lieu du résultat transformé `"A-B-C"`
 */

import { getDb } from "../../src/db/mod.ts";
import { CapabilityStore } from "../../src/capabilities/capability-store.ts";
import { CapabilityRegistry } from "../../src/capabilities/capability-registry.ts";
import { getUserScope } from "../../src/lib/user.ts";

// Configuration
const DEBUG = true;

function log(msg: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[DEBUG] ${msg}`, data ? JSON.stringify(data, null, 2) : "");
  }
}

async function main() {
  console.log("=== Nested Capability Debug Script ===\n");

  // 1. Initialize DB
  log("Initializing database...");
  const db = await getDb();
  log("Database initialized");

  // 2. Create stores
  const capabilityStore = new CapabilityStore(db);
  const capabilityRegistry = new CapabilityRegistry(db);

  // 3. Check for capabilities with "code:" namespace
  log("Querying capabilities with namespace='code'...");

  const codeCapabilities = await db.query(`
    SELECT id, namespace, action, org, project, workflow_pattern_id
    FROM capability_records
    WHERE namespace = 'code'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log("\n--- Capabilities with namespace='code' ---");
  if (codeCapabilities.rows.length === 0) {
    console.log("❌ NO capabilities found with namespace='code'");
    console.log("   This means routeToCapability() will return null and fallback to MCP server");
  } else {
    console.log(`✅ Found ${codeCapabilities.rows.length} capabilities:`);
    for (const row of codeCapabilities.rows) {
      console.log(`   - ${row.namespace}:${row.action} (id: ${row.id?.slice(0, 8)}...)`);
      console.log(`     org: ${row.org}, project: ${row.project}`);
      console.log(`     workflow_pattern_id: ${row.workflow_pattern_id}`);
    }
  }

  // 4. Test scope resolution
  log("\nTesting scope resolution...");
  const scope = await getUserScope(null); // null userId = local user
  console.log("\n--- Scope for null userId ---");
  console.log(`   org: ${scope.org}, project: ${scope.project}`);

  // 5. Test capability resolution for a specific name
  if (codeCapabilities.rows.length > 0) {
    const testCap = codeCapabilities.rows[0];
    const capName = `${testCap.namespace}:${testCap.action}`;
    log(`\nTesting resolveByName('${capName}', scope)...`);

    const resolved = await capabilityRegistry.resolveByName(capName, scope);
    console.log("\n--- resolveByName result ---");
    if (resolved) {
      console.log(`✅ Capability resolved:`);
      console.log(`   id: ${resolved.id}`);
      console.log(`   workflowPatternId: ${resolved.workflowPatternId}`);

      // 6. Load the workflow pattern
      if (resolved.workflowPatternId) {
        log(`\nLoading workflow pattern ${resolved.workflowPatternId}...`);
        const pattern = await capabilityStore.findById(resolved.workflowPatternId);
        console.log("\n--- Workflow Pattern ---");
        if (pattern) {
          console.log(`✅ Pattern found:`);
          console.log(`   id: ${pattern.id}`);
          console.log(`   description: ${pattern.description?.slice(0, 100)}...`);
          console.log(`   codeSnippet preview: ${pattern.codeSnippet?.slice(0, 200)}...`);
        } else {
          console.log("❌ Pattern NOT found - this would cause executeCapability to fail");
        }
      }
    } else {
      console.log("❌ Capability NOT resolved");
      console.log("   This means the capability won't be found by RpcRouter");
    }
  }

  // 7. Check if there are MCP clients registered for "code" server
  console.log("\n--- MCP Server Check ---");
  console.log("Note: Cannot check MCP clients from this script");
  console.log("If there's no 'code' MCP server, routeToMcpServer will fail with:");
  console.log('   "MCP server \\"code\\" not connected and no capability \\"code:xxx\\" found"');

  // 8. Summary
  console.log("\n=== ANALYSIS SUMMARY ===");

  if (codeCapabilities.rows.length === 0) {
    console.log(`
ISSUE IDENTIFIED: No capabilities with namespace='code' in database

The prefix 'code:' is used by the DAG system for pseudo-operations like:
- code:filter, code:map, code:split (JS operations)
- These are NOT MCP tools and NOT database capabilities

When sandbox calls mcp.code.exec_*():
1. RpcRouter.routeToCapability('code', 'exec_*') → returns null (no such capability)
2. RpcRouter.routeToMcpServer('code', 'exec_*') → fails (no 'code' MCP server)
3. Error is returned to sandbox

POSSIBLE ROOT CAUSE:
- The capability was auto-generated with namespace='code' but wasn't saved to DB
- OR the capability exists but scope doesn't match
- OR the workflowPatternId is null/invalid
`);
  } else {
    console.log(`
Capabilities exist with namespace='code'. Need to verify:
1. Scope matches (org/project alignment)
2. workflowPatternId is valid
3. Pattern has codeSnippet
`);
  }

  await db.close();
  console.log("\nDebug script completed.");
}

main().catch(console.error);
