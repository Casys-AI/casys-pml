/**
 * Tests for CLI utilities
 *
 * @module tests/unit/cli/utils_test
 */

import { assert } from "@std/assert";
import {
  detectMCPConfigPath,
  getAgentCardsConfigDir,
  getAgentCardsConfigPath,
  getAgentCardsDatabasePath,
} from "../../../src/cli/utils.ts";

/**
 * Note: These tests run on the actual OS and verify path generation logic.
 * Mocking Deno.build.os is not possible due to property descriptor limitations.
 */

Deno.test("detectMCPConfigPath - returns OS-specific path", () => {
  const path = detectMCPConfigPath();
  const os = Deno.build.os;

  // Verify path contains OS-specific components
  switch (os) {
    case "darwin":
      assert(path.includes("Library/Application Support/Claude"));
      assert(path.endsWith("claude_desktop_config.json"));
      break;
    case "linux":
      assert(path.includes(".config/Claude"));
      assert(path.endsWith("claude_desktop_config.json"));
      break;
    case "windows":
      assert(path.includes("Claude"));
      assert(path.endsWith("claude_desktop_config.json"));
      break;
  }
});

Deno.test("getAgentCardsConfigDir - returns valid directory path", () => {
  const dir = getAgentCardsConfigDir();

  // Should end with .agentcards
  assert(dir.endsWith(".agentcards"));

  // Should contain home directory reference
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (homeDir) {
    assert(dir.startsWith(homeDir), `Expected ${dir} to start with ${homeDir}`);
  }
});

Deno.test("getAgentCardsConfigPath - returns valid config path", () => {
  const path = getAgentCardsConfigPath();

  // Should end with config.yaml
  assert(path.endsWith("config.yaml"));

  // Should contain .agentcards directory
  assert(path.includes(".agentcards"));
});

Deno.test("getAgentCardsDatabasePath - returns valid database path", () => {
  const path = getAgentCardsDatabasePath();

  // Should end with .agentcards.db
  assert(path.endsWith(".agentcards.db"));

  // Should contain .agentcards directory
  assert(path.includes(".agentcards"));
});

Deno.test("All paths use correct separators for OS", () => {
  const os = Deno.build.os;
  const separator = os === "windows" ? "\\" : "/";

  const configDir = getAgentCardsConfigDir();
  const configPath = getAgentCardsConfigPath();
  const dbPath = getAgentCardsDatabasePath();

  // Verify paths use correct separator
  assert(configDir.includes(separator));
  assert(configPath.includes(separator));
  assert(dbPath.includes(separator));
});

Deno.test("Paths are consistent across utility functions", () => {
  const configDir = getAgentCardsConfigDir();
  const configPath = getAgentCardsConfigPath();
  const dbPath = getAgentCardsDatabasePath();

  // Config path should start with config dir
  assert(configPath.startsWith(configDir));

  // Database path should start with config dir
  assert(dbPath.startsWith(configDir));
});
