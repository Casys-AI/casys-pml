import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { ingestOpenClawSessions } from "./ingest.ts";

Deno.test("ingestOpenClawSessions - writes sessions and deduped tool notes", async () => {
  const root = await Deno.makeTempDir();
  try {
    const sourceDir = `${root}/input`;
    const outputDir = `${root}/out`;
    await Deno.mkdir(sourceDir, { recursive: true });

    const sessionPath =
      `${sourceDir}/abcd1234-efgh-5678-ijkl-987654321000.jsonl`;
    const lines = [
      JSON.stringify({
        type: "session",
        id: "abcd1234-efgh-5678-ijkl-987654321000",
        timestamp: "2026-03-04T12:00:00.000Z",
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-04T12:00:01.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "status" }],
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-04T12:00:02.000Z",
        message: {
          role: "assistant",
          content: [{
            type: "toolCall",
            id: "call_1",
            name: "exec",
            arguments: { command: "git status" },
          }],
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-04T12:00:03.000Z",
        message: {
          role: "toolResult",
          toolCallId: "call_1",
          toolName: "exec",
          content: [{ type: "text", text: "clean" }],
          isError: false,
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-04T12:00:04.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "ok" }],
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-04T12:00:05.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "branch" }],
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-04T12:00:06.000Z",
        message: {
          role: "assistant",
          content: [{
            type: "toolCall",
            id: "call_2",
            name: "exec",
            arguments: { command: "git branch --show-current" },
          }],
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-04T12:00:07.000Z",
        message: {
          role: "toolResult",
          toolCallId: "call_2",
          toolName: "exec",
          content: [{ type: "text", text: "main" }],
          isError: false,
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-04T12:00:08.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "on main" }],
        },
      }),
    ];

    await Deno.writeTextFile(sessionPath, `${lines.join("\n")}\n`);

    const result = await ingestOpenClawSessions({
      sourcePath: sourceDir,
      outputPath: outputDir,
    });

    assertEquals(result.sessionsProcessed, 1);
    assertEquals(result.toolsProcessed, 1);

    const sessionNotePath = `${outputDir}/sessions/2026-03-04-abcd1234.md`;
    const toolNotePath = `${outputDir}/tools/exec.md`;

    const sessionNote = await Deno.readTextFile(sessionNotePath);
    const toolNote = await Deno.readTextFile(toolNotePath);

    assertStringIncludes(sessionNote, "# Session abcd1234");
    assertStringIncludes(sessionNote, "## Turn 2");
    assertStringIncludes(toolNote, "# Tool exec");
    assertStringIncludes(toolNote, "- Total invocations: 2");
    assertStringIncludes(toolNote, "- git: 2");
    assertStringIncludes(toolNote, "git status");
    assertStringIncludes(toolNote, "git branch --show-current");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
