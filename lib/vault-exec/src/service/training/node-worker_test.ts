import { assertEquals, assertExists } from "jsr:@std/assert";

import type {
  ImportedOpenClawSessionRow,
  ImportedOpenClawToolCallRow,
} from "../../ingest/types.ts";
import { rebuildDerivedTrainingData } from "../../training-data/rebuild.ts";
import {
  prepareGruTrainingSnapshot,
  readGruTrainingSnapshot,
} from "./runner.ts";
import { readLiveTrainingResult } from "./result.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

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

Deno.test("node worker trains GRU from a prepared snapshot and writes a result artifact", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-node-worker-" });
  const vaultPath = `${tempDir}/demo-vault`;
  const dbPath = `${vaultPath}/.vault-exec/vault.kv`;
  const snapshotDir = `${tempDir}/snapshots/build-test/gru`;
  const resultDir = `${tempDir}/results/build-test/gru`;
  const statusPath = `${tempDir}/status/worker.json`;

  try {
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
        buildToolCallRow({
          turnIndex: 3,
          toolName: "write",
          toolCallId: "toolu_3",
          args: { file_path: "notes.md" },
          family: "relative_file_path",
        }),
      ];
      await seedImportedRows(kv, sessions, toolCalls);
      await rebuildDerivedTrainingData({
        kv,
        sessions,
        toolCalls,
        buildId: "build-test",
      });
    } finally {
      kv.close();
    }

    const snapshot = await prepareGruTrainingSnapshot({
      vaultPath,
      dbPath,
      snapshotDir,
    });
    assertEquals(snapshot.embeddingCount > 0, true);
    assertEquals(await pathExists(`${snapshotDir}/manifest.json`), true);
    assertExists(await readGruTrainingSnapshot(snapshotDir));

    const cmd = new Deno.Command("node", {
      cwd: "/home/ubuntu/CascadeProjects/AgentCards/lib/vault-exec",
      args: [
        "--experimental-transform-types",
        "src/service/training/node-worker.ts",
        "--snapshot",
        snapshotDir,
        "--result",
        resultDir,
        "--status",
        statusPath,
        "--run-id",
        "run-node-worker-test",
        "--max-epochs",
        "1",
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();

    assertEquals(output.success, true);
    assertEquals(await pathExists(`${resultDir}/manifest.json`), true);

    const result = await readLiveTrainingResult(resultDir);
    assertEquals(result.buildId, snapshot.buildId);
    assertEquals(result.metrics.runId, "run-node-worker-test");
    assertEquals(result.gruWeights.vocabSize > 0, true);
    assertEquals(result.metrics.exampleCount > 0, true);
    assertEquals(result.metrics.top3Accuracy >= result.metrics.accuracy, true);
    const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
      state: string;
      phase: string;
      buildId: string;
      runId: string;
    };
    assertEquals(status.state, "completed");
    assertEquals(status.phase, "done");
    assertEquals(status.buildId, snapshot.buildId);
    assertEquals(status.runId, "run-node-worker-test");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("node worker treats sparse snapshots as a no-op instead of failing", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "vault-node-worker-sparse-",
  });
  const vaultPath = `${tempDir}/demo-vault`;
  const dbPath = `${vaultPath}/.vault-exec/vault.kv`;
  const snapshotDir = `${tempDir}/snapshots/build-sparse/gru`;
  const resultDir = `${tempDir}/results/build-sparse/gru`;
  const statusPath = `${tempDir}/status/worker-sparse.json`;

  try {
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });
    const kv = await Deno.openKv(dbPath);
    try {
      const sessions = [buildSessionRow({ toolCallCount: 2, turnCount: 2 })];
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
        buildId: "build-sparse",
      });
    } finally {
      kv.close();
    }

    await prepareGruTrainingSnapshot({
      vaultPath,
      dbPath,
      snapshotDir,
    });

    const output = await new Deno.Command("node", {
      cwd: "/home/ubuntu/CascadeProjects/AgentCards/lib/vault-exec",
      args: [
        "--experimental-transform-types",
        "src/service/training/node-worker.ts",
        "--snapshot",
        snapshotDir,
        "--result",
        resultDir,
        "--status",
        statusPath,
        "--max-epochs",
        "1",
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();

    assertEquals(output.success, true);
    const result = await readLiveTrainingResult(resultDir);
    assertEquals(result.metrics.exampleCount, 0);
    assertEquals(result.metrics.accuracy, 0);
    assertEquals(result.metrics.top3Accuracy, 0);
    assertEquals(result.metrics.mrr, 0);
    const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
      state: string;
      phase: string;
    };
    assertEquals(status.state, "completed");
    assertEquals(status.phase, "done");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
