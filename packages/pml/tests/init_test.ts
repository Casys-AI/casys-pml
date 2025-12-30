/**
 * Init Module Tests
 *
 * @module tests/init
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { initProject } from "../src/init/mod.ts";

const TEST_DIR = await Deno.makeTempDir({ prefix: "pml_test_" });

Deno.test("init - creates .mcp.json and .pml.json", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(testDir);

    const result = await initProject({ yes: true });

    assertEquals(result.success, true);
    assertEquals(await exists(join(testDir, ".mcp.json")), true);
    assertEquals(await exists(join(testDir, ".pml.json")), true);
  } finally {
    Deno.chdir(originalCwd);
  }
});

Deno.test("init - .mcp.json has correct structure", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(testDir);

    await initProject({ yes: true, port: 4000 });

    const content = await Deno.readTextFile(join(testDir, ".mcp.json"));
    const config = JSON.parse(content);

    assertEquals(config.pml.type, "http");
    assertEquals(config.pml.url, "http://localhost:4000/mcp");
    assertEquals(typeof config.pml.env, "object");
    assertStringIncludes(config.pml.env.PML_API_KEY, "${PML_API_KEY}");
  } finally {
    Deno.chdir(originalCwd);
  }
});

Deno.test("init - .pml.json has correct structure", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(testDir);

    await initProject({
      yes: true,
      port: 5000,
      cloudUrl: "https://custom.pml.ai",
    });

    const content = await Deno.readTextFile(join(testDir, ".pml.json"));
    const config = JSON.parse(content);

    // Basic structure
    assertEquals(config.version, "0.1.0");
    assertEquals(config.workspace, "."); // Portable - dynamic detection via resolveWorkspace()

    // Cloud config
    assertEquals(config.cloud.url, "https://custom.pml.ai");
    assertEquals(config.cloud.apiKey, "${PML_API_KEY}");

    // Server config
    assertEquals(config.server.port, 5000);

    // Permissions (Claude Code style)
    assertEquals(Array.isArray(config.permissions.allow), true);
    assertEquals(Array.isArray(config.permissions.deny), true);
    assertEquals(Array.isArray(config.permissions.ask), true);

    // Safe tools in allow
    assertEquals(config.permissions.allow.includes("json:*"), true);
    assertEquals(config.permissions.allow.includes("math:*"), true);

    // I/O tools in ask
    assertEquals(config.permissions.ask.includes("filesystem:*"), true);
    assertEquals(config.permissions.ask.includes("github:*"), true);
  } finally {
    Deno.chdir(originalCwd);
  }
});

Deno.test("init - backs up existing .mcp.json with --yes", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(testDir);

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
  }
});

Deno.test("init - force overwrites without backup", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(testDir);

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
  }
});

Deno.test("init - sets API key when provided", async () => {
  const testDir = await Deno.makeTempDir({ dir: TEST_DIR });
  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(testDir);

    await initProject({ yes: true, apiKey: "test-key-123" });

    const content = await Deno.readTextFile(join(testDir, ".mcp.json"));
    const config = JSON.parse(content);

    assertEquals(config.pml.env.PML_API_KEY, "test-key-123");
  } finally {
    Deno.chdir(originalCwd);
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
