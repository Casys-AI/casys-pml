import { assertStringIncludes } from "jsr:@std/assert";
import { buildToolAggregates } from "./aggregate.ts";
import {
  generateCoverageMarkdown,
  generateSessionMarkdown,
  generateToolMarkdown,
} from "./markdown.ts";
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
          family: "git_vcs",
          l2Hit: true,
          l2Context: {
            normalizedCommand: "git status",
            wrappers: [],
            primaryBinary: "git",
          },
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
  assertStringIncludes(out, "L2 context");
});

Deno.test("generateToolMarkdown - includes L2 families, coverage and iterations", () => {
  const aggregates = buildToolAggregates([session]);
  const execNode = aggregates.get("exec");
  if (!execNode) {
    throw new Error("missing exec aggregate");
  }

  const out = generateToolMarkdown(execNode);
  assertStringIncludes(out, "# Tool exec");
  assertStringIncludes(out, "## L2 Families");
  assertStringIncludes(out, "- git_vcs: 1");
  assertStringIncludes(out, "- L2 hit: 1");
  assertStringIncludes(out, "- L2 fallback: 0");
  assertStringIncludes(out, "## L2 Fallbacks");
  assertStringIncludes(out, "## Iterations");
  assertStringIncludes(out, "```json");
  assertStringIncludes(out, "git status");
  assertStringIncludes(out, "Plan: inspect and report");
});

Deno.test("generateCoverageMarkdown - emits summary and per-tool lines", () => {
  const out = generateCoverageMarkdown({
    totalCalls: 3,
    totalHits: 2,
    totalFallbacks: 1,
    hitRate: 2 / 3,
    tools: [
      {
        toolName: "exec",
        supported: true,
        total: 2,
        hits: 2,
        fallbacks: 0,
        hitRate: 1,
      },
      {
        toolName: "unknown_tool",
        supported: false,
        total: 1,
        hits: 0,
        fallbacks: 1,
        hitRate: 0,
      },
    ],
  });

  assertStringIncludes(out, "# L2 Coverage Report");
  assertStringIncludes(out, "- Total tool calls: 3");
  assertStringIncludes(
    out,
    "- exec: total=2, hit=2, fallback=0, hit_rate=100.0%",
  );
  assertStringIncludes(
    out,
    "- unknown_tool: total=1, hit=0, fallback=1, hit_rate=0.0% (unsupported)",
  );
});

Deno.test("generateSessionMarkdown - uses deterministic fallback date when startedAt is missing", () => {
  const withoutStart = { ...session, startedAt: undefined };
  const out = generateSessionMarkdown(withoutStart);
  assertStringIncludes(out, "  date: 1970-01-01");
});
