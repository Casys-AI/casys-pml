/**
 * Path Validator Tests
 *
 * Tests for path validation security module (Story 14.2, AC4)
 */

import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import {
  createPathValidator,
  validatePath,
  validatePathSync,
} from "../src/security/path-validator.ts";

Deno.test("path-validator - validates path within workspace", async () => {
  const testDir = await Deno.makeTempDir();
  const testFile = join(testDir, "test.txt");
  await Deno.writeTextFile(testFile, "content");

  try {
    const result = await validatePath("test.txt", testDir);

    assertEquals(result.valid, true);
    assertExists(result.normalizedPath);
    assertEquals(result.normalizedPath!.startsWith(testDir), true);
    assertEquals(result.error, undefined);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - rejects path outside workspace", async () => {
  const testDir = await Deno.makeTempDir();
  const otherDir = await Deno.makeTempDir();
  const otherFile = join(otherDir, "secret.txt");
  await Deno.writeTextFile(otherFile, "secret content");

  try {
    const result = await validatePath(otherFile, testDir);

    assertEquals(result.valid, false);
    assertExists(result.error);
    assertEquals(result.error!.code, "PATH_OUTSIDE_WORKSPACE");
  } finally {
    await Deno.remove(testDir, { recursive: true });
    await Deno.remove(otherDir, { recursive: true });
  }
});

Deno.test("path-validator - prevents directory traversal attack (../)", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    const result = await validatePath("../../../etc/passwd", testDir);

    assertEquals(result.valid, false);
    assertExists(result.error);
    assertEquals(result.error!.code, "PATH_TRAVERSAL_ATTACK");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - prevents URL-encoded traversal attack (%2e%2e)", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    const result = await validatePath("%2e%2e/etc/passwd", testDir);

    assertEquals(result.valid, false);
    assertExists(result.error);
    assertEquals(result.error!.code, "PATH_TRAVERSAL_ATTACK");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - prevents null byte injection", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    const result = await validatePath("file.txt\x00.jpg", testDir);

    assertEquals(result.valid, false);
    assertExists(result.error);
    assertEquals(result.error!.code, "PATH_TRAVERSAL_ATTACK");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - rejects empty path", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    const result = await validatePath("", testDir);

    assertEquals(result.valid, false);
    assertExists(result.error);
    assertEquals(result.error!.code, "PATH_INVALID");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - rejects invalid workspace", async () => {
  const result = await validatePath("file.txt", "");

  assertEquals(result.valid, false);
  assertExists(result.error);
  assertEquals(result.error!.code, "WORKSPACE_INVALID");
});

Deno.test("path-validator - validates absolute path within workspace", async () => {
  const testDir = await Deno.makeTempDir();
  const testFile = join(testDir, "sub", "file.txt");
  await Deno.mkdir(join(testDir, "sub"));
  await Deno.writeTextFile(testFile, "content");

  try {
    const result = await validatePath(testFile, testDir);

    assertEquals(result.valid, true);
    assertExists(result.normalizedPath);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - allows workspace root when configured", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    const result = await validatePath(testDir, testDir, {
      allowWorkspaceRoot: true,
    });

    assertEquals(result.valid, true);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - sync version works for basic validation", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    // Test traversal detection
    const result = validatePathSync("../etc/passwd", testDir);

    assertEquals(result.valid, false);
    assertEquals(result.error?.code, "PATH_TRAVERSAL_ATTACK");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - sync version validates path within workspace", async () => {
  const testDir = await Deno.makeTempDir();
  const testFile = join(testDir, "test.txt");
  await Deno.writeTextFile(testFile, "content");

  try {
    const result = validatePathSync("test.txt", testDir);

    assertEquals(result.valid, true);
    assertExists(result.normalizedPath);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - requireExists option validates file existence", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    const result = await validatePath("nonexistent.txt", testDir, {
      requireExists: true,
    });

    assertEquals(result.valid, false);
    assertEquals(result.error?.code, "PATH_NOT_FOUND");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - createPathValidator creates bound validator", async () => {
  const testDir = await Deno.makeTempDir();
  const testFile = join(testDir, "file.txt");
  await Deno.writeTextFile(testFile, "content");

  try {
    const validate = createPathValidator(testDir);

    const result1 = await validate("file.txt");
    assertEquals(result1.valid, true);

    const result2 = await validate("../etc/passwd");
    assertEquals(result2.valid, false);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - handles symlinks pointing outside workspace", async () => {
  const testDir = await Deno.makeTempDir();
  const otherDir = await Deno.makeTempDir();
  const targetFile = join(otherDir, "secret.txt");
  const linkPath = join(testDir, "link.txt");

  await Deno.writeTextFile(targetFile, "secret");

  try {
    await Deno.symlink(targetFile, linkPath);

    const result = await validatePath("link.txt", testDir);

    // Symlink pointing outside should be rejected
    assertEquals(result.valid, false);
    assertEquals(result.error?.code, "PATH_OUTSIDE_WORKSPACE");
  } catch (e) {
    // Symlinks may not work in all environments (e.g., Windows without admin)
    if (!(e instanceof Deno.errors.PermissionDenied)) {
      throw e;
    }
  } finally {
    await Deno.remove(testDir, { recursive: true });
    await Deno.remove(otherDir, { recursive: true });
  }
});

Deno.test("path-validator - allows symlinks pointing within workspace", async () => {
  const testDir = await Deno.makeTempDir();
  const targetFile = join(testDir, "target.txt");
  const linkPath = join(testDir, "link.txt");

  await Deno.writeTextFile(targetFile, "content");

  try {
    await Deno.symlink(targetFile, linkPath);

    const result = await validatePath("link.txt", testDir);

    assertEquals(result.valid, true);
    assertExists(result.normalizedPath);
  } catch (e) {
    // Symlinks may not work in all environments
    if (!(e instanceof Deno.errors.PermissionDenied)) {
      throw e;
    }
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("path-validator - handles nested directories", async () => {
  const testDir = await Deno.makeTempDir();
  const nestedDir = join(testDir, "a", "b", "c", "d");
  const testFile = join(nestedDir, "deep.txt");

  await Deno.mkdir(nestedDir, { recursive: true });
  await Deno.writeTextFile(testFile, "deep content");

  try {
    const result = await validatePath("a/b/c/d/deep.txt", testDir);

    assertEquals(result.valid, true);
    assertExists(result.normalizedPath);
    assertEquals(result.normalizedPath!.endsWith("deep.txt"), true);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});
