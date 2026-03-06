import { parseVault } from "../core/parser.ts";
import type { VaultReader } from "../core/contracts.ts";
import { DenoVaultReader } from "../infrastructure/fs/deno-vault-fs.ts";
import { retrain } from "../workflows/retrain.ts";
import { BGEEmbedder, type Embedder } from "../embeddings/model.ts";
import { runIncrementalOpenClawImport } from "../ingest/pipeline.ts";
import { SYNC_MAX_EPOCHS_SHORT } from "./constants.ts";
import { ensureVaultStateDir, getServicePaths } from "./lifecycle.ts";
import type { SyncResponse } from "./protocol.ts";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runIncrementalSync(
  vaultPath: string,
  deps: {
    reader?: VaultReader;
    embedder?: Embedder;
  } = {},
): Promise<SyncResponse> {
  const reader = deps.reader ?? new DenoVaultReader();
  const embedder = deps.embedder ?? new BGEEmbedder();

  try {
    await ensureVaultStateDir(vaultPath);
    const paths = await getServicePaths(vaultPath);
    const traceImport = await runIncrementalOpenClawImport({
      vaultPath,
      dbPath: paths.vaultDbPath,
    });
    const notes = await parseVault(reader, vaultPath);

    const result = await retrain(notes, paths.vaultDbPath, embedder, {
      skipReindex: false,
      maxEpochs: SYNC_MAX_EPOCHS_SHORT,
      verbose: false,
    });

    return {
      ok: true,
      tracesUsed: result.tracesUsed,
      notesReindexed: result.notesReindexed,
      gruTrained: result.gruTrained,
      gruAccuracy: result.gruAccuracy,
      gnnUpdated: result.gnnUpdated,
      traceSourcesConfigured: traceImport.configuredSources,
      traceFilesChanged: traceImport.changedFiles,
      traceFilesUnchanged: traceImport.unchangedFiles,
      traceSessionsImported: traceImport.sessionsImported,
      traceToolCallsStored: traceImport.toolCallsStored,
      traceWarnings: traceImport.warnings,
    };
  } catch (err) {
    return {
      ok: false,
      tracesUsed: 0,
      notesReindexed: 0,
      gruTrained: false,
      gruAccuracy: 0,
      gnnUpdated: false,
      traceSourcesConfigured: 0,
      traceFilesChanged: 0,
      traceFilesUnchanged: 0,
      traceSessionsImported: 0,
      traceToolCallsStored: 0,
      traceWarnings: [],
      error: toErrorMessage(err),
    };
  } finally {
    await embedder.dispose();
  }
}
