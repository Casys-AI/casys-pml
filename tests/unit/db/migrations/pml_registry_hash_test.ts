/**
 * Unit tests for Migration 040: pml_registry hash column
 *
 * Tests cover:
 * - AC1: hash column is exposed in pml_registry VIEW for capabilities
 * - AC2: hash column is NULL for mcp-tools (they don't have stored hashes)
 * - AC3: McpRegistryService uses stored hash instead of recomputing
 */

import { assertEquals, assertExists } from "@std/assert";
import { createPmlRegistryHashColumnMigration } from "../../../../src/db/migrations/040_pml_registry_hash_column.ts";
import { PGliteClient } from "../../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../../src/db/migrations.ts";
import { McpRegistryService } from "../../../../src/mcp/registry/mcp-registry.service.ts";

function getTestDbPath(testName: string): string {
  return `memory://${testName}-${crypto.randomUUID()}`;
}

async function insertTestDataWithHash(db: PGliteClient): Promise<{
  toolId: string;
  capabilityId: string;
  patternId: string;
  expectedHash: string;
}> {
  // Insert tool (no hash)
  const toolId = "filesystem:read_file";
  await db.exec(`
    INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
    VALUES ('${toolId}', 'filesystem', 'read_file', 'Read a file', '{}')
    ON CONFLICT (tool_id) DO NOTHING
  `);

  // Insert workflow_pattern
  const patternHash = crypto.randomUUID().substring(0, 8);
  const dummyEmbedding = `[${Array(1024).fill("0").join(",")}]`;

  const patternResult = await db.query(`
    INSERT INTO workflow_pattern (description, pattern_hash, dag_structure, intent_embedding)
    VALUES ('Test capability description', '${patternHash}', '{"nodes": [], "edges": []}', '${dummyEmbedding}')
    RETURNING pattern_id
  `);
  const patternId = patternResult[0].pattern_id as string;

  // Insert capability_records with specific hash
  const expectedHash = "ab12";
  const capResult = await db.query(`
    INSERT INTO capability_records (org, project, namespace, action, hash, workflow_pattern_id)
    VALUES ('testorg', 'testproj', 'testns', 'testaction', '${expectedHash}', '${patternId}')
    RETURNING id
  `);
  const capabilityId = capResult[0].id as string;

  return { toolId, capabilityId, patternId, expectedHash };
}

Deno.test("Migration 040 - AC1: pml_registry VIEW exposes hash column for capabilities", async () => {
  const client = new PGliteClient(getTestDbPath("ac1-hash-exposed"));
  await client.connect();

  try {
    const runner = new MigrationRunner(client);
    await runner.runUp(getAllMigrations());

    const { expectedHash } = await insertTestDataWithHash(client);

    // Query the VIEW for capability
    const result = await client.query(`
      SELECT record_type, org, project, namespace, action, hash
      FROM pml_registry
      WHERE record_type = 'capability'
    `);

    assertEquals(result.length, 1);
    assertEquals(result[0].record_type, "capability");
    assertEquals(result[0].hash, expectedHash);
    assertEquals(result[0].org, "testorg");
    assertEquals(result[0].namespace, "testns");
    assertEquals(result[0].action, "testaction");
  } finally {
    await client.close();
  }
});

Deno.test("Migration 040 - AC2: pml_registry VIEW returns NULL hash for mcp-tools", async () => {
  const client = new PGliteClient(getTestDbPath("ac2-null-hash-tools"));
  await client.connect();

  try {
    const runner = new MigrationRunner(client);
    await runner.runUp(getAllMigrations());

    await insertTestDataWithHash(client);

    // Query the VIEW for mcp-tool
    const result = await client.query(`
      SELECT record_type, name, hash
      FROM pml_registry
      WHERE record_type = 'mcp-tool'
    `);

    assertEquals(result.length, 1);
    assertEquals(result[0].record_type, "mcp-tool");
    assertEquals(result[0].hash, null);
  } finally {
    await client.close();
  }
});

Deno.test("Migration 040 - AC3: McpRegistryService.getByFqdn uses stored hash", async () => {
  const client = new PGliteClient(getTestDbPath("ac3-service-uses-hash"));
  await client.connect();

  try {
    const runner = new MigrationRunner(client);
    await runner.runUp(getAllMigrations());

    const { expectedHash } = await insertTestDataWithHash(client);

    const service = new McpRegistryService(client);

    // Request with correct hash should succeed
    const fqdnWithCorrectHash = `testorg.testproj.testns.testaction.${expectedHash}`;
    const entry = await service.getByFqdn(fqdnWithCorrectHash);

    assertExists(entry);
    assertEquals(entry?.fqdn, fqdnWithCorrectHash);

    // Request with wrong hash should fail (return null)
    const fqdnWithWrongHash = `testorg.testproj.testns.testaction.xxxx`;
    const notFound = await service.getByFqdn(fqdnWithWrongHash);

    assertEquals(notFound, null);
  } finally {
    await client.close();
  }
});

Deno.test("Migration 040 - AC3: Service uses stored hash, not recomputed from name:description", async () => {
  const client = new PGliteClient(getTestDbPath("ac3-no-recompute"));
  await client.connect();

  try {
    const runner = new MigrationRunner(client);
    await runner.runUp(getAllMigrations());

    // Insert capability with known hash that differs from what would be computed
    const patternHash = crypto.randomUUID().substring(0, 8);
    const dummyEmbedding = `[${Array(1024).fill("0").join(",")}]`;

    await client.query(`
      INSERT INTO workflow_pattern (description, pattern_hash, dag_structure, intent_embedding)
      VALUES ('Description that would compute different hash', '${patternHash}', '{"nodes": [], "edges": []}', '${dummyEmbedding}')
      RETURNING pattern_id
    `);

    // The stored hash "9999" is intentionally different from what would be computed
    // from "testns:testaction:Description that would compute different hash"
    const storedHash = "9999";
    await client.exec(`
      INSERT INTO capability_records (org, project, namespace, action, hash)
      VALUES ('myorg', 'myproj', 'testns', 'testaction', '${storedHash}')
    `);

    const service = new McpRegistryService(client);

    // Should find it with stored hash
    const entry = await service.getByFqdn(`myorg.myproj.testns.testaction.${storedHash}`);
    assertExists(entry);
    assertEquals(entry?.fqdn.endsWith(storedHash), true);

    // Should NOT find it with a hash computed from name:description
    // (which would be different since description is "Description that would compute different hash")
    const computedHash = "xxxx"; // Any hash that isn't "9999"
    const notFound = await service.getByFqdn(`myorg.myproj.testns.testaction.${computedHash}`);
    assertEquals(notFound, null);
  } finally {
    await client.close();
  }
});

Deno.test("Migration 040 - rollback removes hash column from VIEW", async () => {
  const client = new PGliteClient(getTestDbPath("rollback"));
  await client.connect();

  try {
    const runner = new MigrationRunner(client);
    await runner.runUp(getAllMigrations());

    // Verify hash column exists by selecting it
    const resultBefore = await client.query(`
      SELECT hash FROM pml_registry LIMIT 1
    `);
    // Query succeeds means column exists
    assertExists(resultBefore);

    // Rollback migration 040
    const migration = createPmlRegistryHashColumnMigration();
    await migration.down(client);

    // Verify hash column is gone - query should fail
    let hashColumnGone = false;
    try {
      await client.query(`SELECT hash FROM pml_registry LIMIT 1`);
    } catch {
      hashColumnGone = true;
    }
    assertEquals(hashColumnGone, true, "hash column should be removed after rollback");
  } finally {
    await client.close();
  }
});
