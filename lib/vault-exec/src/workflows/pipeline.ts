import type { IVaultStore, TraceRow, VaultNote } from "../core/types.ts";
import { gnnForward } from "../gnn/application/forward.ts";
import { DEFAULT_GNN_CONFIG } from "../gnn/domain/types.ts";
import type { GNNNode } from "../gnn/domain/types.ts";
import {
  loadOrInitGnnParams,
  persistGnnParams,
} from "../gnn/infrastructure/runtime-store.ts";
import {
  getBlasStatus,
  initBlasAcceleration,
} from "../gnn/infrastructure/blas-ffi.ts";
import { DEFAULT_GRU_CONFIG } from "../gru/types.ts";
import type { GRUVocabulary, VocabNode } from "../gru/types.ts";
import type { TrainingExample } from "../gru/trainer.ts";

export interface GnnRefreshResult {
  updated: boolean;
  embeddingCount: number;
  paramsSource: "loaded" | "initialized" | "skipped";
  blasReady: boolean;
  blasPath: string | null;
}

function buildGnnNodes(
  notes: VaultNote[],
  rows: Awaited<ReturnType<IVaultStore["getAllNotes"]>>,
): GNNNode[] {
  return rows.map((row) => {
    if (!row.embedding) {
      throw new Error(
        `Note "${row.name}" has no embedding after indexing. This should not happen.`,
      );
    }
    const note = notes.find((n) => n.name === row.name);
    return {
      name: row.name,
      level: row.level,
      embedding: row.embedding,
      children: note?.wikilinks ?? [],
    };
  });
}

export async function refreshGnnEmbeddings(
  store: IVaultStore,
  notes: VaultNote[],
): Promise<GnnRefreshResult> {
  const allNotes = await store.getAllNotes();
  const maxLevel = Math.max(...allNotes.map((n) => n.level), 0);
  if (maxLevel <= 0) {
    return {
      updated: false,
      embeddingCount: 0,
      paramsSource: "skipped",
      blasReady: false,
      blasPath: null,
    };
  }

  const blasReady = initBlasAcceleration();
  const blas = getBlasStatus();

  const gnnNodes = buildGnnNodes(notes, allNotes);
  const config = DEFAULT_GNN_CONFIG;
  const { params, source } = await loadOrInitGnnParams(
    store,
    config,
    maxLevel,
  );
  const gnnEmbeddings = gnnForward(gnnNodes, params, config);

  for (const [name, emb] of gnnEmbeddings) {
    await store.updateNoteGnnEmbedding(name, emb);
  }
  await persistGnnParams(store, params);

  return {
    updated: true,
    embeddingCount: gnnEmbeddings.size,
    paramsSource: source,
    blasReady,
    blasPath: blas.path,
  };
}

export function buildGruVocabulary(
  rows: Awaited<ReturnType<IVaultStore["getAllNotes"]>>,
): GRUVocabulary {
  const vocabNodes: VocabNode[] = rows
    .filter((row) => row.gnnEmbedding || row.embedding)
    .map((row) => ({
      name: row.name,
      level: row.level,
      embedding: row.gnnEmbedding ?? row.embedding!,
    }));

  return {
    nodes: vocabNodes,
    nameToIndex: new Map(vocabNodes.map((n, i) => [n.name, i])),
    indexToName: vocabNodes.map((n) => n.name),
  };
}

function buildParentOf(notes: VaultNote[]): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const note of notes) {
    for (const child of note.wikilinks) {
      parentOf.set(child, note.name);
    }
  }
  return parentOf;
}

export function buildTrainingExamples(
  traces: TraceRow[],
  notes: VaultNote[],
  vocab: GRUVocabulary,
): TrainingExample[] {
  const config = DEFAULT_GRU_CONFIG;
  const parentOf = buildParentOf(notes);

  return traces
    .filter((t) => t.path.length >= 2)
    .filter((t) => vocab.nameToIndex.has(t.targetNote))
    .map((t) => {
      const targetName = t.targetNote;
      const targetIdx = vocab.nameToIndex.get(targetName)!;
      const parent = parentOf.get(targetName);
      const parentIdx = parent !== undefined
        ? (vocab.nameToIndex.get(parent) ?? null)
        : null;

      const targetNote = notes.find((n) => n.name === targetName);
      const firstChild = targetNote?.wikilinks.find((c) =>
        vocab.nameToIndex.has(c)
      );
      const childIdx = firstChild !== undefined
        ? vocab.nameToIndex.get(firstChild)!
        : null;

      const intentEmb = (t.intentEmbedding && t.intentEmbedding.length > 0)
        ? t.intentEmbedding
        : new Array(config.inputDim).fill(0);

      return {
        intentEmb,
        path: t.path,
        targetIdx,
        parentIdx,
        childIdx,
        negative: t.success === false,
      };
    });
}
