import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert";

import { resolveVaultExecConfigPath } from "../config/trace-config.ts";
import { openVaultStore } from "../db/index.ts";
import { getServicePaths } from "../service/lifecycle.ts";
import { OpenClawLocalStore } from "./local-store.ts";
import { runIncrementalOpenClawImport } from "./pipeline.ts";

interface ToolCallFixtureOptions {
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  userText?: string;
  assistantText?: string;
}

function buildToolCallFixture(options: ToolCallFixtureOptions): string {
  return [
    JSON.stringify({
      type: "session",
      id: options.sessionId,
      timestamp: "2026-03-06T12:00:00.000Z",
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-06T12:00:01.000Z",
      message: {
        role: "user",
        content: [{
          type: "text",
          text: options.userText ?? "do the thing",
        }],
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-06T12:00:02.000Z",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Need one tool call." },
          {
            type: "toolCall",
            id: "toolu_1",
            name: options.toolName,
            arguments: options.args,
          },
        ],
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-06T12:00:03.000Z",
      message: {
        role: "assistant",
        content: [{
          type: "text",
          text: options.assistantText ?? "done",
        }],
      },
    }),
    "",
  ].join("\n");
}

async function writeTraceConfig(
  vaultPath: string,
  traceSources: string[],
): Promise<void> {
  await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
  await Deno.writeTextFile(
    resolveVaultExecConfigPath(vaultPath),
    `${JSON.stringify({
      traceSources: traceSources.map((path) => ({ kind: "openclaw", path })),
    }, null, 2)}\n`,
  );
}

Deno.test("runIncrementalOpenClawImport imports multiple configured sources and no-ops when unchanged", async () => {
  const vaultPath = await Deno.makeTempDir();
  const sourceA = `${vaultPath}/sources/agents/alpha/sessions`;
  const sourceB = `${vaultPath}/sources/agents/beta/sessions`;

  try {
    await Deno.mkdir(sourceA, { recursive: true });
    await Deno.mkdir(sourceB, { recursive: true });
    await writeTraceConfig(vaultPath, [sourceA, sourceB]);

    await Deno.writeTextFile(
      `${sourceA}/sess-a.jsonl`,
      buildToolCallFixture({
        sessionId: "sess-a",
        toolName: "exec",
        args: { command: "git status --short" },
      }),
    );
    await Deno.writeTextFile(
      `${sourceB}/sess-b.jsonl`,
      buildToolCallFixture({
        sessionId: "sess-b",
        toolName: "read",
        args: { file_path: "notes.md" },
      }),
    );

    const first = await runIncrementalOpenClawImport({ vaultPath });
    assertEquals(first.configuredSources, 2);
    assertEquals(first.changedFiles, 2);
    assertEquals(first.unchangedFiles, 0);
    assertEquals(first.sessionsImported, 2);
    assertEquals(first.toolCallsStored, 2);
    assertEquals(first.warnings, []);

    const paths = await getServicePaths(vaultPath);
    const imported = await OpenClawLocalStore.open(paths.vaultDbPath);
    try {
      const rows = await imported.listToolCalls();
      assertEquals(rows.map((row) => row.sessionId), ["sess-a", "sess-b"]);
      assertEquals(rows.map((row) => row.agentId), ["alpha", "beta"]);
      assertEquals(rows.map((row) => row.toolName), ["exec", "read"]);
    } finally {
      imported.close();
    }

    const execNode = await Deno.readTextFile(
      `${vaultPath}/tool-graph/l1/tool.exec.md`,
    );
    const execL2Node = await Deno.readTextFile(
      `${vaultPath}/tool-graph/l2/tool.exec.git_vcs.md`,
    );
    assertStringIncludes(execNode, "tool_graph_key: tool.exec");
    assertStringIncludes(execL2Node, "tool_graph_key: tool.exec.git_vcs");

    const vaultStore = await openVaultStore(paths.vaultDbPath);
    try {
      assertEquals((await vaultStore.getAllTraces()).length, 0);
    } finally {
      vaultStore.close();
    }

    const second = await runIncrementalOpenClawImport({ vaultPath });
    assertEquals(second.configuredSources, 2);
    assertEquals(second.changedFiles, 0);
    assertEquals(second.unchangedFiles, 2);
    assertEquals(second.sessionsImported, 0);
    assertEquals(second.toolCallsStored, 0);
    assertEquals(second.warnings, []);
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("runIncrementalOpenClawImport reimports only changed files and replaces prior session rows", async () => {
  const vaultPath = await Deno.makeTempDir();
  const sourcePath = `${vaultPath}/sources/agents/alpha/sessions`;

  try {
    await Deno.mkdir(sourcePath, { recursive: true });
    await writeTraceConfig(vaultPath, [sourcePath]);

    const sessionPath = `${sourcePath}/sess-a.jsonl`;
    await Deno.writeTextFile(
      sessionPath,
      buildToolCallFixture({
        sessionId: "sess-a",
        toolName: "exec",
        args: { command: "git status --short" },
      }),
    );

    const first = await runIncrementalOpenClawImport({ vaultPath });
    assertEquals(first.changedFiles, 1);
    assertEquals(first.toolCallsStored, 1);

    await Deno.writeTextFile(
      sessionPath,
      buildToolCallFixture({
        sessionId: "sess-a",
        toolName: "write",
        args: { file_path: "notes.md", content: "updated" },
        assistantText: "updated",
      }),
    );

    const second = await runIncrementalOpenClawImport({ vaultPath });
    assertEquals(second.changedFiles, 1);
    assertEquals(second.unchangedFiles, 0);
    assertEquals(second.sessionsImported, 1);
    assertEquals(second.toolCallsStored, 1);

    const paths = await getServicePaths(vaultPath);
    const imported = await OpenClawLocalStore.open(paths.vaultDbPath);
    try {
      const rows = await imported.listToolCalls();
      assertEquals(rows.length, 1);
      assertEquals(rows[0].toolName, "write");
      assertEquals(rows[0].sessionId, "sess-a");
    } finally {
      imported.close();
    }
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("runIncrementalOpenClawImport warns and skips malformed sessions", async () => {
  const vaultPath = await Deno.makeTempDir();
  const sourcePath = `${vaultPath}/sources/agents/alpha/sessions`;

  try {
    await Deno.mkdir(sourcePath, { recursive: true });
    await writeTraceConfig(vaultPath, [sourcePath]);

    await Deno.writeTextFile(
      `${sourcePath}/valid.jsonl`,
      buildToolCallFixture({
        sessionId: "valid",
        toolName: "exec",
        args: { command: "git status" },
      }),
    );
    await Deno.writeTextFile(`${sourcePath}/broken.jsonl`, "{not-json\n");

    const result = await runIncrementalOpenClawImport({ vaultPath });

    assertEquals(result.changedFiles, 2);
    assertEquals(result.sessionsImported, 1);
    assertEquals(result.toolCallsStored, 1);
    assertEquals(result.warnings.length, 1);
    assertStringIncludes(result.warnings[0], "broken.jsonl");
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("runIncrementalOpenClawImport removes previously imported rows when a source file becomes malformed", async () => {
  const vaultPath = await Deno.makeTempDir();
  const sourcePath = `${vaultPath}/sources/agents/alpha/sessions`;

  try {
    await Deno.mkdir(sourcePath, { recursive: true });
    await writeTraceConfig(vaultPath, [sourcePath]);

    const sessionPath = `${sourcePath}/sess-a.jsonl`;
    await Deno.writeTextFile(
      sessionPath,
      buildToolCallFixture({
        sessionId: "sess-a",
        toolName: "exec",
        args: { command: "git status --short" },
      }),
    );

    await runIncrementalOpenClawImport({ vaultPath });

    await Deno.writeTextFile(sessionPath, "{not-json\n");
    const result = await runIncrementalOpenClawImport({ vaultPath });

    assertEquals(result.sessionsImported, 0);
    assertEquals(result.toolCallsStored, 0);
    assertEquals(result.warnings.length, 1);

    const paths = await getServicePaths(vaultPath);
    const imported = await OpenClawLocalStore.open(paths.vaultDbPath);
    try {
      assertEquals(await imported.listToolCalls(), []);
    } finally {
      imported.close();
    }

    await assertRejects(
      () => Deno.readTextFile(`${vaultPath}/tool-graph/l1/tool.exec.md`),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("runIncrementalOpenClawImport prunes rows for sources removed from config", async () => {
  const vaultPath = await Deno.makeTempDir();
  const sourceA = `${vaultPath}/sources/agents/alpha/sessions`;
  const sourceB = `${vaultPath}/sources/agents/beta/sessions`;

  try {
    await Deno.mkdir(sourceA, { recursive: true });
    await Deno.mkdir(sourceB, { recursive: true });

    await Deno.writeTextFile(
      `${sourceA}/sess-a.jsonl`,
      buildToolCallFixture({
        sessionId: "sess-a",
        toolName: "exec",
        args: { command: "git status --short" },
      }),
    );
    await Deno.writeTextFile(
      `${sourceB}/sess-b.jsonl`,
      buildToolCallFixture({
        sessionId: "sess-b",
        toolName: "read",
        args: { file_path: "notes.md" },
      }),
    );

    await writeTraceConfig(vaultPath, [sourceA, sourceB]);
    await runIncrementalOpenClawImport({ vaultPath });

    await writeTraceConfig(vaultPath, [sourceA]);
    const result = await runIncrementalOpenClawImport({ vaultPath });

    assertEquals(result.configuredSources, 1);
    assertEquals(result.changedFiles, 0);
    assertEquals(result.sessionsImported, 0);

    const paths = await getServicePaths(vaultPath);
    const imported = await OpenClawLocalStore.open(paths.vaultDbPath);
    try {
      const rows = await imported.listToolCalls();
      assertEquals(rows.length, 1);
      assertEquals(rows[0].sessionId, "sess-a");
      assertEquals(rows[0].agentId, "alpha");
    } finally {
      imported.close();
    }

    await assertRejects(
      () => Deno.readTextFile(`${vaultPath}/tool-graph/l1/tool.read.md`),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});
