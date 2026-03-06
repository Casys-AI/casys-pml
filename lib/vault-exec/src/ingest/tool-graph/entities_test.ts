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
      l2FallbackReason: "unsupported_shape",
    })),
    {
      l1Key: "tool.browser",
      l2Key: "tool.browser.fallback",
    },
  );
});

Deno.test("deriveToolGraphEntities aggregates stable nodes and sequential transitions", () => {
  const rows = [
    buildRow(),
    buildRow({
      turnIndex: 2,
      callIndex: 0,
      toolName: "read",
      family: "relative:file_path",
      sourcePath: "/tmp/.openclaw/agents/alpha/sessions/sess-a.jsonl",
      sessionId: "sess-a",
      sessionShortId: "sessa",
      agentId: "alpha",
    }),
    buildRow({
      sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
      sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
      sessionId: "sess-b",
      sessionShortId: "sessb",
      agentId: "beta",
      contentHash: "hash-b",
    }),
    buildRow({
      sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
      sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
      sessionId: "sess-b",
      sessionShortId: "sessb",
      agentId: "beta",
      contentHash: "hash-b",
      turnIndex: 2,
      callIndex: 0,
      toolName: "read",
      family: "relative:file_path",
    }),
    buildRow({
      toolName: "browser",
      family: null,
      l2Hit: false,
      l2FallbackReason: "unsupported_shape",
      sourceRoot: "/tmp/.openclaw/agents/gamma/sessions",
      sourcePath: "/tmp/.openclaw/agents/gamma/sessions/sess-c.jsonl",
      sessionId: "sess-c",
      sessionShortId: "sessc",
      agentId: "gamma",
      contentHash: "hash-c",
    }),
    buildRow({
      toolName: "read",
      family: "relative:file_path",
      l2Hit: true,
      sourceRoot: "/tmp/.openclaw/agents/gamma/sessions",
      sourcePath: "/tmp/.openclaw/agents/gamma/sessions/sess-c.jsonl",
      sessionId: "sess-c",
      sessionShortId: "sessc",
      agentId: "gamma",
      contentHash: "hash-c",
      turnIndex: 2,
      callIndex: 0,
    }),
  ];

  const entities = deriveToolGraphEntities(rows);
  assertEquals(entities.map((entity) => entity.key), [
    "tool.browser",
    "tool.browser.fallback",
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
  assertEquals(exec.previousTransitions, {});
  assertEquals(exec.nextTransitions, {});

  const execGit = entities.find((entity) => entity.key === "tool.exec.git_vcs");
  if (!execGit) throw new Error("missing tool.exec.git_vcs");
  assertEquals(execGit.level, 2);
  assertEquals(execGit.totalOccurrences, 2);
  assertEquals(execGit.uniqueSessions, 2);
  assertEquals(execGit.uniqueAgents, 2);
  assertEquals(execGit.previousTransitions, {});
  assertEquals(execGit.nextTransitions, {
    "tool.read.relative_file_path": 2,
  });

  const read = entities.find((entity) => entity.key === "tool.read");
  if (!read) throw new Error("missing tool.read");
  assertEquals(read.previousTransitions, {});
  assertEquals(read.nextTransitions, {});

  const readRelative = entities.find((entity) =>
    entity.key === "tool.read.relative_file_path"
  );
  if (!readRelative) throw new Error("missing tool.read.relative_file_path");
  assertEquals(readRelative.previousTransitions, {
    "tool.browser.fallback": 1,
    "tool.exec.git_vcs": 2,
  });
  assertEquals(readRelative.nextTransitions, {});

  const browser = entities.find((entity) => entity.key === "tool.browser");
  if (!browser) throw new Error("missing tool.browser");
  assertEquals(browser.totalOccurrences, 1);
  assertEquals(browser.l2Fallbacks, 1);
  assertEquals(browser.previousTransitions, {});
  assertEquals(browser.nextTransitions, {});

  const browserFallback = entities.find((entity) =>
    entity.key === "tool.browser.fallback"
  );
  if (!browserFallback) throw new Error("missing tool.browser.fallback");
  assertEquals(browserFallback.level, 2);
  assertEquals(browserFallback.totalOccurrences, 1);
  assertEquals(browserFallback.previousTransitions, {});
  assertEquals(browserFallback.nextTransitions, {
    "tool.read.relative_file_path": 1,
  });
});
