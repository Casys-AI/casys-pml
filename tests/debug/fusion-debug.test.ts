/**
 * Debug test to understand why fusion isn't happening
 */

import { PGliteClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import { StaticStructureBuilder } from "../../src/capabilities/static-structure-builder.ts";
import { staticStructureToDag } from "../../src/dag/static-to-dag-converter.ts";
import { optimizeDAG, canFuseTasks } from "../../src/dag/dag-optimizer.ts";
import { isPureOperation } from "../../src/capabilities/pure-operations.ts";
import type { Task } from "../../src/graphrag/types.ts";

const testCode = `
const data = "a,b,c";
return data.split(",").map(x => x.toUpperCase()).join("-");
`;

async function setupTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(":memory:");
  await db.connect();
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());
  return db;
}

Deno.test("DEBUG: Check fusion pipeline", async () => {
  const db = await setupTestDb();

  console.log("\n=== STEP 1: Parse code to static structure ===");
  const builder = new StaticStructureBuilder(db);
  const staticStructure = await builder.buildStaticStructure(testCode);

  console.log("Nodes:");
  for (const n of staticStructure.nodes) {
    console.log(`  - ${n.id}: tool=${"tool" in n ? n.tool : "N/A"}, type=${n.type}, metadata=${JSON.stringify("metadata" in n ? n.metadata : {})}`);
  }
  console.log("\nEdges:");
  for (const e of staticStructure.edges) {
    console.log(`  - ${e.from} --[${e.type}]--> ${e.to}`);
  }

  console.log("\n=== STEP 2: Convert to logical DAG ===");
  const logicalDAG = staticStructureToDag(staticStructure);
  console.log("Logical tasks:");
  for (const t of logicalDAG.tasks) {
    console.log(`  - ${t.id}: tool=${t.tool}, type=${t.type}, dependsOn=[${t.dependsOn.join(",")}], metadata=${JSON.stringify(t.metadata)}`);
  }

  console.log("\n=== STEP 3: Check isPureOperation for each tool ===");
  for (const task of logicalDAG.tasks) {
    if (task.tool) {
      const taskWithMeta = task as Task & { metadata?: { pure?: boolean } };
      console.log(`  ${task.tool}: isPure=${isPureOperation(task.tool)}, metadata.pure=${taskWithMeta.metadata?.pure}`);
    }
  }

  console.log("\n=== STEP 4: Check canFuseTasks ===");
  const codeTasks = logicalDAG.tasks.filter(t => t.type === "code_execution" && t.tool?.startsWith("code:"));
  console.log("Code tasks for fusion check:");
  for (const t of codeTasks) {
    const task = t as Task & { metadata?: { pure?: boolean; executable?: boolean } };
    console.log(`  - ${t.id}: tool=${t.tool}, pure=${task.metadata?.pure}, executable=${task.metadata?.executable}`);
  }

  if (codeTasks.length > 1) {
    const canFuse = canFuseTasks(codeTasks);
    console.log(`\ncanFuseTasks([all code tasks]) = ${canFuse}`);

    // Try with just executable tasks
    const executableTasks = codeTasks.filter(t => {
      const task = t as Task & { metadata?: { executable?: boolean } };
      return task.metadata?.executable !== false;
    });
    console.log(`\nExecutable code tasks only: ${executableTasks.length}`);
    for (const t of executableTasks) {
      const task = t as Task & { metadata?: { pure?: boolean; executable?: boolean } };
      console.log(`  - ${t.id}: tool=${t.tool}, pure=${task.metadata?.pure}`);
    }
    if (executableTasks.length > 1) {
      const canFuseExec = canFuseTasks(executableTasks);
      console.log(`canFuseTasks([executable only]) = ${canFuseExec}`);
    }
  }

  console.log("\n=== STEP 5: Optimize DAG ===");
  const optimizedDAG = optimizeDAG(logicalDAG);
  console.log("Physical tasks:");
  for (const t of optimizedDAG.tasks) {
    const task = t as Task & { metadata?: Record<string, unknown> };
    console.log(`  - ${t.id}: tool=${t.tool}, type=${t.type}, metadata=${JSON.stringify(task.metadata)}`);
  }

  console.log("\nphysicalToLogical mapping:");
  for (const [phys, logical] of optimizedDAG.physicalToLogical) {
    console.log(`  ${phys} -> [${logical.join(", ")}] ${logical.length > 1 ? "*** FUSED ***" : ""}`);
  }

  console.log("\n=== STEP 6: Generate Logical Trace ===");
  // Simulate physical execution result (only the executable task ran)
  const physicalResults = new Map<string, { taskId: string; status: "success" | "error" | "failed_safe"; output: unknown; executionTimeMs: number }>();
  for (const task of optimizedDAG.tasks) {
    physicalResults.set(task.id, {
      taskId: task.id,
      status: "success" as const,
      output: "A-B-C", // Simulated result
      executionTimeMs: 100,
    });
  }

  // Import trace generator dynamically
  const { generateLogicalTrace } = await import("../../src/dag/trace-generator.ts");
  const logicalTrace = generateLogicalTrace(optimizedDAG, physicalResults);

  console.log("executedPath:", logicalTrace.executedPath);
  console.log("toolsUsed:", logicalTrace.toolsUsed);
  console.log("taskResults count:", logicalTrace.taskResults.length);
  for (const r of logicalTrace.taskResults) {
    console.log(`  - ${r.taskId}: tool=${r.tool}, success=${r.success}, duration=${r.durationMs}ms`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Logical tasks: ${logicalDAG.tasks.length}`);
  console.log(`Physical tasks: ${optimizedDAG.tasks.length}`);
  console.log(`executedPath includes ALL ops: ${logicalTrace.executedPath.length === logicalDAG.tasks.length ? "YES ✓" : "NO ✗"}`);
  console.log(`  Expected: ${logicalDAG.tasks.length}, Got: ${logicalTrace.executedPath.length}`);

  await db.close();
});
