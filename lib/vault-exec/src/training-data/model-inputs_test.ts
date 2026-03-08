import { assertEquals } from "jsr:@std/assert";

import { VaultKV } from "../db/store-kv.ts";
import type { ImportedOpenClawToolCallRow } from "../ingest/types.ts";
import type { GNNConfig } from "../gnn/domain/types.ts";
import { DEFAULT_GRU_CONFIG } from "../gru/types.ts";
import type { ToolLeafEdgeNextRow, ToolLeafNodeRow } from "./rebuild.ts";
import {
  buildGruTrainingExamplesFromToolCalls,
  buildGruVocabularyFromEmbeddings,
  buildToolLeafSeedEmbeddings,
  renderToolCallTrainingContext,
  runLeafGnnForward,
  toolCallTrainingKey,
} from "./model-inputs.ts";

function buildNode(
  overrides: Partial<ToolLeafNodeRow> = {},
): ToolLeafNodeRow {
  return {
    leafKey: "tool.exec.git_vcs",
    toolRoot: "exec",
    level: 2,
    isFallback: false,
    totalOccurrences: 10,
    topLevelOccurrences: 8,
    subagentOccurrences: 2,
    uniqueSessions: 4,
    uniqueAgents: 2,
    ...overrides,
  };
}

function buildEdge(
  overrides: Partial<ToolLeafEdgeNextRow> = {},
): ToolLeafEdgeNextRow {
  return {
    fromLeaf: "tool.exec.git_vcs",
    toLeaf: "tool.read.relative_path",
    weight: 3,
    topLevelWeight: 3,
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
    userIntent: "check repository status",
    userProvenance: undefined,
    assistantFinalText: "I will inspect the repo state.",
    assistantThinking: ["Need the current git status before editing."],
    parentPlanHint: "Establish repository context",
    toolResultContent: undefined,
    toolResultDetails: undefined,
    toolResultIsError: false,
    ...overrides,
  };
}

Deno.test("buildToolLeafSeedEmbeddings is deterministic and sized to the requested dimension", () => {
  const nodes = [
    buildNode(),
    buildNode({
      leafKey: "tool.read.relative_path",
      toolRoot: "read",
      totalOccurrences: 6,
      topLevelOccurrences: 6,
      subagentOccurrences: 0,
    }),
  ];

  const first = buildToolLeafSeedEmbeddings(nodes, 16);
  const second = buildToolLeafSeedEmbeddings(nodes, 16);

  assertEquals(first.size, 2);
  assertEquals(first.get("tool.exec.git_vcs")?.length, 16);
  assertEquals(first.get("tool.exec.git_vcs"), second.get("tool.exec.git_vcs"));
});

Deno.test("runLeafGnnForward uses the real GNN forward path and persists params", async () => {
  const db = await VaultKV.open(":memory:");

  try {
    const config: GNNConfig = {
      numHeads: 1,
      headDim: 4,
      embDim: 8,
      shareLevelWeights: true,
      leakyReluAlpha: 0.2,
    };
    const nodes = [
      buildNode(),
      buildNode({
        leafKey: "tool.read.relative_path",
        toolRoot: "read",
        totalOccurrences: 6,
        topLevelOccurrences: 6,
        subagentOccurrences: 0,
      }),
    ];
    const edges = [buildEdge()];

    const result = await runLeafGnnForward(db, nodes, edges, config);

    assertEquals(result.paramsSource, "initialized");
    assertEquals(result.graphNodes.length, 2);
    assertEquals(result.gnnEmbeddings.size, 2);
    assertEquals(result.gnnEmbeddings.get("tool.exec.git_vcs")?.length, 8);
    assertEquals((await db.getGnnParams()) !== null, true);
  } finally {
    db.close();
  }
});

Deno.test("buildGruVocabularyFromEmbeddings sorts leaves and preserves embeddings", () => {
  const nodes = [
    buildNode({ leafKey: "tool.read.relative_path", toolRoot: "read" }),
    buildNode(),
  ];
  const embeddings = new Map<string, number[]>([
    ["tool.exec.git_vcs", new Array(4).fill(1)],
    ["tool.read.relative_path", new Array(4).fill(2)],
  ]);

  const vocab = buildGruVocabularyFromEmbeddings(nodes, embeddings);

  assertEquals(vocab.indexToName, [
    "tool.exec.git_vcs",
    "tool.read.relative_path",
  ]);
  assertEquals(vocab.nameToIndex.get("tool.read.relative_path"), 1);
  assertEquals(vocab.nodes[0].embedding, new Array(4).fill(1));
});

Deno.test("buildGruTrainingExamplesFromToolCalls derives leaf paths and respects filters", () => {
  const vocab = buildGruVocabularyFromEmbeddings(
    [
      buildNode(),
      buildNode({
        leafKey: "tool.read.relative_path",
        toolRoot: "read",
      }),
      buildNode({
        leafKey: "tool.write.relative_path",
        toolRoot: "write",
      }),
    ],
    new Map<string, number[]>([
      ["tool.exec.git_vcs", new Array(8).fill(1)],
      ["tool.read.relative_path", new Array(8).fill(2)],
      ["tool.write.relative_path", new Array(8).fill(3)],
    ]),
  );

  const topLevelRows = [
    buildToolCall(),
    buildToolCall({
      turnIndex: 2,
      callIndex: 0,
      toolCallId: "toolu_2",
      toolName: "read",
      family: "relative_path",
      args: { file_path: "README.md" },
    }),
    buildToolCall({
      turnIndex: 3,
      callIndex: 0,
      toolCallId: "toolu_3",
      toolName: "write",
      family: "relative_path",
      args: { file_path: "README.md" },
    }),
  ];
  const subagentRows = [
    buildToolCall({
      sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
      sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
      sessionId: "sess-b",
      sessionShortId: "sessb",
      agentId: "beta",
      sessionKind: "subagent",
      toolCallId: "toolu_4",
      toolName: "read",
      family: "relative_path",
    }),
    buildToolCall({
      sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
      sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
      sessionId: "sess-b",
      sessionShortId: "sessb",
      agentId: "beta",
      sessionKind: "subagent",
      turnIndex: 2,
      toolCallId: "toolu_5",
      toolName: "write",
      family: "relative_path",
    }),
    buildToolCall({
      sourceRoot: "/tmp/.openclaw/agents/beta/sessions",
      sourcePath: "/tmp/.openclaw/agents/beta/sessions/sess-b.jsonl",
      sessionId: "sess-b",
      sessionShortId: "sessb",
      agentId: "beta",
      sessionKind: "subagent",
      turnIndex: 3,
      toolCallId: "toolu_6",
      toolName: "exec",
      family: "git_vcs",
    }),
  ];
  const shortRows = [
    buildToolCall({
      sourceRoot: "/tmp/.openclaw/agents/gamma/sessions",
      sourcePath: "/tmp/.openclaw/agents/gamma/sessions/sess-c.jsonl",
      sessionId: "sess-c",
      sessionShortId: "sessc",
      agentId: "gamma",
      toolCallId: "toolu_7",
    }),
    buildToolCall({
      sourceRoot: "/tmp/.openclaw/agents/gamma/sessions",
      sourcePath: "/tmp/.openclaw/agents/gamma/sessions/sess-c.jsonl",
      sessionId: "sess-c",
      sessionShortId: "sessc",
      agentId: "gamma",
      turnIndex: 2,
      toolCallId: "toolu_8",
      toolName: "read",
      family: "relative_path",
    }),
  ];

  const intentEmb = new Array(DEFAULT_GRU_CONFIG.inputDim).fill(0.25);
  const intentEmbeddings = new Map<string, number[]>([
    [toolCallTrainingKey(topLevelRows[1]), intentEmb],
  ]);

  const topLevelOnly = buildGruTrainingExamplesFromToolCalls(
    [...topLevelRows, ...subagentRows, ...shortRows],
    vocab,
    {
      minCalls: 3,
      includeSubagents: false,
      intentEmbeddingsByCallKey: intentEmbeddings,
    },
  );

  assertEquals(topLevelOnly.length, 2);
  assertEquals(topLevelOnly[0].path, [
    "tool.exec.git_vcs",
    "tool.read.relative_path",
  ]);
  assertEquals(topLevelOnly[0].targetIdx, 1);
  assertEquals(topLevelOnly[0].intentEmb, intentEmb);
  assertEquals(topLevelOnly[1].path, [
    "tool.exec.git_vcs",
    "tool.read.relative_path",
    "tool.write.relative_path",
  ]);
  assertEquals(
    topLevelOnly[1].intentEmb,
    new Array(DEFAULT_GRU_CONFIG.inputDim).fill(0),
  );

  const withSubagents = buildGruTrainingExamplesFromToolCalls(
    [...topLevelRows, ...subagentRows],
    vocab,
    { minCalls: 3, includeSubagents: true },
  );

  assertEquals(withSubagents.length, 4);
});

Deno.test("renderToolCallTrainingContext keeps the useful stored context", () => {
  const row = buildToolCall();

  assertEquals(
    renderToolCallTrainingContext(row),
    [
      "tool: exec",
      "leaf: tool.exec.git_vcs",
      "user_intent: check repository status",
      "parent_plan: Establish repository context",
      "assistant_final: I will inspect the repo state.",
      "assistant_thinking: Need the current git status before editing.",
    ].join("\n"),
  );
});
