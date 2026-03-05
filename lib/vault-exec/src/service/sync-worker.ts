import { parseVault } from "../parser.ts";
import { DenoVaultReader } from "../io.ts";
import { retrain } from "../retrain.ts";
import { BGEEmbedder } from "../embeddings/model.ts";
import { SYNC_MAX_EPOCHS_SHORT } from "./constants.ts";
import { ensureVaultStateDir, getServicePaths } from "./lifecycle.ts";
import type { SyncResponse } from "./protocol.ts";

export async function runIncrementalSync(vaultPath: string): Promise<SyncResponse> {
  const reader = new DenoVaultReader();
  const embedder = new BGEEmbedder();

  try {
    await ensureVaultStateDir(vaultPath);
    const paths = await getServicePaths(vaultPath);
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
    };
  } catch (err) {
    return {
      ok: false,
      tracesUsed: 0,
      notesReindexed: 0,
      gruTrained: false,
      gruAccuracy: 0,
      gnnUpdated: false,
      error: (err as Error).message,
    };
  } finally {
    await embedder.dispose();
  }
}
