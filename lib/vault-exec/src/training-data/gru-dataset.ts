import { deriveToolGraphKeysForCall } from "../ingest/tool-graph/naming.ts";
import type { ImportedOpenClawToolCallRow } from "../ingest/types.ts";
import type { TrainingExample } from "../gru/trainer.ts";
import type { SessionSequenceRow } from "./rebuild.ts";
import {
  DEFAULT_GRU_CONFIG,
  type GRUConfig,
  type GRUVocabulary,
  type VocabNode,
} from "../gru/types.ts";

export interface GruTrainingLeafEmbeddingRow {
  leafKey: string;
  level: 1 | 2 | 3;
  embedding: number[];
}

export interface BuildGruTrainingExamplesOptions {
  minCalls?: number;
  includeSubagents?: boolean;
  config?: GRUConfig;
  intentEmbeddingsByCallKey?: ReadonlyMap<string, number[]>;
  maxExamples?: number;
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

function zeroIntentEmbedding(config: GRUConfig): number[] {
  return new Array(config.inputDim).fill(0);
}

function sessionKeyForCall(row: ImportedOpenClawToolCallRow): string {
  return `${row.sourceRoot}::${row.sessionId}`;
}

function compareSessionRows(
  left: SessionSequenceRow,
  right: SessionSequenceRow,
): number {
  return left.sourceRoot.localeCompare(right.sourceRoot) ||
    left.sessionId.localeCompare(right.sessionId);
}

function capExamples(
  rows: TrainingExample[],
  maxExamples?: number,
): TrainingExample[] {
  if (!maxExamples || rows.length <= maxExamples) {
    return rows;
  }
  return rows.slice(rows.length - maxExamples);
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

export function buildGruVocabularyFromLeafEmbeddings(
  rows: GruTrainingLeafEmbeddingRow[],
): GRUVocabulary {
  const nodes: VocabNode[] = rows
    .slice()
    .sort((left, right) => compareStrings(left.leafKey, right.leafKey))
    .map((row) => ({
      name: row.leafKey,
      level: row.level,
      embedding: row.embedding,
    }));

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
          `[training-data/gru-dataset] Expected intent embedding length ${config.inputDim}, got ${intentEmb.length}`,
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

  return capExamples(examples, options.maxExamples);
}

export function buildGruTrainingExamplesFromSessionSequences(
  rows: SessionSequenceRow[],
  vocab: GRUVocabulary,
  options: BuildGruTrainingExamplesOptions = {},
): TrainingExample[] {
  const minCalls = options.minCalls ?? 3;
  const includeSubagents = options.includeSubagents ?? true;
  const config = options.config ?? DEFAULT_GRU_CONFIG;
  const zeroIntent = zeroIntentEmbedding(config);

  const sorted = rows.slice().sort(compareSessionRows);
  const examples: TrainingExample[] = [];

  for (const row of sorted) {
    if (!includeSubagents && row.sessionKind === "subagent") {
      continue;
    }
    if (row.leafKeys.length < minCalls) {
      continue;
    }

    for (
      let targetPosition = 1;
      targetPosition < row.leafKeys.length;
      targetPosition++
    ) {
      const targetLeaf = row.leafKeys[targetPosition];
      const targetIdx = vocab.nameToIndex.get(targetLeaf);
      if (targetIdx === undefined) {
        continue;
      }

      const path = row.leafKeys.slice(0, targetPosition + 1);
      if (path.length < 2) {
        continue;
      }

      examples.push({
        intentEmb: zeroIntent,
        path,
        targetIdx,
        parentIdx: null,
        childIdx: null,
        negative: false,
      });
    }
  }

  return capExamples(examples, options.maxExamples);
}
