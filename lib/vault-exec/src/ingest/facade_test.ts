import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildToolAggregates } from "./aggregate.ts";
import { classifyToolFamily } from "./families.ts";
import {
  generateSessionMarkdown,
  generateToolMarkdown,
  toolFileName,
} from "./markdown.ts";
import type { ParsedOpenClawSession } from "./types.ts";

const session: ParsedOpenClawSession = {
  sessionId: "sess-1",
  shortId: "sess1",
  sourcePath: "/tmp/sess-1.jsonl",
  startedAt: "2026-03-04T12:00:00.000Z",
  turns: [{
    index: 1,
    userIntent: "run status",
    toolCalls: [{
      toolName: "exec",
      args: { command: "git status" },
      family: "git_vcs",
      l2Hit: true,
    }],
    toolResults: [{
      toolName: "exec",
      content: [{ type: "text", text: "clean" }],
      isError: false,
    }],
    assistantFinalText: "done",
  }],
};

Deno.test("ingest facades keep classification and filename behavior", () => {
  assertEquals(classifyToolFamily("exec", { command: "git status" }), "git_vcs");
  assertEquals(toolFileName("Exec Tool"), "exec-tool.md");
});

Deno.test("ingest facades keep markdown/aggregate behavior", () => {
  const sessionOut = generateSessionMarkdown(session);
  assertStringIncludes(sessionOut, "# Session sess1");

  const aggregates = buildToolAggregates([session]);
  const execAggregate = aggregates.get("exec");
  if (!execAggregate) throw new Error("missing exec aggregate");

  const toolOut = generateToolMarkdown(execAggregate);
  assertStringIncludes(toolOut, "# Tool exec");
  assertStringIncludes(toolOut, "- git_vcs: 1");
});
