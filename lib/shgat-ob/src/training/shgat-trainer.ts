/**
 * SHGAT Training Module
 *
 * Extracted training logic from SHGAT class for modularity.
 * These functions handle the core training loops and gradient computation.
 *
 * @module shgat/training/shgat-trainer
 */

import * as math from "../utils/math.ts";
import type {
  ForwardCache,
  LevelParams,
  SHGATConfig,
  TrainingExample,
} from "../core/types.ts";
import {
  backwardResidualLogits,
  applyResidualConnectionPerLevel,
  applyResidualConnection,
  type ResidualCache,
} from "../core/forward-helpers.ts";
import { DEFAULT_HYPERGRAPH_FEATURES } from "../core/types.ts";
import type { SHGATParams } from "../initialization/index.ts";
import type { V2VParams, MultiLevelBackwardCache } from "../message-passing/index.ts";
import { MultiLevelOrchestrator } from "../message-passing/index.ts";
import {
  accumulateW_intentGradients,
  applyFeatureGradients,
  applyFusionGradients,
  applyLayerGradients,
  applyW_intentGradients,
  backward as backwardV1,
  computeFusionWeights,
  initV1Gradients,
} from "./v1-trainer.ts";
import {
  applyKHeadGradients,
  applyWIntentGradients,
  computeKHeadGradientNorm,
  initMultiLevelKHeadGradients,
} from "./multi-level-trainer-khead.ts";
import {
  batchedKHeadForward,
  batchedBackpropKHeadLogit,
  batchedBackpropWIntent,
  batchProjectIntents,
} from "./batched-khead.ts";
import {
  applyLevelGradients,
  computeGradientNorm,
} from "./multi-level-trainer.ts";
import type { GraphBuilder } from "../graph/mod.ts";
import type { HierarchyResult, MultiLevelIncidence } from "../graph/mod.ts";
import {
  buildToolToCapMatrix as buildToolToCapMatrixFn,
  buildCapToCapMatrices as buildCapToCapMatricesFn,
  flattenEmbeddingsByCapabilityOrder as flattenEmbeddingsFn,
  buildCapIndexToLevelMap as buildCapIndexToLevelMapFn,
  type ForwardContext,
} from "../core/forward-helpers.ts";

// ==========================================================================
// Training Context Interface
// ==========================================================================

/**
 * Context required for training operations
 * Provided by SHGAT instance
 */
export interface TrainingContext {
  config: SHGATConfig;
  params: SHGATParams;
  levelParams: Map<number, LevelParams>;
  v2vParams: V2VParams;
  graphBuilder: GraphBuilder;
  hierarchy: HierarchyResult | null;
  multiLevelIncidence: MultiLevelIncidence | null;

  // Methods from SHGAT (minimal set)
  forward(): { H: number[][]; E: number[][]; cache: ForwardCache };
  projectIntent(intentEmbedding: number[]): number[];
  rebuildHierarchy(): void;

  /** ResidualCache from forward pass for learnable per-level residuals backward */
  getResidualCache?: () => import("../core/forward-helpers.ts").ResidualCache | null;
}

// Helper to create ForwardContext from TrainingContext
function getForwardContext(ctx: TrainingContext): ForwardContext {
  return {
    config: ctx.config,
    graphBuilder: ctx.graphBuilder,
    hierarchy: ctx.hierarchy,
    multiLevelIncidence: ctx.multiLevelIncidence,
  };
}

// ==========================================================================
// Legacy V1 Training (Fusion Weights)
// ==========================================================================

/**
 * Train using legacy V1 method (fusion weights)
 */
export function trainBatchLegacy(
  ctx: TrainingContext,
  examples: TrainingExample[],
  isWeights?: number[],
  gamma: number = 0.99,
): { loss: number; accuracy: number; tdErrors: number[] } {
  const weights = isWeights ?? new Array(examples.length).fill(1);
  const tdErrors: number[] = [];

  let totalLoss = 0, correct = 0;
  const grads = initV1Gradients(ctx.config, ctx.params.layerParams);

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const isWeight = weights[i];

    const { E, cache } = ctx.forward();
    const capIdx = ctx.graphBuilder.getCapabilityIndex(example.candidateId);
    if (capIdx === undefined) {
      tdErrors.push(0);
      continue;
    }

    const capNode = ctx.graphBuilder.getCapabilityNode(example.candidateId)!;
    const features = capNode.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;
    const intentProjected = ctx.projectIntent(example.intentEmbedding);

    const intentSim = math.cosineSimilarity(intentProjected, E[capIdx]);
    const rawSemantic = intentSim;
    const rawStructure = features.hypergraphPageRank + (features.adamicAdar ?? 0);
    const rawTemporal = features.recency + (features.heatDiffusion ?? 0);

    const semanticScore = rawSemantic * ctx.params.featureWeights.semantic;
    const structureScore = rawStructure * ctx.params.featureWeights.structure;
    const temporalScore = rawTemporal * ctx.params.featureWeights.temporal;

    const groupWeights = computeFusionWeights(ctx.params.fusionWeights);
    const reliabilityMult = capNode.successRate < 0.5
      ? 0.5
      : (capNode.successRate > 0.9 ? 1.2 : 1.0);
    const baseScore = groupWeights.semantic * semanticScore +
      groupWeights.structure * structureScore + groupWeights.temporal * temporalScore;
    const score = math.sigmoid(baseScore * reliabilityMult);

    const tdError = example.outcome * Math.pow(gamma, example.contextTools?.length ?? 0) - score;
    tdErrors.push(tdError);

    totalLoss += math.binaryCrossEntropy(score, example.outcome) * isWeight;
    if ((score > 0.5 ? 1 : 0) === example.outcome) correct++;

    const dLoss = (score - example.outcome) * isWeight;
    const sigmoidGrad = score * (1 - score) * reliabilityMult;
    const { semantic: ws, structure: wst, temporal: wt } = groupWeights;

    grads.fusionGradients.semantic += dLoss * sigmoidGrad *
      (ws * (1 - ws) * semanticScore - ws * wst * structureScore - ws * wt * temporalScore);
    grads.fusionGradients.structure += dLoss * sigmoidGrad *
      (wst * (1 - wst) * structureScore - wst * ws * semanticScore - wst * wt * temporalScore);
    grads.fusionGradients.temporal += dLoss * sigmoidGrad *
      (wt * (1 - wt) * temporalScore - wt * ws * semanticScore - wt * wst * structureScore);
    grads.featureGradients.semantic += dLoss * sigmoidGrad * ws * rawSemantic;
    grads.featureGradients.structure += dLoss * sigmoidGrad * wst * rawStructure;
    grads.featureGradients.temporal += dLoss * sigmoidGrad * wt * rawTemporal;

    backwardV1(grads, cache, capIdx, intentProjected, dLoss, ctx.config);
    accumulateW_intentGradients(
      grads,
      example.intentEmbedding,
      intentProjected,
      E[capIdx],
      dLoss,
    );
  }

  applyLayerGradients(grads, ctx.params.layerParams, ctx.config, examples.length);
  applyFusionGradients(grads, ctx.params.fusionWeights, ctx.config, examples.length);
  applyFeatureGradients(grads, ctx.params.featureWeights, ctx.config, examples.length);
  applyW_intentGradients(grads, ctx.params.W_intent, ctx.config, examples.length);

  return { loss: totalLoss / examples.length, accuracy: correct / examples.length, tdErrors };
}

// ==========================================================================
// K-Head Training Helpers
// ==========================================================================

/**
 * Accumulate gradient for a capability embedding
 */
export function accumulateDCapGradient(
  dE_accum: Map<number, Map<number, number[]>>,
  capIdx: number,
  dCap: number[],
  capIndexToLevel: Map<number, { level: number; withinLevelIdx: number }>,
): void {
  const levelInfo = capIndexToLevel.get(capIdx);
  if (!levelInfo) return;

  const { level, withinLevelIdx } = levelInfo;
  const levelMap = dE_accum.get(level);
  if (!levelMap) return;

  const existing = levelMap.get(withinLevelIdx);
  if (existing) {
    for (let j = 0; j < dCap.length; j++) {
      existing[j] += dCap[j];
    }
  } else {
    levelMap.set(withinLevelIdx, [...dCap]);
  }
}

/**
 * Build dE_final from accumulated gradients
 */
export function buildDEFinalFromAccum(
  dE_accum: Map<number, Map<number, number[]>>,
  mpCache: MultiLevelBackwardCache,
): Map<number, number[][]> {
  const dE_final = new Map<number, number[][]>();

  for (const [level, accum] of dE_accum) {
    const E_level = mpCache.E_final?.get(level);
    if (!E_level) continue;

    const numCaps = E_level.length;
    const embDim = E_level[0]?.length || 0;
    const dE: number[][] = Array.from({ length: numCaps }, () => new Array(embDim).fill(0));

    for (const [idx, grad] of accum) {
      if (idx < numCaps) {
        for (let j = 0; j < Math.min(grad.length, embDim); j++) {
          dE[idx][j] = grad[j];
        }
      }
    }

    dE_final.set(level, dE);
  }

  return dE_final;
}

/**
 * Accumulate gradient for a tool (level 0) embedding
 */
export function accumulateDToolGradient(
  dH_accum: Map<number, number[]>,
  toolIdx: number,
  dTool: number[],
): void {
  const existing = dH_accum.get(toolIdx);
  if (existing) {
    for (let j = 0; j < dTool.length; j++) {
      existing[j] += dTool[j];
    }
  } else {
    dH_accum.set(toolIdx, [...dTool]);
  }
}

/**
 * Build dH_final from accumulated tool gradients
 */
export function buildDHFinalFromAccum(
  dH_accum: Map<number, number[]>,
  numTools: number,
  embDim: number,
): number[][] {
  const dH: number[][] = Array.from({ length: numTools }, () => new Array(embDim).fill(0));

  for (const [idx, grad] of dH_accum) {
    if (idx < numTools) {
      for (let j = 0; j < Math.min(grad.length, embDim); j++) {
        dH[idx][j] = grad[j];
      }
    }
  }

  return dH;
}

/**
 * Get node index and type (tool or capability) for a given node ID.
 * Works with both unified Node API and legacy Tool/Capability APIs.
 * Returns null if node not found.
 */
export function getNodeIndexInfo(
  graphBuilder: {
    getNode: (id: string) => { level: number } | undefined;
    getToolIndex: (id: string) => number | undefined;
    getCapabilityIndex: (id: string) => number | undefined;
    getToolNodes?: () => Map<string, unknown>;
    getCapabilityNodes?: () => Map<string, { hierarchyLevel?: number }>;
  },
  nodeId: string,
): { idx: number; isLeaf: boolean; level: number } | null {
  // Try unified Node API first
  const node = graphBuilder.getNode(nodeId);
  if (node) {
    const isLeaf = node.level === 0;
    const idx = isLeaf
      ? graphBuilder.getToolIndex(nodeId)
      : graphBuilder.getCapabilityIndex(nodeId);
    if (idx === undefined) return null;
    return { idx, isLeaf, level: node.level };
  }

  // Fall back to legacy APIs: check if it's a tool (level 0)
  const toolIdx = graphBuilder.getToolIndex(nodeId);
  if (toolIdx !== undefined) {
    return { idx: toolIdx, isLeaf: true, level: 0 };
  }

  // Check if it's a capability (level 1+)
  const capIdx = graphBuilder.getCapabilityIndex(nodeId);
  if (capIdx !== undefined) {
    // Get level from capability node if available
    let level = 1; // Default to level 1 for capabilities
    if (graphBuilder.getCapabilityNodes) {
      const capNode = graphBuilder.getCapabilityNodes().get(nodeId);
      if (capNode?.hierarchyLevel !== undefined) {
        level = capNode.hierarchyLevel;
      }
    }
    return { idx: capIdx, isLeaf: false, level };
  }

  return null;
}

/**
 * Convert MP gradients to accumulator format for applyLevelGradients
 */
export function convertMPGradsToAccumFormat(
  mpGrads: { levelGradients: Map<number, { dW_child: number[][][]; dW_parent: number[][][]; da_upward: number[][]; da_downward: number[][] }> },
): Map<number, { dW_child: number[][][]; dW_parent: number[][][]; da_upward: number[][]; da_downward: number[][] }> {
  return mpGrads.levelGradients;
}

/**
 * Compute gradient norm from MP gradients
 */
export function computeMPGradNorm(
  mpGrads: { levelGradients: Map<number, { dW_child: number[][][]; dW_parent: number[][][]; da_upward: number[][]; da_downward: number[][] }> },
): number {
  let sumSq = 0;

  for (const [, grads] of mpGrads.levelGradients) {
    for (const mat of grads.dW_child) {
      for (const row of mat) {
        for (const v of row) sumSq += v * v;
      }
    }
    for (const mat of grads.dW_parent) {
      for (const row of mat) {
        for (const v of row) sumSq += v * v;
      }
    }
    for (const row of grads.da_upward) {
      for (const v of row) sumSq += v * v;
    }
    for (const row of grads.da_downward) {
      for (const v of row) sumSq += v * v;
    }
  }

  return Math.sqrt(sumSq);
}

// ==========================================================================
// Batched K-Head Training
// ==========================================================================

/**
 * Batched K-Head training with single forward pass
 *
 * ~10x faster than per-example training by:
 * 1. Running message passing ONCE (same graph for all examples)
 * 2. Batching all intent projections
 * 3. Using BLAS matrix ops for K-head scoring
 */
export function trainBatchV1KHeadBatchedCore(
  ctx: TrainingContext,
  examples: TrainingExample[],
  weights: number[],
  orchestrator: MultiLevelOrchestrator,
  evaluateOnly: boolean,
  temperature: number,
): { loss: number; accuracy: number; tdErrors: number[]; gradNorm: number } {
  if (examples.length === 0) {
    return { loss: 0, accuracy: 0, tdErrors: [], gradNorm: 0 };
  }

  // Rebuild hierarchy
  ctx.rebuildHierarchy();

  // Initialize gradients
  const grads = initMultiLevelKHeadGradients(
    ctx.levelParams,
    ctx.params.headParams,
    ctx.config,
  );

  // Build cap index → level mapping
  const fwdCtx = getForwardContext(ctx);
  const capIndexToLevel = buildCapIndexToLevelMapFn(fwdCtx);
  const maxLevel = ctx.hierarchy?.maxHierarchyLevel ?? 0;

  // === SINGLE FORWARD PASS (message passing) ===
  const H_init = ctx.graphBuilder.getToolEmbeddings();
  const capabilityNodes = ctx.graphBuilder.getCapabilityNodes();

  // Handle flat structure (all level 0, no capabilities)
  const isFlat = capabilityNodes.size === 0;
  // Note: Flat structure warning logged only once at module level to avoid spam

  if (!ctx.hierarchy || !ctx.multiLevelIncidence) {
    throw new Error(
      "[trainBatchV1KHeadBatchedCore] Training requires hierarchy and incidence matrices. " +
      "Call forward() before training to initialize the graph structure."
    );
  }

  // Build E_levels_init for hierarchical structures
  let E_flat: number[][] = [];
  let H_final: number[][] = H_init.map(row => [...row]); // Default to original
  let mpCache: import("../message-passing/multi-level-orchestrator.ts").MultiLevelBackwardCache | null = null;

  if (!isFlat) {
    // HIERARCHICAL: Do message passing
    const E_levels_init = new Map<number, number[][]>();
    for (let level = 0; level <= maxLevel; level++) {
      const capsAtLevel = ctx.hierarchy.hierarchyLevels.get(level) ?? new Set<string>();
      const embeddings: number[][] = [];
      for (const capId of capsAtLevel) {
        const cap = capabilityNodes.get(capId);
        if (cap) embeddings.push([...cap.embedding]);
      }
      if (embeddings.length > 0) {
        E_levels_init.set(level, embeddings);
      }
    }

    // Build matrices
    const toolToCapMatrix = buildToolToCapMatrixFn(fwdCtx);
    const capToCapMatrices = buildCapToCapMatricesFn(fwdCtx);

    // Forward with cache
    // Only pass v2vParams if V2V is actually configured (v2vResidual > 0)
    const useV2V = ctx.config.v2vResidual !== undefined && ctx.config.v2vResidual > 0;
    const { result, cache } = orchestrator.forwardMultiLevelWithCache(
      H_init,
      E_levels_init,
      toolToCapMatrix,
      capToCapMatrices,
      ctx.levelParams,
      {
        numHeads: ctx.config.numHeads,
        numLayers: ctx.config.numLayers,
        dropout: ctx.config.dropout,
        leakyReluSlope: ctx.config.leakyReluSlope,
      },
      useV2V ? ctx.v2vParams : undefined,
    );

    // Flatten E for K-head scoring
    E_flat = flattenEmbeddingsFn(fwdCtx, result.E);
    H_final = result.H;
    mpCache = cache;
  }
  // FLAT: Skip message passing, use original tool embeddings directly
  // H_final already initialized to H_init

  // Store propagated embeddings BEFORE residual for backward pass
  const E_propagated = E_flat.map(row => [...row]);
  const H_propagated = H_final.map(row => [...row]);

  // Apply per-level residual connection (same as forwardCore)
  let residualCache: ResidualCache | null = null;
  if (ctx.config.preserveDim) {
    const E_original = ctx.graphBuilder.getCapabilityEmbeddings();
    const H_original = ctx.graphBuilder.getToolEmbeddings();
    const defaultResidual = ctx.config.preserveDimResidual ?? 0.3;

    // Check for learnable per-level residuals
    const maxLevel = ctx.hierarchy?.maxHierarchyLevel ?? 0;
    if (ctx.params.residualLogits && ctx.params.residualLogits.length > 0 && maxLevel > 0) {
      // Convert logits to alphas: α = sigmoid(logit)
      const logits = ctx.params.residualLogits.slice(0, maxLevel + 1);
      const perLevelResiduals = logits.map(logit =>
        1 / (1 + Math.exp(-Math.max(-500, Math.min(500, logit))))
      );

      const E_levels = ctx.graphBuilder.getCapabilityLevels();
      const H_levels = ctx.graphBuilder.getToolLevels();

      // Store cache for backward pass
      residualCache = {
        E_original,
        H_original,
        E_propagated,
        H_propagated,
        E_levels,
        H_levels,
        alphas: perLevelResiduals,
        logits,
      };

      E_flat = applyResidualConnectionPerLevel(E_flat, E_original, E_levels, perLevelResiduals, defaultResidual);
      H_final = applyResidualConnectionPerLevel(H_final, H_original, H_levels, perLevelResiduals, defaultResidual);
    } else if (ctx.config.preserveDimResiduals && ctx.config.preserveDimResiduals.length > 0) {
      // Fixed per-level residuals from config
      const E_levels = ctx.graphBuilder.getCapabilityLevels();
      const H_levels = ctx.graphBuilder.getToolLevels();
      E_flat = applyResidualConnectionPerLevel(E_flat, E_original, E_levels, ctx.config.preserveDimResiduals, defaultResidual);
      H_final = applyResidualConnectionPerLevel(H_final, H_original, H_levels, ctx.config.preserveDimResiduals, defaultResidual);
    } else if (defaultResidual > 0) {
      // Single residual value
      E_flat = applyResidualConnection(E_flat, E_original, defaultResidual);
      H_final = applyResidualConnection(H_final, H_original, defaultResidual);
    }
  }

  // Build capId → embedding map for batched scoring
  const capEmbeddings = new Map<string, number[]>();
  const capIds = Array.from(capabilityNodes.keys());
  for (let i = 0; i < capIds.length; i++) {
    capEmbeddings.set(capIds[i], E_flat[i]);
  }
  // Also add tools - use H_final (after message passing) not original embeddings
  const toolNodes = ctx.graphBuilder.getToolNodes();
  const toolIds = Array.from(toolNodes.keys());
  for (let i = 0; i < toolIds.length; i++) {
    const toolId = toolIds[i];
    // Use H_final which contains embeddings AFTER message passing + residual
    if (H_final[i]) {
      capEmbeddings.set(toolId, H_final[i]);
    }
  }

  // === BATCHED INTENT PROJECTION ===
  const intents = examples.map((ex) => ex.intentEmbedding);
  const intentsBatched = batchProjectIntents(intents, ctx.params.W_intent);

  // === BATCHED K-HEAD FORWARD ===
  const { logits: allLogits, cache: kheadCache } = batchedKHeadForward(
    intents,
    ctx.params.W_intent,
    capEmbeddings,
    ctx.params.headParams,
    ctx.config,
  );

  // === COMPUTE LOSS AND BACKWARD ===
  const TEMPERATURE = temperature;
  const tdErrors: number[] = [];
  let totalLoss = 0;
  let correct = 0;

  // Accumulate dCapEmbedding gradients per level (for level 1+)
  const dE_accum = new Map<number, Map<number, number[]>>();
  for (let level = 0; level <= maxLevel; level++) {
    dE_accum.set(level, new Map());
  }

  // Accumulate dToolEmbedding gradients (for level 0)
  const dH_accum = new Map<number, number[]>();

  // Accumulate dIntentsBatched for W_intent backprop
  const dIntentsBatched: number[][] = [];

  for (let exIdx = 0; exIdx < examples.length; exIdx++) {
    const example = examples[exIdx];
    const isWeight = weights[exIdx];

    // Get positive node (any level)
    const posNodeInfo = getNodeIndexInfo(ctx.graphBuilder, example.candidateId);
    if (!posNodeInfo) {
      throw new Error(
        `[trainBatchV1KHeadBatchedCore] Node "${example.candidateId}" not found. ` +
        `Ensure the node is registered before training.`
      );
    }
    const { idx: posNodeIdx, isLeaf: posIsLeaf } = posNodeInfo;

    const posLogit = allLogits.get(example.candidateId)?.[exIdx] ?? 0;

    if (example.negativeCapIds && example.negativeCapIds.length > 0) {
      // === CONTRASTIVE (InfoNCE) ===
      const negLogits: number[] = [];
      const negNodeInfos: { idx: number; isLeaf: boolean; level: number }[] = [];
      const validNegIds: string[] = [];

      for (const negId of example.negativeCapIds) {
        const negInfo = getNodeIndexInfo(ctx.graphBuilder, negId);
        if (!negInfo) continue;
        negLogits.push(allLogits.get(negId)?.[exIdx] ?? 0);
        negNodeInfos.push(negInfo);
        validNegIds.push(negId);
      }

      // InfoNCE loss
      const allLogitsEx = [posLogit, ...negLogits];
      const scaledScores = allLogitsEx.map((s) => s / TEMPERATURE);
      const maxScoreVal = Math.max(...scaledScores);
      const expScores = scaledScores.map((s) => Math.exp(s - maxScoreVal));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const softmax = expScores.map((e) => e / sumExp);

      totalLoss += -Math.log(softmax[0] + 1e-7) * isWeight;

      const margin = negLogits.length > 0 ? posLogit - Math.max(...negLogits) : 3;
      const clippedMargin = Math.max(-3, Math.min(3, margin));
      tdErrors.push(Math.exp(-clippedMargin));

      if (negLogits.length === 0 || posLogit > Math.max(...negLogits)) correct++;

      // === BACKWARD ===
      let dIntentAccum = new Array(ctx.config.hiddenDim).fill(0);

      // Positive node gradient
      const dLossPos = (softmax[0] - 1) / TEMPERATURE * isWeight;
      const posKCaps = kheadCache.K_caps.get(example.candidateId);
      const posNodeEmb = capEmbeddings.get(example.candidateId);
      if (posKCaps && posNodeEmb) {
        for (let h = 0; h < ctx.config.numHeads; h++) {
          const Q = kheadCache.Q_batches[h][exIdx];
          const K = posKCaps[h];
          if (!K) continue;
          const { dIntentsBatched: dI, dCapEmbedding: dNode } = batchedBackpropKHeadLogit(
            [dLossPos / ctx.config.numHeads],
            [Q],
            K,
            [intentsBatched[exIdx]],
            posNodeEmb,
            ctx.params.headParams[h],
            grads.khead,
            h,
          );
          for (let j = 0; j < dIntentAccum.length; j++) {
            dIntentAccum[j] += dI[0]?.[j] ?? 0;
          }
          // Accumulate in the right place based on node level
          if (posIsLeaf) {
            accumulateDToolGradient(dH_accum, posNodeIdx, dNode);
          } else {
            accumulateDCapGradient(dE_accum, posNodeIdx, dNode, capIndexToLevel);
          }
        }
      }

      // Negative nodes gradients
      for (let i = 0; i < negLogits.length; i++) {
        const dLossNeg = softmax[i + 1] / TEMPERATURE * isWeight;
        const negId = validNegIds[i];
        const negInfo = negNodeInfos[i];
        const negKCaps = kheadCache.K_caps.get(negId);
        const negNodeEmb = capEmbeddings.get(negId);
        if (!negKCaps || !negNodeEmb) continue;

        for (let h = 0; h < ctx.config.numHeads; h++) {
          const Q = kheadCache.Q_batches[h][exIdx];
          const K = negKCaps[h];
          if (!K) continue;
          const { dIntentsBatched: dI, dCapEmbedding: dNode } = batchedBackpropKHeadLogit(
            [dLossNeg / ctx.config.numHeads],
            [Q],
            K,
            [intentsBatched[exIdx]],
            negNodeEmb,
            ctx.params.headParams[h],
            grads.khead,
            h,
          );
          for (let j = 0; j < dIntentAccum.length; j++) {
            dIntentAccum[j] += dI[0]?.[j] ?? 0;
          }
          // Accumulate in the right place based on node level
          if (negInfo.isLeaf) {
            accumulateDToolGradient(dH_accum, negInfo.idx, dNode);
          } else {
            accumulateDCapGradient(dE_accum, negInfo.idx, dNode, capIndexToLevel);
          }
        }
      }

      dIntentsBatched.push(dIntentAccum);
    } else {
      // No silent fallback - require contrastive examples
      throw new Error(
        `[trainBatchV1KHeadBatchedCore] Example ${exIdx} has no negativeCapIds. ` +
        `InfoNCE contrastive training requires negative samples. ` +
        `Provide negativeCapIds in each TrainingExample.`
      );
    }
  }

  // === BACKWARD: W_intent ===
  batchedBackpropWIntent(dIntentsBatched, intents, grads.dW_intent);

  // === BACKWARD: Multi-level message passing ===
  let mpGradNorm = 0;
  let v2vGradNorm = 0;
  if (mpCache && (dE_accum.size > 0 || dH_accum.size > 0)) {
    const dE_final = buildDEFinalFromAccum(dE_accum, mpCache);

    // Build dH_final from accumulated tool gradients
    const numTools = ctx.graphBuilder.getToolNodes().size;
    const dH_final = dH_accum.size > 0
      ? buildDHFinalFromAccum(dH_accum, numTools, ctx.config.embeddingDim)
      : null;

    // === BACKWARD: Per-level residual logits ===
    // Use local residualCache created during forward pass (not ctx.getResidualCache)
    if (!evaluateOnly && residualCache) {
        // Flatten dE_final to match residualCache order (sorted by capId)
        // The residualCache.E_levels contains levels in capability order
        const capNodes = ctx.graphBuilder.getCapabilityNodes();
        const sortedCapIds = Array.from(capNodes.keys()).sort();
        const dE_flat: number[][] = [];

        for (const capId of sortedCapIds) {
          const cap = capNodes.get(capId);
          if (!cap) continue;
          const level = cap.hierarchyLevel ?? 0;
          const levelDEs = dE_final.get(level);
          if (!levelDEs) {
            dE_flat.push(new Array(ctx.config.embeddingDim).fill(0));
            continue;
          }
          // Find index within level
          const capsAtLevel = ctx.hierarchy?.hierarchyLevels.get(level);
          if (!capsAtLevel) {
            dE_flat.push(new Array(ctx.config.embeddingDim).fill(0));
            continue;
          }
          const sortedCapsAtLevel = Array.from(capsAtLevel).sort();
          const idxWithinLevel = sortedCapsAtLevel.indexOf(capId);
          dE_flat.push(levelDEs[idxWithinLevel] ?? new Array(ctx.config.embeddingDim).fill(0));
        }

        // Call backward for residual logits (now with dH support)
        backwardResidualLogits(
          dE_flat,
          dH_final, // Now passing tool gradients for level 0
          residualCache,
          ctx.params.residualLogits,
          ctx.config.learningRate,
        );
    }

    const mpGrads = orchestrator.backwardMultiLevel(
      dE_final,
      dH_final, // Now passing tool gradients
      mpCache,
      ctx.levelParams,
      ctx.v2vParams,
    );

    const mpGradsConverted = { levelGradients: mpGrads.levelGrads };
    if (!evaluateOnly) {
      applyLevelGradients(mpGradsConverted, ctx.levelParams, ctx.config, examples.length);
    }
    mpGradNorm = computeMPGradNorm(mpGradsConverted);

    if (mpGrads.v2vGrads) {
      if (!evaluateOnly) {
        const lr = ctx.config.learningRate;
        const batchSize = examples.length;
        ctx.v2vParams.residualLogit -= lr * mpGrads.v2vGrads.dResidualLogit / batchSize;
        ctx.v2vParams.temperatureLogit -= lr * mpGrads.v2vGrads.dTemperatureLogit / batchSize;
      }
      v2vGradNorm = Math.sqrt(
        mpGrads.v2vGrads.dResidualLogit ** 2 + mpGrads.v2vGrads.dTemperatureLogit ** 2
      );
    }
  }

  // Compute gradient norms
  const levelGradNorm = computeGradientNorm(grads);
  const kheadGradNorm = computeKHeadGradientNorm(grads.khead);
  const gradNorm = Math.sqrt(
    levelGradNorm ** 2 + kheadGradNorm ** 2 + mpGradNorm ** 2 + v2vGradNorm ** 2
  );

  // Apply gradients (skip if evaluateOnly)
  if (!evaluateOnly) {
    applyKHeadGradients(grads.khead, ctx.params.headParams, ctx.config, examples.length);
    applyWIntentGradients(grads, ctx.params.W_intent, ctx.config, examples.length);

    // DEBUG: Log gradient info
    if (Math.random() < 0.1) { // 10% of batches
      console.log(`[TRAIN DEBUG] gradNorm=${gradNorm.toFixed(4)}, khead=${kheadGradNorm.toFixed(4)}, loss=${(totalLoss/examples.length).toFixed(4)}, W_q[0][0][0]=${ctx.params.headParams[0].W_q[0][0].toFixed(6)}`);
    }
  }

  return {
    loss: totalLoss / examples.length,
    accuracy: correct / examples.length,
    tdErrors,
    gradNorm,
  };
}
