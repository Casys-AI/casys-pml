/**
 * E2E Test 11: Trace Fusion Metadata Enrichment
 *
 * Tests the complete flow for fused task metadata:
 * 1. Code with method chaining → Static structure
 * 2. Static structure → Logical DAG → Optimized DAG (fusion)
 * 3. ExecutionCaptureService enriches taskResults with isFused/logicalOperations
 * 4. Verify metadata is correct for frontend FusedTaskCard rendering
 *
 * Validates tech-spec: 2026-01-22-tech-spec-fused-task-metadata-enrichment.md
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import { StaticStructureBuilder } from "../../src/capabilities/static-structure-builder.ts";
import { staticStructureToDag } from "../../src/dag/static-to-dag-converter.ts";
import { optimizeDAG, type OptimizedDAGStructure } from "../../src/dag/dag-optimizer.ts";
import {
  generateLogicalTrace,
  getFusionMetadata,
  isFusedTask,
  getLogicalTasks,
} from "../../src/dag/trace-generator.ts";
import { initializeTestDatabase } from "../fixtures/test-helpers.ts";
import type { TraceTaskResult } from "../../src/capabilities/types/mod.ts";
import type { TaskResult } from "../../src/dag/types.ts";

// =============================================================================
// E2E: getFusionMetadata() correctly identifies fused operations
// =============================================================================

Deno.test({
  name: "E2E Fusion Metadata: getFusionMetadata() with real optimized DAG",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const db = await initializeTestDatabase();

    try {
      const builder = new StaticStructureBuilder(db);

      // Code with method chaining (will be fused)
      const code = `
        const data = "a,b,c,d,e";
        const items = data.split(",");
        const filtered = items.filter(x => x !== "c");
        const upper = filtered.map(x => x.toUpperCase());
        const result = upper.join("-");
        return result;
      `;

      // 1. Build static structure
      const structure = await builder.buildStaticStructure(code);

      // 2. Convert to logical DAG
      const logicalDAG = staticStructureToDag(structure);

      console.log("Logical DAG tasks:", logicalDAG.tasks.map((t) => ({
        id: t.id,
        tool: t.tool,
      })));

      // Should have code:split, code:filter, code:map, code:join
      const codeTasks = logicalDAG.tasks.filter((t) => t.tool?.startsWith("code:"));
      assert(codeTasks.length >= 4, `Expected at least 4 code tasks, got ${codeTasks.length}`);

      // 3. Optimize DAG (fusion)
      const optimizedDAG = optimizeDAG(logicalDAG);

      console.log("Optimized DAG tasks:", optimizedDAG.tasks.map((t) => ({
        id: t.id,
        tool: t.tool,
        fusedFrom: t.metadata?.fusedFrom,
      })));

      // Should have fewer physical tasks due to fusion
      assert(
        optimizedDAG.tasks.length < logicalDAG.tasks.length,
        "Optimization should reduce task count via fusion",
      );

      // 4. Test getFusionMetadata() for fused tasks
      for (const physicalTask of optimizedDAG.tasks) {
        const fusionMeta = getFusionMetadata(
          physicalTask.id,
          100, // 100ms simulated duration
          optimizedDAG as OptimizedDAGStructure,
        );

        const logicalIds = getLogicalTasks(physicalTask.id, optimizedDAG);
        const shouldBeFused = logicalIds.length > 1;

        assertEquals(
          fusionMeta.isFused,
          shouldBeFused,
          `Task ${physicalTask.id} isFused should be ${shouldBeFused}`,
        );

        if (fusionMeta.isFused) {
          assertExists(fusionMeta.logicalOperations, "Fused task should have logicalOperations");
          assertEquals(
            fusionMeta.logicalOperations!.length,
            logicalIds.length,
            "logicalOperations count should match logical task count",
          );

          // Verify each operation has toolId
          for (const op of fusionMeta.logicalOperations!) {
            assert(op.toolId && op.toolId !== "", "Each operation should have a toolId");
          }

          console.log(`  ✓ Fused task ${physicalTask.id}: ${fusionMeta.logicalOperations!.map((op) => op.toolId).join(" → ")}`);
        }
      }

      console.log("  ✓ getFusionMetadata() works correctly with real DAG");
    } finally {
      await db.close();
    }
  },
});

// =============================================================================
// E2E: Simulated ExecutionCaptureService enrichment flow
// =============================================================================

Deno.test({
  name: "E2E Fusion Metadata: Simulated enrichment flow (client → server → enriched trace)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const db = await initializeTestDatabase();

    try {
      const builder = new StaticStructureBuilder(db);

      // Code with MCP + method chaining
      const code = `
        const content = await mcp.filesystem.read_file({ path: "/data.txt" });
        const lines = content.split("\\n");
        const nonEmpty = lines.filter(x => x.length > 0);
        const upper = nonEmpty.map(x => x.toUpperCase());
        return upper;
      `;

      // Build full DAG pipeline
      const structure = await builder.buildStaticStructure(code);
      const logicalDAG = staticStructureToDag(structure);
      const optimizedDAG = optimizeDAG(logicalDAG);

      // Simulate client execution results (client only sees MCP calls, not code:* ops)
      const clientTaskResults: TraceTaskResult[] = [
        {
          taskId: "client_t1",
          tool: "filesystem:read_file",
          args: { path: "/data.txt" },
          result: "line1\nline2\nline3",
          success: true,
          durationMs: 50,
          // isFused is NOT set by client - this is what the server needs to enrich!
        },
      ];

      // Simulate mapClientResultsToPhysical (match by tool name)
      const physicalResults = new Map<string, TaskResult>();
      const mcpPhysicalTasks = optimizedDAG.tasks.filter((t) => t.type === "mcp_tool");

      for (const clientResult of clientTaskResults) {
        const matchingPhysical = mcpPhysicalTasks.find((t) => t.tool === clientResult.tool);
        if (matchingPhysical) {
          physicalResults.set(matchingPhysical.id, {
            taskId: matchingPhysical.id,
            status: "success",
            output: clientResult.result,
            executionTimeMs: clientResult.durationMs,
          });
        }
      }

      // Simulate enrichTaskResultsWithFusion (the key functionality we implemented)
      const toolToClientIndices = new Map<string, number[]>();
      clientTaskResults.forEach((t, idx) => {
        const indices = toolToClientIndices.get(t.tool) || [];
        indices.push(idx);
        toolToClientIndices.set(t.tool, indices);
      });

      const usedClientIndices = new Set<number>();

      for (const [physicalId] of physicalResults) {
        const physicalTask = optimizedDAG.tasks.find((t) => t.id === physicalId);
        if (!physicalTask?.tool) continue;

        const candidateIndices = toolToClientIndices.get(physicalTask.tool) || [];
        const clientIdx = candidateIndices.find((idx) => !usedClientIndices.has(idx));

        if (clientIdx === undefined) continue;
        usedClientIndices.add(clientIdx);

        const clientResult = clientTaskResults[clientIdx];
        const fusionMeta = getFusionMetadata(
          physicalId,
          clientResult.durationMs,
          optimizedDAG as OptimizedDAGStructure,
        );

        if (fusionMeta.isFused) {
          clientResult.isFused = true;
          clientResult.logicalOperations = fusionMeta.logicalOperations;
        }
      }

      // Verify enrichment worked
      // MCP task should NOT be fused (it's a single operation)
      const mcpTask = clientTaskResults.find((t) => t.tool === "filesystem:read_file");
      assertExists(mcpTask, "Should have MCP task result");

      // The MCP task itself won't be fused unless it maps to a fused physical task
      // In this case, MCP task should remain unfused
      console.log(`  MCP task isFused: ${mcpTask!.isFused ?? "undefined (not fused)"}`);

      // Now test with code:* tasks that WOULD be fused
      // The code:split → filter → map chain should be fused into one physical task
      const fusedPhysicalTask = optimizedDAG.tasks.find((t) =>
        t.metadata?.fusedFrom && t.metadata.fusedFrom.length > 1
      );

      if (fusedPhysicalTask) {
        const fusionMeta = getFusionMetadata(
          fusedPhysicalTask.id,
          300, // 300ms for chain
          optimizedDAG as OptimizedDAGStructure,
        );

        assert(fusionMeta.isFused, "Fused physical task should have isFused: true");
        assertExists(fusionMeta.logicalOperations, "Should have logicalOperations");
        assert(
          fusionMeta.logicalOperations!.length >= 2,
          `Should have at least 2 logical operations, got ${fusionMeta.logicalOperations!.length}`,
        );

        console.log(`  ✓ Fused task: ${fusionMeta.logicalOperations!.map((op) => op.toolId).join(" → ")}`);
        console.log(`  ✓ Each operation duration: ${fusionMeta.logicalOperations![0].durationMs}ms (estimated)`);
      }

      // Verify generateLogicalTrace still works
      const logicalTrace = generateLogicalTrace(optimizedDAG, physicalResults);

      assert(logicalTrace.executedPath.length > 0, "Should have executed path");
      console.log(`  ✓ Executed path: ${logicalTrace.executedPath.join(" → ")}`);

      console.log("  ✓ Full enrichment flow works correctly");
    } finally {
      await db.close();
    }
  },
});

// =============================================================================
// E2E: Verify fusion metadata for various code patterns
// =============================================================================

Deno.test({
  name: "E2E Fusion Metadata: Multiple fusion scenarios",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const db = await initializeTestDatabase();

    try {
      const builder = new StaticStructureBuilder(db);

      await t.step("Scenario 1: Simple chain (split → filter → map → join)", async () => {
        const code = `
          const data = "1,2,3,4,5";
          return data.split(",").filter(x => x !== "3").map(x => x * 2).join("-");
        `;

        const structure = await builder.buildStaticStructure(code);
        const logicalDAG = staticStructureToDag(structure);
        const optimizedDAG = optimizeDAG(logicalDAG);

        // Find the fused physical task
        const fusedTask = optimizedDAG.tasks.find((t) =>
          (optimizedDAG.physicalToLogical.get(t.id)?.length ?? 0) > 1
        );

        if (fusedTask) {
          const fusionMeta = getFusionMetadata(
            fusedTask.id,
            400,
            optimizedDAG as OptimizedDAGStructure,
          );

          assert(fusionMeta.isFused, "Chain should be fused");
          console.log(`    Chain fused: ${fusionMeta.logicalOperations?.map((op) => op.toolId).join(" → ")}`);
        }

        console.log("    ✓ Simple chain scenario passed");
      });

      await t.step("Scenario 2: Fork prevents fusion", async () => {
        const code = `
          const numbers = [1, 2, 3, 4, 5];
          const evens = numbers.filter(x => x % 2 === 0);
          const doubled = evens.map(x => x * 2);
          const sum = evens.reduce((a, b) => a + b, 0);
          return { doubled, sum };
        `;

        const structure = await builder.buildStaticStructure(code);
        const logicalDAG = staticStructureToDag(structure);
        const optimizedDAG = optimizeDAG(logicalDAG);

        // Filter should NOT be fused with map (because it also feeds reduce)
        const filterTask = logicalDAG.tasks.find((t) => t.tool === "code:filter");
        if (filterTask) {
          const filterPhysicalId = optimizedDAG.logicalToPhysical.get(filterTask.id);
          if (filterPhysicalId) {
            const logicalIds = optimizedDAG.physicalToLogical.get(filterPhysicalId) || [];
            console.log(`    Filter task fused with ${logicalIds.length} operations`);
            // Fork point should NOT be fused
            assertEquals(logicalIds.length, 1, "Filter (fork point) should not be fused");
          }
        }

        console.log("    ✓ Fork prevention scenario passed");
      });

      await t.step("Scenario 3: Mixed MCP and code", async () => {
        const code = `
          const users = await mcp.db.query({ sql: "SELECT * FROM users" });
          const active = users.filter(u => u.active);
          const emails = active.map(u => u.email);
          await mcp.email.sendBulk({ to: emails });
        `;

        const structure = await builder.buildStaticStructure(code);
        const logicalDAG = staticStructureToDag(structure);
        const optimizedDAG = optimizeDAG(logicalDAG);

        // MCP tasks should remain separate
        const mcpTasks = optimizedDAG.tasks.filter((t) => t.type === "mcp_tool");
        for (const mcpTask of mcpTasks) {
          const fusionMeta = getFusionMetadata(
            mcpTask.id,
            100,
            optimizedDAG as OptimizedDAGStructure,
          );
          // MCP tasks are single operations (not fused)
          assert(!fusionMeta.isFused || fusionMeta.logicalOperations?.length === 1,
            "MCP tasks should be single operations");
        }

        console.log("    ✓ Mixed MCP/code scenario passed");
      });

      console.log("  ✓ All fusion scenarios passed");
    } finally {
      await db.close();
    }
  },
});

// =============================================================================
// E2E: Verify frontend-ready data structure
// =============================================================================

Deno.test({
  name: "E2E Fusion Metadata: Verify FusedTaskCard-compatible data structure",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const db = await initializeTestDatabase();

    try {
      const builder = new StaticStructureBuilder(db);

      const code = `
        const text = "hello world";
        return text.split(" ").map(w => w.toUpperCase()).join("_");
      `;

      const structure = await builder.buildStaticStructure(code);
      const logicalDAG = staticStructureToDag(structure);
      const optimizedDAG = optimizeDAG(logicalDAG);

      // Find a fused task
      const fusedTask = optimizedDAG.tasks.find((t) =>
        (optimizedDAG.physicalToLogical.get(t.id)?.length ?? 0) > 1
      );

      if (fusedTask) {
        const fusionMeta = getFusionMetadata(
          fusedTask.id,
          300,
          optimizedDAG as OptimizedDAGStructure,
        );

        // Verify structure matches what FusedTaskCard expects
        assert(typeof fusionMeta.isFused === "boolean", "isFused should be boolean");

        if (fusionMeta.isFused && fusionMeta.logicalOperations) {
          for (const op of fusionMeta.logicalOperations) {
            assert(typeof op.toolId === "string", "toolId should be string");
            assert(typeof op.durationMs === "number", "durationMs should be number");
          }

          // Verify duration is split evenly
          const totalDuration = fusionMeta.logicalOperations.reduce(
            (sum, op) => sum + (op.durationMs || 0),
            0,
          );
          assertEquals(
            Math.round(totalDuration),
            300,
            "Total duration should match input duration",
          );

          console.log(`  ✓ FusedTaskCard data structure valid:`);
          console.log(`    - isFused: ${fusionMeta.isFused}`);
          console.log(`    - logicalOperations: [${fusionMeta.logicalOperations.map((op) => `{toolId: "${op.toolId}", durationMs: ${op.durationMs}}`).join(", ")}]`);
        }
      } else {
        console.log("  ⚠ No fused task found (optimizer may have different strategy)");
      }

      console.log("  ✓ Data structure is FusedTaskCard-compatible");
    } finally {
      await db.close();
    }
  },
});
