import type { VaultNote } from "../core/types.ts";
import { type Embedder } from "../embeddings/model.ts";
import {
  type IncrementalOpenClawImportResult,
  runIncrementalOpenClawImport,
} from "../ingest/pipeline.ts";

export interface InitResult {
  notesIndexed: number;
  embeddingsGenerated: number;
  gnnForwardDone: boolean;
  syntheticTraces: number;
  gruTrained: boolean;
  gruAccuracy?: number;
}

export interface InitWithTraceImportResult extends InitResult {
  traceImport: IncrementalOpenClawImportResult;
}

function emptyInitResult(): InitResult {
  return {
    notesIndexed: 0,
    embeddingsGenerated: 0,
    gnnForwardDone: false,
    syntheticTraces: 0,
    gruTrained: false,
  };
}

export async function initVaultWithTraceImport(
  vaultPath: string,
  _notes: VaultNote[],
  dbPath: string,
  _embedder: Embedder,
): Promise<InitWithTraceImportResult> {
  const traceImport = await runIncrementalOpenClawImport({ vaultPath, dbPath });
  return {
    ...emptyInitResult(),
    traceImport,
  };
}

export async function initVault(
  _notes: VaultNote[],
  _dbPath: string,
  _embedder: Embedder,
): Promise<InitResult> {
  return emptyInitResult();
}
