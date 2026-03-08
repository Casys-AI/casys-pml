import { assertEquals, assertRejects } from "jsr:@std/assert";

import { VaultKV } from "../db/store-kv.ts";
import { deserializeWeights } from "../gru/weights.ts";
import type { GNNConfig } from "../gnn/domain/types.ts";
import type { GRUConfig } from "../gru/types.ts";
import type { ImportedOpenClawToolCallRow } from "../ingest/types.ts";
import type { ToolLeafEdgeNextRow, ToolLeafNodeRow } from "./rebuild.ts";
import { trainGruFromOpenClawData } from "./gru-training.ts";

function buildNode(
  overrides: Partial<ToolLeafNodeRow> = {},
): ToolLeafNodeRow {
  return {
    leafKey: "tool.exec.git_vcs",
    toolRoot: "exec",
    level: 2,
    isFallback: false,
    totalOccurrences: 8,
    topLevelOccurrences: 8,
    subagentOccurrences: 0,
    uniqueSessions: 2,
    uniqueAgents: 1,
    ...overrides,
  };
}

function buildEdge(
  overrides: Partial<ToolLeafEdgeNextRow> = {},
): ToolLeafEdgeNextRow {
  return {
    fromLeaf: "tool.exec.git_vcs",
    toLeaf: "tool.read.relative_path",
    weight: 2,
    topLevelWeight: 2,
    subagentWeight: 0,
    ...overrides,
  };
}

function buildToolCall(
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
    args: { command: "git status" },
    family: "git_vcs",
    l2Hit: true,
    l2FallbackReason: undefined,
    l2Context: undefined,
    userIntent: "inspect repo state",
    userProvenance: undefined,
    assistantFinalText: "I will inspect the repo.",
    assistantThinking: ["Need tool output before editing."],
    parentPlanHint: undefined,
    toolResultContent: undefined,
    toolResultDetails: undefined,
    toolResultIsError: false,
    ...overrides,
  };
}

Deno.test("trainGruFromOpenClawData persists GRU weights built from GNN leaf embeddings", async () => {
  const db = await VaultKV.open(":memory:");

  try {
    const events: string[] = [];
    const gnnConfig: GNNConfig = {
      numHeads: 1,
      headDim: 4,
      embDim: 8,
      shareLevelWeights: true,
      leakyReluAlpha: 0.2,
    };
    const gruConfig: GRUConfig = {
      inputDim: 8,
      hiddenDim: 4,
      projectionDim: 4,
      intentDim: 4,
      fusionDim: 4,
      outputDim: 8,
    };

    const result = await trainGruFromOpenClawData(db, {
      nodeRows: [
        buildNode(),
        buildNode({
          leafKey: "tool.read.relative_path",
          toolRoot: "read",
          totalOccurrences: 6,
        }),
        buildNode({
          leafKey: "tool.write.relative_path",
          toolRoot: "write",
          totalOccurrences: 4,
        }),
      ],
      edgeRows: [
        buildEdge(),
        buildEdge({
          fromLeaf: "tool.read.relative_path",
          toLeaf: "tool.write.relative_path",
          weight: 2,
        }),
      ],
      toolCalls: [
        buildToolCall(),
        buildToolCall({
          turnIndex: 2,
          toolCallId: "toolu_2",
          toolName: "read",
          family: "relative_path",
        }),
        buildToolCall({
          turnIndex: 3,
          toolCallId: "toolu_3",
          toolName: "write",
          family: "relative_path",
        }),
      ],
      gnnConfig,
      gruConfig,
      maxEpochs: 1,
      minCalls: 3,
      onProgress: (event) => {
        events.push(
          `${event.kind}:${event.phase}:${event.current}/${event.total}`,
        );
      },
    });

    assertEquals(result.paramsSource, "initialized");
    assertEquals(result.vocabSize, 3);
    assertEquals(result.exampleCount, 2);
    assertEquals(result.epochs, 1);
    assertEquals(result.history.length, 1);
    assertEquals((await db.getGnnParams()) !== null, true);

    const latest = await db.getLatestWeights();
    assertEquals(latest !== null, true);
    assertEquals(latest?.vocabSize, 3);

    const decoded = await deserializeWeights(latest!.blob);
    assertEquals(decoded.config.inputDim, 8);
    assertEquals(decoded.vocab.indexToName, [
      "tool.exec.git_vcs",
      "tool.read.relative_path",
      "tool.write.relative_path",
    ]);
    assertEquals(events, [
      "stage:gnn:1/6",
      "stage:vocab:2/6",
      "stage:examples:3/6",
      "stage:train:4/6",
      "epoch:train:1/1",
      "stage:serialize:5/6",
      "stage:persist:6/6",
      "stage:done:6/6",
    ]);
  } finally {
    db.close();
  }
});

Deno.test("trainGruFromOpenClawData rejects mismatched GNN and GRU dimensions", async () => {
  const db = await VaultKV.open(":memory:");

  try {
    await assertRejects(
      () =>
        trainGruFromOpenClawData(db, {
          nodeRows: [buildNode()],
          edgeRows: [],
          toolCalls: [buildToolCall(), buildToolCall({ turnIndex: 2 })],
          gnnConfig: {
            numHeads: 1,
            headDim: 4,
            embDim: 8,
            shareLevelWeights: true,
            leakyReluAlpha: 0.2,
          },
          gruConfig: {
            inputDim: 16,
            hiddenDim: 4,
            projectionDim: 4,
            intentDim: 4,
            fusionDim: 4,
            outputDim: 16,
          },
        }),
      Error,
      "must match GRU inputDim",
    );
  } finally {
    db.close();
  }
});

Deno.test("trainGruFromOpenClawData can cap the number of training examples", async () => {
  const db = await VaultKV.open(":memory:");

  try {
    const result = await trainGruFromOpenClawData(db, {
      nodeRows: [
        buildNode(),
        buildNode({
          leafKey: "tool.read.relative_path",
          toolRoot: "read",
          totalOccurrences: 6,
        }),
        buildNode({
          leafKey: "tool.write.relative_path",
          toolRoot: "write",
          totalOccurrences: 4,
        }),
      ],
      edgeRows: [
        buildEdge(),
        buildEdge({
          fromLeaf: "tool.read.relative_path",
          toLeaf: "tool.write.relative_path",
          weight: 2,
        }),
      ],
      toolCalls: [
        buildToolCall(),
        buildToolCall({
          turnIndex: 2,
          toolCallId: "toolu_2",
          toolName: "read",
          family: "relative_path",
        }),
        buildToolCall({
          turnIndex: 3,
          toolCallId: "toolu_3",
          toolName: "write",
          family: "relative_path",
        }),
      ],
      gnnConfig: {
        numHeads: 1,
        headDim: 4,
        embDim: 8,
        shareLevelWeights: true,
        leakyReluAlpha: 0.2,
      },
      gruConfig: {
        inputDim: 8,
        hiddenDim: 4,
        projectionDim: 4,
        intentDim: 4,
        fusionDim: 4,
        outputDim: 8,
      },
      maxEpochs: 1,
      minCalls: 3,
      maxExamples: 1,
    });

    assertEquals(result.exampleCount, 1);
  } finally {
    db.close();
  }
});
