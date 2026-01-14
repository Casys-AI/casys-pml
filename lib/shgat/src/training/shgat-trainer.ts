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
  backpropMultiHeadKHead,
  backpropMultiHeadKHeadLogit,
  backpropWIntent,
  computeKHeadGradientNorm,
  computeMultiHeadKHeadScoresWithCache,
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
// K-Head Training (InfoNCE / BCE)
// ==========================================================================

/**
 * Train using K-head attention with InfoNCE or BCE loss
 *
 * @param ctx Training context
 * @param examples Training examples
 * @param isWeights Importance sampling weights
 * @param orchestrator MultiLevelOrchestrator in training mode
 * @returns Training result
 */
export function trainBatchV1KHeadCore(
  ctx: TrainingContext,
  examples: TrainingExample[],
  isWeights: number[],
  orchestrator: MultiLevelOrchestrator,
): { loss: number; accuracy: number; tdErrors: number[]; gradNorm: number } {
  const tdErrors: number[] = [];
  const weights = isWeights;

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

  // Accumulate dCapEmbedding gradients per level
  const dE_accum = new Map<number, Map<number, number[]>>();
  for (let level = 0; level <= maxLevel; level++) {
    dE_accum.set(level, new Map());
  }

  let totalLoss = 0;
  let correct = 0;
  let mpCache: MultiLevelBackwardCache | null = null;

  const TEMPERATURE = 0.1;

  for (let exIdx = 0; exIdx < examples.length; exIdx++) {
    const example = examples[exIdx];
    const isWeight = weights[exIdx];

    const H_init = ctx.graphBuilder.getToolEmbeddings();
    const capabilityNodes = ctx.graphBuilder.getCapabilityNodes();

    if (capabilityNodes.size === 0 || !ctx.hierarchy || !ctx.multiLevelIncidence) {
      tdErrors.push(0);
      continue;
    }

    // Build E_levels_init
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

    const toolToCapMatrix = buildToolToCapMatrixFn(fwdCtx);
    const capToCapMatrices = buildCapToCapMatricesFn(fwdCtx);

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
      ctx.v2vParams,
    );

    mpCache = cache;
    const E_flat = flattenEmbeddingsFn(fwdCtx, result.E);
    const intentProjected = ctx.projectIntent(example.intentEmbedding);

    const posCapIdx = ctx.graphBuilder.getCapabilityIndex(example.candidateId);
    if (posCapIdx === undefined) {
      tdErrors.push(0);
      continue;
    }

    const posCapEmbedding = E_flat[posCapIdx];

    const { scores: posHeadScores, logits: posHeadLogits, caches: posHeadCaches } =
      computeMultiHeadKHeadScoresWithCache(
        intentProjected,
        posCapEmbedding,
        ctx.params.headParams,
        ctx.config,
      );
    const posScore = posHeadScores.reduce((a, b) => a + b, 0) / ctx.config.numHeads;
    const posLogit = posHeadLogits.reduce((a, b) => a + b, 0) / ctx.config.numHeads;

    if (example.negativeCapIds && example.negativeCapIds.length > 0) {
      // InfoNCE contrastive
      const negLogits: number[] = [];
      const negCaches: Array<{ Q: number[]; K: number[]; dotQK: number }[]> = [];
      const negCapIndices: number[] = [];
      const negEmbeddings: number[][] = [];

      for (const negCapId of example.negativeCapIds) {
        const negCapIdx = ctx.graphBuilder.getCapabilityIndex(negCapId);
        if (negCapIdx === undefined) continue;

        const negCapEmbedding = E_flat[negCapIdx];
        const { logits, caches } = computeMultiHeadKHeadScoresWithCache(
          intentProjected,
          negCapEmbedding,
          ctx.params.headParams,
          ctx.config,
        );

        negLogits.push(logits.reduce((a, b) => a + b, 0) / ctx.config.numHeads);
        negCaches.push(caches);
        negCapIndices.push(negCapIdx);
        negEmbeddings.push(negCapEmbedding);
      }

      const allLogits = [posLogit, ...negLogits];
      const scaledScores = allLogits.map((s) => s / TEMPERATURE);
      const maxScoreVal = Math.max(...scaledScores);
      const expScores = scaledScores.map((s) => Math.exp(s - maxScoreVal));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const softmax = expScores.map((e) => e / sumExp);

      totalLoss += -Math.log(softmax[0] + 1e-7) * isWeight;

      const margin = negLogits.length > 0 ? posLogit - Math.max(...negLogits) : 3;
      const clippedMargin = Math.max(-3, Math.min(3, margin));
      tdErrors.push(Math.exp(-clippedMargin));

      if (negLogits.length === 0 || posLogit > Math.max(...negLogits)) correct++;

      const dLossPos = (softmax[0] - 1) / TEMPERATURE * isWeight;
      const { dIntentProjected: dIntentPos, dCapEmbedding: dCapPos } = backpropMultiHeadKHeadLogit(
        dLossPos,
        posHeadCaches,
        intentProjected,
        posCapEmbedding,
        ctx.params.headParams,
        grads.khead,
        ctx.config,
      );

      accumulateDCapGradient(dE_accum, posCapIdx, dCapPos, capIndexToLevel);

      let dIntentAccum = [...dIntentPos];
      for (let i = 0; i < negLogits.length; i++) {
        const dLossNeg = softmax[i + 1] / TEMPERATURE * isWeight;
        const { dIntentProjected: dIntentNeg, dCapEmbedding: dCapNeg } = backpropMultiHeadKHeadLogit(
          dLossNeg,
          negCaches[i],
          intentProjected,
          negEmbeddings[i],
          ctx.params.headParams,
          grads.khead,
          ctx.config,
        );

        for (let j = 0; j < dIntentAccum.length; j++) {
          dIntentAccum[j] += dIntentNeg[j] ?? 0;
        }

        accumulateDCapGradient(dE_accum, negCapIndices[i], dCapNeg, capIndexToLevel);
      }

      backpropWIntent(dIntentAccum, example.intentEmbedding, grads, ctx.config);
    } else {
      // BCE fallback
      const predScore = Math.min(0.95, Math.max(0.05, posScore));
      totalLoss += math.binaryCrossEntropy(predScore, example.outcome) * isWeight;
      tdErrors.push(example.outcome - predScore);

      if ((predScore > 0.5 ? 1 : 0) === example.outcome) correct++;

      const dLossRaw = example.outcome === 1 ? -1 / (predScore + 1e-7) : 1 / (1 - predScore + 1e-7);
      const dLoss = dLossRaw * isWeight;
      const { dIntentProjected, dCapEmbedding } = backpropMultiHeadKHead(
        dLoss,
        posHeadScores,
        posHeadCaches,
        intentProjected,
        posCapEmbedding,
        ctx.params.headParams,
        grads.khead,
        ctx.config,
      );

      accumulateDCapGradient(dE_accum, posCapIdx, dCapEmbedding, capIndexToLevel);
      backpropWIntent(dIntentProjected, example.intentEmbedding, grads, ctx.config);
    }
  }

  // Backward through message passing
  let mpGradNorm = 0;
  let v2vGradNorm = 0;
  if (mpCache && dE_accum.size > 0) {
    const dE_final = buildDEFinalFromAccum(dE_accum, mpCache);
    const mpGrads = orchestrator.backwardMultiLevel(
      dE_final,
      null,
      mpCache,
      ctx.levelParams,
      ctx.v2vParams,
    );

    const mpGradsConverted = { levelGradients: mpGrads.levelGrads };
    applyLevelGradients(mpGradsConverted, ctx.levelParams, ctx.config, examples.length);
    mpGradNorm = computeMPGradNorm(mpGradsConverted);

    if (mpGrads.v2vGrads) {
      const lr = ctx.config.learningRate;
      const batchSize = examples.length;
      ctx.v2vParams.residualLogit -= lr * mpGrads.v2vGrads.dResidualLogit / batchSize;
      ctx.v2vParams.temperatureLogit -= lr * mpGrads.v2vGrads.dTemperatureLogit / batchSize;
      v2vGradNorm = Math.sqrt(
        mpGrads.v2vGrads.dResidualLogit ** 2 + mpGrads.v2vGrads.dTemperatureLogit ** 2
      );
    }
  }

  const levelGradNorm = computeGradientNorm(grads);
  const kheadGradNorm = computeKHeadGradientNorm(grads.khead);
  const gradNorm = Math.sqrt(
    levelGradNorm ** 2 + kheadGradNorm ** 2 + mpGradNorm ** 2 + v2vGradNorm ** 2
  );

  applyKHeadGradients(grads.khead, ctx.params.headParams, ctx.config, examples.length);
  applyWIntentGradients(grads, ctx.params.W_intent, ctx.config, examples.length);

  return {
    loss: totalLoss / examples.length,
    accuracy: correct / examples.length,
    tdErrors,
    gradNorm,
  };
}

// ==========================================================================
// Batched K-Head Training (10x faster)
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

  if (capabilityNodes.size === 0 || !ctx.hierarchy || !ctx.multiLevelIncidence) {
    return { loss: 0, accuracy: 0, tdErrors: [], gradNorm: 0 };
  }

  // Build E_levels_init
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
  const { result, cache: mpCache } = orchestrator.forwardMultiLevelWithCache(
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
    ctx.v2vParams,
  );

  // Flatten E for K-head scoring
  const E_flat = flattenEmbeddingsFn(fwdCtx, result.E);

  // Build capId → embedding map for batched scoring
  const capEmbeddings = new Map<string, number[]>();
  const capIds = Array.from(capabilityNodes.keys());
  for (let i = 0; i < capIds.length; i++) {
    capEmbeddings.set(capIds[i], E_flat[i]);
  }
  // Also add tools
  const toolNodes = ctx.graphBuilder.getToolNodes();
  for (const [toolId, tool] of toolNodes) {
    if (tool.embedding) {
      capEmbeddings.set(toolId, tool.embedding);
    }
  }

  // === BATCHED INTENT PROJECTION ===
  const intents = examples.map((ex) => ex.intentEmbedding);
  const intentsBatched = batchProjectIntents(intents, ctx.params.W_intent);

  // === BATCHED K-HEAD FORWARD ===
  const { scores: allScores, logits: allLogits, cache: kheadCache } = batchedKHeadForward(
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

  // Accumulate dCapEmbedding gradients per level
  const dE_accum = new Map<number, Map<number, number[]>>();
  for (let level = 0; level <= maxLevel; level++) {
    dE_accum.set(level, new Map());
  }

  // Accumulate dIntentsBatched for W_intent backprop
  const dIntentsBatched: number[][] = [];

  for (let exIdx = 0; exIdx < examples.length; exIdx++) {
    const example = examples[exIdx];
    const isWeight = weights[exIdx];

    // Get positive cap scores
    const posCapIdx = ctx.graphBuilder.getCapabilityIndex(example.candidateId);
    if (posCapIdx === undefined) {
      tdErrors.push(0);
      dIntentsBatched.push(new Array(ctx.config.hiddenDim).fill(0));
      continue;
    }

    const posLogit = allLogits.get(example.candidateId)?.[exIdx] ?? 0;

    if (example.negativeCapIds && example.negativeCapIds.length > 0) {
      // === CONTRASTIVE (InfoNCE) ===
      const negLogits: number[] = [];
      const negCapIndices: number[] = [];
      const validNegCapIds: string[] = [];

      for (const negCapId of example.negativeCapIds) {
        const negCapIdx = ctx.graphBuilder.getCapabilityIndex(negCapId);
        if (negCapIdx === undefined) continue;
        negLogits.push(allLogits.get(negCapId)?.[exIdx] ?? 0);
        negCapIndices.push(negCapIdx);
        validNegCapIds.push(negCapId);
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

      // Positive cap gradient
      const dLossPos = (softmax[0] - 1) / TEMPERATURE * isWeight;
      const posKCaps = kheadCache.K_caps.get(example.candidateId);
      const posCapEmb = capEmbeddings.get(example.candidateId);
      if (posKCaps && posCapEmb) {
        for (let h = 0; h < ctx.config.numHeads; h++) {
          const Q = kheadCache.Q_batches[h][exIdx];
          const K = posKCaps[h];
          if (!K) continue;
          const { dIntentsBatched: dI, dCapEmbedding: dCap } = batchedBackpropKHeadLogit(
            [dLossPos / ctx.config.numHeads],
            [Q],
            K,
            [intentsBatched[exIdx]],
            posCapEmb,
            ctx.params.headParams[h],
            grads.khead,
            h,
          );
          for (let j = 0; j < dIntentAccum.length; j++) {
            dIntentAccum[j] += dI[0]?.[j] ?? 0;
          }
          accumulateDCapGradient(dE_accum, posCapIdx, dCap, capIndexToLevel);
        }
      }

      // Negative caps gradients
      for (let i = 0; i < negLogits.length; i++) {
        const dLossNeg = softmax[i + 1] / TEMPERATURE * isWeight;
        const negCapId = validNegCapIds[i];
        const negCapIdx = negCapIndices[i];
        const negKCaps = kheadCache.K_caps.get(negCapId);
        const negCapEmb = capEmbeddings.get(negCapId);
        if (!negKCaps || !negCapEmb) continue;

        for (let h = 0; h < ctx.config.numHeads; h++) {
          const Q = kheadCache.Q_batches[h][exIdx];
          const K = negKCaps[h];
          if (!K) continue;
          const { dIntentsBatched: dI, dCapEmbedding: dCap } = batchedBackpropKHeadLogit(
            [dLossNeg / ctx.config.numHeads],
            [Q],
            K,
            [intentsBatched[exIdx]],
            negCapEmb,
            ctx.params.headParams[h],
            grads.khead,
            h,
          );
          for (let j = 0; j < dIntentAccum.length; j++) {
            dIntentAccum[j] += dI[0]?.[j] ?? 0;
          }
          accumulateDCapGradient(dE_accum, negCapIdx, dCap, capIndexToLevel);
        }
      }

      dIntentsBatched.push(dIntentAccum);
    } else {
      // === LEGACY BCE ===
      const posScore = allScores.get(example.candidateId)?.[exIdx] ?? 0.5;
      const predScore = Math.min(0.95, Math.max(0.05, posScore));
      totalLoss += math.binaryCrossEntropy(predScore, example.outcome) * isWeight;
      tdErrors.push(example.outcome - predScore);

      if ((predScore > 0.5 ? 1 : 0) === example.outcome) correct++;

      // BCE backward
      const dLossRaw = example.outcome === 1 ? -1 / (predScore + 1e-7) : 1 / (1 - predScore + 1e-7);
      const dLoss = dLossRaw * isWeight;
      let dIntentAccum = new Array(ctx.config.hiddenDim).fill(0);

      const bceKCaps = kheadCache.K_caps.get(example.candidateId);
      const bceCapEmb = capEmbeddings.get(example.candidateId);
      if (bceKCaps && bceCapEmb) {
        for (let h = 0; h < ctx.config.numHeads; h++) {
          const Q = kheadCache.Q_batches[h][exIdx];
          const K = bceKCaps[h];
          if (!K) continue;
          const score = allScores.get(example.candidateId)?.[exIdx] ?? 0.5;
          const scoringDim = K.length;
          const scale = Math.sqrt(scoringDim);
          const dDotQK = dLoss * score * (1 - score) / scale / ctx.config.numHeads;

          const dQ = K.map((k) => dDotQK * k);
          const dK = Q.map((q) => dDotQK * q);

          math.outerProductAdd(grads.khead.dW_q[h], dQ, intentsBatched[exIdx]);
          math.outerProductAdd(grads.khead.dW_k[h], dK, bceCapEmb);

          const dIntent = math.matVecTransposeBlas(ctx.params.headParams[h].W_q, dQ);
          for (let j = 0; j < dIntentAccum.length; j++) {
            dIntentAccum[j] += dIntent[j] ?? 0;
          }

          const dCap = math.matVecTransposeBlas(ctx.params.headParams[h].W_k, dK);
          accumulateDCapGradient(dE_accum, posCapIdx, dCap, capIndexToLevel);
        }
      }

      dIntentsBatched.push(dIntentAccum);
    }
  }

  // === BACKWARD: W_intent ===
  batchedBackpropWIntent(dIntentsBatched, intents, grads.dW_intent);

  // === BACKWARD: Multi-level message passing ===
  let mpGradNorm = 0;
  let v2vGradNorm = 0;
  if (mpCache && dE_accum.size > 0) {
    const dE_final = buildDEFinalFromAccum(dE_accum, mpCache);
    const mpGrads = orchestrator.backwardMultiLevel(
      dE_final,
      null,
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
  }

  return {
    loss: totalLoss / examples.length,
    accuracy: correct / examples.length,
    tdErrors,
    gradNorm,
  };
}
