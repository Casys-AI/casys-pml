import type { IVaultStore } from "../core/types.ts";
import { deriveToolGraphKeysForCall } from "../ingest/tool-graph/naming.ts";
import type { ImportedOpenClawToolCallRow } from "../ingest/types.ts";
import { gnnForward } from "../gnn/application/forward.ts";
import {
  DEFAULT_GNN_CONFIG,
  type GNNConfig,
  type GNNNode,
} from "../gnn/domain/types.ts";
import {
  loadOrInitGnnParams,
  persistGnnParams,
} from "../gnn/infrastructure/runtime-store.ts";
import type { TrainingExample } from "../gru/trainer.ts";
import {
  DEFAULT_GRU_CONFIG,
  type GRUConfig,
  type GRUVocabulary,
  type VocabNode,
} from "../gru/types.ts";
import type { ToolLeafEdgeNextRow, ToolLeafNodeRow } from "./rebuild.ts";

const HASH_MODULUS = 2_147_483_647;
const HASH_MULTIPLIER = 31;

export interface RunLeafGnnForwardResult {
  paramsSource: "loaded" | "initialized";
  seedEmbeddings: Map<string, number[]>;
  gnnEmbeddings: Map<string, number[]>;
  graphNodes: GNNNode[];
}

export interface BuildGruTrainingExamplesOptions {
  minCalls?: number;
  includeSubagents?: boolean;
  config?: GRUConfig;
  intentEmbeddingsByCallKey?: ReadonlyMap<string, number[]>;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareToolCalls(
  left: ImportedOpenClawToolCallRow,
  right: ImportedOpenClawToolCallRow,
): number {
  return left.sourceRoot.localeCompare(right.sourceRoot) ||
    left.sessionId.localeCompare(right.sessionId) ||
    left.turnIndex - right.turnIndex ||
    left.callIndex - right.callIndex;
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * HASH_MULTIPLIER + char.charCodeAt(0)) % HASH_MODULUS;
  }
  return hash;
}

function normalizeVector(values: number[]): number[] {
  let normSquared = 0;
  for (const value of values) {
    normSquared += value * value;
  }
  const norm = Math.sqrt(normSquared);
  if (norm <= 1e-12) {
    return values;
  }
  return values.map((value) => value / norm);
}

function buildLeafFeatureVector(
  row: ToolLeafNodeRow,
  maxima: {
    totalOccurrences: number;
    uniqueSessions: number;
    uniqueAgents: number;
  },
): number[] {
  const total = row.totalOccurrences /
    Math.max(1, maxima.totalOccurrences);
  const uniqueSessions = row.uniqueSessions /
    Math.max(1, maxima.uniqueSessions);
  const uniqueAgents = row.uniqueAgents /
    Math.max(1, maxima.uniqueAgents);
  const topLevelShare = row.totalOccurrences === 0
    ? 0
    : row.topLevelOccurrences / row.totalOccurrences;
  const subagentShare = row.totalOccurrences === 0
    ? 0
    : row.subagentOccurrences / row.totalOccurrences;
  const fallback = row.isFallback ? 1 : 0;
  const level = row.level / 3;
  const toolRootHash = hashString(row.toolRoot) / HASH_MODULUS;

  return [
    total,
    uniqueSessions,
    uniqueAgents,
    topLevelShare,
    subagentShare,
    fallback,
    level,
    toolRootHash,
  ];
}

function expandLeafFeatures(
  leafKey: string,
  features: number[],
  dimension: number,
): number[] {
  const expanded = new Array<number>(dimension);
  for (let index = 0; index < dimension; index++) {
    const base = features[index % features.length];
    const phase = hashString(`${leafKey}#${index}`) / HASH_MODULUS;
    const signal = Math.sin((phase * Math.PI * 2) + index) * 0.5 + 0.5;
    const bias = features[(index + 3) % features.length] * 0.15;
    expanded[index] = base * (0.55 + signal) + bias;
  }
  return normalizeVector(expanded);
}

function zeroIntentEmbedding(config: GRUConfig): number[] {
  return new Array(config.inputDim).fill(0);
}

function sessionKeyForCall(row: ImportedOpenClawToolCallRow): string {
  return `${row.sourceRoot}::${row.sessionId}`;
}

export function toolCallTrainingKey(row: ImportedOpenClawToolCallRow): string {
  return `${sessionKeyForCall(row)}::${row.turnIndex}::${row.callIndex}`;
}

export function renderToolCallTrainingContext(
  row: ImportedOpenClawToolCallRow,
): string {
  const parts = [
    `tool: ${row.toolName}`,
    `leaf: ${
      deriveToolGraphKeysForCall(row).l2Key ??
        deriveToolGraphKeysForCall(row).l1Key
    }`,
    row.userIntent ? `user_intent: ${row.userIntent}` : "",
    row.parentPlanHint ? `parent_plan: ${row.parentPlanHint}` : "",
    row.assistantFinalText ? `assistant_final: ${row.assistantFinalText}` : "",
    row.assistantThinking && row.assistantThinking.length > 0
      ? `assistant_thinking: ${row.assistantThinking.join("\n")}`
      : "",
  ].filter((part) => part.length > 0);

  return parts.join("\n");
}

export function buildToolLeafSeedEmbeddings(
  rows: ToolLeafNodeRow[],
  dimension = DEFAULT_GRU_CONFIG.inputDim,
): Map<string, number[]> {
  const maxima = {
    totalOccurrences: Math.max(1, ...rows.map((row) => row.totalOccurrences)),
    uniqueSessions: Math.max(1, ...rows.map((row) => row.uniqueSessions)),
    uniqueAgents: Math.max(1, ...rows.map((row) => row.uniqueAgents)),
  };

  const entries = rows
    .slice()
    .sort((left, right) => compareStrings(left.leafKey, right.leafKey))
    .map((row) => {
      const features = buildLeafFeatureVector(row, maxima);
      return [
        row.leafKey,
        expandLeafFeatures(row.leafKey, features, dimension),
      ] as const;
    });

  return new Map(entries);
}

export function buildToolLeafGraphNodes(
  nodeRows: ToolLeafNodeRow[],
  edgeRows: ToolLeafEdgeNextRow[],
  embeddings: ReadonlyMap<string, number[]>,
): GNNNode[] {
  const children = new Map<string, Set<string>>();
  for (const edge of edgeRows) {
    const bucket = children.get(edge.fromLeaf) ?? new Set<string>();
    bucket.add(edge.toLeaf);
    children.set(edge.fromLeaf, bucket);
  }

  return nodeRows
    .slice()
    .sort((left, right) => compareStrings(left.leafKey, right.leafKey))
    .map((row) => {
      const embedding = embeddings.get(row.leafKey);
      if (!embedding) {
        throw new Error(
          `[training-data/model-inputs] Missing embedding for leaf "${row.leafKey}"`,
        );
      }

      return {
        name: row.leafKey,
        level: row.level,
        embedding,
        children: [...(children.get(row.leafKey) ?? new Set<string>())]
          .sort(compareStrings),
      };
    });
}

export async function runLeafGnnForward(
  store: IVaultStore,
  nodeRows: ToolLeafNodeRow[],
  edgeRows: ToolLeafEdgeNextRow[],
  config: GNNConfig = DEFAULT_GNN_CONFIG,
): Promise<RunLeafGnnForwardResult> {
  const seedEmbeddings = buildToolLeafSeedEmbeddings(nodeRows, config.embDim);
  const graphNodes = buildToolLeafGraphNodes(
    nodeRows,
    edgeRows,
    seedEmbeddings,
  );
  const maxLevel = Math.max(1, ...graphNodes.map((node) => node.level));
  const { params, source } = await loadOrInitGnnParams(store, config, maxLevel);
  const gnnEmbeddings = gnnForward(graphNodes, params, config);
  await persistGnnParams(store, params);

  return {
    paramsSource: source,
    seedEmbeddings,
    gnnEmbeddings,
    graphNodes,
  };
}

export function buildGruVocabularyFromEmbeddings(
  nodeRows: ToolLeafNodeRow[],
  embeddings: ReadonlyMap<string, number[]>,
): GRUVocabulary {
  const nodes: VocabNode[] = nodeRows
    .slice()
    .sort((left, right) => compareStrings(left.leafKey, right.leafKey))
    .map((row) => {
      const embedding = embeddings.get(row.leafKey);
      if (!embedding) {
        throw new Error(
          `[training-data/model-inputs] Missing vocab embedding for leaf "${row.leafKey}"`,
        );
      }
      return {
        name: row.leafKey,
        level: row.level,
        embedding,
      };
    });

  return {
    nodes,
    nameToIndex: new Map(nodes.map((node, index) => [node.name, index])),
    indexToName: nodes.map((node) => node.name),
  };
}

export function buildGruTrainingExamplesFromToolCalls(
  rows: ImportedOpenClawToolCallRow[],
  vocab: GRUVocabulary,
  options: BuildGruTrainingExamplesOptions = {},
): TrainingExample[] {
  const minCalls = options.minCalls ?? 3;
  const includeSubagents = options.includeSubagents ?? true;
  const config = options.config ?? DEFAULT_GRU_CONFIG;
  const intentEmbeddings = options.intentEmbeddingsByCallKey ?? new Map();
  const sessions = new Map<string, ImportedOpenClawToolCallRow[]>();

  for (const row of rows.slice().sort(compareToolCalls)) {
    const bucket = sessions.get(sessionKeyForCall(row)) ?? [];
    bucket.push(row);
    sessions.set(sessionKeyForCall(row), bucket);
  }

  const examples: TrainingExample[] = [];
  for (const sessionRows of sessions.values()) {
    if (
      !includeSubagents &&
      (sessionRows[0].sessionKind ?? "top_level") === "subagent"
    ) {
      continue;
    }

    if (sessionRows.length < minCalls) {
      continue;
    }

    const leafKeys = sessionRows.map((row) => {
      const keys = deriveToolGraphKeysForCall(row);
      return keys.l2Key ?? keys.l1Key;
    });

    for (
      let targetPosition = 1;
      targetPosition < leafKeys.length;
      targetPosition++
    ) {
      const targetLeaf = leafKeys[targetPosition];
      const targetIdx = vocab.nameToIndex.get(targetLeaf);
      if (targetIdx === undefined) {
        continue;
      }

      const path = leafKeys.slice(0, targetPosition + 1);
      if (path.length < 2) {
        continue;
      }

      const intentEmb = intentEmbeddings.get(
        toolCallTrainingKey(sessionRows[targetPosition]),
      ) ?? zeroIntentEmbedding(config);

      if (intentEmb.length !== config.inputDim) {
        throw new Error(
          `[training-data/model-inputs] Expected intent embedding length ${config.inputDim}, got ${intentEmb.length}`,
        );
      }

      examples.push({
        intentEmb,
        path,
        targetIdx,
        parentIdx: null,
        childIdx: null,
        negative: false,
      });
    }
  }

  return examples;
}
