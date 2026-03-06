import { assertEquals } from "jsr:@std/assert";
import { parseOpenClawSessionLines } from "./parser.ts";

Deno.test("parseOpenClawSessionLines - extracts turn with tool chain and final answer", () => {
  const lines = [
    JSON.stringify({
      type: "session",
      id: "abcd1234-efgh-5678-ijkl-987654321000",
      timestamp: "2026-03-04T12:00:00.000Z",
    }),
    JSON.stringify({
      type: "model_change",
      modelId: "claude-sonnet-4-6",
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-04T12:00:01.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "Check repository status" }],
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-04T12:00:02.000Z",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "I should inspect git state first." },
          {
            type: "toolCall",
            id: "toolu_1",
            name: "exec",
            arguments: { command: "git status --short" },
          },
        ],
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-04T12:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "toolu_1",
        toolName: "exec",
        content: [{ type: "text", text: "M src/cli.ts" }],
        isError: false,
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-04T12:00:04.000Z",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Repository has local changes." }],
      },
    }),
  ];

  const parsed = parseOpenClawSessionLines(
    lines,
    "/tmp/abcd1234-efgh-5678-ijkl-987654321000.jsonl",
  );

  assertEquals(parsed.sessionId, "abcd1234-efgh-5678-ijkl-987654321000");
  assertEquals(parsed.modelId, "claude-sonnet-4-6");
  assertEquals(parsed.turns.length, 1);

  const turn = parsed.turns[0];
  assertEquals(turn.userIntent, "Check repository status");
  assertEquals(turn.parentPlanHint, "I should inspect git state first.");
  assertEquals(turn.toolCalls.length, 1);
  assertEquals(turn.toolCalls[0].toolName, "exec");
  assertEquals(turn.toolCalls[0].args, { command: "git status --short" });
  assertEquals(turn.toolCalls[0].family, "git_vcs");
  assertEquals(turn.toolCalls[0].l2Hit, true);
  assertEquals(turn.toolCalls[0].l2Context, {
    normalizedCommand: "git status --short",
    wrappers: [],
    primaryBinary: "git",
  });
  assertEquals(turn.toolResults.length, 1);
  assertEquals(turn.toolResults[0].toolName, "exec");
  assertEquals(turn.toolResults[0].isError, false);
  assertEquals(turn.assistantFinalText, "Repository has local changes.");
});

Deno.test("parseOpenClawSessionLines - supports OpenAI-style tool_calls payload", () => {
  const lines = [
    JSON.stringify({
      type: "session",
      id: "sess-openai-style",
      timestamp: "2026-03-04T12:00:00.000Z",
    }),
    JSON.stringify({
      type: "message",
      message: {
        role: "user",
        content: "format json",
      },
    }),
    JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "write",
              arguments: '{"file_path":"a.json","content":"{\\"ok\\":true}"}',
            },
          },
        ],
      },
    }),
  ];

  const parsed = parseOpenClawSessionLines(
    lines,
    "/tmp/sess-openai-style.jsonl",
  );
  assertEquals(parsed.turns.length, 1);
  assertEquals(parsed.turns[0].toolCalls.length, 1);
  assertEquals(parsed.turns[0].toolCalls[0].toolName, "write");
  assertEquals(parsed.turns[0].toolCalls[0].family, "relative:file_path");
  assertEquals(parsed.turns[0].toolCalls[0].l2Hit, true);
});

Deno.test("parseOpenClawSessionLines - infers startedAt from first timestamped event", () => {
  const lines = [
    JSON.stringify({
      type: "session",
      id: "sess-without-session-timestamp",
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-04T12:34:56.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    }),
  ];

  const parsed = parseOpenClawSessionLines(
    lines,
    "/tmp/sess-without-session-timestamp.jsonl",
  );

  assertEquals(parsed.startedAt, "2026-03-04T12:34:56.000Z");
});
