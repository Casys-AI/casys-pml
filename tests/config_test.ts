/**
 * MCP Config Loader Tests
 *
 * Tests for packages/pml/src/config.ts
 * F16 Fix: Add missing tests for MCP config sync feature
 */

import { assertEquals } from "@std/assert";
import { loadMcpServers, getMcpServersList, getMissingEnvVars } from "../src/config.ts";
import type { PmlConfig } from "../src/types.ts";

// Helper to create minimal valid PmlConfig
function makeConfig(mcpServers?: PmlConfig["mcpServers"]): PmlConfig {
  return {
    version: "1.0.0",
    mcpServers,
  };
}

// ============================================================================
// loadMcpServers Tests
// ============================================================================

Deno.test("loadMcpServers - returns empty map for no mcpServers", () => {
  const config = makeConfig();
  const servers = loadMcpServers(config);
  assertEquals(servers.size, 0);
});

Deno.test("loadMcpServers - loads stdio server", () => {
  const config = makeConfig({
    "test-server": {
      type: "stdio",
      command: "npx",
      args: ["-y", "test-mcp-server"],
    },
  });

  const servers = loadMcpServers(config);
  assertEquals(servers.size, 1);
  assertEquals(servers.get("test-server")?.command, "npx");
  assertEquals(servers.get("test-server")?.args, ["-y", "test-mcp-server"]);
});

Deno.test("loadMcpServers - loads http server", () => {
  const config = makeConfig({
    "http-server": {
      type: "http",
      url: "https://api.example.com/mcp",
    },
  });

  const servers = loadMcpServers(config);
  assertEquals(servers.size, 1);
  assertEquals(servers.get("http-server")?.url, "https://api.example.com/mcp");
});

Deno.test("loadMcpServers - skips 'pml' server (self)", () => {
  const config = makeConfig({
    pml: {
      type: "stdio",
      command: "pml",
      args: ["stdio"],
    },
    "other-server": {
      type: "stdio",
      command: "npx",
      args: ["other"],
    },
  });

  const servers = loadMcpServers(config);
  assertEquals(servers.size, 1);
  assertEquals(servers.has("pml"), false);
  assertEquals(servers.has("other-server"), true);
});

Deno.test("loadMcpServers - skips stdio without command", () => {
  const config = makeConfig({
    "bad-server": {
      type: "stdio",
      // missing command
    } as any,
  });

  const servers = loadMcpServers(config);
  assertEquals(servers.size, 0);
});

Deno.test("loadMcpServers - skips http without url", () => {
  const config = makeConfig({
    "bad-http": {
      type: "http",
      // missing url
    } as any,
  });

  const servers = loadMcpServers(config);
  assertEquals(servers.size, 0);
});

Deno.test("loadMcpServers - resolves env vars in command", () => {
  Deno.env.set("TEST_MCP_CMD", "custom-command");

  try {
    const config = makeConfig({
      "env-server": {
        type: "stdio",
        command: "${TEST_MCP_CMD}",
        args: ["arg1"],
      },
    });

    const servers = loadMcpServers(config);
    assertEquals(servers.get("env-server")?.command, "custom-command");
  } finally {
    Deno.env.delete("TEST_MCP_CMD");
  }
});

Deno.test("loadMcpServers - resolves env vars in args", () => {
  Deno.env.set("TEST_ARG", "resolved-arg");

  try {
    const config = makeConfig({
      "env-args-server": {
        type: "stdio",
        command: "npx",
        args: ["${TEST_ARG}", "static-arg"],
      },
    });

    const servers = loadMcpServers(config);
    assertEquals(servers.get("env-args-server")?.args, ["resolved-arg", "static-arg"]);
  } finally {
    Deno.env.delete("TEST_ARG");
  }
});

Deno.test("loadMcpServers - resolves env vars in env object", () => {
  Deno.env.set("OUTER_VAR", "outer-value");

  try {
    const config = makeConfig({
      "env-obj-server": {
        type: "stdio",
        command: "npx",
        args: ["server"],
        env: {
          INNER_KEY: "${OUTER_VAR}",
          STATIC_KEY: "static-value",
        },
      },
    });

    const servers = loadMcpServers(config);
    assertEquals(servers.get("env-obj-server")?.env?.INNER_KEY, "outer-value");
    assertEquals(servers.get("env-obj-server")?.env?.STATIC_KEY, "static-value");
  } finally {
    Deno.env.delete("OUTER_VAR");
  }
});

Deno.test("loadMcpServers - missing env var returns empty string (F8 fix)", () => {
  Deno.env.delete("NONEXISTENT_VAR");

  const config = makeConfig({
    "missing-env-server": {
      type: "stdio",
      command: "npx",
      args: ["${NONEXISTENT_VAR}"],
    },
  });

  const servers = loadMcpServers(config);
  assertEquals(servers.get("missing-env-server")?.args, [""]);
});

// ============================================================================
// getMcpServersList Tests
// ============================================================================

Deno.test("getMcpServersList - returns array of servers", () => {
  const config = makeConfig({
    server1: { type: "stdio", command: "cmd1", args: [] },
    server2: { type: "http", url: "http://localhost" },
  });

  const list = getMcpServersList(config);
  assertEquals(list.length, 2);
  assertEquals(list.map((s) => s.name).sort(), ["server1", "server2"]);
});

// ============================================================================
// getMissingEnvVars Tests
// ============================================================================

Deno.test("getMissingEnvVars - returns empty for no env", () => {
  const missing = getMissingEnvVars(undefined);
  assertEquals(missing, []);
});

Deno.test("getMissingEnvVars - returns empty for all set", () => {
  Deno.env.set("EXISTING_VAR", "value");

  try {
    const missing = getMissingEnvVars({ KEY: "${EXISTING_VAR}" });
    assertEquals(missing, []);
  } finally {
    Deno.env.delete("EXISTING_VAR");
  }
});

Deno.test("getMissingEnvVars - returns missing vars", () => {
  Deno.env.delete("MISSING_VAR_1");
  Deno.env.delete("MISSING_VAR_2");

  const missing = getMissingEnvVars({
    KEY1: "${MISSING_VAR_1}",
    KEY2: "${MISSING_VAR_2}",
  });

  assertEquals(missing.sort(), ["MISSING_VAR_1", "MISSING_VAR_2"]);
});

Deno.test("getMissingEnvVars - dedupes repeated vars", () => {
  Deno.env.delete("REPEATED_VAR");

  const missing = getMissingEnvVars({
    KEY1: "${REPEATED_VAR}",
    KEY2: "${REPEATED_VAR}",
  });

  assertEquals(missing, ["REPEATED_VAR"]);
});
