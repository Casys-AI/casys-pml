/**
 * Dependency Manager Tests
 *
 * Tests for DepState, integrity verification, and env checker.
 *
 * @module tests/dep_manager_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { DepState } from "../src/loader/dep-state.ts";
import {
  checkEnvVars,
  formatMissingEnvError,
  getEnvStatus,
  validateEnvForDep,
} from "../src/loader/env-checker.ts";
import {
  computeStringHash,
  isValidIntegrityFormat,
  parseIntegrity,
} from "../src/loader/integrity.ts";
import type { McpDependency } from "../src/loader/types.ts";

// ============================================================================
// DepState Tests
// ============================================================================

Deno.test("DepState - creates with default state path", () => {
  const state = new DepState();
  const path = state.getStatePath();
  assertEquals(path.includes(".pml/deps.json"), true);
});

Deno.test("DepState - creates with custom state path", () => {
  const state = new DepState("/tmp/test-deps.json");
  assertEquals(state.getStatePath(), "/tmp/test-deps.json");
});

Deno.test("DepState - load creates default state if file not found", async () => {
  const state = new DepState("/tmp/nonexistent-deps.json");
  await state.load();

  // Should have empty installed list
  assertEquals(state.getAllInstalled(), []);
});

Deno.test("DepState - isInstalled returns false for missing dep", async () => {
  const state = new DepState("/tmp/test-deps-2.json");
  await state.load();

  assertEquals(state.isInstalled("nonexistent", "1.0.0"), false);
});

Deno.test("DepState - markInstalled and isInstalled work together", async () => {
  const state = new DepState("/tmp/test-deps-3.json");
  await state.load();

  const dep: McpDependency = {
    name: "test-dep",
    type: "stdio",
    install: "npx test-dep@1.0.0",
    version: "1.0.0",
    integrity: "sha256-abc123",
  };

  state.markInstalled(dep, "sha256-abc123");

  assertEquals(state.isInstalled("test-dep", "1.0.0"), true);
  assertEquals(state.isInstalled("test-dep", "2.0.0"), false);
});

Deno.test("DepState - getInstalled returns dep info", async () => {
  const state = new DepState("/tmp/test-deps-4.json");
  await state.load();

  const dep: McpDependency = {
    name: "info-dep",
    type: "stdio",
    install: "npx info-dep@1.0.0",
    version: "1.0.0",
    integrity: "sha256-xyz789",
  };

  state.markInstalled(dep, "sha256-xyz789", "/path/to/install");

  const installed = state.getInstalled("info-dep");
  assertExists(installed);
  assertEquals(installed.name, "info-dep");
  assertEquals(installed.version, "1.0.0");
  assertEquals(installed.integrity, "sha256-xyz789");
  assertEquals(installed.installPath, "/path/to/install");
});

Deno.test("DepState - markUninstalled removes dep", async () => {
  const state = new DepState("/tmp/test-deps-5.json");
  await state.load();

  const dep: McpDependency = {
    name: "remove-dep",
    type: "stdio",
    install: "npx remove-dep@1.0.0",
    version: "1.0.0",
    integrity: "sha256-remove",
  };

  state.markInstalled(dep, "sha256-remove");
  assertEquals(state.isInstalled("remove-dep", "1.0.0"), true);

  state.markUninstalled("remove-dep");
  assertEquals(state.isInstalled("remove-dep", "1.0.0"), false);
});

Deno.test("DepState - needsUpdate detects version mismatch", async () => {
  const state = new DepState("/tmp/test-deps-6.json");
  await state.load();

  const oldDep: McpDependency = {
    name: "update-dep",
    type: "stdio",
    install: "npx update-dep@1.0.0",
    version: "1.0.0",
    integrity: "sha256-old",
  };

  state.markInstalled(oldDep, "sha256-old");

  const newDep: McpDependency = {
    name: "update-dep",
    type: "stdio",
    install: "npx update-dep@2.0.0",
    version: "2.0.0",
    integrity: "sha256-new",
  };

  assertEquals(state.needsUpdate(oldDep), false);
  assertEquals(state.needsUpdate(newDep), true);
});

Deno.test("DepState - getMissingOrOutdated returns correct deps", async () => {
  const state = new DepState("/tmp/test-deps-7.json");
  await state.load();

  const installedDep: McpDependency = {
    name: "installed",
    type: "stdio",
    install: "npx installed@1.0.0",
    version: "1.0.0",
    integrity: "sha256-installed",
  };

  state.markInstalled(installedDep, "sha256-installed");

  const deps: McpDependency[] = [
    installedDep,
    {
      name: "missing",
      type: "stdio",
      install: "npx missing@1.0.0",
      version: "1.0.0",
      integrity: "sha256-missing",
    },
    {
      name: "installed",
      type: "stdio",
      install: "npx installed@2.0.0",
      version: "2.0.0", // Version mismatch
      integrity: "sha256-updated",
    },
  ];

  const missing = state.getMissingOrOutdated(deps);
  assertEquals(missing.length, 2);
  assertEquals(missing[0].name, "missing");
  assertEquals(missing[1].name, "installed");
  assertEquals(missing[1].version, "2.0.0");
});

// ============================================================================
// Environment Checker Tests
// ============================================================================

Deno.test("checkEnvVars - returns valid when all vars present", () => {
  // PATH is typically always set
  const result = checkEnvVars(["PATH"]);
  assertEquals(result.valid, true);
  assertEquals(result.missing.length, 0);
  assertEquals(result.present.includes("PATH"), true);
});

Deno.test("checkEnvVars - returns invalid when var missing", () => {
  const result = checkEnvVars(["DEFINITELY_NOT_SET_12345"]);
  assertEquals(result.valid, false);
  assertEquals(result.missing, ["DEFINITELY_NOT_SET_12345"]);
});

Deno.test("checkEnvVars - handles mixed present/missing", () => {
  const result = checkEnvVars(["PATH", "NOT_SET_VAR_XYZ"]);
  assertEquals(result.valid, false);
  assertEquals(result.present.includes("PATH"), true);
  assertEquals(result.missing.includes("NOT_SET_VAR_XYZ"), true);
});

Deno.test("formatMissingEnvError - formats single var", () => {
  const error = formatMissingEnvError("test-dep", ["API_KEY"]);
  assertEquals(error.includes("test-dep"), true);
  assertEquals(error.includes("API_KEY"), true);
  assertEquals(error.includes("export API_KEY"), true);
});

Deno.test("formatMissingEnvError - formats multiple vars", () => {
  const error = formatMissingEnvError("test-dep", ["VAR_1", "VAR_2"]);
  assertEquals(error.includes("VAR_1"), true);
  assertEquals(error.includes("VAR_2"), true);
  assertEquals(error.includes("1 more"), true);
});

Deno.test("formatMissingEnvError - returns empty for no missing", () => {
  const error = formatMissingEnvError("test-dep", []);
  assertEquals(error, "");
});

Deno.test("validateEnvForDep - throws on missing vars", () => {
  try {
    validateEnvForDep("test-dep", ["MISSING_VAR_ABC"]);
    throw new Error("Should have thrown");
  } catch (error) {
    assertEquals(error instanceof Error, true);
    assertEquals((error as Error).message.includes("MISSING_VAR_ABC"), true);
  }
});

Deno.test("validateEnvForDep - passes with empty required", () => {
  // Should not throw
  validateEnvForDep("test-dep", []);
});

Deno.test("getEnvStatus - returns set/unset status", () => {
  const status = getEnvStatus(["PATH", "NOT_SET_STATUS_VAR"]);
  assertEquals(status["PATH"], "set");
  assertEquals(status["NOT_SET_STATUS_VAR"], "unset");
});

// ============================================================================
// Integrity Tests
// ============================================================================

Deno.test("computeStringHash - computes sha256", async () => {
  const hash = await computeStringHash("test content");
  assertEquals(hash.startsWith("sha256-"), true);
  assertEquals(hash.length > 10, true);
});

Deno.test("computeStringHash - same input gives same hash", async () => {
  const hash1 = await computeStringHash("consistent input");
  const hash2 = await computeStringHash("consistent input");
  assertEquals(hash1, hash2);
});

Deno.test("computeStringHash - different input gives different hash", async () => {
  const hash1 = await computeStringHash("input a");
  const hash2 = await computeStringHash("input b");
  assertEquals(hash1 !== hash2, true);
});

Deno.test("parseIntegrity - parses valid sha256", () => {
  const result = parseIntegrity("sha256-abc123def456");
  assertExists(result);
  assertEquals(result.algorithm, "sha256");
  assertEquals(result.hash, "abc123def456");
});

Deno.test("parseIntegrity - returns null for invalid format", () => {
  assertEquals(parseIntegrity("md5-abc123"), null);
  assertEquals(parseIntegrity("sha256abc123"), null);
  assertEquals(parseIntegrity(""), null);
});

Deno.test("isValidIntegrityFormat - validates correctly", () => {
  assertEquals(isValidIntegrityFormat("sha256-abc123"), true);
  assertEquals(isValidIntegrityFormat("sha256-ABCDEF"), true);
  assertEquals(isValidIntegrityFormat("md5-abc"), false);
  assertEquals(isValidIntegrityFormat("invalid"), false);
});

// ============================================================================
// Dependency Installer Integrity Tests
// ============================================================================

import { DepInstaller } from "../src/loader/dep-installer.ts";
import { IntegrityError } from "../src/loader/types.ts";

Deno.test("DepInstaller - verifies integrity against npm registry", async () => {
  const state = new DepState("/tmp/test-installer-integrity.json");
  await state.load();

  const installer = new DepInstaller(state);

  const dep: McpDependency = {
    name: "@modelcontextprotocol/server-memory",
    type: "stdio",
    install: "npx @modelcontextprotocol/server-memory@1.0.0",
    version: "1.0.0",
    integrity: "sha256-intentionally-wrong-hash", // Wrong hash!
  };

  // Mock fetch to return npm registry response
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("registry.npmjs.org")) {
      return new Response(
        JSON.stringify({
          name: "@modelcontextprotocol/server-memory",
          version: "1.0.0",
          dist: {
            shasum: "abc123def456",
            integrity: "sha512-realintegrityhash",
            tarball: "https://registry.npmjs.org/...",
          },
        }),
        { status: 200 },
      );
    }
    return originalFetch(url);
  };

  try {
    await installer.install(dep);
    throw new Error("Should have thrown IntegrityError");
  } catch (error) {
    // Should throw IntegrityError because hash doesn't match
    if (error instanceof Error && error.message === "Should have thrown IntegrityError") {
      throw error; // Re-throw our test failure
    }
    // Could be IntegrityError or InstallError wrapping it
    assertEquals(
      error instanceof IntegrityError ||
        (error instanceof Error && error.message.includes("Integrity")),
      true,
      `Expected IntegrityError, got: ${error}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("DepInstaller - passes with matching sha1 integrity", async () => {
  const state = new DepState("/tmp/test-installer-sha1.json");
  await state.load();

  const installer = new DepInstaller(state);

  const dep: McpDependency = {
    name: "test-package",
    type: "stdio",
    install: "npx test-package@1.0.0",
    version: "1.0.0",
    integrity: "sha1-abc123def456", // SHA-1 format
  };

  // Mock fetch to return matching shasum
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("registry.npmjs.org")) {
      return new Response(
        JSON.stringify({
          name: "test-package",
          version: "1.0.0",
          dist: {
            shasum: "abc123def456", // Matches!
            tarball: "https://registry.npmjs.org/...",
          },
        }),
        { status: 200 },
      );
    }
    return originalFetch(url);
  };

  try {
    const result = await installer.install(dep);
    assertEquals(result.success, true);
    assertEquals(result.integrity, "sha1-abc123def456");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
