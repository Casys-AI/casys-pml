import { assertEquals, assertRejects } from "jsr:@std/assert";

import {
  loadTraceConfig,
  resolveVaultExecConfigPath,
} from "./trace-config.ts";

Deno.test("resolveVaultExecConfigPath - points to .vault-exec/config.json", () => {
  assertEquals(
    resolveVaultExecConfigPath("/tmp/demo-vault/"),
    "/tmp/demo-vault/.vault-exec/config.json",
  );
});

Deno.test("loadTraceConfig - missing config returns empty traceSources", async () => {
  const vaultPath = await Deno.makeTempDir();
  try {
    const config = await loadTraceConfig(vaultPath);
    assertEquals(config, { traceSources: [] });
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("loadTraceConfig - parses valid openclaw sources", async () => {
  const vaultPath = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
    await Deno.writeTextFile(
      resolveVaultExecConfigPath(vaultPath),
      JSON.stringify({
        traceSources: [
          { kind: "openclaw", path: "/tmp/agent-a/sessions" },
          { kind: "openclaw", path: "/tmp/agent-b/sessions" },
        ],
      }),
    );

    const config = await loadTraceConfig(vaultPath);
    assertEquals(config, {
      traceSources: [
        { kind: "openclaw", path: "/tmp/agent-a/sessions" },
        { kind: "openclaw", path: "/tmp/agent-b/sessions" },
      ],
    });
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("loadTraceConfig - invalid JSON throws deterministic error", async () => {
  const vaultPath = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
    await Deno.writeTextFile(resolveVaultExecConfigPath(vaultPath), "{");

    await assertRejects(
      () => loadTraceConfig(vaultPath),
      Error,
      `[trace-config] Invalid JSON in ${resolveVaultExecConfigPath(vaultPath)}`,
    );
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("loadTraceConfig - unsupported source kind throws validation error", async () => {
  const vaultPath = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
    await Deno.writeTextFile(
      resolveVaultExecConfigPath(vaultPath),
      JSON.stringify({
        traceSources: [{ kind: "unknown", path: "/tmp/x" }],
      }),
    );

    await assertRejects(
      () => loadTraceConfig(vaultPath),
      Error,
      "[trace-config] Invalid trace source at index 0: unsupported kind \"unknown\"",
    );
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});
