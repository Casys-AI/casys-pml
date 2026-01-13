/**
 * Binary Resolver Tests (TDD)
 *
 * Tests for resolving and downloading MCP server binaries.
 *
 * @module tests/binary_resolver_test
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  type BinaryConfig,
  BinaryResolver,
  getOsArch,
  getBinaryAssetName,
  getCachePath,
} from "../src/loader/binary-resolver.ts";

// =============================================================================
// Unit Tests: OS/Arch Detection
// =============================================================================

Deno.test("getOsArch returns valid os and arch", () => {
  const { os, arch } = getOsArch();

  // OS should be one of the supported platforms
  const validOs = ["linux", "darwin", "windows"];
  assertEquals(validOs.includes(os), true, `Invalid OS: ${os}`);

  // Arch should be one of the supported architectures
  const validArch = ["x64", "arm64"];
  assertEquals(validArch.includes(arch), true, `Invalid arch: ${arch}`);
});

// =============================================================================
// Unit Tests: Binary Asset Name
// =============================================================================

Deno.test("getBinaryAssetName generates correct names", () => {
  assertEquals(
    getBinaryAssetName("mcp-std", "linux", "x64"),
    "mcp-std-linux-x64",
  );

  assertEquals(
    getBinaryAssetName("mcp-std", "darwin", "arm64"),
    "mcp-std-darwin-arm64",
  );

  assertEquals(
    getBinaryAssetName("mcp-std", "windows", "x64"),
    "mcp-std-windows-x64.exe",
  );
});

// =============================================================================
// Unit Tests: Cache Path
// =============================================================================

Deno.test("getCachePath returns correct path structure", () => {
  const path = getCachePath("mcp-std", "0.2.1");

  // Should contain casys cache dir
  assertEquals(path.includes(".cache/casys") || path.includes("cache/casys"), true);

  // Should contain package name and version
  assertEquals(path.includes("mcp-std"), true);
  assertEquals(path.includes("0.2.1"), true);
});

// =============================================================================
// Unit Tests: Binary Config Validation
// =============================================================================

Deno.test("BinaryResolver validates config", () => {
  // Valid config
  const validConfig: BinaryConfig = {
    name: "mcp-std",
    version: "0.2.1",
    repo: "Casys-AI/mcp-std",
  };

  const resolver = new BinaryResolver(validConfig);
  assertExists(resolver);
});

Deno.test("BinaryResolver builds correct download URL", () => {
  const config: BinaryConfig = {
    name: "mcp-std",
    version: "0.2.1",
    repo: "Casys-AI/mcp-std",
  };

  const resolver = new BinaryResolver(config);
  const url = resolver.getDownloadUrl("linux", "x64");

  assertEquals(
    url,
    "https://github.com/Casys-AI/mcp-std/releases/download/v0.2.1/mcp-std-linux-x64",
  );
});

Deno.test("BinaryResolver builds correct download URL for windows", () => {
  const config: BinaryConfig = {
    name: "mcp-std",
    version: "0.2.1",
    repo: "Casys-AI/mcp-std",
  };

  const resolver = new BinaryResolver(config);
  const url = resolver.getDownloadUrl("windows", "x64");

  assertEquals(
    url,
    "https://github.com/Casys-AI/mcp-std/releases/download/v0.2.1/mcp-std-windows-x64.exe",
  );
});

// =============================================================================
// Integration Tests: Cache Check
// =============================================================================

Deno.test("BinaryResolver.isCached returns false for non-existent binary", async () => {
  const config: BinaryConfig = {
    name: "mcp-std",
    version: "99.99.99", // Non-existent version
    repo: "Casys-AI/mcp-std",
  };

  const resolver = new BinaryResolver(config);
  const cached = await resolver.isCached();

  assertEquals(cached, false);
});

// =============================================================================
// Integration Tests: Resolve (with mock/skip download)
// =============================================================================

Deno.test({
  name: "BinaryResolver.resolve downloads and caches binary",
  ignore: true, // TODO: Enable when binaries are published to mcp-std releases
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const config: BinaryConfig = {
    name: "mcp-std",
    version: "0.2.1",
    repo: "Casys-AI/mcp-std",
  };

  const resolver = new BinaryResolver(config);

  // Clean cache first
  await resolver.clearCache();

  // Resolve should download
  const binaryPath = await resolver.resolve();

  // Path should exist
  assertExists(binaryPath);
  assertEquals(binaryPath.includes("mcp-std"), true);

  // Should now be cached
  const cached = await resolver.isCached();
  assertEquals(cached, true);

  // Second resolve should use cache (fast)
  const start = Date.now();
  const cachedPath = await resolver.resolve();
  const elapsed = Date.now() - start;

  assertEquals(cachedPath, binaryPath);
  assertEquals(elapsed < 100, true, "Cached resolve should be fast");
});

Deno.test("BinaryResolver.resolve throws on invalid repo/version", async () => {
  const config: BinaryConfig = {
    name: "mcp-std",
    version: "0.0.0-invalid",
    repo: "Casys-AI/non-existent-repo-12345",
  };

  const resolver = new BinaryResolver(config);

  await assertRejects(
    () => resolver.resolve(),
    Error,
    "Failed to download",
  );
});

// =============================================================================
// Integration Tests: Full Flow
// =============================================================================

Deno.test({
  name: "BinaryResolver full flow: resolve returns executable path",
  ignore: true, // TODO: Enable when binaries are published to mcp-std releases
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const config: BinaryConfig = {
    name: "mcp-std",
    version: "0.2.1",
    repo: "Casys-AI/mcp-std",
  };

  const resolver = new BinaryResolver(config);
  const binaryPath = await resolver.resolve();

  // Check file exists and is executable
  const stat = await Deno.stat(binaryPath);
  assertEquals(stat.isFile, true);

  // On Unix, check executable permission
  if (Deno.build.os !== "windows") {
    assertEquals((stat.mode! & 0o111) !== 0, true, "Binary should be executable");
  }
});
