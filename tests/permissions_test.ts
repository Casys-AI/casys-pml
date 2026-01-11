/**
 * Permissions Tests
 *
 * Tests for permission loading and checking (Story 14.2, AC5)
 */

import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import {
  checkPermission,
  createPermissionChecker,
  getPermissionsSummary,
  loadUserPermissions,
  loadUserPermissionsSync,
  matchesPattern,
} from "../src/permissions/loader.ts";
import type { PmlPermissions } from "../src/types.ts";

// Silent logger for tests
const silentLogger = {
  info: () => {},
  warn: () => {},
};

// ============================================================================
// matchesPattern tests
// ============================================================================

Deno.test("permissions - matchesPattern matches wildcard (*)", () => {
  assertEquals(matchesPattern("filesystem:read_file", ["*"]), true);
  assertEquals(matchesPattern("github:create_issue", ["*"]), true);
  assertEquals(matchesPattern("anything", ["*"]), true);
});

Deno.test("permissions - matchesPattern matches namespace wildcard", () => {
  assertEquals(matchesPattern("filesystem:read_file", ["filesystem:*"]), true);
  assertEquals(matchesPattern("filesystem:write_file", ["filesystem:*"]), true);
  assertEquals(matchesPattern("github:create_issue", ["filesystem:*"]), false);
});

Deno.test("permissions - matchesPattern matches exact tool name", () => {
  assertEquals(
    matchesPattern("filesystem:read_file", ["filesystem:read_file"]),
    true,
  );
  assertEquals(
    matchesPattern("filesystem:write_file", ["filesystem:read_file"]),
    false,
  );
});

Deno.test("permissions - matchesPattern matches any pattern in array", () => {
  const patterns = ["json:*", "math:*", "filesystem:read_file"];

  assertEquals(matchesPattern("json:parse", patterns), true);
  assertEquals(matchesPattern("math:sum", patterns), true);
  assertEquals(matchesPattern("filesystem:read_file", patterns), true);
  assertEquals(matchesPattern("filesystem:write_file", patterns), false);
});

Deno.test("permissions - matchesPattern returns false for empty patterns", () => {
  assertEquals(matchesPattern("anything", []), false);
});

// ============================================================================
// checkPermission tests
// ============================================================================

Deno.test("permissions - checkPermission allows explicitly allowed tools", () => {
  const permissions: PmlPermissions = {
    allow: ["json:*", "math:*"],
    deny: [],
    ask: [],
  };

  assertEquals(checkPermission("json:parse", permissions), "allowed");
  assertEquals(checkPermission("math:sum", permissions), "allowed");
});

Deno.test("permissions - checkPermission denies explicitly denied tools", () => {
  const permissions: PmlPermissions = {
    allow: [],
    deny: ["dangerous:*"],
    ask: [],
  };

  assertEquals(checkPermission("dangerous:delete_all", permissions), "denied");
});

Deno.test("permissions - checkPermission deny takes precedence over allow", () => {
  const permissions: PmlPermissions = {
    allow: ["*"], // Allow everything
    deny: ["dangerous:*"], // But deny dangerous
    ask: [],
  };

  assertEquals(checkPermission("json:parse", permissions), "allowed");
  assertEquals(checkPermission("dangerous:delete_all", permissions), "denied");
});

Deno.test("permissions - checkPermission returns ask for tools in ask list", () => {
  const permissions: PmlPermissions = {
    allow: [],
    deny: [],
    ask: ["filesystem:*"],
  };

  assertEquals(checkPermission("filesystem:read_file", permissions), "ask");
  assertEquals(checkPermission("filesystem:write_file", permissions), "ask");
});

Deno.test("permissions - checkPermission defaults to ask for unknown tools", () => {
  const permissions: PmlPermissions = {
    allow: ["json:*"],
    deny: ["dangerous:*"],
    ask: ["filesystem:*"],
  };

  // Tool not in any list should default to ask
  assertEquals(checkPermission("unknown:tool", permissions), "ask");
});

Deno.test("permissions - checkPermission respects priority: deny > allow > ask > default", () => {
  const permissions: PmlPermissions = {
    allow: ["*"],
    deny: ["dangerous:*"],
    ask: ["filesystem:*"],
  };

  // deny overrides all
  assertEquals(checkPermission("dangerous:delete", permissions), "denied");

  // allow if not denied
  assertEquals(checkPermission("json:parse", permissions), "allowed");
});

// ============================================================================
// loadUserPermissions tests
// ============================================================================

Deno.test("permissions - loadUserPermissions returns defaults when no config", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    const result = await loadUserPermissions(testDir, silentLogger);

    assertEquals(result.source, "defaults");
    // Empty arrays = implicit "ask for everything" via checkPermission() default
    assertEquals(result.permissions.allow, []);
    assertEquals(result.permissions.deny, []);
    assertEquals(result.permissions.ask, []);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("permissions - loadUserPermissions loads from .pml.json", async () => {
  const testDir = await Deno.makeTempDir();
  const configPath = join(testDir, ".pml.json");

  const config = {
    version: "0.1.0",
    workspace: testDir,
    cloud: { url: "https://test.com", apiKey: "key" },
    server: { port: 3003 },
    permissions: {
      allow: ["json:*", "math:*"],
      deny: ["dangerous:*"],
      ask: ["filesystem:*"],
    },
  };

  await Deno.writeTextFile(configPath, JSON.stringify(config));

  try {
    const result = await loadUserPermissions(testDir, silentLogger);

    assertEquals(result.source, "config");
    assertExists(result.configPath);
    assertEquals(result.permissions.allow, ["json:*", "math:*"]);
    assertEquals(result.permissions.deny, ["dangerous:*"]);
    assertEquals(result.permissions.ask, ["filesystem:*"]);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("permissions - loadUserPermissions uses user config as THE truth (no fallback)", async () => {
  const testDir = await Deno.makeTempDir();
  const configPath = join(testDir, ".pml.json");

  // User config with ONLY allow - no deny or ask
  const config = {
    version: "0.1.0",
    workspace: testDir,
    cloud: { url: "https://test.com", apiKey: "key" },
    server: { port: 3003 },
    permissions: {
      allow: ["json:*"],
      // No deny or ask - should NOT fall back to defaults
    },
  };

  await Deno.writeTextFile(configPath, JSON.stringify(config));

  try {
    const result = await loadUserPermissions(testDir, silentLogger);

    assertEquals(result.source, "config");
    assertEquals(result.permissions.allow, ["json:*"]);
    // Should be empty, NOT fallback to defaults
    assertEquals(result.permissions.deny, []);
    assertEquals(result.permissions.ask, []);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("permissions - loadUserPermissionsSync works synchronously", async () => {
  const testDir = await Deno.makeTempDir();
  const configPath = join(testDir, ".pml.json");

  const config = {
    version: "0.1.0",
    workspace: testDir,
    cloud: { url: "https://test.com", apiKey: "key" },
    server: { port: 3003 },
    permissions: {
      allow: ["sync:*"],
      deny: [],
      ask: [],
    },
  };

  await Deno.writeTextFile(configPath, JSON.stringify(config));

  try {
    const result = loadUserPermissionsSync(testDir, silentLogger);

    assertEquals(result.source, "config");
    assertEquals(result.permissions.allow, ["sync:*"]);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("permissions - loadUserPermissions handles missing permissions section", async () => {
  const testDir = await Deno.makeTempDir();
  const configPath = join(testDir, ".pml.json");

  // Config without permissions section
  const config = {
    version: "0.1.0",
    workspace: testDir,
    cloud: { url: "https://test.com", apiKey: "key" },
    server: { port: 3003 },
    // No permissions section
  };

  await Deno.writeTextFile(configPath, JSON.stringify(config));

  try {
    const result = await loadUserPermissions(testDir, silentLogger);

    // Config exists but no permissions = use config source with empty permissions
    // (checkPermission defaults to "ask" for unmatched tools)
    assertEquals(result.source, "config");
    assertEquals(result.permissions.ask, []);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("permissions - loadUserPermissions handles invalid JSON", async () => {
  const testDir = await Deno.makeTempDir();
  const configPath = join(testDir, ".pml.json");

  await Deno.writeTextFile(configPath, "invalid json {{{");

  try {
    const result = await loadUserPermissions(testDir, silentLogger);

    // Should fall back to safe defaults on parse error
    // Empty arrays = implicit "ask for everything" via checkPermission() default
    assertEquals(result.source, "defaults");
    assertEquals(result.permissions.ask, []);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

// ============================================================================
// createPermissionChecker tests
// ============================================================================

Deno.test("permissions - createPermissionChecker creates bound checker", () => {
  const permissions: PmlPermissions = {
    allow: ["json:*"],
    deny: ["dangerous:*"],
    ask: ["filesystem:*"],
  };

  const check = createPermissionChecker(permissions);

  assertEquals(check("json:parse"), "allowed");
  assertEquals(check("dangerous:delete"), "denied");
  assertEquals(check("filesystem:read"), "ask");
});

// ============================================================================
// getPermissionsSummary tests
// ============================================================================

Deno.test("permissions - getPermissionsSummary formats permissions", () => {
  const permissions: PmlPermissions = {
    allow: ["json:*", "math:*"],
    deny: ["dangerous:*"],
    ask: ["filesystem:*"],
  };

  const summary = getPermissionsSummary(permissions);

  assertEquals(summary.includes("Allow:"), true);
  assertEquals(summary.includes("json:*"), true);
  assertEquals(summary.includes("Deny:"), true);
  assertEquals(summary.includes("dangerous:*"), true);
  assertEquals(summary.includes("Ask:"), true);
  assertEquals(summary.includes("filesystem:*"), true);
});

Deno.test("permissions - getPermissionsSummary handles empty permissions", () => {
  const permissions: PmlPermissions = {
    allow: [],
    deny: [],
    ask: [],
  };

  const summary = getPermissionsSummary(permissions);

  assertEquals(summary.includes("No explicit permissions configured"), true);
});
