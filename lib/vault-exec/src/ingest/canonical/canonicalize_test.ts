import { assertEquals, assertMatch, assertRejects } from "jsr:@std/assert";

import type { ParsedOpenClawSession } from "../types.ts";
import {
  canonicalizeSession,
  canonicalSessionId,
} from "./canonicalize.ts";

function buildSession(): ParsedOpenClawSession {
  return {
    sessionId: "session-alpha-123",
    shortId: "sessiona",
    sourcePath: "/tmp/openclaw/session-alpha-123.jsonl",
    startedAt: "2026-03-06T12:34:56.000Z",
    agentId: "agent-a",
    turns: [
      {
        index: 1,
        timestamp: "2026-03-06T12:35:00.000Z",
        userIntent: "contact alice@example.com about /home/ubuntu/demo",
        assistantFinalText: "done",
        assistantThinking: ["secret"],
        modelId: "gpt-x",
        toolCalls: [{
          toolName: "exec",
          toolCallId: "call-1",
          args: {
            command: "ssh ubuntu@example.internal",
            file_path: "/home/ubuntu/private.txt",
          },
          family: "git_vcs",
          l2Hit: true,
          l2FallbackReason: undefined,
          l2Context: { primaryBinary: "git" },
        }],
        toolResults: [{
          toolCallId: "call-1",
          toolName: "exec",
          content: [{ type: "text", text: "private result" }],
          isError: false,
        }],
      },
    ],
  };
}

Deno.test("canonicalSessionId - returns deterministic pseudonymous id", async () => {
  const id = await canonicalSessionId("session-alpha-123");
  assertMatch(id, /^[a-f0-9]{16}$/);
  assertEquals(id, await canonicalSessionId("session-alpha-123"));
});

Deno.test("canonicalizeSession - keeps only allowlisted canonical fields", async () => {
  const rows = await canonicalizeSession(buildSession(), "openclaw:david");

  assertEquals(rows.length, 1);
  assertEquals(rows[0], {
    sourceId: "openclaw:david",
    sessionId: await canonicalSessionId("session-alpha-123"),
    sessionDate: "2026-03-06",
    turnIndex: 1,
    toolName: "exec",
    family: "git_vcs",
    l2Hit: true,
    fallbackReason: undefined,
    fingerprint: rows[0].fingerprint,
  });
  assertMatch(rows[0].fingerprint, /^[a-f0-9]{64}$/);
  assertEquals("args" in rows[0], false);
  assertEquals("l2Context" in rows[0], false);
  assertEquals("toolResult" in rows[0], false);
  assertEquals("userIntent" in rows[0], false);
});

Deno.test("canonicalizeSession - preserves bounded date-only and canonical metadata", async () => {
  const rows = await canonicalizeSession(buildSession(), "openclaw:david");

  assertEquals(rows[0].sourceId, "openclaw:david");
  assertEquals(rows[0].sessionDate, "2026-03-06");
  assertEquals(rows[0].turnIndex, 1);
  assertEquals(rows[0].toolName, "exec");
  assertEquals(rows[0].family, "git_vcs");
});

Deno.test("canonicalizeSession - fails fast on invalid tool metadata", async () => {
  const session = buildSession();
  session.turns[0].toolCalls[0].toolName = "";

  await assertRejects(
    () => canonicalizeSession(session, "openclaw:david"),
    Error,
    "[canonicalize] Invalid toolName at turn 1 call 0",
  );
});
