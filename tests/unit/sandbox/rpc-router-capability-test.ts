/**
 * Quick test to verify RpcRouter routes to capabilities correctly
 */

import { assertEquals, assertExists } from "@std/assert";

// Check if capability_records has code:exec_4631a670
Deno.test("capability exists in DB", async () => {
  const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
  const client = new Client("postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys");
  await client.connect();

  try {
    const result = await client.queryObject<{ id: string; namespace: string; action: string }>`
      SELECT id, namespace, action
      FROM capability_records
      WHERE namespace = 'code' AND action = 'exec_4631a670'
    `;

    console.log("Capability records found:", result.rows);
    assertEquals(result.rows.length, 1, "Should find exactly one capability");
    assertEquals(result.rows[0].namespace, "code");
    assertEquals(result.rows[0].action, "exec_4631a670");
  } finally {
    await client.end();
  }
});

// Check trace count before and after a simple execution
Deno.test("trace count after nested capability", async () => {
  const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
  const client = new Client("postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys");
  await client.connect();

  try {
    // Get initial count
    const before = await client.queryObject<{ count: string }>`SELECT COUNT(*) as count FROM execution_trace`;
    const initialCount = parseInt(before.rows[0].count);
    console.log("Initial trace count:", initialCount);

    // The test would need to actually call the capability via WorkerBridge
    // This is just a placeholder to show the expected flow

    console.log("Note: To fully test, need to call capability via pml:execute and check traces");
  } finally {
    await client.end();
  }
});
