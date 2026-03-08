import { assertEquals } from "jsr:@std/assert";

import type { Embedder } from "../embeddings/model.ts";
import { resolveVaultExecConfigPath } from "../config/trace-config.ts";
import {
  listActiveSessionSequences,
  listActiveToolLeafEdgesNext,
  listActiveToolLeafNodes,
} from "../training-data/rebuild.ts";
import { runIncrementalSync } from "./sync-worker.ts";

class MockEmbedder implements Embedder {
  async encode(text: string): Promise<number[]> {
    const seed = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: 1024 }, (_, i) => Math.sin(seed + i) * 0.1);
  }
  isLoaded(): boolean {
    return true;
  }
  async load(): Promise<void> {}
  async dispose(): Promise<void> {}
}

function buildTraceFixture(): string {
  return [
    JSON.stringify({
      type: "session",
      id: "sess-a",
      timestamp: "2026-03-06T12:00:00.000Z",
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-06T12:00:01.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "check status" }],
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-06T12:00:02.000Z",
      message: {
        role: "assistant",
        content: [{
          type: "toolCall",
          id: "toolu_1",
          name: "exec",
          arguments: { command: "git status --short" },
        }],
      },
    }),
    "",
  ].join("\n");
}

Deno.test("runIncrementalSync imports traces, rebuilds derived tables, and reports counters", async () => {
  const vaultPath = await Deno.makeTempDir();
  const sourcePath = `${vaultPath}/sources/agents/alpha/sessions`;

  try {
    await Deno.mkdir(sourcePath, { recursive: true });
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
    await Deno.writeTextFile(
      `${vaultPath}/Root.md`,
      `---
compiled_at: 2026-03-06T12:00:00.000Z
value: true
---

hello world
`,
    );
    await Deno.writeTextFile(
      resolveVaultExecConfigPath(vaultPath),
      `${
        JSON.stringify(
          {
            traceSources: [
              { kind: "openclaw", path: sourcePath },
              { kind: "openclaw", path: `${vaultPath}/missing-source` },
            ],
          },
          null,
          2,
        )
      }\n`,
    );
    await Deno.writeTextFile(`${sourcePath}/sess-a.jsonl`, buildTraceFixture());

    const result = await runIncrementalSync(vaultPath, {
      embedder: new MockEmbedder(),
    });

    assertEquals(result.ok, true);
    assertEquals(result.traceSourcesConfigured, 2);
    assertEquals(result.traceFilesChanged, 1);
    assertEquals(result.traceFilesUnchanged, 0);
    assertEquals(result.traceSessionsImported, 1);
    assertEquals(result.traceToolCallsStored, 1);
    assertEquals(result.traceWarnings.length, 1);
    assertEquals(result.tracesUsed, 0);
    assertEquals(result.notesReindexed, 0);
    assertEquals(result.gruTrained, false);
    assertEquals(result.gruAccuracy, 0);
    assertEquals(result.gnnUpdated, false);

    const kv = await Deno.openKv(`${vaultPath}/.vault-exec/vault.kv`);
    try {
      assertEquals(
        (await listActiveToolLeafNodes(kv)).map((node) => node.leafKey),
        ["tool.exec.git_vcs"],
      );
      assertEquals(await listActiveToolLeafEdgesNext(kv), []);
      assertEquals(
        (await listActiveSessionSequences(kv)).map((row) => row.leafKeys),
        [["tool.exec.git_vcs"]],
      );
    } finally {
      kv.close();
    }
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});
