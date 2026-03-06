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
      toolResults: [],
    }],
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
