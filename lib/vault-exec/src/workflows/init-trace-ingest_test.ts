import { assertEquals } from "jsr:@std/assert";

import { parseVault } from "../core/parser.ts";
import type { VaultNote } from "../core/types.ts";
import type { Embedder } from "../embeddings/model.ts";
import { DenoVaultReader } from "../infrastructure/fs/deno-vault-fs.ts";
import { resolveVaultExecConfigPath } from "../config/trace-config.ts";
import {
  listActiveSessionSequences,
  listActiveToolLeafEdgesNext,
  listActiveToolLeafNodes,
} from "../training-data/rebuild.ts";
import {
  readRequestedBuild,
  resolveLiveTrainingPaths,
} from "../service/training/state.ts";
import { initVaultWithTraceImport } from "./init.ts";

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

function compiledNote(name: string, body: string): VaultNote {
  return {
    path: `${name}.md`,
    name,
    body,
    frontmatter: {
      compiled_at: "2026-03-06T12:00:00.000Z",
      value: true,
    },
    wikilinks: [],
  };
}

function compiledNoteMarkdown(body: string): string {
  return `---
compiled_at: 2026-03-06T12:00:00.000Z
value: true
---

${body}
`;
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

Deno.test("initVaultWithTraceImport imports traces and keeps generated tools notes out of parsed vault notes", async () => {
  const vaultPath = await Deno.makeTempDir();
  const sourcePath = `${vaultPath}/sources/agents/alpha/sessions`;
  const dbPath = `${vaultPath}/.vault-exec/vault.kv`;

  try {
    await Deno.mkdir(sourcePath, { recursive: true });
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
    await Deno.writeTextFile(
      resolveVaultExecConfigPath(vaultPath),
      `${
        JSON.stringify(
          {
            traceSources: [{ kind: "openclaw", path: sourcePath }],
          },
          null,
          2,
        )
      }\n`,
    );
    await Deno.writeTextFile(
      `${vaultPath}/Root.md`,
      compiledNoteMarkdown("hello world"),
    );
    await Deno.writeTextFile(`${sourcePath}/sess-a.jsonl`, buildTraceFixture());

    const notes = [compiledNote("Root", "hello world")];
    const result = await initVaultWithTraceImport(
      vaultPath,
      notes,
      dbPath,
      new MockEmbedder(),
    );

    assertEquals(result.traceImport.sessionsImported, 1);
    assertEquals(result.traceImport.toolCallsStored, 1);
    assertEquals(result.notesIndexed, 0);
    assertEquals(result.embeddingsGenerated, 0);
    assertEquals(result.gnnForwardDone, false);
    assertEquals(result.syntheticTraces, 0);
    assertEquals(result.gruTrained, false);

    const projected = await Deno.stat(
      `${vaultPath}/tools/exec/exec.md`,
    );
    assertEquals(projected.isFile, true);

    const kv = await Deno.openKv(dbPath);
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

    const requested = await readRequestedBuild(
      resolveLiveTrainingPaths(vaultPath).requestedBuildPath,
    );
    assertEquals(requested?.requestedBy, "workflow-init");
    assertEquals(typeof requested?.buildId, "string");

    const parsed = await parseVault(new DenoVaultReader(), vaultPath);
    assertEquals(parsed.map((note) => note.name), ["Root"]);
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});
