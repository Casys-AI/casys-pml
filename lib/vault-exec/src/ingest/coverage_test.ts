import { assertStringIncludes } from "jsr:@std/assert";
import { buildL2CoverageReport } from "./coverage.ts";
import { generateCoverageMarkdown } from "./markdown.ts";
import type { ParsedOpenClawSession } from "./types.ts";

Deno.test("buildL2CoverageReport + generateCoverageMarkdown - summarizes per-tool hit and fallback", () => {
  const session: ParsedOpenClawSession = {
    sessionId: "sess-1",
    shortId: "sess1",
    sourcePath: "/tmp/sess-1.jsonl",
    startedAt: "2026-03-05T00:00:00.000Z",
    turns: [{
      index: 1,
      userIntent: "run",
      toolCalls: [
        {
          toolName: "exec",
          args: { command: "git status" },
          family: "git",
          l2Hit: true,
        },
        {
          toolName: "process",
          args: { action: "noop" },
          family: null,
          l2Hit: false,
        },
        {
          toolName: "unknown_tool",
          args: {},
          family: null,
          l2Hit: false,
        },
      ],
      toolResults: [],
    }],
  };

  const report = buildL2CoverageReport([session]);
  const out = generateCoverageMarkdown(report);

  assertStringIncludes(out, "# L2 Coverage Report");
  assertStringIncludes(
    out,
    "- exec: total=1, hit=1, fallback=0, hit_rate=100.0%",
  );
  assertStringIncludes(
    out,
    "- process: total=1, hit=0, fallback=1, hit_rate=0.0%",
  );
  assertStringIncludes(
    out,
    "- unknown_tool: total=1, hit=0, fallback=1, hit_rate=0.0% (unsupported)",
  );
});
