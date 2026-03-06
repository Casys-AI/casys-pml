import { assertEquals } from "jsr:@std/assert";

import { deriveToolGraphEntities } from "./entities.ts";
import { deriveToolGraphKeysForCall } from "./naming.ts";
import type { ImportedOpenClawToolCallRow } from "../types.ts";

function buildRow(
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
    turnIndex: 1,
    callIndex: 0,
    timestamp: "2026-03-06T12:00:01.000Z",
    toolName: "exec",
    family: "git_vcs",
    l2Hit: true,
    ...overrides,
  };
}

Deno.test("deriveToolGraphKeysForCall produces stable dotted keys", () => {
  assertEquals(
    deriveToolGraphKeysForCall(buildRow()),
    {
      l1Key: "tool.exec",
      l2Key: "tool.exec.git_vcs",
    },
  );

  assertEquals(
    deriveToolGraphKeysForCall(buildRow({
      toolName: "read",
      family: "relative:file_path",
    })),
    {
      l1Key: "tool.read",
      l2Key: "tool.read.relative_file_path",
    },
  );

  assertEquals(
    deriveToolGraphKeysForCall(buildRow({
      toolName: "browser",
      family: null,
      l2Hit: false,
    })),
    {
      l1Key: "tool.browser",
    },
  );
});

Deno.test("deriveToolGraphEntities aggregates stable nodes and parent-child relations", () => {
  const rows = [
    buildRow(),
    buildRow({
      sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
      sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
      sessionId: "sess-b",
      sessionShortId: "sessb",
      agentId: "beta",
      contentHash: "hash-b",
    }),
    buildRow({
      toolName: "read",
      family: "relative:file_path",
      sourcePath: "/tmp/.openclaw/agents/alpha/sessions/sess-a.jsonl",
      sessionId: "sess-a",
    }),
    buildRow({
      toolName: "browser",
      family: null,
      l2Hit: false,
      l2FallbackReason: "unsupported_shape",
    }),
  ];

  const entities = deriveToolGraphEntities(rows);
  assertEquals(entities.map((entity) => entity.key), [
    "tool.browser",
    "tool.exec",
    "tool.exec.git_vcs",
    "tool.read",
    "tool.read.relative_file_path",
  ]);

  const exec = entities.find((entity) => entity.key === "tool.exec");
  if (!exec) throw new Error("missing tool.exec");
  assertEquals(exec.level, 1);
  assertEquals(exec.totalOccurrences, 2);
  assertEquals(exec.uniqueSessions, 2);
  assertEquals(exec.uniqueAgents, 2);
  assertEquals(exec.childKeys, ["tool.exec.git_vcs"]);

  const execGit = entities.find((entity) => entity.key === "tool.exec.git_vcs");
  if (!execGit) throw new Error("missing tool.exec.git_vcs");
  assertEquals(execGit.level, 2);
  assertEquals(execGit.parentKey, "tool.exec");
  assertEquals(execGit.totalOccurrences, 2);
  assertEquals(execGit.uniqueSessions, 2);
  assertEquals(execGit.uniqueAgents, 2);

  const browser = entities.find((entity) => entity.key === "tool.browser");
  if (!browser) throw new Error("missing tool.browser");
  assertEquals(browser.totalOccurrences, 1);
  assertEquals(browser.childKeys, []);
  assertEquals(browser.l2Fallbacks, 1);
});
