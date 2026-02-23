/**
 * Init Module Tests
 *
 * @module tests/init
 */

import { assertEquals } from "jsr:@std/assert@1";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { initProject } from "../src/init/mod.ts";

const TEST_DIR = await Deno.makeTempDir({ prefix: "pml_test_" });

Deno.test("init - creates .mcp.json and .pml.json", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");

  try {
    Deno.chdir(testDir);
    Deno.env.set("PML_WORKSPACE", testDir);

    const result = await initProject({ yes: true });

    assertEquals(result.success, true);
    assertEquals(await exists(join(testDir, ".mcp.json")), true);
    assertEquals(await exists(join(testDir, ".pml.json")), true);
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) Deno.env.set("PML_WORKSPACE", originalEnv);
    else Deno.env.delete("PML_WORKSPACE");
  }
});

Deno.test("init - .mcp.json has correct structure", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");

  try {
    Deno.chdir(testDir);
    Deno.env.set("PML_WORKSPACE", testDir);

    await initProject({ yes: true, port: 4000 });

    const content = await Deno.readTextFile(join(testDir, ".mcp.json"));
    const config = JSON.parse(content);

    // Claude Code format: { mcpServers: { pml: {...} } }
    assertEquals(config.mcpServers.pml.type, "stdio");
    assertEquals(config.mcpServers.pml.command, "pml");
    assertEquals(config.mcpServers.pml.args, ["stdio"]);
    // Note: env is NOT included by default - pml stdio auto-loads from .env
    assertEquals(config.mcpServers.pml.env, undefined);
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) Deno.env.set("PML_WORKSPACE", originalEnv);
    else Deno.env.delete("PML_WORKSPACE");
  }
});

Deno.test("init - .pml.json has correct structure", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");

  try {
    Deno.chdir(testDir);
    Deno.env.set("PML_WORKSPACE", testDir);

    await initProject({
      yes: true,
      port: 5000,
      cloudUrl: "https://custom.pml.ai",
    });

    const content = await Deno.readTextFile(join(testDir, ".pml.json"));
    const config = JSON.parse(content);

    // Basic structure - version should match package version
    assertEquals(typeof config.version, "string");
    assertEquals(config.version.match(/^\d+\.\d+\.\d+$/) !== null, true);
    assertEquals(config.workspace, "."); // Portable - dynamic detection via resolveWorkspace()

    // Cloud config - apiKey removed (loaded from .env directly)
    assertEquals(config.cloud.url, "https://custom.pml.ai");
    assertEquals(config.cloud.apiKey, undefined);

    // Server config - NOT included in .pml.json (only used for `pml serve`)
    // Port is passed to .mcp.json args instead
    assertEquals(config.server, undefined);

    // Permissions - empty arrays (checkPermission defaults to "ask" for unmatched)
    assertEquals(Array.isArray(config.permissions.allow), true);
    assertEquals(Array.isArray(config.permissions.deny), true);
    assertEquals(Array.isArray(config.permissions.ask), true);

    // All empty - implicit "ask for everything" behavior
    assertEquals(config.permissions.allow.length, 0);
    assertEquals(config.permissions.deny.length, 0);
    assertEquals(config.permissions.ask.length, 0);
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) Deno.env.set("PML_WORKSPACE", originalEnv);
    else Deno.env.delete("PML_WORKSPACE");
  }
});

Deno.test("init - backs up existing .mcp.json with --yes", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");

  try {
    Deno.chdir(testDir);
    Deno.env.set("PML_WORKSPACE", testDir);

    // Create existing config
    const existingConfig = { existing: { type: "stdio", command: "test" } };
    await Deno.writeTextFile(
      join(testDir, ".mcp.json"),
      JSON.stringify(existingConfig),
    );

    const result = await initProject({ yes: true });

    assertEquals(result.success, true);
    assertEquals(await exists(join(testDir, ".mcp.json.backup")), true);

    // Verify backup contains original content
    const backupContent = await Deno.readTextFile(
      join(testDir, ".mcp.json.backup"),
    );
    assertEquals(JSON.parse(backupContent), existingConfig);
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) Deno.env.set("PML_WORKSPACE", originalEnv);
    else Deno.env.delete("PML_WORKSPACE");
  }
});

Deno.test("init - force overwrites without backup", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");

  try {
    Deno.chdir(testDir);
    Deno.env.set("PML_WORKSPACE", testDir);

    // Create existing config
    await Deno.writeTextFile(
      join(testDir, ".mcp.json"),
      JSON.stringify({ existing: true }),
    );

    const result = await initProject({ force: true });

    assertEquals(result.success, true);
    assertEquals(result.backedUp, undefined);
    assertEquals(await exists(join(testDir, ".mcp.json.backup")), false);
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) Deno.env.set("PML_WORKSPACE", originalEnv);
    else Deno.env.delete("PML_WORKSPACE");
  }
});

Deno.test("init - sets API key when provided", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");

  try {
    Deno.chdir(testDir);
    Deno.env.set("PML_WORKSPACE", testDir);

    await initProject({ yes: true, apiKey: "test-key-123" });

    const content = await Deno.readTextFile(join(testDir, ".mcp.json"));
    const config = JSON.parse(content);

    assertEquals(config.mcpServers.pml.env.PML_API_KEY, "test-key-123");
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) Deno.env.set("PML_WORKSPACE", originalEnv);
    else Deno.env.delete("PML_WORKSPACE");
  }
});

// Cleanup
Deno.test({
  name: "cleanup test directory",
  fn: async () => {
    await Deno.remove(TEST_DIR, { recursive: true });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
