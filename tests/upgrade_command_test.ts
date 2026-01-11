/**
 * Upgrade Command Tests
 *
 * Tests for the pml upgrade command.
 *
 * @module tests/upgrade_command_test
 */

import { assertEquals } from "@std/assert";

// =============================================================================
// Version Comparison Tests (copied from upgrade-command.ts for testing)
// =============================================================================

/**
 * Compare semantic versions.
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const cleanA = a.replace(/^v/, "");
  const cleanB = b.replace(/^v/, "");

  const partsA = cleanA.split(".").map(Number);
  const partsB = cleanB.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

/**
 * Detect current platform and return binary name.
 */
function getBinaryName(): string {
  const os = Deno.build.os;
  const arch = Deno.build.arch;

  if (os === "linux") {
    return "pml-linux-x64";
  } else if (os === "darwin") {
    return arch === "aarch64" ? "pml-macos-arm64" : "pml-macos-x64";
  } else if (os === "windows") {
    return "pml-windows-x64.exe";
  }

  throw new Error(`Unsupported platform: ${os}-${arch}`);
}

// =============================================================================
// Unit Tests
// =============================================================================

Deno.test("compareVersions: equal versions return 0", () => {
  assertEquals(compareVersions("1.0.0", "1.0.0"), 0);
  assertEquals(compareVersions("v1.0.0", "1.0.0"), 0);
  assertEquals(compareVersions("1.0.0", "v1.0.0"), 0);
  assertEquals(compareVersions("v1.0.0", "v1.0.0"), 0);
});

Deno.test("compareVersions: major version difference", () => {
  assertEquals(compareVersions("2.0.0", "1.0.0"), 1);
  assertEquals(compareVersions("1.0.0", "2.0.0"), -1);
  assertEquals(compareVersions("10.0.0", "9.0.0"), 1);
});

Deno.test("compareVersions: minor version difference", () => {
  assertEquals(compareVersions("1.2.0", "1.1.0"), 1);
  assertEquals(compareVersions("1.1.0", "1.2.0"), -1);
  assertEquals(compareVersions("1.10.0", "1.9.0"), 1);
});

Deno.test("compareVersions: patch version difference", () => {
  assertEquals(compareVersions("1.0.2", "1.0.1"), 1);
  assertEquals(compareVersions("1.0.1", "1.0.2"), -1);
  assertEquals(compareVersions("1.0.10", "1.0.9"), 1);
});

Deno.test("compareVersions: different length versions", () => {
  assertEquals(compareVersions("1.0", "1.0.0"), 0);
  assertEquals(compareVersions("1.0.0", "1.0"), 0);
  assertEquals(compareVersions("1.0.1", "1.0"), 1);
  assertEquals(compareVersions("1.0", "1.0.1"), -1);
});

Deno.test("compareVersions: handles v prefix", () => {
  assertEquals(compareVersions("v1.2.3", "1.2.3"), 0);
  assertEquals(compareVersions("v2.0.0", "v1.9.9"), 1);
  assertEquals(compareVersions("v1.0.0", "v1.0.1"), -1);
});

Deno.test("getBinaryName: returns valid binary name for current platform", () => {
  const binaryName = getBinaryName();

  // Should be one of the known binaries
  const validNames = [
    "pml-linux-x64",
    "pml-macos-x64",
    "pml-macos-arm64",
    "pml-windows-x64.exe",
  ];

  assertEquals(
    validNames.includes(binaryName),
    true,
    `Binary name ${binaryName} not in valid list`,
  );
});

Deno.test("getBinaryName: matches current OS", () => {
  const binaryName = getBinaryName();
  const os = Deno.build.os;

  if (os === "linux") {
    assertEquals(binaryName, "pml-linux-x64");
  } else if (os === "darwin") {
    assertEquals(binaryName.startsWith("pml-macos-"), true);
  } else if (os === "windows") {
    assertEquals(binaryName, "pml-windows-x64.exe");
  }
});
