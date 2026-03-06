import { assertEquals, assertRejects } from "jsr:@std/assert";

import type {
  ImportedOpenClawSessionRow,
  ImportedOpenClawToolCallRow,
} from "../ingest/types.ts";
import {
  getActiveTrainingBuildId,
  listActiveSessionSequences,
  listActiveToolLeafEdgesNext,
  listActiveToolLeafNodes,
  rebuildDerivedTrainingData,
} from "./rebuild.ts";

function buildSessionRow(
  overrides: Partial<ImportedOpenClawSessionRow> = {},
): ImportedOpenClawSessionRow {
  return {
    sourceRoot: "/tmp/.openclaw/agents/alpha/sessions",
    sourcePath: "/tmp/.openclaw/agents/alpha/sessions/sess-a.jsonl",
    contentHash: "hash-a",
    sessionId: "sess-a",
    sessionShortId: "sessa",
    sessionStartedAt: "2026-03-06T12:00:00.000Z",
    agentId: "alpha",
    modelId: "gpt-5",
    sessionKind: "top_level",
    importedAt: "2026-03-06T12:30:00.000Z",
    turnCount: 2,
    toolCallCount: 2,
    ...overrides,
  };
}

function buildToolCallRow(
  overrides: Partial<ImportedOpenClawToolCallRow> = {},
): ImportedOpenClawToolCallRow {
  return {
    sourceRoot: "/tmp/.openclaw/agents/alpha/sessions",
    sourcePath: "/tmp/.openclaw/agents/alpha/sessions/sess-a.jsonl",
    contentHash: "hash-a",
    sessionId: "sess-a",
    sessionShortId: "sessa",
    sessionStartedAt: "2026-03-06T12:00:00.000Z",
    agentId: "alpha",
    sessionKind: "top_level",
    turnIndex: 1,
    callIndex: 0,
    timestamp: "2026-03-06T12:00:01.000Z",
    modelId: "gpt-5",
    toolName: "exec",
    toolCallId: "toolu_1",
    args: { command: "git status --short" },
    family: "git_vcs",
    l2Hit: true,
    userIntent: "check status",
    ...overrides,
  };
}

Deno.test("rebuildTrainingData materializes leaf nodes, next edges, and session sequences", async () => {
  const tempDir = await Deno.makeTempDir();
  const dbPath = `${tempDir}/vault.kv`;
  const kv = await Deno.openKv(dbPath);

  try {
    const summary = await rebuildDerivedTrainingData({
      kv,
      sessions: [
        buildSessionRow(),
        buildSessionRow({
          sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
          sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
          contentHash: "hash-b",
          sessionId: "sess-b",
          sessionShortId: "sessb",
          agentId: "beta",
          sessionKind: "subagent",
        }),
      ],
      toolCalls: [
        buildToolCallRow(),
        buildToolCallRow({
          turnIndex: 2,
          toolName: "read",
          toolCallId: "toolu_2",
          args: { file_path: "notes.md" },
          family: "relative_file_path",
        }),
        buildToolCallRow({
          sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
          sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
          contentHash: "hash-b",
          sessionId: "sess-b",
          sessionShortId: "sessb",
          agentId: "beta",
          sessionKind: "subagent",
          toolName: "browser",
          toolCallId: "toolu_3",
          args: { action: "navigate", url: "https://example.com" },
          family: null,
          l2Hit: false,
          l2FallbackReason: "unsupported_shape",
        }),
        buildToolCallRow({
          sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
          sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
          contentHash: "hash-b",
          sessionId: "sess-b",
          sessionShortId: "sessb",
          agentId: "beta",
          sessionKind: "subagent",
          turnIndex: 2,
          toolName: "read",
          toolCallId: "toolu_4",
          args: { file_path: "notes.md" },
          family: "relative_file_path",
        }),
      ],
      buildId: "build-a",
    });

    assertEquals(summary.buildId, "build-a");
    assertEquals(summary.toolLeafNodes, 3);
    assertEquals(summary.toolLeafEdgesNext, 2);
    assertEquals(summary.sessionSequences, 2);
    assertEquals(await getActiveTrainingBuildId(kv), "build-a");

    const nodes = await listActiveToolLeafNodes(kv);
    assertEquals(nodes.map((row) => row.leafKey), [
      "tool.browser.fallback",
      "tool.exec.git_vcs",
      "tool.read.relative_file_path",
    ]);
    assertEquals(nodes.find((row) => row.leafKey === "tool.exec"), undefined);
    assertEquals(
      nodes.find((row) => row.leafKey === "tool.read.relative_file_path"),
      {
        leafKey: "tool.read.relative_file_path",
        toolRoot: "read",
        level: 2,
        isFallback: false,
        totalOccurrences: 2,
        topLevelOccurrences: 1,
        subagentOccurrences: 1,
        uniqueSessions: 2,
        uniqueAgents: 2,
      },
    );

    const edges = await listActiveToolLeafEdgesNext(kv);
    assertEquals(edges, [
      {
        fromLeaf: "tool.browser.fallback",
        toLeaf: "tool.read.relative_file_path",
        weight: 1,
        topLevelWeight: 0,
        subagentWeight: 1,
      },
      {
        fromLeaf: "tool.exec.git_vcs",
        toLeaf: "tool.read.relative_file_path",
        weight: 1,
        topLevelWeight: 1,
        subagentWeight: 0,
      },
    ]);

    const sequences = await listActiveSessionSequences(kv);
    assertEquals(sequences, [
      {
        sourceRoot: "/tmp/.openclaw/agents/alpha/sessions",
        sessionId: "sess-a",
        sessionShortId: "sessa",
        sourcePath: "/tmp/.openclaw/agents/alpha/sessions/sess-a.jsonl",
        sessionKind: "top_level",
        agentId: "alpha",
        leafKeys: ["tool.exec.git_vcs", "tool.read.relative_file_path"],
        callCount: 2,
      },
      {
        sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
        sessionId: "sess-b",
        sessionShortId: "sessb",
        sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
        sessionKind: "subagent",
        agentId: "beta",
        leafKeys: ["tool.browser.fallback", "tool.read.relative_file_path"],
        callCount: 2,
      },
    ]);
  } finally {
    kv.close();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("rebuildDerivedTrainingData replaces the active derived build", async () => {
  const tempDir = await Deno.makeTempDir();
  const dbPath = `${tempDir}/vault.kv`;
  const kv = await Deno.openKv(dbPath);

  try {
    await rebuildDerivedTrainingData({
      kv,
      sessions: [buildSessionRow({ toolCallCount: 1, turnCount: 1 })],
      toolCalls: [buildToolCallRow()],
      buildId: "build-old",
    });

    await rebuildDerivedTrainingData({
      kv,
      sessions: [
        buildSessionRow({
          sourcePath: "/tmp/.openclaw/agents/alpha/sessions/sess-c.jsonl",
          contentHash: "hash-c",
          sessionId: "sess-c",
          sessionShortId: "sessc",
          toolCallCount: 1,
          turnCount: 1,
        }),
      ],
      toolCalls: [
        buildToolCallRow({
          sourcePath: "/tmp/.openclaw/agents/alpha/sessions/sess-c.jsonl",
          contentHash: "hash-c",
          sessionId: "sess-c",
          sessionShortId: "sessc",
          toolName: "write",
          args: { file_path: "notes.md", content: "updated" },
          family: "relative_file_path",
        }),
      ],
      buildId: "build-new",
    });

    assertEquals(await getActiveTrainingBuildId(kv), "build-new");
    assertEquals(await listActiveToolLeafNodes(kv), [
      {
        leafKey: "tool.write.relative_file_path",
        toolRoot: "write",
        level: 2,
        isFallback: false,
        totalOccurrences: 1,
        topLevelOccurrences: 1,
        subagentOccurrences: 0,
        uniqueSessions: 1,
        uniqueAgents: 1,
      },
    ]);
    assertEquals(await listActiveToolLeafEdgesNext(kv), []);
  } finally {
    kv.close();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("rebuildDerivedTrainingData keeps the previous active build when validation fails", async () => {
  const tempDir = await Deno.makeTempDir();
  const dbPath = `${tempDir}/vault.kv`;
  const kv = await Deno.openKv(dbPath);

  try {
    await rebuildDerivedTrainingData({
      kv,
      sessions: [buildSessionRow({ toolCallCount: 1, turnCount: 1 })],
      toolCalls: [buildToolCallRow()],
      buildId: "stable-build",
    });

    await assertRejects(
      () =>
        rebuildDerivedTrainingData({
          kv,
          sessions: [buildSessionRow({ toolCallCount: 1, turnCount: 1 })],
          toolCalls: [
            buildToolCallRow({
              sessionId: "",
            }) as ImportedOpenClawToolCallRow,
          ],
          buildId: "broken-build",
        }),
      Error,
      "sessionId",
    );

    assertEquals(await getActiveTrainingBuildId(kv), "stable-build");
    assertEquals(await listActiveToolLeafNodes(kv), [
      {
        leafKey: "tool.exec.git_vcs",
        toolRoot: "exec",
        level: 2,
        isFallback: false,
        totalOccurrences: 1,
        topLevelOccurrences: 1,
        subagentOccurrences: 0,
        uniqueSessions: 1,
        uniqueAgents: 1,
      },
    ]);
  } finally {
    kv.close();
    await Deno.remove(tempDir, { recursive: true });
  }
});
