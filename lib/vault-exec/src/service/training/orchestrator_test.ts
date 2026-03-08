import { assertEquals, assertExists } from "jsr:@std/assert";

import { openVaultStore } from "../../db/index.ts";
import type {
  ImportedOpenClawSessionRow,
  ImportedOpenClawToolCallRow,
} from "../../ingest/types.ts";
import { getActiveTrainingBuildId } from "../../training-data/rebuild.ts";
import { rebuildDerivedTrainingData } from "../../training-data/rebuild.ts";
import {
  readLiveTrainingLock,
  readLiveTrainingStatus,
  readRequestedBuild,
  resolveLiveTrainingPaths,
  writeRequestedBuild,
} from "./state.ts";
import { runQueuedLiveTraining } from "./orchestrator.ts";
import { readLiveTrainingFailure } from "./result.ts";

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
    turnCount: 3,
    toolCallCount: 3,
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
    toolResultIsError: false,
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

Deno.test("runQueuedLiveTraining consumes the requested build, trains once, and persists GRU weights", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "vault-live-orchestrator-",
  });
  const vaultPath = `${tempDir}/demo-vault`;
  const dbPath = `${vaultPath}/.vault-exec/vault.kv`;

  try {
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
    const seedKv = await Deno.openKv(dbPath);
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
        buildToolCallRow({
          turnIndex: 3,
          toolName: "write",
          toolCallId: "toolu_3",
          args: { file_path: "notes.md" },
          family: "relative_file_path",
        }),
      ];
      await seedImportedRows(seedKv, sessions, toolCalls);
      await rebuildDerivedTrainingData({
        kv: seedKv,
        sessions,
        toolCalls,
        buildId: "build-test",
      });
    } finally {
      seedKv.close();
    }

    const readKv = await Deno.openKv(dbPath);
    const buildId = await getActiveTrainingBuildId(readKv);
    readKv.close();
    assertExists(buildId);

    const paths = resolveLiveTrainingPaths(vaultPath);
    await writeRequestedBuild(paths.requestedBuildPath, {
      buildId,
      requestedAt: "2026-03-06T12:00:00.000Z",
      requestedBy: "sync-worker-test",
    });

    const result = await runQueuedLiveTraining({
      vaultPath,
      dbPath,
      maxEpochs: 1,
    });

    assertEquals(result.ran, true);
    assertEquals(result.completedBuildIds.includes(buildId), true);
    assertEquals(await readLiveTrainingLock(paths.lockPath), null);
    assertEquals(await readRequestedBuild(paths.requestedBuildPath), null);
    const status = await readLiveTrainingStatus(paths.statusPath);
    assertEquals(status?.state, "completed");
    assertEquals(status?.phase, "done");
    const workerStatus = await readLiveTrainingStatus(paths.workerStatusPath);
    assertEquals(workerStatus?.state, "completed");
    assertEquals(workerStatus?.phase, "done");
    assertEquals(workerStatus?.buildId, buildId);

    const store = await openVaultStore(dbPath);
    try {
      const latest = await store.getLatestWeights();
      assertExists(latest);
      assertEquals(latest.vocabSize > 0, true);
    } finally {
      store.close();
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("runQueuedLiveTraining writes a failure artifact when background training fails", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "vault-live-orchestrator-fail-",
  });
  const vaultPath = `${tempDir}/demo-vault`;
  const dbPath = `${vaultPath}/.vault-exec/missing.kv`;

  try {
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
    const paths = resolveLiveTrainingPaths(vaultPath);
    await writeRequestedBuild(paths.requestedBuildPath, {
      buildId: "build-missing",
      requestedAt: "2026-03-06T12:00:00.000Z",
      requestedBy: "sync-worker-test",
    });

    let failed = false;
    try {
      await runQueuedLiveTraining({
        vaultPath,
        dbPath,
        maxEpochs: 1,
      });
    } catch {
      failed = true;
    }

    assertEquals(failed, true);
    const failure = await readLiveTrainingFailure(
      `${paths.resultDir}/build-missing/gru`,
    );
    assertEquals(failure?.buildId, "build-missing");
    assertEquals(typeof failure?.error, "string");
    const status = await readLiveTrainingStatus(paths.statusPath);
    assertEquals(status?.state, "failed");
    assertEquals(status?.phase, "done");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
