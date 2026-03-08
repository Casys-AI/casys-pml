import type { IVaultStore } from "../core/types.ts";
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
import { DEFAULT_GRU_CONFIG } from "../gru/types.ts";
export {
  buildGruTrainingExamplesFromToolCalls,
  renderToolCallTrainingContext,
  toolCallTrainingKey,
  type BuildGruTrainingExamplesOptions,
  type GruTrainingLeafEmbeddingRow,
} from "./gru-dataset.ts";
import { buildGruVocabularyFromLeafEmbeddings } from "./gru-dataset.ts";
import type { ToolLeafEdgeNextRow, ToolLeafNodeRow } from "./rebuild.ts";

const HASH_MODULUS = 2_147_483_647;
const HASH_MULTIPLIER = 31;

export interface RunLeafGnnForwardResult {
  paramsSource: "loaded" | "initialized";
  seedEmbeddings: Map<string, number[]>;
  gnnEmbeddings: Map<string, number[]>;
  graphNodes: GNNNode[];
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
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
) {
  return buildGruVocabularyFromLeafEmbeddings(
    nodeRows
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
          leafKey: row.leafKey,
          level: row.level,
          embedding,
        };
      }),
  );
}
