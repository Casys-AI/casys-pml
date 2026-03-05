import type { IVaultStore } from "../../db/types.ts";
import { initParams } from "../params.ts";
import type { GNNConfig, GNNParams } from "../types.ts";
import { deserializeGnnParams, serializeGnnParams } from "../backward.ts";

function isCompatible(params: GNNParams, config: GNNConfig): boolean {
  return params.numHeads === config.numHeads &&
    params.headDim === config.headDim &&
    params.embDim === config.embDim &&
    params.levels.size > 0;
}

/**
 * Load persisted GNN params when available and compatible.
 * Falls back to one-time initialization and persists the result.
 */
export async function loadOrInitGnnParams(
  db: IVaultStore,
  config: GNNConfig,
  maxLevel: number,
): Promise<{ params: GNNParams; source: "loaded" | "initialized" }> {
  const stored = await db.getGnnParams();
  if (stored) {
    try {
      const restored = await deserializeGnnParams(stored.params);
      if (isCompatible(restored, config)) {
        return { params: restored, source: "loaded" };
      }
    } catch {
      // fall through to re-init
    }
  }

  const params = initParams(config, maxLevel + 1);
  const blob = await serializeGnnParams(params);
  await db.saveGnnParams(blob, 0, 0);
  return { params, source: "initialized" };
}

/** Persist the latest GNN parameters back to KV. */
export async function persistGnnParams(
  db: IVaultStore,
  params: GNNParams,
): Promise<void> {
  const blob = await serializeGnnParams(params);
  await db.saveGnnParams(blob, 0, 0);
}

