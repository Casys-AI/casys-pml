/**
 * SHGAT Factory Functions
 *
 * Factory functions for creating and training SHGAT instances.
 * Extracted from shgat.ts for modularity.
 *
 * @module shgat/core/factory
 */

import { getLogger } from "./logger.ts";
import { SHGAT } from "./shgat.ts";
import type { HypergraphFeatures, SHGATConfig, TrainingExample } from "./types.ts";
import { createMembersFromLegacy } from "./types.ts";
import { getAdaptiveHeadsByGraphSize } from "../initialization/index.ts";
import { generateDefaultToolEmbedding } from "../graph/mod.ts";
import { trainOnEpisodes } from "../training/v1-trainer.ts";

const log = getLogger();

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create SHGAT from capability records
 *
 * @param capabilities Array of capability records
 * @param configOrToolEmbeddings Either config or tool embeddings map
 * @param config Config (if second param is tool embeddings)
 */
export function createSHGATFromCapabilities(
  capabilities: Array<
    {
      id: string;
      embedding: number[];
      toolsUsed: string[];
      successRate: number;
      parents?: string[];
      children?: string[];
      hypergraphFeatures?: HypergraphFeatures;
    }
  >,
  configOrToolEmbeddings?: Partial<SHGATConfig> | Map<string, number[]>,
  config?: Partial<SHGATConfig>,
): SHGAT {
  let toolEmbeddings: Map<string, number[]> | undefined;
  let actualConfig: Partial<SHGATConfig> | undefined;

  if (configOrToolEmbeddings instanceof Map) {
    toolEmbeddings = configOrToolEmbeddings;
    actualConfig = config;
  } else {
    actualConfig = configOrToolEmbeddings;
  }

  // Collect all unique tools
  const allTools = new Set<string>();
  for (const cap of capabilities) for (const toolId of cap.toolsUsed) allTools.add(toolId);

  // Compute max hierarchy level from children relationships
  const hasChildren = capabilities.some((c) => c.children && c.children.length > 0);
  const maxLevel = hasChildren ? 1 : 0;

  // Get embeddingDim and preserveDim from config
  const embeddingDim = capabilities[0]?.embedding.length || 1024;
  const preserveDim = actualConfig?.preserveDim ?? true;

  // Adaptive K based on graph size (ADR-053)
  const adaptiveConfig = getAdaptiveHeadsByGraphSize(
    allTools.size,
    capabilities.length,
    maxLevel,
    preserveDim,
    embeddingDim,
  );

  // Merge: user config overrides adaptive, adaptive overrides defaults
  const mergedConfig: Partial<SHGATConfig> = {
    numHeads: adaptiveConfig.numHeads,
    hiddenDim: adaptiveConfig.hiddenDim,
    headDim: adaptiveConfig.headDim,
    ...actualConfig,
  };

  // Validate config consistency
  const finalHiddenDim = mergedConfig.hiddenDim ?? adaptiveConfig.hiddenDim;
  const finalNumHeads = mergedConfig.numHeads ?? adaptiveConfig.numHeads;
  const expectedHiddenDim = finalNumHeads * 64;
  if (finalHiddenDim !== expectedHiddenDim) {
    log.warn(
      `[SHGAT] hiddenDim should be numHeads * 64 = ${expectedHiddenDim}, got ${finalHiddenDim}. ` +
        `Each head needs 64 dims for full expressiveness.`,
    );
  }

  const shgat = new SHGAT(mergedConfig);

  for (const toolId of allTools) {
    shgat.registerTool({
      id: toolId,
      embedding: toolEmbeddings?.get(toolId) || generateDefaultToolEmbedding(toolId, embeddingDim),
    });
  }

  for (const cap of capabilities) {
    shgat.registerCapability({
      id: cap.id,
      embedding: cap.embedding,
      members: createMembersFromLegacy(cap.toolsUsed, cap.children),
      hierarchyLevel: 0,
      toolsUsed: cap.toolsUsed,
      successRate: cap.successRate,
      parents: cap.parents,
      children: cap.children,
    });
    if (cap.hypergraphFeatures) shgat.updateHypergraphFeatures(cap.id, cap.hypergraphFeatures);
  }

  return shgat;
}

/**
 * Train SHGAT using legacy fusion weights
 * @deprecated Use trainSHGATOnEpisodesKHead with batched K-head training instead
 */
export async function trainSHGATOnEpisodes(
  shgat: SHGAT,
  episodes: TrainingExample[],
  _getEmbedding: (id: string) => number[] | null,
  options: {
    epochs?: number;
    batchSize?: number;
    onEpoch?: (epoch: number, loss: number, accuracy: number) => void;
  } = {},
): Promise<{ finalLoss: number; finalAccuracy: number }> {
  // Migrated to batched K-head training (was: trainBatch with fusion weights)
  return trainOnEpisodes((batch) => shgat.trainBatchV1KHeadBatched(batch), episodes, options);
}

/**
 * Train SHGAT using K-head attention scoring (trains W_q, W_k)
 * Uses batched training for ~10x speedup
 */
export async function trainSHGATOnEpisodesKHead(
  shgat: SHGAT,
  episodes: TrainingExample[],
  _getEmbedding: (id: string) => number[] | null,
  options: {
    epochs?: number;
    learningRate?: number;
    batchSize?: number;
    onEpoch?: (epoch: number, loss: number, accuracy: number) => void;
  } = {},
): Promise<{ finalLoss: number; finalAccuracy: number }> {
  const originalLr = shgat.getLearningRate();
  if (options.learningRate !== undefined) {
    shgat.setLearningRate(options.learningRate);
  }

  try {
    // Use batched K-head training for ~10x speedup
    return await trainOnEpisodes((batch) => shgat.trainBatchV1KHeadBatched(batch), episodes, options);
  } finally {
    shgat.setLearningRate(originalLr);
  }
}

/**
 * Online learning: Train SHGAT V1 on a single execution result
 * Uses batched K-head training
 */
export async function trainSHGATOnExecution(
  shgat: SHGAT,
  execution: {
    intentEmbedding: number[];
    targetCapId: string;
    outcome: number;
  },
): Promise<{ loss: number; accuracy: number; gradNorm: number }> {
  const example: TrainingExample = {
    intentEmbedding: execution.intentEmbedding,
    contextTools: [],
    candidateId: execution.targetCapId,
    outcome: execution.outcome,
  };

  // Use batched K-head training (works fine with single example)
  const result = shgat.trainBatchV1KHeadBatched([example]);

  return {
    loss: result.loss,
    accuracy: result.accuracy,
    gradNorm: result.gradNorm,
  };
}
