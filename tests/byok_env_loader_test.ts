/**
 * BYOK Env Loader Edge Case Tests
 *
 * Story 14.6: BYOK API Key Management
 *
 * Tests edge cases and error handling for env-loader.ts
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
} from "@std/assert";
import { join } from "@std/path";
import { envFileExists, getKey, reloadEnv } from "../src/byok/mod.ts";

// ============================================================================
// reloadEnv Tests
// ============================================================================

Deno.test("reloadEnv - loads valid .env file", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    await Deno.writeTextFile(
      join(tempDir, ".env"),
      "TEST_RELOAD_KEY=test-value-123",
    );

    Deno.env.delete("TEST_RELOAD_KEY");

    await reloadEnv(tempDir);

    assertEquals(Deno.env.get("TEST_RELOAD_KEY"), "test-value-123");
  } finally {
    Deno.env.delete("TEST_RELOAD_KEY");
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - handles missing .env gracefully", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    // No .env file created - should not throw
    await reloadEnv(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - uses custom env path", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    await Deno.writeTextFile(
      join(tempDir, ".env.local"),
      "CUSTOM_PATH_KEY=custom-value",
    );

    Deno.env.delete("CUSTOM_PATH_KEY");

    await reloadEnv(tempDir, ".env.local");

    assertEquals(Deno.env.get("CUSTOM_PATH_KEY"), "custom-value");
  } finally {
    Deno.env.delete("CUSTOM_PATH_KEY");
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - overwrites existing env vars", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    // Set initial value
    Deno.env.set("OVERWRITE_KEY", "old-value");

    // Write new value to .env
    await Deno.writeTextFile(
      join(tempDir, ".env"),
      "OVERWRITE_KEY=new-value",
    );

    await reloadEnv(tempDir);

    assertEquals(Deno.env.get("OVERWRITE_KEY"), "new-value");
  } finally {
    Deno.env.delete("OVERWRITE_KEY");
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - handles multiple keys", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    const envContent = `
KEY_ONE=value-one
KEY_TWO=value-two
KEY_THREE=value-three
`;
    await Deno.writeTextFile(join(tempDir, ".env"), envContent);

    Deno.env.delete("KEY_ONE");
    Deno.env.delete("KEY_TWO");
    Deno.env.delete("KEY_THREE");

    await reloadEnv(tempDir);

    assertEquals(Deno.env.get("KEY_ONE"), "value-one");
    assertEquals(Deno.env.get("KEY_TWO"), "value-two");
    assertEquals(Deno.env.get("KEY_THREE"), "value-three");
  } finally {
    Deno.env.delete("KEY_ONE");
    Deno.env.delete("KEY_TWO");
    Deno.env.delete("KEY_THREE");
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - handles empty .env file", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    await Deno.writeTextFile(join(tempDir, ".env"), "");

    // Should not throw on empty file
    await reloadEnv(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - handles .env with only comments", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    const envContent = `
# This is a comment
# Another comment
# No actual keys
`;
    await Deno.writeTextFile(join(tempDir, ".env"), envContent);

    await reloadEnv(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - handles special characters in values", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    const envContent = `
SPECIAL_KEY="value with = equals"
URL_KEY=https://example.com/path?query=value&other=123
`;
    await Deno.writeTextFile(join(tempDir, ".env"), envContent);

    Deno.env.delete("SPECIAL_KEY");
    Deno.env.delete("URL_KEY");

    await reloadEnv(tempDir);

    // Values should be loaded (exact handling depends on @std/dotenv)
    assertExists(Deno.env.get("URL_KEY"));
  } finally {
    Deno.env.delete("SPECIAL_KEY");
    Deno.env.delete("URL_KEY");
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - throws with context on parse error", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    // Create a directory with the .env name (will cause error)
    await Deno.mkdir(join(tempDir, ".env"));

    await assertRejects(
      async () => {
        await reloadEnv(tempDir);
      },
      Error,
      // Should include path context
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// getKey Tests
// ============================================================================

Deno.test("getKey - returns set value", () => {
  Deno.env.set("GET_KEY_TEST", "test-value");

  const value = getKey("GET_KEY_TEST");
  assertEquals(value, "test-value");

  Deno.env.delete("GET_KEY_TEST");
});

Deno.test("getKey - returns undefined for unset key", () => {
  Deno.env.delete("UNSET_KEY_TEST");

  const value = getKey("UNSET_KEY_TEST");
  assertEquals(value, undefined);
});

Deno.test("getKey - returns empty string if set to empty", () => {
  Deno.env.set("EMPTY_KEY_TEST", "");

  const value = getKey("EMPTY_KEY_TEST");
  assertEquals(value, "");

  Deno.env.delete("EMPTY_KEY_TEST");
});

// ============================================================================
// envFileExists Tests
// ============================================================================

Deno.test("envFileExists - returns true when file exists", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    await Deno.writeTextFile(join(tempDir, ".env"), "KEY=value");

    const exists = await envFileExists(tempDir);
    assertEquals(exists, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("envFileExists - returns false when file missing", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    const exists = await envFileExists(tempDir);
    assertEquals(exists, false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("envFileExists - supports custom env path", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    await Deno.writeTextFile(join(tempDir, ".env.production"), "KEY=value");

    const defaultExists = await envFileExists(tempDir);
    assertEquals(defaultExists, false);

    const customExists = await envFileExists(tempDir, ".env.production");
    assertEquals(customExists, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Concurrency Tests
// ============================================================================

Deno.test("reloadEnv - handles rapid successive calls", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    await Deno.writeTextFile(join(tempDir, ".env"), "RAPID_KEY=initial");
    Deno.env.delete("RAPID_KEY");

    // Call reloadEnv multiple times rapidly
    await Promise.all([
      reloadEnv(tempDir),
      reloadEnv(tempDir),
      reloadEnv(tempDir),
    ]);

    assertEquals(Deno.env.get("RAPID_KEY"), "initial");
  } finally {
    Deno.env.delete("RAPID_KEY");
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("reloadEnv - picks up file changes between calls", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "env_test_" });

  try {
    // Initial load
    await Deno.writeTextFile(join(tempDir, ".env"), "CHANGE_KEY=first");
    Deno.env.delete("CHANGE_KEY");

    await reloadEnv(tempDir);
    assertEquals(Deno.env.get("CHANGE_KEY"), "first");

    // Update file
    await Deno.writeTextFile(join(tempDir, ".env"), "CHANGE_KEY=second");

    // Reload should pick up change
    await reloadEnv(tempDir);
    assertEquals(Deno.env.get("CHANGE_KEY"), "second");
  } finally {
    Deno.env.delete("CHANGE_KEY");
    await Deno.remove(tempDir, { recursive: true });
  }
});
