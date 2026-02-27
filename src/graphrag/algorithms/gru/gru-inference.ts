/**
 * GRU Inference — Pure JS+BLAS forward pass
 *
 * Reimplements the CompactInformedGRU forward pass without TF.js.
 * Uses BLAS-accelerated math from the SHGAT utils when available.
 *
 * Architecture (single-step, batch=1):
 *   1. input_proj: toolEmb[1024] → [128] (linear)
 *   2. concat: [128] || transFeats[5] → [133]
 *   3. GRU cell: x[133], h[64] → h_new[64]  (resetAfter=false)
 *   4. intent_proj: intent[1024] → relu → [64]
 *   5. cap_proj: capFingerprint[numCaps] → relu → [16]
 *   6. composite_proj: composite[3] → relu → [8]
 *   7. term_hidden: concat(gru[64], intent[64]) → relu → [32]
 *   8. termination: [32] → sigmoid → scalar
 *   9. fusion: concat(gru[64], intent[64], cap[16], comp[8]) → relu → [64]
 *  10. emb_proj: [64] → [1024] (linear)
 *  11. similarity: dot(emb_proj, vocabEmb/temperature) → softmax → [vocabSize]
 *  12. structural_bias: log(probs) + α·jaccard[last] + β·bigram[last] → re-softmax
 *
 * Decode strategy:
 *   - Greedy (buildPath): forward → structural bias → argmax → termination check
 *   - Beam (buildPathBeam): competitive branching — terminate vs continue
 *     are scored and compete, length-normalized by len^alpha (default 0.7)
 *
 * @module graphrag/algorithms/gru/gru-inference
 */

import * as log from "@std/log";
import {
  sigmoid,
  softmax,
} from "../shgat/utils/math.ts";

import type {
  GRUWeights,
  GRUVocabulary,
  GRUConfig,
  IGRUInference,
  StructuralMatrices,
} from "./types.ts";
import { DEFAULT_GRU_CONFIG } from "./types.ts";

// ---------------------------------------------------------------------------
// Dense forward (matmul + bias + activation)
// ---------------------------------------------------------------------------

type Activation = "linear" | "relu" | "sigmoid";

function denseForward(
  input: number[],
  kernel: number[][],
  bias: number[],
  activation: Activation = "linear",
): number[] {
  const outDim = kernel[0]?.length ?? 0;
  const inDim = input.length;
  const result = new Array<number>(outDim);

  for (let j = 0; j < outDim; j++) {
    let sum = bias[j];
    for (let i = 0; i < inDim; i++) {
      sum += input[i] * kernel[i][j];
    }
    if (activation === "relu") {
      result[j] = sum > 0 ? sum : 0;
    } else if (activation === "sigmoid") {
      result[j] = sigmoid(sum);
    } else {
      result[j] = sum;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// GRU cell forward (resetAfter=false)
// ---------------------------------------------------------------------------

/**
 * Single GRU cell step (resetAfter=false).
 *
 * Gates:
 *   z = sigmoid(x·Wz + h·Uz + bz)        — update gate
 *   r = sigmoid(x·Wr + h·Ur + br)        — reset gate
 *   h' = tanh(x·Wh + (r⊙h)·Uh + bh)     — candidate
 *   h_new = z⊙h_prev + (1-z)⊙h'
 *
 * kernel: [inputDim, 3*units]  columns = [Wz | Wr | Wh]
 * recurrentKernel: [units, 3*units]  columns = [Uz | Ur | Uh]
 * bias: [3*units]  = [bz | br | bh]
 */
function gruCellForward(
  x: number[],
  hPrev: number[],
  kernel: number[][],
  recurrentKernel: number[][],
  bias: number[],
): number[] {
  const units = hPrev.length;
  const inputDim = x.length;

  // x @ kernel → [3*units]
  const xW = new Array<number>(3 * units);
  for (let j = 0; j < 3 * units; j++) {
    let sum = 0;
    for (let i = 0; i < inputDim; i++) {
      sum += x[i] * kernel[i][j];
    }
    xW[j] = sum;
  }

  // h @ recurrentKernel → [3*units]
  const hU = new Array<number>(3 * units);
  for (let j = 0; j < 3 * units; j++) {
    let sum = 0;
    for (let i = 0; i < units; i++) {
      sum += hPrev[i] * recurrentKernel[i][j];
    }
    hU[j] = sum;
  }

  // z gate (update): sigmoid(xW_z + hU_z + b_z)
  const z = new Array<number>(units);
  for (let i = 0; i < units; i++) {
    z[i] = sigmoid(xW[i] + hU[i] + bias[i]);
  }

  // r gate (reset): sigmoid(xW_r + hU_r + b_r)
  const r = new Array<number>(units);
  for (let i = 0; i < units; i++) {
    r[i] = sigmoid(xW[units + i] + hU[units + i] + bias[units + i]);
  }

  // Candidate h': tanh(xW_h + (r⊙h)@U_h + b_h)
  // resetAfter=false: r is applied BEFORE the recurrent multiply
  const hNew = new Array<number>(units);
  for (let i = 0; i < units; i++) {
    let rh_Uh = 0;
    for (let k = 0; k < units; k++) {
      rh_Uh += (r[k] * hPrev[k]) * recurrentKernel[k][2 * units + i];
    }
    const candidate = Math.tanh(xW[2 * units + i] + rh_Uh + bias[2 * units + i]);
    hNew[i] = z[i] * hPrev[i] + (1 - z[i]) * candidate;
  }

  return hNew;
}

// ---------------------------------------------------------------------------
// GRU Inference Engine
// ---------------------------------------------------------------------------

export class GRUInference implements IGRUInference {
  private weights: GRUWeights | null = null;
  private vocab: GRUVocabulary | null = null;
  private structural: StructuralMatrices | null = null;
  private config: GRUConfig;
  private numCapabilities = 0;

  constructor(config?: Partial<GRUConfig>) {
    this.config = { ...DEFAULT_GRU_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  setWeights(weights: GRUWeights): void {
    this.weights = weights;
    this.numCapabilities = weights.capProjKernel.length;
    log.info(`[GRU] Weights loaded: vocabSize=${weights.similarityHeadKernel[0]?.length ?? 0}, numCaps=${this.numCapabilities}`);
  }

  setVocabulary(vocab: GRUVocabulary): void {
    this.vocab = vocab;
    log.info(`[GRU] Vocabulary set: ${vocab.vocabSize} nodes (${vocab.numTools} tools)`);
  }

  setStructuralMatrices(structural: StructuralMatrices): void {
    this.structural = structural;
  }

  isReady(): boolean {
    return this.weights !== null && this.vocab !== null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  predictFirstTool(intentEmb: number[]): {
    toolId: string;
    score: number;
    ranked: { toolId: string; score: number }[];
  } {
    if (!this.weights || !this.vocab) {
      throw new Error("[GRU] Not ready — weights or vocabulary not loaded");
    }

    // First step: empty context → zero everything
    const zeroEmb = new Array<number>(this.weights.inputProjKernel.length).fill(0);
    const zeroTransFeats = new Float32Array(5);
    const zeroCap = new Float32Array(this.numCapabilities);
    const zeroComposite = [0, 0, 0];
    const h0 = new Array<number>(this.weights.gruRecurrentKernel.length).fill(0);

    const { probs } = this.forwardStep(zeroEmb, zeroTransFeats, h0, intentEmb, zeroCap, zeroComposite);
    // No structural bias on first tool (no context yet)

    const ranked: { toolId: string; score: number }[] = [];
    for (let i = 0; i < this.vocab.vocabSize; i++) {
      ranked.push({
        toolId: this.vocab.indexToNode[i],
        score: probs[i],
      });
    }
    ranked.sort((a, b) => b.score - a.score);

    // Promote top result to canonical cap if it's a 1-child tool
    const topToolId = ranked[0]?.toolId ?? "";
    const promoted = this.promoteToolToCap(topToolId);

    return {
      toolId: promoted,
      score: ranked[0]?.score ?? 0,
      ranked: ranked.slice(0, 10),
    };
  }

  buildPath(intentEmb: number[], firstToolId: string): string[] {
    if (!this.weights || !this.vocab) {
      throw new Error("[GRU] Not ready");
    }

    const path: string[] = [firstToolId];
    const hiddenDim = this.weights.gruRecurrentKernel.length;
    let h = new Array<number>(hiddenDim).fill(0);

    h = this.processToolStep(firstToolId, [], h, intentEmb);

    for (let step = 1; step < this.config.maxPathLength; step++) {
      const lastToolId = path[path.length - 1];
      const lastIdx = this.vocab.nodeToIndex.get(lastToolId);
      const lastEmb = lastIdx !== undefined
        ? this.vocab.embeddings[lastIdx]
        : new Array(this.weights.inputProjKernel.length).fill(0);

      const transFeats = this.computeTransFeats(path);
      const capFp = this.computeCapFingerprint(this.pathToIndices(path));
      const composite = [0, 0, 0];

      const { probs: rawProbs, termProb } = this.forwardStep(lastEmb, transFeats, h, intentEmb, capFp, composite);

      // Structural bias + sticky penalty
      const adjusted = this.applyStructuralBias(rawProbs, lastToolId);
      const nextId = this.pickBestTool(adjusted, path);
      if (!nextId) break;

      path.push(nextId);

      // Check termination AFTER adding the tool (matches training code)
      if (termProb > this.config.terminationThreshold) {
        break;
      }

      h = this.processToolStep(nextId, path.slice(0, -1), h, intentEmb);
    }

    return this.promoteTerminal(path);
  }

  /**
   * Beam search with competitive termination branching.
   *
   * At each step, for each active beam:
   *   Branch A: TERMINATE — score += log(termProb), mark done (only if path >= 2)
   *   Branch B: CONTINUE — score += log(1-termProb) + log(toolProb), for each top-K tool
   *
   * Both branches compete on length-normalized score: logProb / len^alpha
   * This matches the training benchmark (lengthAlpha=0.7 → 70.8% E2E Beam).
   */
  buildPathBeam(
    intentEmb: number[],
    firstToolId: string,
    beamWidth = 3,
  ): { path: string[]; score: number }[] {
    if (!this.weights || !this.vocab) {
      throw new Error("[GRU] Not ready");
    }

    const { maxPathLength, stickyMaxRepeat, lengthAlpha } = this.config;
    const hiddenDim = this.weights.gruRecurrentKernel.length;

    const normalize = (logProb: number, len: number) =>
      logProb / Math.pow(len, lengthAlpha);

    interface Beam {
      path: string[];
      h: number[];
      logScore: number;
    }

    // Initialize with first tool
    const h0 = new Array<number>(hiddenDim).fill(0);
    const hAfterFirst = this.processToolStep(firstToolId, [], h0, intentEmb);

    let active: Beam[] = [{
      path: [firstToolId],
      h: hAfterFirst,
      logScore: 0,
    }];

    const completed: { path: string[]; logScore: number }[] = [];

    for (let step = 1; step < maxPathLength; step++) {
      const nextActive: Beam[] = [];

      for (const beam of active) {
        const lastToolId = beam.path[beam.path.length - 1];
        const lastIdx = this.vocab!.nodeToIndex.get(lastToolId);
        const lastEmb = lastIdx !== undefined
          ? this.vocab!.embeddings[lastIdx]
          : new Array(this.weights!.inputProjKernel.length).fill(0);

        const transFeats = this.computeTransFeats(beam.path);
        const capFp = this.computeCapFingerprint(this.pathToIndices(beam.path));
        const composite = [0, 0, 0];

        const { probs: rawProbs, termProb } = this.forwardStep(
          lastEmb, transFeats, beam.h, intentEmb, capFp, composite,
        );

        const adjusted = this.applyStructuralBias(rawProbs, lastToolId);

        const tp = Math.max(termProb, 1e-10);

        // Branch A: TERMINATE (only if path has >= 2 tools)
        if (beam.path.length >= 2) {
          completed.push({
            path: beam.path,
            logScore: beam.logScore + Math.log(tp),
          });
        }

        // Branch B: CONTINUE with top-K tools
        const continueLogProb = beam.logScore + Math.log(Math.max(1 - tp, 1e-10));
        const topK = this.topKIndices(adjusted, beamWidth);

        for (const { idx, prob } of topK) {
          const toolId = this.vocab!.indexToNode[idx];
          if (!toolId) continue;

          // Sticky penalty
          const repeatCount = beam.path.filter(t => t === toolId).length;
          if (repeatCount >= stickyMaxRepeat) continue;

          const newPath = [...beam.path, toolId].slice(0, maxPathLength);

          const newH = this.processToolStep(toolId, beam.path, beam.h, intentEmb);

          nextActive.push({
            path: newPath,
            h: newH,
            logScore: continueLogProb + Math.log(Math.max(prob, 1e-10)),
          });
        }
      }

      if (nextActive.length === 0) break;

      // Prune to beam width by length-normalized score
      nextActive.sort((a, b) => normalize(b.logScore, b.path.length) - normalize(a.logScore, a.path.length));
      active = nextActive.slice(0, beamWidth);
    }

    // Remaining active beams → completed
    for (const beam of active) {
      completed.push({ path: beam.path, logScore: beam.logScore });
    }

    // Sort by length-normalized score
    completed.sort((a, b) => normalize(b.logScore, b.path.length) - normalize(a.logScore, a.path.length));

    // Deduplicate (keep best score per unique path)
    const seen = new Set<string>();
    const deduped: typeof completed = [];
    for (const c of completed) {
      const key = c.path.join("|");
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(c);
      }
    }

    return deduped.slice(0, beamWidth * 2).map(c => ({
      path: this.promoteTerminal(c.path),
      score: normalize(c.logScore, c.path.length),
    }));
  }

  // -------------------------------------------------------------------------
  // Forward pass (single step) — pure, no decode-time bias
  // -------------------------------------------------------------------------

  private forwardStep(
    toolEmb: number[] | Float32Array,
    transFeats: Float32Array,
    hPrev: number[],
    intentEmb: number[],
    capFingerprint: Float32Array,
    compositeFeats: number[],
  ): { probs: number[]; termProb: number; hNew: number[] } {
    const w = this.weights!;

    // 1. input_proj: toolEmb → [128] (linear)
    const projected = denseForward(Array.from(toolEmb), w.inputProjKernel, w.inputProjBias, "linear");

    // 2. concat: [128] || transFeats[5] → [133]
    const gruInput = [...projected, ...Array.from(transFeats)];

    // 3. GRU cell
    const hNew = gruCellForward(gruInput, hPrev, w.gruKernel, w.gruRecurrentKernel, w.gruBias);

    // 4. intent_proj: intent[1024] → relu → [64]
    const intentProj = denseForward(intentEmb, w.intentProjKernel, w.intentProjBias, "relu");

    // 5. cap_proj: capFingerprint → relu → [16]
    const capProj = denseForward(Array.from(capFingerprint), w.capProjKernel, w.capProjBias, "relu");

    // 6. composite_proj: [3] → relu → [8]
    const compProj = denseForward(compositeFeats, w.compositeProjKernel, w.compositeProjBias, "relu");

    // 7-8. Termination head
    const termInput = [...hNew, ...intentProj];
    const termHidden = denseForward(termInput, w.termHiddenKernel, w.termHiddenBias, "relu");
    const termOut = denseForward(termHidden, w.terminationHeadKernel, w.terminationHeadBias, "sigmoid");
    const termProb = termOut[0];

    // 9. Fusion: concat(gru[64], intent[64], cap[16], comp[8]) → relu → [64]
    const fusionInput = [...hNew, ...intentProj, ...capProj, ...compProj];
    const fusionOut = denseForward(fusionInput, w.fusionDenseKernel, w.fusionDenseBias, "relu");

    // 10. emb_proj: [64] → [1024] (linear)
    const embProj = denseForward(fusionOut, w.embProjKernel, w.embProjBias, "linear");

    // 11. Similarity: embProj @ vocabEmbKernel → softmax
    const vocabSize = w.similarityHeadKernel[0]?.length ?? 0;
    const logits = new Array<number>(vocabSize);
    for (let j = 0; j < vocabSize; j++) {
      let sum = 0;
      for (let i = 0; i < embProj.length; i++) {
        sum += embProj[i] * w.similarityHeadKernel[i][j];
      }
      logits[j] = sum; // Already scaled by temperature in the kernel
    }

    return { probs: softmax(logits), termProb, hNew };
  }

  // -------------------------------------------------------------------------
  // Structural bias (decode-time, log-space)
  // -------------------------------------------------------------------------

  /**
   * Apply Jaccard + bigram bias in log-space, using the last tool's row.
   * Matches training code: logProbs[i] += α·jaccard[last,i] + β·bigram[last,i]
   * Only biases L0 tool indices (0..numTools-1); non-leaf nodes keep raw probs.
   */
  private applyStructuralBias(probs: number[], lastToolId: string): number[] {
    if (!this.structural || !this.vocab) return probs;
    const { jaccardAlpha, bigramBeta } = this.config;
    if (jaccardAlpha === 0 && bigramBeta === 0) return probs;

    const lastToolIdx = this.vocab.nodeToIndex.get(lastToolId);
    if (lastToolIdx === undefined || lastToolIdx >= this.structural.numTools) return probs;

    const numTools = this.structural.numTools;
    const vocabSize = probs.length;

    // Work in log-space
    const logProbs = new Array<number>(vocabSize);
    for (let i = 0; i < vocabSize; i++) {
      logProbs[i] = Math.log(Math.max(probs[i], 1e-10));
    }

    // Add Jaccard bias (L0 tools only)
    if (this.structural.jaccardMatrix) {
      const rowBase = lastToolIdx * numTools;
      for (let i = 0; i < numTools && i < vocabSize; i++) {
        logProbs[i] += jaccardAlpha * this.structural.jaccardMatrix[rowBase + i];
      }
    }

    // Add bigram bias (L0 tools only)
    if (this.structural.bigramMatrix) {
      const rowBase = lastToolIdx * numTools;
      for (let i = 0; i < numTools && i < vocabSize; i++) {
        logProbs[i] += bigramBeta * this.structural.bigramMatrix[rowBase + i];
      }
    }

    // Re-softmax to normalize
    let maxLogP = -Infinity;
    for (let i = 0; i < vocabSize; i++) {
      if (logProbs[i] > maxLogP) maxLogP = logProbs[i];
    }

    const result = new Array<number>(vocabSize);
    let sum = 0;
    for (let i = 0; i < vocabSize; i++) {
      result[i] = Math.exp(logProbs[i] - maxLogP);
      sum += result[i];
    }
    if (sum > 0) {
      for (let i = 0; i < vocabSize; i++) result[i] /= sum;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Helper: process a tool step through the GRU (hidden state update only)
  // -------------------------------------------------------------------------

  private processToolStep(
    toolId: string,
    contextBefore: string[],
    hPrev: number[],
    _intentEmb: number[],
  ): number[] {
    const w = this.weights!;
    const idx = this.vocab!.nodeToIndex.get(toolId);
    const toolEmb = idx !== undefined
      ? this.vocab!.embeddings[idx]
      : new Array(w.inputProjKernel.length).fill(0);

    const transFeats = this.computeTransFeats([...contextBefore, toolId]);

    const projected = denseForward(toolEmb, w.inputProjKernel, w.inputProjBias, "linear");
    const gruInput = [...projected, ...Array.from(transFeats)];

    return gruCellForward(gruInput, hPrev, w.gruKernel, w.gruRecurrentKernel, w.gruBias);
  }

  // -------------------------------------------------------------------------
  // Helper: pick best tool with sticky penalty
  // -------------------------------------------------------------------------

  private pickBestTool(probs: number[], currentPath: string[]): string | null {
    if (!this.vocab) return null;

    const indexed = probs.map((p, i) => ({ idx: i, prob: p }));
    indexed.sort((a, b) => b.prob - a.prob);

    for (const { idx } of indexed) {
      const toolId = this.vocab.indexToNode[idx];
      if (!toolId) continue;

      const repeatCount = currentPath.filter(t => t === toolId).length;
      if (repeatCount >= this.config.stickyMaxRepeat) continue;

      return toolId;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Helper: top-K indices from probability array
  // -------------------------------------------------------------------------

  private topKIndices(probs: number[], k: number): { idx: number; prob: number }[] {
    const indexed = probs.map((p, i) => ({ idx: i, prob: p }));
    indexed.sort((a, b) => b.prob - a.prob);
    return indexed.slice(0, k);
  }

  // -------------------------------------------------------------------------
  // Helper: path to vocab indices (L0 only)
  // -------------------------------------------------------------------------

  private pathToIndices(path: string[]): number[] {
    if (!this.vocab) return [];
    const indices: number[] = [];
    for (const toolId of path) {
      const idx = this.vocab.nodeToIndex.get(toolId);
      if (idx !== undefined && idx < this.vocab.numTools) {
        indices.push(idx);
      }
    }
    return indices;
  }

  // -------------------------------------------------------------------------
  // Transition features (5D) — matches training computeTransitionFeatures()
  // -------------------------------------------------------------------------

  /**
   * Compute 5-dimensional transition features for the current path.
   * Uses toolCapMap from structural matrices when available.
   *
   * [0] avg_jaccard: mean Jaccard(lastTool, each context tool)
   * [1] shared_caps: |lastTool ∩ union(context)| / numCapabilities
   * [2] is_repeat: 1 if lastTool == second-to-last, else 0
   * [3] cap_novelty: fraction of lastTool's caps NOT covered by context
   * [4] context_length / 20
   */
  private computeTransFeats(path: string[]): Float32Array {
    const feats = new Float32Array(5);
    if (path.length === 0 || !this.vocab) return feats;

    const tcm = this.structural?.toolCapMap;
    const lastToolId = path[path.length - 1];
    const lastIdx = this.vocab.nodeToIndex.get(lastToolId);

    // [2] is_repeat
    if (path.length >= 2) {
      feats[2] = path[path.length - 1] === path[path.length - 2] ? 1 : 0;
    }

    // [4] context_length / 20
    feats[4] = path.length / 20;

    // Features [0], [1], [3] need toolCapMap
    if (!tcm || lastIdx === undefined || lastIdx >= tcm.numTools) return feats;

    const { matrix, numTools, numCapabilities } = tcm;
    const contextIdxs: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const idx = this.vocab.nodeToIndex.get(path[i]);
      if (idx !== undefined && idx < numTools) {
        contextIdxs.push(idx);
      }
    }

    if (contextIdxs.length === 0) return feats;

    const lastBase = lastIdx * numCapabilities;

    // Count lastTool's capabilities
    let lastCard = 0;
    for (let c = 0; c < numCapabilities; c++) {
      lastCard += matrix[lastBase + c];
    }

    // [0] avg_jaccard: mean Jaccard(lastTool, each context tool)
    let jaccardSum = 0;
    for (const ctxIdx of contextIdxs) {
      const ctxBase = ctxIdx * numCapabilities;
      let inter = 0;
      let ctxCard = 0;
      for (let c = 0; c < numCapabilities; c++) {
        const cv = matrix[ctxBase + c];
        ctxCard += cv;
        if (matrix[lastBase + c] === 1 && cv === 1) inter++;
      }
      const union = lastCard + ctxCard - inter;
      jaccardSum += union > 0 ? inter / union : 0;
    }
    feats[0] = jaccardSum / contextIdxs.length;

    // [1] shared_caps: |lastTool ∩ union(context)| / numCapabilities
    if (numCapabilities > 0) {
      let shared = 0;
      for (let c = 0; c < numCapabilities; c++) {
        if (matrix[lastBase + c] !== 1) continue;
        for (const ctxIdx of contextIdxs) {
          if (matrix[ctxIdx * numCapabilities + c] === 1) {
            shared++;
            break;
          }
        }
      }
      feats[1] = shared / numCapabilities;
    }

    // [3] cap_novelty: fraction of lastTool's caps NOT covered by context
    if (lastCard > 0) {
      let novelCount = 0;
      for (let c = 0; c < numCapabilities; c++) {
        if (matrix[lastBase + c] !== 1) continue;
        let covered = false;
        for (const ctxIdx of contextIdxs) {
          if (ctxIdx === lastIdx) continue;
          if (matrix[ctxIdx * numCapabilities + c] === 1) {
            covered = true;
            break;
          }
        }
        if (!covered) novelCount++;
      }
      feats[3] = novelCount / lastCard;
    }

    return feats;
  }

  // -------------------------------------------------------------------------
  // Capability fingerprint from context tool indices
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Tool → Cap promotion (1-child canonical caps)
  // -------------------------------------------------------------------------

  /**
   * If toolId maps to a unique canonical cap (1-child, no ambiguity), return the cap.
   * Otherwise return the toolId unchanged.
   */
  private promoteToolToCap(toolId: string): string {
    return this.vocab?.toolToCanonicalCap?.get(toolId) ?? toolId;
  }

  /**
   * Promote the LAST element of a path (the terminal prediction) to its
   * canonical cap if applicable. Intermediate tools are left as-is.
   */
  private promoteTerminal(path: string[]): string[] {
    if (path.length === 0 || !this.vocab?.toolToCanonicalCap) return path;
    const last = path[path.length - 1];
    const promoted = this.vocab.toolToCanonicalCap.get(last);
    if (promoted) {
      const result = [...path];
      result[result.length - 1] = promoted;
      return result;
    }
    return path;
  }

  /**
   * Binary fingerprint: union of capabilities across context tools.
   * Returns zeros if toolCapMap is not available.
   */
  private computeCapFingerprint(contextIdxs: number[]): Float32Array {
    const fp = new Float32Array(this.numCapabilities);
    const tcm = this.structural?.toolCapMap;
    if (!tcm || contextIdxs.length === 0) return fp;

    const { matrix, numTools, numCapabilities } = tcm;
    for (const idx of contextIdxs) {
      if (idx >= numTools) continue;
      const base = idx * numCapabilities;
      for (let c = 0; c < numCapabilities; c++) {
        if (matrix[base + c] === 1) fp[c] = 1;
      }
    }

    return fp;
  }
}
