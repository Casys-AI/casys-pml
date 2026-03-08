import { assertEquals } from "jsr:@std/assert";

import { openVaultStore } from "../db/index.ts";
import type { ParsedOpenClawSession } from "./types.ts";
import { OpenClawLocalStore } from "./local-store.ts";

function buildSession(
  overrides: Partial<ParsedOpenClawSession> = {},
): ParsedOpenClawSession {
  return {
    sessionId: "sess-1",
    shortId: "sess1",
    sourcePath: "/tmp/.openclaw/agents/agent-a/sessions/sess-1.jsonl",
    startedAt: "2026-03-06T12:00:00.000Z",
    agentId: "agent-a",
    turns: [{
      index: 1,
      timestamp: "2026-03-06T12:00:01.000Z",
      userIntent: "check git status",
      userProvenance: {
        kind: "inter_session",
        sourceSessionKey: "agent:agent-a:main",
      },
      assistantFinalText: "repo has local changes",
      assistantThinking: ["Inspect repo", "Then read docs"],
      modelId: "gpt-5",
      parentPlanHint: "Inspect repo",
      toolCalls: [
        {
          toolName: "exec",
          toolCallId: "toolu_1",
          args: { command: "git status --short" },
          family: "git_vcs",
          l2Hit: true,
          l2Context: { primaryBinary: "git" },
        },
        {
          toolName: "read",
          toolCallId: "toolu_2",
          args: { file_path: "README.md" },
          family: "relative:file_path",
          l2Hit: true,
        },
      ],
      toolResults: [{
        toolName: "exec",
        toolCallId: "toolu_1",
        content: [{ type: "text", text: "M src/cli.ts" }],
        details: {
          status: "completed",
          exitCode: 0,
          aggregated: "M src/cli.ts",
        },
        isError: false,
      }],
    }],
    sessionKind: "top_level",
    sessionProvenance: {
      kind: "inter_session",
      sourceSessionKey: "agent:agent-a:main",
    },
    sessionCwd: "/home/ubuntu/.openclaw/workspace",
    ...overrides,
  };
}

Deno.test("OpenClawLocalStore stores imported tool calls without touching training traces", async () => {
  const root = await Deno.makeTempDir();
  const dbPath = `${root}/vault.kv`;
  const store = await OpenClawLocalStore.open(dbPath);

  try {
    const stored = await store.replaceSession(
      "/tmp/.openclaw/agents/agent-a/sessions",
      "hash-a",
      buildSession(),
    );

    assertEquals(stored, 2);

    const calls = await store.listToolCalls();
    assertEquals(calls.length, 2);
    assertEquals(calls[0].sessionId, "sess-1");
    assertEquals(calls[0].agentId, "agent-a");
    assertEquals(calls[0].sourceRoot, "/tmp/.openclaw/agents/agent-a/sessions");
    assertEquals(calls[0].contentHash, "hash-a");
    assertEquals(calls[0].toolCallId, "toolu_1");
    assertEquals(calls[0].args, { command: "git status --short" });
    assertEquals(calls[0].l2Context, { primaryBinary: "git" });
    assertEquals(calls[0].userIntent, "check git status");
    assertEquals(calls[0].userProvenance, {
      kind: "inter_session",
      sourceSessionKey: "agent:agent-a:main",
    });
    assertEquals(calls[0].assistantFinalText, "repo has local changes");
    assertEquals(calls[0].assistantThinking, [
      "Inspect repo",
      "Then read docs",
    ]);
    assertEquals(calls[0].modelId, "gpt-5");
    assertEquals(calls[0].toolResultContent, [{
      type: "text",
      text: "M src/cli.ts",
    }]);
    assertEquals(calls[0].toolResultDetails, {
      status: "completed",
      exitCode: 0,
      aggregated: "M src/cli.ts",
    });
    assertEquals(calls[0].toolResultIsError, false);

    const sessions = await store.listSessions();
    assertEquals(sessions.length, 1);
    assertEquals(sessions[0].sessionKind, "top_level");
    assertEquals(sessions[0].sessionCwd, "/home/ubuntu/.openclaw/workspace");
    assertEquals(sessions[0].sessionProvenance, {
      kind: "inter_session",
      sourceSessionKey: "agent:agent-a:main",
    });

    const vaultStore = await openVaultStore(dbPath);
    try {
      assertEquals((await vaultStore.getAllTraces()).length, 0);
    } finally {
      vaultStore.close();
    }
  } finally {
    store.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("OpenClawLocalStore replaces prior rows for the same source session", async () => {
  const root = await Deno.makeTempDir();
  const dbPath = `${root}/vault.kv`;
  const store = await OpenClawLocalStore.open(dbPath);

  try {
    await store.replaceSession(
      "/tmp/.openclaw/agents/agent-a/sessions",
      "hash-a",
      buildSession(),
    );

    const updatedSession = buildSession({
      turns: [{
        index: 1,
        timestamp: "2026-03-06T12:00:05.000Z",
        userIntent: "check git status again",
        toolCalls: [{
          toolName: "exec",
          toolCallId: "toolu_3",
          args: { command: "git status" },
          family: "git_vcs",
          l2Hit: true,
        }],
        toolResults: [],
      }],
    });

    const stored = await store.replaceSession(
      "/tmp/.openclaw/agents/agent-a/sessions",
      "hash-b",
      updatedSession,
    );

    assertEquals(stored, 1);

    const calls = await store.listToolCalls();
    assertEquals(calls.length, 1);
    assertEquals(calls[0].contentHash, "hash-b");
    assertEquals(calls[0].toolName, "exec");
    assertEquals(calls[0].turnIndex, 1);
    assertEquals(calls[0].callIndex, 0);
  } finally {
    store.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("OpenClawLocalStore compacts oversized tool result payloads before writing to KV", async () => {
  const root = await Deno.makeTempDir();
  const dbPath = `${root}/vault.kv`;
  const store = await OpenClawLocalStore.open(dbPath);

  try {
    const hugeContent = "x".repeat(50_000);
    const hugeDetails = {
      raw: "y".repeat(30_000),
      nested: { summary: "z".repeat(10_000) },
    };

    const stored = await store.replaceSession(
      "/tmp/.openclaw/agents/agent-a/sessions",
      "hash-huge",
      buildSession({
        turns: [{
          index: 1,
          timestamp: "2026-03-06T12:00:01.000Z",
          userIntent: "inspect huge gateway result",
          toolCalls: [{
            toolName: "gateway",
            toolCallId: "toolu_huge",
            args: { action: "config.get" },
            family: "config_get",
            l2Hit: true,
          }],
          toolResults: [{
            toolName: "gateway",
            toolCallId: "toolu_huge",
            content: hugeContent,
            details: hugeDetails,
            isError: false,
          }],
        }],
      }),
    );

    assertEquals(stored, 1);

    const calls = await store.listToolCalls();
    assertEquals(calls.length, 1);
    assertEquals(JSON.stringify(calls[0]).length < 65_536, true);

    const compactedContent = calls[0].toolResultContent as Record<
      string,
      unknown
    >;
    const compactedDetails = calls[0].toolResultDetails as Record<
      string,
      unknown
    >;

    assertEquals(compactedContent.truncated, true);
    assertEquals(compactedDetails.truncated, true);
    assertEquals(typeof compactedContent.preview, "string");
    assertEquals(typeof compactedDetails.preview, "string");
    assertEquals(
      typeof compactedContent.originalBytes === "number" &&
        (compactedContent.originalBytes as number) > 50_000,
      true,
    );
    assertEquals(
      typeof compactedDetails.originalBytes === "number" &&
        (compactedDetails.originalBytes as number) > 40_000,
      true,
    );
  } finally {
    store.close();
    await Deno.remove(root, { recursive: true });
  }
});
