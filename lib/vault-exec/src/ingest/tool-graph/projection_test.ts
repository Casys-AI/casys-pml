import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert";

import { deriveToolGraphEntities } from "./entities.ts";
import {
  projectToolGraph,
  resolveToolGraphNotePath,
} from "./projection.ts";
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

Deno.test("projectToolGraph writes stable markdown notes into hierarchical tools paths with sequence links", async () => {
  const vaultPath = await Deno.makeTempDir();

  try {
    const entities = deriveToolGraphEntities([
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
        turnIndex: 2,
        callIndex: 0,
      }),
    ]);

    await projectToolGraph(vaultPath, entities);

    const l1Path = resolveToolGraphNotePath(vaultPath, entities.find((entity) =>
      entity.key === "tool.exec"
    )!);
    const l2Path = resolveToolGraphNotePath(vaultPath, entities.find((entity) =>
      entity.key === "tool.exec.git_vcs"
    )!);

    assertEquals(l1Path, `${vaultPath}/tools/exec/exec.md`);
    assertEquals(l2Path, `${vaultPath}/tools/exec/git_vcs/git_vcs.md`);

    const l1 = await Deno.readTextFile(l1Path);
    const l2 = await Deno.readTextFile(l2Path);

    assertStringIncludes(l1, "tool_graph_key: tool.exec");
    assert(l1.includes("## Previous") === false);
    assertStringIncludes(l1, "## Next");
    assertStringIncludes(l1, "[[tools/read/read|read]] (1)");
    assertStringIncludes(l1, "## Tool Graph Meta");
    assertStringIncludes(l2, "tool_graph_key: tool.exec.git_vcs");
    assert(l2.includes("## Previous") === false);
    assertStringIncludes(l2, "## Next");
    assertStringIncludes(
      l2,
      "[[tools/read/relative_file_path/relative_file_path|relative_file_path]] (1)",
    );
    assertStringIncludes(l2, "\"uniqueAgents\": 2");
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("projectToolGraph is idempotent for the same entity set", async () => {
  const vaultPath = await Deno.makeTempDir();

  try {
    const entities = deriveToolGraphEntities([buildRow()]);

    await projectToolGraph(vaultPath, entities);
    const notePath = `${vaultPath}/tools/exec/exec.md`;
    const first = await Deno.readTextFile(notePath);

    await projectToolGraph(vaultPath, entities);
    const second = await Deno.readTextFile(notePath);

    assertEquals(second, first);
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("projectToolGraph removes stale markdown notes missing from the next entity set", async () => {
  const vaultPath = await Deno.makeTempDir();

  try {
    await projectToolGraph(vaultPath, deriveToolGraphEntities([
      buildRow(),
      buildRow({
        toolName: "read",
        family: "relative:file_path",
      }),
    ]));

    const stalePath = `${vaultPath}/tools/read/read.md`;
    const keptPath = `${vaultPath}/tools/exec/exec.md`;
    assertEquals(await Deno.readTextFile(stalePath).then(() => true), true);

    await projectToolGraph(vaultPath, deriveToolGraphEntities([buildRow()]));

    assertEquals(await Deno.readTextFile(keptPath).then(() => true), true);
    await assertRejects(
      () => Deno.readTextFile(stalePath),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});
