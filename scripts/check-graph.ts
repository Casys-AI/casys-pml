#!/usr/bin/env -S deno run --allow-all
/**
 * Quick diagnostic script to check graph state in database
 */

import { createDefaultClient } from "../src/db/client.ts";

const db = createDefaultClient();
await db.connect();

console.log("🔍 Checking graph state in database...\n");

// Check tool_embedding table
const tools = await db.query("SELECT COUNT(*) as count FROM tool_embedding");
console.log(`📊 Tools in database: ${tools[0].count}`);

// Check tool_dependency table
const deps = await db.query("SELECT COUNT(*) as count FROM tool_dependency");
console.log(`🔗 Edges in database: ${deps[0].count}`);

// Show all dependencies if any exist
if (parseInt(deps[0].count as string) > 0) {
  console.log("\n📋 All dependencies:");
  const allDeps = await db.query(`
    SELECT from_tool_id, to_tool_id, observed_count, confidence_score, last_observed
    FROM tool_dependency
    ORDER BY last_observed DESC
  `);

  for (const dep of allDeps) {
    console.log(`  ${dep.from_tool_id} → ${dep.to_tool_id} (count: ${dep.observed_count}, score: ${dep.confidence_score})`);
  }
} else {
  console.log("\n⚠️  No edges found in database");
}

await db.close();
console.log("\n✅ Done");
