import { assertStringIncludes } from "jsr:@std/assert";
import { buildToolAggregates } from "./aggregate.ts";
import { generateSessionMarkdown, generateToolMarkdown } from "./markdown.ts";
import type { ParsedOpenClawSession } from "./types.ts";

const session: ParsedOpenClawSession = {
  sessionId: "abcd1234-efgh-5678-ijkl-987654321000",
  shortId: "abcd1234",
  sourcePath: "/tmp/session.jsonl",
  startedAt: "2026-03-04T12:00:00.000Z",
  modelId: "claude-sonnet-4-6",
  turns: [
    {
      index: 1,
      timestamp: "2026-03-04T12:00:01.000Z",
      userIntent: "run check",
      parentPlanHint: "Plan: inspect and report",
      assistantFinalText: "Done.",
      toolCalls: [
        {
          toolName: "exec",
          toolCallId: "call_1",
          args: { command: "git status" },
          timestamp: "2026-03-04T12:00:02.000Z",
          family: "git",
        },
      ],
      toolResults: [
        {
          toolCallId: "call_1",
          toolName: "exec",
          content: [{ type: "text", text: "clean" }],
          isError: false,
          timestamp: "2026-03-04T12:00:03.000Z",
        },
      ],
    },
  ],
};

Deno.test("generateSessionMarkdown - includes core turn sections", () => {
  const out = generateSessionMarkdown(session);
  assertStringIncludes(out, "# Session abcd1234");
  assertStringIncludes(out, "## Turn 1");
  assertStringIncludes(out, "## User Intent");
  assertStringIncludes(out, "run check");
  assertStringIncludes(out, "## Tool Chain");
  assertStringIncludes(out, "`exec`");
  assertStringIncludes(out, "### Tool Results");
  assertStringIncludes(out, "## Assistant Final Text");
});

Deno.test("generateToolMarkdown - includes L2 families counts and iterations", () => {
  const aggregates = buildToolAggregates([session]);
  const execNode = aggregates.get("exec");
  if (!execNode) {
    throw new Error("missing exec aggregate");
  }

  const out = generateToolMarkdown(execNode);
  assertStringIncludes(out, "# Tool exec");
  assertStringIncludes(out, "## L2 Families");
  assertStringIncludes(out, "- git: 1");
  assertStringIncludes(out, "## Iterations");
  assertStringIncludes(out, "```json");
  assertStringIncludes(out, "git status");
  assertStringIncludes(out, "Plan: inspect and report");
});
