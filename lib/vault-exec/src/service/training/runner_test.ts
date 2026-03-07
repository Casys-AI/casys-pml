import { assertEquals, assertExists } from "jsr:@std/assert";
import { openVaultStore } from "../../db/index.ts";
import type {
  ImportedOpenClawSessionRow,
  ImportedOpenClawToolCallRow,
} from "../../ingest/types.ts";
import { rebuildDerivedTrainingData } from "../../training-data/rebuild.ts";
import {
  prepareGruTrainingSnapshot,
  readGruTrainingSnapshot,
} from "./runner.ts";
import { resolveLiveTrainingPaths } from "./state.ts";

function buildSessionRow(
  overrides: Partial<ImportedOpenClawSessionRow> = {},
): ImportedOpenClawSessionRow {
  return {
    sourceRoot: "/tmp/.openclaw/agents/alpha/sessions",
    sourcePath: "/tmp/.openclaw/agents/alpha/sessions/sess-a.jsonl",
    contentHash: "hash-a",
    sessionId: "sess-a",
    sessionShortId: "sessa",
    sessionStartedAt: "2026-03-06T12:00:00.000Z",
    agentId: "alpha",
    modelId: "gpt-5",
    sessionKind: "top_level",
    importedAt: "2026-03-06T12:30:00.000Z",
    turnCount: 2,
    toolCallCount: 2,
    ...overrides,
  };
}

function buildToolCallRow(
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
    sessionKind: "top_level",
    turnIndex: 1,
    callIndex: 0,
    timestamp: "2026-03-06T12:00:01.000Z",
    modelId: "gpt-5",
    toolName: "exec",
    toolCallId: "toolu_1",
    args: { command: "git status --short" },
    family: "git_vcs",
    l2Hit: true,
    userIntent: "check status",
    ...overrides,
  };
}

async function seedImportedRows(
  kv: Deno.Kv,
  sessions: ImportedOpenClawSessionRow[],
  toolCalls: ImportedOpenClawToolCallRow[],
): Promise<void> {
  for (const session of sessions) {
    await kv.set([
      "vault",
      "openclaw",
      "sessions",
      session.sourceRoot,
      session.sessionId,
    ], session);
  }

  for (const row of toolCalls) {
    await kv.set([
      "vault",
      "openclaw",
      "tool_calls",
      row.sourceRoot,
      row.sessionId,
      String(row.turnIndex).padStart(8, "0"),
      String(row.callIndex).padStart(8, "0"),
    ], row);
  }
}

Deno.test("prepareGruTrainingSnapshot runs the custom GNN path and exports leaf embeddings", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-live-runner-" });
  const vaultPath = `${tempDir}/demo-vault`;
  const dbPath = `${vaultPath}/.vault-exec/vault.kv`;
  await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
  const kv = await Deno.openKv(dbPath);

  try {
    const sessions = [buildSessionRow()];
    const toolCalls = [
      buildToolCallRow(),
      buildToolCallRow({
        turnIndex: 2,
        toolName: "read",
        toolCallId: "toolu_2",
        args: { file_path: "notes.md" },
        family: "relative_file_path",
      }),
    ];

    await seedImportedRows(kv, sessions, toolCalls);
    await rebuildDerivedTrainingData({
      kv,
      sessions,
      toolCalls,
      buildId: "build-123",
    });

    const result = await prepareGruTrainingSnapshot({ vaultPath, dbPath });

    assertEquals(result.buildId, "build-123");
    assertEquals(result.embeddingCount, 2);
    assertEquals(
      result.snapshotDir,
      `${resolveLiveTrainingPaths(vaultPath).snapshotDir}/build-123/gru`,
    );
    assertExists(result.snapshotDir);

    const snapshot = await readGruTrainingSnapshot(result.snapshotDir);
    assertEquals(snapshot.buildId, "build-123");
    assertEquals(snapshot.leafEmbeddings.length, 2);
    assertEquals(snapshot.leafEmbeddings[0].embedding.length, 1024);
    assertEquals(snapshot.toolCalls.length, 2);

    const store = await openVaultStore(dbPath);
    try {
      const gnn = await store.getGnnParams();
      assertExists(gnn);
    } finally {
      store.close();
    }
  } finally {
    kv.close();
    await Deno.remove(tempDir, { recursive: true });
  }
});
