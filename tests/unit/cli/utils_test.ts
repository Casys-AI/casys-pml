/**
 * Tests for CLI utilities
 *
 * @module tests/unit/cli/utils_test
 */

import { assert, assertEquals } from "@std/assert";
import {
  detectMCPConfigPath,
  getAgentCardsConfigDir,
  getAgentCardsConfigPath,
  getLegacyConfigPath,
  getAgentCardsDatabasePath,
  getWorkflowTemplatesPath,
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

Deno.test("getAgentCardsConfigPath - returns valid config path (JSON)", () => {
  const path = getAgentCardsConfigPath();

  // Should end with config.json (ADR-009)
  assert(path.endsWith("config.json"));

  // Should contain .agentcards directory
  assert(path.includes(".agentcards"));
});

Deno.test("getLegacyConfigPath - returns YAML config path (deprecated)", () => {
  const path = getLegacyConfigPath();

  // Should end with config.yaml (legacy)
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

  // Database path should start with config dir (when no env var set)
  assert(dbPath.startsWith(configDir));
});

Deno.test("getAgentCardsDatabasePath - respects AGENTCARDS_DB_PATH env var", () => {
  const customPath = "/workspaces/AgentCards/.agentcards.db";

  // Set custom path
  Deno.env.set("AGENTCARDS_DB_PATH", customPath);

  try {
    const path = getAgentCardsDatabasePath();
    assertEquals(path, customPath);
  } finally {
    // Clean up
    Deno.env.delete("AGENTCARDS_DB_PATH");
  }
});

Deno.test("getAgentCardsDatabasePath - uses default when env var not set", () => {
  // Ensure env var is not set
  Deno.env.delete("AGENTCARDS_DB_PATH");

  const path = getAgentCardsDatabasePath();

  // Should use default path
  assert(path.includes(".agentcards"));
  assert(path.endsWith(".agentcards.db"));
});

Deno.test("Legacy YAML path differs from JSON path only in extension", () => {
  const jsonPath = getAgentCardsConfigPath();
  const yamlPath = getLegacyConfigPath();

  // Same base path
  const jsonBase = jsonPath.replace(".json", "");
  const yamlBase = yamlPath.replace(".yaml", "");

  assert(jsonBase === yamlBase, "Base paths should be identical");

  // Different extensions
  assert(jsonPath.endsWith(".json"));
  assert(yamlPath.endsWith(".yaml"));
});

Deno.test("getWorkflowTemplatesPath - respects AGENTCARDS_WORKFLOW_PATH env var", () => {
  const customPath = "playground/config/workflow-templates.yaml";

  // Set custom path
  Deno.env.set("AGENTCARDS_WORKFLOW_PATH", customPath);

  try {
    const path = getWorkflowTemplatesPath();
    assertEquals(path, customPath);
  } finally {
    // Clean up
    Deno.env.delete("AGENTCARDS_WORKFLOW_PATH");
  }
});

Deno.test("getWorkflowTemplatesPath - uses default when env var not set", () => {
  // Ensure env var is not set
  Deno.env.delete("AGENTCARDS_WORKFLOW_PATH");

  const path = getWorkflowTemplatesPath();

  // Should use default path
  assertEquals(path, "./config/workflow-templates.yaml");
});

Deno.test("getWorkflowTemplatesPath - supports various path formats", () => {
  const testPaths = [
    "playground/config/workflow-templates.yaml", // Relative path
    "/absolute/path/workflow-templates.yaml", // Absolute path
    "./config/workflow-templates.yaml", // Dot-relative path
    "../parent/workflow-templates.yaml", // Parent directory path
  ];

  for (const testPath of testPaths) {
    Deno.env.set("AGENTCARDS_WORKFLOW_PATH", testPath);

    try {
      const path = getWorkflowTemplatesPath();
      assertEquals(
        path,
        testPath,
        `Should return custom path: ${testPath}`,
      );
    } finally {
      Deno.env.delete("AGENTCARDS_WORKFLOW_PATH");
    }
  }
});
