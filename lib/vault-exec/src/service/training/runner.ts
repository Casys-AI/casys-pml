import { openVaultStore } from "../../db/index.ts";
import { OpenClawLocalStore } from "../../ingest/local-store.ts";
import type { ImportedOpenClawToolCallRow } from "../../ingest/types.ts";
import { DEFAULT_GNN_CONFIG, type GNNConfig } from "../../gnn/domain/types.ts";
import { runLeafGnnForward } from "../../training-data/model-inputs.ts";
import {
  getActiveTrainingBuildId,
  listActiveToolLeafEdgesNext,
  listActiveToolLeafNodes,
  type ToolLeafNodeRow,
} from "../../training-data/rebuild.ts";
import type { GruTrainingLeafEmbeddingRow } from "../../training-data/gru-dataset.ts";
import { resolveLiveTrainingPaths } from "./state.ts";

interface GruWeightsManifest {
  fileName: string;
  vocabSize: number;
  epoch: number;
  accuracy: number;
}

interface GruTrainingSnapshotManifest {
  version: 1;
  buildId: string;
  createdAt: string;
  vaultPath: string;
  paramsSource: "loaded" | "initialized";
  nodeRows: ToolLeafNodeRow[];
  toolCalls: ImportedOpenClawToolCallRow[];
  leafEmbeddings: GruTrainingLeafEmbeddingRow[];
  gruWeights?: GruWeightsManifest;
}

export interface GruTrainingSnapshot {
  version: 1;
  buildId: string;
  createdAt: string;
  vaultPath: string;
  paramsSource: "loaded" | "initialized";
  nodeRows: ToolLeafNodeRow[];
  toolCalls: ImportedOpenClawToolCallRow[];
  leafEmbeddings: GruTrainingLeafEmbeddingRow[];
  gruWeights?: {
    bytes: Uint8Array;
    vocabSize: number;
    epoch: number;
    accuracy: number;
  };
}

export interface PrepareGruTrainingSnapshotArgs {
  vaultPath: string;
  dbPath: string;
  snapshotDir?: string;
  gnnConfig?: GNNConfig;
}

export interface PrepareGruTrainingSnapshotResult {
  buildId: string;
  snapshotDir: string;
  embeddingCount: number;
  paramsSource: "loaded" | "initialized";
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

async function ensureDir(path: string): Promise<void> {
  await Deno.mkdir(path, { recursive: true });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.writeTextFile(path, JSON.stringify(value, null, 2));
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await Deno.readTextFile(path);
  return JSON.parse(raw) as T;
}

export async function readGruTrainingSnapshot(
  snapshotDir: string,
): Promise<GruTrainingSnapshot> {
  const manifest = await readJson<GruTrainingSnapshotManifest>(
    joinPath(snapshotDir, "manifest.json"),
  );

  return {
    version: manifest.version,
    buildId: manifest.buildId,
    createdAt: manifest.createdAt,
    vaultPath: manifest.vaultPath,
    paramsSource: manifest.paramsSource,
    nodeRows: manifest.nodeRows,
    toolCalls: manifest.toolCalls,
    leafEmbeddings: manifest.leafEmbeddings,
    gruWeights: manifest.gruWeights
      ? {
        bytes: await Deno.readFile(
          joinPath(snapshotDir, manifest.gruWeights.fileName),
        ),
        vocabSize: manifest.gruWeights.vocabSize,
        epoch: manifest.gruWeights.epoch,
        accuracy: manifest.gruWeights.accuracy,
      }
      : undefined,
  };
}

export async function prepareGruTrainingSnapshot(
  args: PrepareGruTrainingSnapshotArgs,
): Promise<PrepareGruTrainingSnapshotResult> {
  const kv = await Deno.openKv(args.dbPath);
  const store = await openVaultStore(args.dbPath);
  const openClawStore = await OpenClawLocalStore.open(args.dbPath);

  try {
    const buildId = await getActiveTrainingBuildId(kv);
    if (!buildId) {
      throw new Error(
        `[service/training/runner] No active training build found in ${args.dbPath}`,
      );
    }

    const nodeRows = await listActiveToolLeafNodes(kv);
    const edgeRows = await listActiveToolLeafEdgesNext(kv);
    const toolCalls = await openClawStore.listToolCalls();
    const gnn = await runLeafGnnForward(
      store,
      nodeRows,
      edgeRows,
      args.gnnConfig ?? DEFAULT_GNN_CONFIG,
    );
    const latestWeights = await store.getLatestWeights();
    const leafEmbeddings = nodeRows.map((row) => {
      const embedding = gnn.gnnEmbeddings.get(row.leafKey);
      if (!embedding) {
        throw new Error(
          `[service/training/runner] Missing GNN embedding for "${row.leafKey}"`,
        );
      }
      return {
        leafKey: row.leafKey,
        level: row.level,
        embedding,
      } satisfies GruTrainingLeafEmbeddingRow;
    });

    const paths = resolveLiveTrainingPaths(args.vaultPath);
    const snapshotDir = args.snapshotDir ?? joinPath(
      joinPath(paths.snapshotDir, buildId),
      "gru",
    );
    await ensureDir(snapshotDir);

    const manifest: GruTrainingSnapshotManifest = {
      version: 1,
      buildId,
      createdAt: new Date().toISOString(),
      vaultPath: args.vaultPath,
      paramsSource: gnn.paramsSource,
      nodeRows,
      toolCalls,
      leafEmbeddings,
      gruWeights: latestWeights
        ? {
          fileName: "gru-weights.blob",
          vocabSize: latestWeights.vocabSize,
          epoch: latestWeights.epoch,
          accuracy: latestWeights.accuracy,
        }
        : undefined,
    };

    if (latestWeights) {
      await Deno.writeFile(
        joinPath(snapshotDir, "gru-weights.blob"),
        latestWeights.blob,
      );
    }

    await writeJson(joinPath(snapshotDir, "manifest.json"), manifest);

    return {
      buildId,
      snapshotDir,
      embeddingCount: leafEmbeddings.length,
      paramsSource: gnn.paramsSource,
    };
  } finally {
    kv.close();
    store.close();
    openClawStore.close();
  }
}
