/**
 * Workspace Resolution Tests
 *
 * Tests for workspace resolution module (Story 14.2, AC1-3)
 */

import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import {
  findProjectRoot,
  getWorkspaceSourceDescription,
  isValidWorkspace,
  PROJECT_MARKERS,
  resolveWorkspace,
  resolveWorkspaceWithDetails,
  type WorkspaceResult,
} from "../src/workspace.ts";

// Silent logger for tests
const silentLogger = {
  info: () => {},
  warn: () => {},
};

/**
 * Capturing logger for testing log output
 */
function createCapturingLogger() {
  const messages: { level: "info" | "warn"; message: string }[] = [];
  return {
    logger: {
      info: (msg: string) => messages.push({ level: "info", message: msg }),
      warn: (msg: string) => messages.push({ level: "warn", message: msg }),
    },
    messages,
  };
}

Deno.test("workspace - PROJECT_MARKERS contains expected markers", () => {
  assertEquals(PROJECT_MARKERS.includes(".git"), true);
  assertEquals(PROJECT_MARKERS.includes("deno.json"), true);
  assertEquals(PROJECT_MARKERS.includes("deno.jsonc"), true);
  assertEquals(PROJECT_MARKERS.includes("package.json"), true);
  assertEquals(PROJECT_MARKERS.includes(".pml.json"), true);
});

Deno.test("workspace - resolveWorkspace returns string path", () => {
  const result = resolveWorkspace(silentLogger);
  assertEquals(typeof result, "string");
  assertExists(result);
});

Deno.test("workspace - resolveWorkspaceWithDetails returns WorkspaceResult", () => {
  const result = resolveWorkspaceWithDetails(silentLogger);
  assertExists(result.path);
  assertEquals(["env", "detected", "fallback"].includes(result.source), true);
});

Deno.test("workspace - PML_WORKSPACE env var takes priority", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    // Set env var
    const originalEnv = Deno.env.get("PML_WORKSPACE");
    Deno.env.set("PML_WORKSPACE", testDir);

    const result = resolveWorkspaceWithDetails(silentLogger);

    assertEquals(result.path, testDir);
    assertEquals(result.source, "env");

    // Restore original env
    if (originalEnv) {
      Deno.env.set("PML_WORKSPACE", originalEnv);
    } else {
      Deno.env.delete("PML_WORKSPACE");
    }
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - findProjectRoot detects .git marker", async () => {
  const testDir = await Deno.makeTempDir();
  const subDir = join(testDir, "src", "lib");

  try {
    // Create nested structure with .git at root
    await Deno.mkdir(subDir, { recursive: true });
    await Deno.mkdir(join(testDir, ".git"));

    const result = findProjectRoot(subDir, [".git"]);

    assertExists(result);
    assertEquals(result!.path, testDir);
    assertEquals(result!.marker, ".git");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - findProjectRoot detects deno.json marker", async () => {
  const testDir = await Deno.makeTempDir();
  const subDir = join(testDir, "packages", "foo");

  try {
    await Deno.mkdir(subDir, { recursive: true });
    await Deno.writeTextFile(join(testDir, "deno.json"), "{}");

    const result = findProjectRoot(subDir, ["deno.json"]);

    assertExists(result);
    assertEquals(result!.path, testDir);
    assertEquals(result!.marker, "deno.json");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - findProjectRoot detects package.json marker", async () => {
  const testDir = await Deno.makeTempDir();
  const subDir = join(testDir, "node_modules", "foo");

  try {
    await Deno.mkdir(subDir, { recursive: true });
    await Deno.writeTextFile(join(testDir, "package.json"), "{}");

    const result = findProjectRoot(subDir, ["package.json"]);

    assertExists(result);
    assertEquals(result!.path, testDir);
    assertEquals(result!.marker, "package.json");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - findProjectRoot detects .pml.json marker", async () => {
  const testDir = await Deno.makeTempDir();
  const subDir = join(testDir, "src");

  try {
    await Deno.mkdir(subDir, { recursive: true });
    await Deno.writeTextFile(join(testDir, ".pml.json"), "{}");

    const result = findProjectRoot(subDir, [".pml.json"]);

    assertExists(result);
    assertEquals(result!.path, testDir);
    assertEquals(result!.marker, ".pml.json");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - findProjectRoot returns null when no marker found", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    // No markers in directory
    const result = findProjectRoot(testDir, [".nonexistent"]);
    assertEquals(result, null);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - findProjectRoot respects marker priority", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    // Create multiple markers
    await Deno.mkdir(join(testDir, ".git"));
    await Deno.writeTextFile(join(testDir, "deno.json"), "{}");

    // First marker in array wins
    const result = findProjectRoot(testDir, [".git", "deno.json"]);

    assertExists(result);
    assertEquals(result!.marker, ".git");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - isValidWorkspace returns true for existing directory", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    assertEquals(isValidWorkspace(testDir), true);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - isValidWorkspace returns false for non-existent path", () => {
  assertEquals(isValidWorkspace("/non/existent/path/xyz123"), false);
});

Deno.test("workspace - isValidWorkspace returns false for file (not directory)", async () => {
  const testFile = await Deno.makeTempFile();

  try {
    assertEquals(isValidWorkspace(testFile), false);
  } finally {
    await Deno.remove(testFile);
  }
});

Deno.test("workspace - getWorkspaceSourceDescription formats env source", () => {
  const result: WorkspaceResult = {
    path: "/test/path",
    source: "env",
  };
  assertEquals(
    getWorkspaceSourceDescription(result),
    "environment variable (PML_WORKSPACE)",
  );
});

Deno.test("workspace - getWorkspaceSourceDescription formats detected source", () => {
  const result: WorkspaceResult = {
    path: "/test/path",
    source: "detected",
    marker: ".git",
  };
  assertEquals(getWorkspaceSourceDescription(result), "detected via .git");
});

Deno.test("workspace - getWorkspaceSourceDescription formats fallback source", () => {
  const result: WorkspaceResult = {
    path: "/test/path",
    source: "fallback",
  };
  assertEquals(
    getWorkspaceSourceDescription(result),
    "current directory (fallback)",
  );
});

Deno.test("workspace - PML_WORKSPACE with invalid path falls back to detection", async () => {
  const testDir = await Deno.makeTempDir();
  // Create a marker so detection works
  await Deno.mkdir(join(testDir, ".git"));

  // Save original and change directory
  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");

  try {
    Deno.chdir(testDir);
    // Set invalid env var (non-existent path)
    Deno.env.set("PML_WORKSPACE", "/non/existent/path/xyz123");

    const result = resolveWorkspaceWithDetails(silentLogger);

    // Should fall back to detection, not use invalid env var
    assertEquals(result.source, "detected");
    assertEquals(result.path, testDir);
    assertEquals(result.marker, ".git");
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) {
      Deno.env.set("PML_WORKSPACE", originalEnv);
    } else {
      Deno.env.delete("PML_WORKSPACE");
    }
    await Deno.remove(testDir, { recursive: true });
  }
});

// ============================================================================
// L1: Log message content tests
// ============================================================================

Deno.test("workspace - logs info message when using valid PML_WORKSPACE", async () => {
  const testDir = await Deno.makeTempDir();
  const originalEnv = Deno.env.get("PML_WORKSPACE");
  const { logger, messages } = createCapturingLogger();

  try {
    Deno.env.set("PML_WORKSPACE", testDir);

    resolveWorkspaceWithDetails(logger);

    // Should log info about using env var
    assertEquals(messages.length, 1);
    assertEquals(messages[0].level, "info");
    assertEquals(messages[0].message.includes("PML_WORKSPACE"), true);
    assertEquals(messages[0].message.includes(testDir), true);
  } finally {
    if (originalEnv) {
      Deno.env.set("PML_WORKSPACE", originalEnv);
    } else {
      Deno.env.delete("PML_WORKSPACE");
    }
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - logs warning when PML_WORKSPACE is invalid", async () => {
  const testDir = await Deno.makeTempDir();
  await Deno.mkdir(join(testDir, ".git")); // Add marker for fallback

  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");
  const { logger, messages } = createCapturingLogger();

  try {
    Deno.chdir(testDir);
    Deno.env.set("PML_WORKSPACE", "/invalid/path/xyz");

    resolveWorkspaceWithDetails(logger);

    // Should log warning about invalid env var, then info about detection
    const warnMsg = messages.find((m) => m.level === "warn");
    assertExists(warnMsg);
    assertEquals(warnMsg.message.includes("not a valid directory"), true);
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) {
      Deno.env.set("PML_WORKSPACE", originalEnv);
    } else {
      Deno.env.delete("PML_WORKSPACE");
    }
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - logs info message when project root detected", async () => {
  const testDir = await Deno.makeTempDir();
  await Deno.mkdir(join(testDir, ".git"));

  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");
  const { logger, messages } = createCapturingLogger();

  try {
    Deno.chdir(testDir);
    Deno.env.delete("PML_WORKSPACE"); // Ensure no env var

    resolveWorkspaceWithDetails(logger);

    // Should log info about detected root
    assertEquals(messages.length, 1);
    assertEquals(messages[0].level, "info");
    assertEquals(messages[0].message.includes("Detected project root"), true);
    assertEquals(messages[0].message.includes(".git"), true);
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) {
      Deno.env.set("PML_WORKSPACE", originalEnv);
    } else {
      Deno.env.delete("PML_WORKSPACE");
    }
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("workspace - logs warning when falling back to CWD", async () => {
  // Use a deep nested temp dir whose parents up to /tmp have no markers.
  // To isolate from host contamination (e.g. stray package.json in /tmp),
  // we create a temp dir, place a .git marker (so traversal stops here),
  // then create a sub-directory with NO markers — findProjectRoot from the
  // sub-dir will find .git in parent = detected, not fallback.
  //
  // Instead, we test the fallback path by directly calling findProjectRoot
  // on a marker-free directory (no traversal beyond it) and verifying it
  // returns null, then verifying resolveWorkspaceWithDetails produces warnings
  // when findProjectRoot would return null.
  //
  // Simplest reliable approach: set PML_WORKSPACE to an invalid path so it
  // gets rejected, AND make sure findProjectRoot finds nothing by using
  // a directory whose entire ancestry has no markers — which we can't
  // guarantee on any host. So we test the log messages via a controlled path.

  const testDir = await Deno.makeTempDir();

  // Verify findProjectRoot returns null for this dir (if no markers above)
  const detected = findProjectRoot(testDir, [...PROJECT_MARKERS]);

  if (detected) {
    // Host has stray markers (e.g. /tmp/package.json) — skip this test
    console.log(
      `  [SKIP] Found marker "${detected.marker}" at ${detected.path}, ` +
        `cannot test CWD fallback on this host`,
    );
    await Deno.remove(testDir, { recursive: true });
    return;
  }

  const originalCwd = Deno.cwd();
  const originalEnv = Deno.env.get("PML_WORKSPACE");
  const { logger, messages } = createCapturingLogger();

  try {
    Deno.chdir(testDir);
    Deno.env.delete("PML_WORKSPACE");

    resolveWorkspaceWithDetails(logger);

    // Should log 2 warnings about fallback
    assertEquals(messages.filter((m) => m.level === "warn").length, 2);
    assertEquals(messages[0].message.includes("No project root detected"), true);
    assertEquals(messages[1].message.includes("PML_WORKSPACE"), true);
  } finally {
    Deno.chdir(originalCwd);
    if (originalEnv) {
      Deno.env.set("PML_WORKSPACE", originalEnv);
    } else {
      Deno.env.delete("PML_WORKSPACE");
    }
    await Deno.remove(testDir, { recursive: true });
  }
});
