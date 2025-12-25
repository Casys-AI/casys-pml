/**
 * SHGAT (SuperHyperGraph Attention Networks) v2
 *
 * Implementation based on "SuperHyperGraph Attention Networks" research paper.
 * Key architecture:
 * - Two-phase message passing: Vertex→Hyperedge, Hyperedge→Vertex
 * - Incidence matrix A where A[v][e] = 1 if vertex v is in hyperedge e
 * - K-head attention (K=4-16, adaptive) learning patterns on TraceFeatures
 *
 * This file is the main orchestrator that delegates to specialized modules:
 * - graph/: Node registration and incidence matrix
 * - initialization/: Parameter initialization
 * - message-passing/: Two-phase message passing
 * - scoring/: V1 and V2 scoring
 * - training/: V1 and V2 training logic
 *
 * @module graphrag/algorithms/shgat
 */

import { getLogger } from "../../telemetry/logger.ts";

// Module imports
import { GraphBuilder, generateDefaultToolEmbedding } from "./shgat/graph/index.ts";
import {
  initializeParameters,
  initializeV2GradientAccumulators,
  resetV2GradientAccumulators,
  exportParams as exportParamsHelper,
  importParams as importParamsHelper,
  countParameters,
  type SHGATParams,
  type V2GradientAccumulators,
} from "./shgat/initialization/index.ts";
import { MultiLevelOrchestrator } from "./shgat/message-passing/index.ts";
import * as math from "./shgat/utils/math.ts";
import {
  initV1Gradients,
  computeFusionWeights,
  backward as backwardV1,
  accumulateW_intentGradients,
  applyLayerGradients,
  applyFusionGradients,
  applyFeatureGradients,
  applyW_intentGradients,
  trainOnEpisodes,
} from "./shgat/training/v1-trainer.ts";
import {
  traceStatsToVector,
  forwardV2WithCache,
  backwardV2,
  applyV2Gradients,
  buildTraceFeatures,
  createDefaultTraceStatsFromFeatures,
} from "./shgat/training/v2-trainer.ts";

// Re-export all types from ./shgat/types.ts for backward compatibility
export {
  type TraceStats,
  DEFAULT_TRACE_STATS,
  NUM_TRACE_STATS,
  type TraceFeatures,
  createDefaultTraceFeatures,
  type FusionWeights,
  DEFAULT_FUSION_WEIGHTS,
  type FeatureWeights,
  DEFAULT_FEATURE_WEIGHTS,
  type SHGATConfig,
  DEFAULT_SHGAT_CONFIG,
  getAdaptiveConfig,
  type TrainingExample,
  type HypergraphFeatures,
  DEFAULT_HYPERGRAPH_FEATURES,
  type ToolGraphFeatures,
  DEFAULT_TOOL_GRAPH_FEATURES,
  type ToolNode,
  type CapabilityNode,
  type AttentionResult,
  type ForwardCache,
} from "./shgat/types.ts";

import {
  type TraceStats,
  DEFAULT_TRACE_STATS,
  type TraceFeatures,
  type SHGATConfig,
  DEFAULT_SHGAT_CONFIG,
  type TrainingExample,
  type HypergraphFeatures,
  DEFAULT_HYPERGRAPH_FEATURES,
  type ToolGraphFeatures,
  DEFAULT_TOOL_GRAPH_FEATURES,
  type ToolNode,
  type CapabilityNode,
  type AttentionResult,
  type ForwardCache,
  type FusionWeights,
} from "./shgat/types.ts";

const log = getLogger("default");

// ============================================================================
// SHGAT Implementation
// ============================================================================

/**
 * SuperHyperGraph Attention Networks
 *
 * Implements proper two-phase message passing:
 * 1. Vertex → Hyperedge: Aggregate tool features to capabilities
 * 2. Hyperedge → Vertex: Propagate capability features back to tools
 */
export class SHGAT {
  private config: SHGATConfig;
  private graphBuilder: GraphBuilder;
  private params: SHGATParams;
  private orchestrator: MultiLevelOrchestrator;
  private trainingMode = false;
  private lastCache: ForwardCache | null = null;
  private v2GradAccum: V2GradientAccumulators;

  constructor(config: Partial<SHGATConfig> = {}) {
    this.config = { ...DEFAULT_SHGAT_CONFIG, ...config };
    this.graphBuilder = new GraphBuilder();
    this.orchestrator = new MultiLevelOrchestrator(this.trainingMode);
    this.params = initializeParameters(this.config);
    this.v2GradAccum = initializeV2GradientAccumulators(this.config);
  }

  // ==========================================================================
  // Graph Management (delegated to GraphBuilder)
  // ==========================================================================

  registerTool(node: ToolNode): void {
    this.graphBuilder.registerTool(node);
  }

  registerCapability(node: CapabilityNode): void {
    this.graphBuilder.registerCapability(node);
  }

  hasToolNode(toolId: string): boolean {
    return this.graphBuilder.hasToolNode(toolId);
  }

  hasCapabilityNode(capabilityId: string): boolean {
    return this.graphBuilder.hasCapabilityNode(capabilityId);
  }

  getToolCount(): number {
    return this.graphBuilder.getToolCount();
  }

  getCapabilityCount(): number {
    return this.graphBuilder.getCapabilityCount();
  }

  getToolIds(): string[] {
    return this.graphBuilder.getToolIds();
  }

  getCapabilityIds(): string[] {
    return this.graphBuilder.getCapabilityIds();
  }

  buildFromData(
    tools: Array<{ id: string; embedding: number[] }>,
    capabilities: Array<{
      id: string;
      embedding: number[];
      toolsUsed: string[];
      successRate: number;
      parents?: string[];
      children?: string[];
    }>,
  ): void {
    this.graphBuilder.buildFromData({ tools, capabilities });
  }

  updateHypergraphFeatures(capabilityId: string, features: Partial<HypergraphFeatures>): void {
    this.graphBuilder.updateHypergraphFeatures(capabilityId, features);
  }

  updateToolFeatures(toolId: string, features: Partial<ToolGraphFeatures>): void {
    this.graphBuilder.updateToolFeatures(toolId, features);
  }

  batchUpdateFeatures(updates: Map<string, Partial<HypergraphFeatures>>): void {
    this.graphBuilder.batchUpdateCapabilityFeatures(updates);
    log.debug("[SHGAT] Updated hypergraph features", { updatedCount: updates.size });
  }

  batchUpdateToolFeatures(updates: Map<string, Partial<ToolGraphFeatures>>): void {
    this.graphBuilder.batchUpdateToolFeatures(updates);
    log.debug("[SHGAT] Updated tool features", { updatedCount: updates.size });
  }

  // ==========================================================================
  // Two-Phase Message Passing
  // ==========================================================================

  forward(): { H: number[][]; E: number[][]; cache: ForwardCache } {
    const H = this.graphBuilder.getToolEmbeddings();
    const E = this.graphBuilder.getCapabilityEmbeddings();
    const incidenceMatrix = this.graphBuilder.getIncidenceMatrix();

    const result = this.orchestrator.forward(
      H, E, incidenceMatrix, this.params.layerParams,
      {
        numHeads: this.config.numHeads,
        numLayers: this.config.numLayers,
        dropout: this.config.dropout,
        leakyReluSlope: this.config.leakyReluSlope,
      },
    );

    this.lastCache = result.cache;
    return result;
  }

  // ==========================================================================
  // Intent Projection
  // ==========================================================================

  private projectIntent(intentEmbedding: number[]): number[] {
    const propagatedDim = this.params.W_intent.length;
    const result = new Array(propagatedDim).fill(0);

    for (let i = 0; i < propagatedDim; i++) {
      for (let j = 0; j < intentEmbedding.length; j++) {
        result[i] += this.params.W_intent[i][j] * intentEmbedding[j];
      }
    }

    return result;
  }

  // ==========================================================================
  // V2 Scoring Methods
  // ==========================================================================

  private projectFeaturesV2(features: TraceFeatures): number[] {
    const { hiddenDim } = this.config;
    const statsVec = traceStatsToVector(features.traceStats);
    const combined = [...features.intentEmbedding, ...features.candidateEmbedding, ...features.contextAggregated, ...statsVec];

    const result = new Array(hiddenDim).fill(0);
    for (let i = 0; i < hiddenDim; i++) {
      let sum = this.params.b_proj[i];
      for (let j = 0; j < combined.length; j++) {
        sum += this.params.W_proj[i][j] * combined[j];
      }
      result[i] = Math.max(0, sum);
    }

    return result;
  }

  private computeHeadScoreV2(projected: number[], headIdx: number): number {
    const hp = this.params.headParams[headIdx];
    const { hiddenDim } = this.config;

    const Q = new Array(hiddenDim).fill(0);
    const K = new Array(hiddenDim).fill(0);
    const V = new Array(hiddenDim).fill(0);

    for (let i = 0; i < hiddenDim; i++) {
      for (let j = 0; j < projected.length; j++) {
        Q[i] += hp.W_q[i][j] * projected[j];
        K[i] += hp.W_k[i][j] * projected[j];
        V[i] += hp.W_v[i][j] * projected[j];
      }
    }

    const scale = Math.sqrt(hiddenDim);
    const attentionWeight = math.sigmoid(math.dot(Q, K) / scale);
    return attentionWeight * V.reduce((a, b) => a + b, 0) / hiddenDim;
  }

  private computeMultiHeadScoresV2(features: TraceFeatures): number[] {
    const projected = this.projectFeaturesV2(features);
    return Array.from({ length: this.config.numHeads }, (_, h) => this.computeHeadScoreV2(projected, h));
  }

  private fusionMLPForward(headScores: number[]): number {
    const { mlpHiddenDim } = this.config;
    const hidden = new Array(mlpHiddenDim).fill(0);

    for (let i = 0; i < mlpHiddenDim; i++) {
      let sum = this.params.fusionMLP.b1[i];
      for (let j = 0; j < headScores.length; j++) {
        sum += this.params.fusionMLP.W1[i][j] * headScores[j];
      }
      hidden[i] = Math.max(0, sum);
    }

    let output = this.params.fusionMLP.b2;
    for (let i = 0; i < mlpHiddenDim; i++) {
      output += this.params.fusionMLP.W2[i] * hidden[i];
    }

    return math.sigmoid(output);
  }

  scoreWithTraceFeaturesV2(features: TraceFeatures): { score: number; headScores: number[] } {
    const headScores = this.computeMultiHeadScoresV2(features);
    return { score: this.fusionMLPForward(headScores), headScores };
  }

  scoreAllCapabilitiesV2(
    intentEmbedding: number[],
    traceFeaturesMap: Map<string, TraceFeatures>,
    contextToolIds: string[] = [],
  ): AttentionResult[] {
    const results: AttentionResult[] = [];
    const { numHeads } = this.config;
    const capabilityNodes = this.graphBuilder.getCapabilityNodes();
    const toolNodes = this.graphBuilder.getToolNodes();

    const contextEmbeddings: number[][] = [];
    for (const toolId of contextToolIds.slice(-this.config.maxContextLength)) {
      const tool = toolNodes.get(toolId);
      if (tool) contextEmbeddings.push(tool.embedding);
    }
    const contextAggregated = math.meanPool(contextEmbeddings, intentEmbedding.length);

    for (const [capId, cap] of capabilityNodes) {
      const providedFeatures = traceFeaturesMap.get(capId);
      const hgFeatures = cap.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;

      const features: TraceFeatures = {
        intentEmbedding, candidateEmbedding: cap.embedding, contextEmbeddings, contextAggregated,
        traceStats: providedFeatures?.traceStats ?? createDefaultTraceStatsFromFeatures(
          cap.successRate, hgFeatures.cooccurrence, hgFeatures.recency, hgFeatures.hypergraphPageRank
        ),
      };

      const { score, headScores } = this.scoreWithTraceFeaturesV2(features);
      const reliabilityMult = cap.successRate < 0.5 ? 0.5 : (cap.successRate > 0.9 ? 1.2 : 1.0);

      results.push({
        capabilityId: capId,
        score: Math.min(0.95, Math.max(0, score * reliabilityMult)),
        headWeights: new Array(numHeads).fill(1 / numHeads),
        headScores,
        recursiveContribution: 0,
        featureContributions: { semantic: headScores[0] ?? 0, structure: headScores[1] ?? 0, temporal: headScores[2] ?? 0, reliability: reliabilityMult },
        toolAttention: this.getCapabilityToolAttention(this.graphBuilder.getCapabilityIndex(capId)!),
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  scoreAllToolsV2(
    intentEmbedding: number[],
    traceFeaturesMap: Map<string, TraceFeatures>,
    contextToolIds: string[] = [],
  ): Array<{ toolId: string; score: number; headScores: number[] }> {
    const results: Array<{ toolId: string; score: number; headScores: number[] }> = [];
    const toolNodes = this.graphBuilder.getToolNodes();

    const contextEmbeddings: number[][] = [];
    for (const toolId of contextToolIds.slice(-this.config.maxContextLength)) {
      const tool = toolNodes.get(toolId);
      if (tool) contextEmbeddings.push(tool.embedding);
    }
    const contextAggregated = math.meanPool(contextEmbeddings, intentEmbedding.length);

    for (const [toolId, tool] of toolNodes) {
      const providedFeatures = traceFeaturesMap.get(toolId);
      const toolFeatures = tool.toolFeatures || DEFAULT_TOOL_GRAPH_FEATURES;

      const features: TraceFeatures = {
        intentEmbedding, candidateEmbedding: tool.embedding, contextEmbeddings, contextAggregated,
        traceStats: providedFeatures?.traceStats ?? createDefaultTraceStatsFromFeatures(0.5, toolFeatures.cooccurrence, toolFeatures.recency, toolFeatures.pageRank),
      };

      const { score, headScores } = this.scoreWithTraceFeaturesV2(features);
      results.push({ toolId, score: Math.min(0.95, Math.max(0, score)), headScores });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  scoreAllCapabilitiesV3(
    intentEmbedding: number[],
    traceFeaturesMap: Map<string, TraceFeatures>,
    contextToolIds: string[] = [],
  ): AttentionResult[] {
    const results: AttentionResult[] = [];
    const { numHeads } = this.config;
    const capabilityNodes = this.graphBuilder.getCapabilityNodes();
    const toolNodes = this.graphBuilder.getToolNodes();

    const { E } = this.forward();

    const contextEmbeddings: number[][] = [];
    for (const toolId of contextToolIds.slice(-this.config.maxContextLength)) {
      const tool = toolNodes.get(toolId);
      if (tool) contextEmbeddings.push(tool.embedding);
    }
    const contextAggregated = math.meanPool(contextEmbeddings, intentEmbedding.length);

    for (const [capId, cap] of capabilityNodes) {
      const cIdx = this.graphBuilder.getCapabilityIndex(capId)!;
      const providedFeatures = traceFeaturesMap.get(capId);
      const hgFeatures = cap.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;

      const features: TraceFeatures = {
        intentEmbedding, candidateEmbedding: E[cIdx], contextEmbeddings, contextAggregated,
        traceStats: providedFeatures?.traceStats ?? createDefaultTraceStatsFromFeatures(
          cap.successRate, hgFeatures.cooccurrence, hgFeatures.recency, hgFeatures.hypergraphPageRank
        ),
      };

      const { score, headScores } = this.scoreWithTraceFeaturesV2(features);
      const reliabilityMult = cap.successRate < 0.5 ? 0.5 : (cap.successRate > 0.9 ? 1.2 : 1.0);

      results.push({
        capabilityId: capId,
        score: Math.min(0.95, Math.max(0, score * reliabilityMult)),
        headWeights: new Array(numHeads).fill(1 / numHeads),
        headScores,
        recursiveContribution: 0,
        featureContributions: { semantic: headScores[0] ?? 0, structure: headScores[1] ?? 0, temporal: headScores[2] ?? 0, reliability: reliabilityMult },
        toolAttention: this.getCapabilityToolAttention(cIdx),
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // ==========================================================================
  // V1 Scoring Methods (Legacy 3-Head Architecture)
  // ==========================================================================

  scoreAllCapabilities(intentEmbedding: number[], _contextToolEmbeddings?: number[][], _contextCapabilityIds?: string[]): AttentionResult[] {
    const { E } = this.forward();
    const results: AttentionResult[] = [];
    const capabilityNodes = this.graphBuilder.getCapabilityNodes();

    const groupWeights = computeFusionWeights(this.params.fusionWeights, this.config.headFusionWeights);
    const intentProjected = this.projectIntent(intentEmbedding);
    const activeHeads = this.config.activeHeads ?? [0, 1, 2];

    for (const [capId, cap] of capabilityNodes) {
      const cIdx = this.graphBuilder.getCapabilityIndex(capId)!;
      const intentSim = math.cosineSimilarity(intentProjected, E[cIdx]);
      const reliabilityMult = cap.successRate < 0.5 ? 0.5 : (cap.successRate > 0.9 ? 1.2 : 1.0);
      const features = cap.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;

      const semanticScore = intentSim * this.params.featureWeights.semantic;
      const structureScore = (features.hypergraphPageRank + (features.adamicAdar ?? 0)) * this.params.featureWeights.structure;
      const temporalScore = (features.recency + (features.heatDiffusion ?? 0)) * this.params.featureWeights.temporal;

      const activeWeights = [
        activeHeads.includes(0) ? groupWeights.semantic : 0,
        activeHeads.includes(1) ? groupWeights.structure : 0,
        activeHeads.includes(2) ? groupWeights.temporal : 0,
      ];
      const totalActiveWeight = activeWeights.reduce((a, b) => a + b, 0) || 1;

      const baseScore = (activeWeights[0] * semanticScore + activeWeights[1] * structureScore + activeWeights[2] * temporalScore) / totalActiveWeight;
      const score = Number.isFinite(baseScore * reliabilityMult) ? math.sigmoid(baseScore * reliabilityMult) : 0.5;

      results.push({
        capabilityId: capId,
        score,
        headWeights: activeWeights.map(w => w / totalActiveWeight),
        headScores: [semanticScore, structureScore, temporalScore],
        recursiveContribution: 0,
        featureContributions: { semantic: semanticScore, structure: structureScore, temporal: temporalScore, reliability: reliabilityMult },
        toolAttention: this.getCapabilityToolAttention(cIdx),
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  scoreAllTools(intentEmbedding: number[]): Array<{ toolId: string; score: number; headWeights?: number[] }> {
    const { H } = this.forward();
    const results: Array<{ toolId: string; score: number; headWeights?: number[] }> = [];
    const toolNodes = this.graphBuilder.getToolNodes();

    const groupWeights = computeFusionWeights(this.params.fusionWeights, this.config.headFusionWeights);
    const intentProjected = this.projectIntent(intentEmbedding);
    const activeHeads = this.config.activeHeads ?? [0, 1, 2];

    for (const [toolId, tool] of toolNodes) {
      const tIdx = this.graphBuilder.getToolIndex(toolId)!;
      const intentSim = math.cosineSimilarity(intentProjected, H[tIdx]);
      const features = tool.toolFeatures;

      if (!features) {
        results.push({ toolId, score: Math.max(0, Math.min(intentSim, 0.95)) });
        continue;
      }

      const semanticScore = intentSim * this.params.featureWeights.semantic;
      const structureScore = (features.pageRank + features.adamicAdar) * this.params.featureWeights.structure;
      const temporalScore = (features.recency + features.heatDiffusion) * this.params.featureWeights.temporal;

      const activeWeights = [
        activeHeads.includes(0) ? groupWeights.semantic : 0,
        activeHeads.includes(1) ? groupWeights.structure : 0,
        activeHeads.includes(2) ? groupWeights.temporal : 0,
      ];
      const totalActiveWeight = activeWeights.reduce((a, b) => a + b, 0) || 1;

      const baseScore = (activeWeights[0] * semanticScore + activeWeights[1] * structureScore + activeWeights[2] * temporalScore) / totalActiveWeight;
      const score = Number.isFinite(baseScore) ? math.sigmoid(baseScore) : 0.5;

      results.push({ toolId, score: Math.max(0, Math.min(score, 0.95)), headWeights: activeWeights.map(w => w / totalActiveWeight) });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  predictPathSuccess(intentEmbedding: number[], path: string[]): number {
    const capabilityNodes = this.graphBuilder.getCapabilityNodes();
    const toolNodes = this.graphBuilder.getToolNodes();

    if (capabilityNodes.size === 0 && toolNodes.size === 0) return 0.5;
    if (!path || path.length === 0) return 0.5;

    const toolScoresMap = new Map<string, number>();
    const capScoresMap = new Map<string, number>();

    if (path.some((id) => toolNodes.has(id))) {
      for (const r of this.scoreAllTools(intentEmbedding)) toolScoresMap.set(r.toolId, r.score);
    }
    if (path.some((id) => capabilityNodes.has(id))) {
      for (const r of this.scoreAllCapabilities(intentEmbedding)) capScoresMap.set(r.capabilityId, r.score);
    }

    let weightedSum = 0, weightTotal = 0;
    for (let i = 0; i < path.length; i++) {
      const weight = 1 + i * 0.5;
      const score = toolScoresMap.get(path[i]) ?? capScoresMap.get(path[i]) ?? 0.5;
      weightedSum += score * weight;
      weightTotal += weight;
    }

    return weightedSum / weightTotal;
  }

  computeAttention(intentEmbedding: number[], _contextToolEmbeddings: number[][], capabilityId: string, _contextCapabilityIds?: string[]): AttentionResult {
    const results = this.scoreAllCapabilities(intentEmbedding);
    return results.find((r) => r.capabilityId === capabilityId) || {
      capabilityId, score: 0,
      headWeights: new Array(this.config.numHeads).fill(0),
      headScores: new Array(this.config.numHeads).fill(0),
      recursiveContribution: 0,
    };
  }

  private getCapabilityToolAttention(capIdx: number): number[] {
    if (!this.lastCache || this.lastCache.attentionVE.length === 0) return [];

    const lastLayerVE = this.lastCache.attentionVE[this.config.numLayers - 1];
    const toolCount = this.graphBuilder.getToolCount();

    return Array.from({ length: toolCount }, (_, t) => {
      let avg = 0;
      for (let h = 0; h < this.config.numHeads; h++) avg += lastLayerVE[h][t][capIdx];
      return avg / this.config.numHeads;
    });
  }

  // ==========================================================================
  // Training
  // ==========================================================================

  trainOnExample(example: TrainingExample): { loss: number; accuracy: number; tdErrors: number[] } {
    return this.trainBatch([example]);
  }

  trainBatch(examples: TrainingExample[], isWeights?: number[], gamma: number = 0.99): { loss: number; accuracy: number; tdErrors: number[] } {
    const weights = isWeights ?? new Array(examples.length).fill(1);
    const tdErrors: number[] = [];
    this.trainingMode = true;

    let totalLoss = 0, correct = 0;
    const grads = initV1Gradients(this.config, this.params.layerParams);

    for (let i = 0; i < examples.length; i++) {
      const example = examples[i];
      const isWeight = weights[i];

      const { E, cache } = this.forward();
      const capIdx = this.graphBuilder.getCapabilityIndex(example.candidateId);
      if (capIdx === undefined) { tdErrors.push(0); continue; }

      const capNode = this.graphBuilder.getCapabilityNode(example.candidateId)!;
      const features = capNode.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;
      const intentProjected = this.projectIntent(example.intentEmbedding);

      const intentSim = math.cosineSimilarity(intentProjected, E[capIdx]);
      const rawSemantic = intentSim;
      const rawStructure = features.hypergraphPageRank + (features.adamicAdar ?? 0);
      const rawTemporal = features.recency + (features.heatDiffusion ?? 0);

      const semanticScore = rawSemantic * this.params.featureWeights.semantic;
      const structureScore = rawStructure * this.params.featureWeights.structure;
      const temporalScore = rawTemporal * this.params.featureWeights.temporal;

      const groupWeights = computeFusionWeights(this.params.fusionWeights);
      const reliabilityMult = capNode.successRate < 0.5 ? 0.5 : (capNode.successRate > 0.9 ? 1.2 : 1.0);
      const baseScore = groupWeights.semantic * semanticScore + groupWeights.structure * structureScore + groupWeights.temporal * temporalScore;
      const score = math.sigmoid(baseScore * reliabilityMult);

      const tdError = example.outcome * Math.pow(gamma, example.contextTools?.length ?? 0) - score;
      tdErrors.push(tdError);

      totalLoss += math.binaryCrossEntropy(score, example.outcome) * isWeight;
      if ((score > 0.5 ? 1 : 0) === example.outcome) correct++;

      const dLoss = (score - example.outcome) * isWeight;
      const sigmoidGrad = score * (1 - score) * reliabilityMult;
      const { semantic: ws, structure: wst, temporal: wt } = groupWeights;

      grads.fusionGradients.semantic += dLoss * sigmoidGrad * (ws * (1 - ws) * semanticScore - ws * wst * structureScore - ws * wt * temporalScore);
      grads.fusionGradients.structure += dLoss * sigmoidGrad * (wst * (1 - wst) * structureScore - wst * ws * semanticScore - wst * wt * temporalScore);
      grads.fusionGradients.temporal += dLoss * sigmoidGrad * (wt * (1 - wt) * temporalScore - wt * ws * semanticScore - wt * wst * structureScore);
      grads.featureGradients.semantic += dLoss * sigmoidGrad * ws * rawSemantic;
      grads.featureGradients.structure += dLoss * sigmoidGrad * wst * rawStructure;
      grads.featureGradients.temporal += dLoss * sigmoidGrad * wt * rawTemporal;

      backwardV1(grads, cache, capIdx, intentProjected, dLoss, this.config);
      accumulateW_intentGradients(grads, example.intentEmbedding, intentProjected, E[capIdx], dLoss);
    }

    applyLayerGradients(grads, this.params.layerParams, this.config, examples.length);
    applyFusionGradients(grads, this.params.fusionWeights, this.config, examples.length);
    applyFeatureGradients(grads, this.params.featureWeights, this.config, examples.length);
    applyW_intentGradients(grads, this.params.W_intent, this.config, examples.length);

    this.trainingMode = false;
    return { loss: totalLoss / examples.length, accuracy: correct / examples.length, tdErrors };
  }

  resetV2Gradients(): void {
    resetV2GradientAccumulators(this.v2GradAccum, this.config);
  }

  trainBatchV2(examples: TrainingExample[], traceStatsMap: Map<string, TraceStats>, isWeights?: number[], gamma: number = 0.99): { loss: number; accuracy: number; tdErrors: number[] } {
    const weights = isWeights ?? new Array(examples.length).fill(1);
    const tdErrors: number[] = [];
    this.trainingMode = true;

    let totalLoss = 0, correct = 0;
    this.resetV2Gradients();

    for (let i = 0; i < examples.length; i++) {
      const example = examples[i];
      const isWeight = weights[i];

      const capNode = this.graphBuilder.getCapabilityNode(example.candidateId);
      if (!capNode) { tdErrors.push(0); continue; }

      const traceStats = traceStatsMap.get(example.candidateId) ?? { ...DEFAULT_TRACE_STATS };
      const contextEmbeddings: number[][] = [];
      for (const toolId of example.contextTools.slice(0, 5)) {
        const toolNode = this.graphBuilder.getToolNode(toolId);
        if (toolNode) contextEmbeddings.push(toolNode.embedding);
      }

      const features = buildTraceFeatures(example.intentEmbedding, capNode.embedding, contextEmbeddings, traceStats, this.config.embeddingDim);
      const cache = forwardV2WithCache(features, this.config, this.params.headParams, this.params.W_proj, this.params.b_proj, this.params.fusionMLP);

      const tdError = example.outcome * Math.pow(gamma, example.contextTools.length) - cache.score;
      tdErrors.push(tdError);

      totalLoss += math.binaryCrossEntropy(cache.score, example.outcome) * isWeight;
      if ((cache.score > 0.5 ? 1 : 0) === example.outcome) correct++;

      backwardV2(cache, (cache.score - example.outcome) * isWeight, this.config, this.params.headParams, this.params.fusionMLP, this.v2GradAccum);
    }

    applyV2Gradients(this.v2GradAccum, this.config, this.params.W_proj, this.params.b_proj, this.params.fusionMLP, examples.length);
    this.trainingMode = false;
    return { loss: totalLoss / examples.length, accuracy: correct / examples.length, tdErrors };
  }

  applyV2Gradients(batchSize: number): void {
    applyV2Gradients(this.v2GradAccum, this.config, this.params.W_proj, this.params.b_proj, this.params.fusionMLP, batchSize);
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  exportParams(): Record<string, unknown> {
    return exportParamsHelper(this.config, this.params);
  }

  importParams(params: Record<string, unknown>): void {
    const result = importParamsHelper(params, this.params);
    if (result.config) this.config = result.config;
    this.params = result.params;
  }

  getFusionWeights(): { semantic: number; structure: number; temporal: number } {
    return computeFusionWeights(this.params.fusionWeights, this.config.headFusionWeights);
  }

  setFusionWeights(weights: Partial<FusionWeights>): void {
    if (weights.semantic !== undefined) this.params.fusionWeights.semantic = weights.semantic;
    if (weights.structure !== undefined) this.params.fusionWeights.structure = weights.structure;
    if (weights.temporal !== undefined) this.params.fusionWeights.temporal = weights.temporal;
  }

  getRegisteredToolIds(): string[] {
    return this.graphBuilder.getToolIds();
  }

  getRegisteredCapabilityIds(): string[] {
    return this.graphBuilder.getCapabilityIds();
  }

  getStats(): {
    numHeads: number; hiddenDim: number; numLayers: number; paramCount: number; v2ParamCount: number;
    registeredCapabilities: number; registeredTools: number; incidenceNonZeros: number;
    fusionWeights: { semantic: number; structure: number; temporal: number }; mlpHiddenDim: number; maxContextLength: number;
  } {
    const { v1ParamCount, v2ParamCount } = countParameters(this.config);
    const incidenceStats = this.graphBuilder.getIncidenceStats();

    return {
      numHeads: this.config.numHeads, hiddenDim: this.config.hiddenDim, numLayers: this.config.numLayers,
      paramCount: v1ParamCount, v2ParamCount,
      registeredCapabilities: incidenceStats.numCapabilities, registeredTools: incidenceStats.numTools, incidenceNonZeros: incidenceStats.nonZeros,
      fusionWeights: this.getFusionWeights(), mlpHiddenDim: this.config.mlpHiddenDim, maxContextLength: this.config.maxContextLength,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSHGATFromCapabilities(
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents?: string[]; children?: string[]; hypergraphFeatures?: HypergraphFeatures }>,
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

  const shgat = new SHGAT(actualConfig);
  const allTools = new Set<string>();
  for (const cap of capabilities) for (const toolId of cap.toolsUsed) allTools.add(toolId);

  const embeddingDim = capabilities[0]?.embedding.length || 1024;
  for (const toolId of allTools) {
    shgat.registerTool({ id: toolId, embedding: toolEmbeddings?.get(toolId) || generateDefaultToolEmbedding(toolId, embeddingDim) });
  }

  for (const cap of capabilities) {
    shgat.registerCapability({ id: cap.id, embedding: cap.embedding, toolsUsed: cap.toolsUsed, successRate: cap.successRate, parents: cap.parents || [], children: cap.children || [] });
    if (cap.hypergraphFeatures) shgat.updateHypergraphFeatures(cap.id, cap.hypergraphFeatures);
  }

  return shgat;
}

export async function trainSHGATOnEpisodes(
  shgat: SHGAT, episodes: TrainingExample[], _getEmbedding: (id: string) => number[] | null,
  options: { epochs?: number; batchSize?: number; onEpoch?: (epoch: number, loss: number, accuracy: number) => void } = {},
): Promise<{ finalLoss: number; finalAccuracy: number }> {
  return trainOnEpisodes((batch) => shgat.trainBatch(batch), episodes, options);
}
