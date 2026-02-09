/**
 * Structural Bias — Pre-computed matrices & per-step features
 *
 * Provides Jaccard similarity, bigram transition, capability fingerprint,
 * and per-step transition feature computation for the Compact Informed GRU.
 *
 * All matrices are flat Float32Array in row-major order.
 * No TF.js or Deno API dependencies — pure TypeScript arithmetic.
 *
 * @module gru/transition/structural-bias
 */

import type { ToolCapabilityMap } from "./types.ts";

// ---------------------------------------------------------------------------
// Jaccard similarity matrix
// ---------------------------------------------------------------------------

/**
 * Compute the symmetric Jaccard similarity matrix from tool-capability mappings.
 *
 * jaccard(i, j) = |caps_i ∩ caps_j| / |caps_i ∪ caps_j|
 *
 * Returns a flat Float32Array of size [numTools * numTools], row-major.
 * Only the upper triangle is computed; lower triangle is mirrored.
 * Diagonal is 1.0 (a tool is identical to itself), or 0 if the tool has no capabilities.
 *
 * @param toolCapMap - Binary tool-to-capability matrix and dimensions.
 * @returns Symmetric Jaccard matrix [numTools, numTools] as Float32Array.
 */
export function computeJaccardMatrix(toolCapMap: ToolCapabilityMap): Float32Array {
  const { matrix, numTools, numCapabilities } = toolCapMap;
  const out = new Float32Array(numTools * numTools);

  // Pre-compute cardinality (number of caps) per tool to avoid repeated sums
  const card = new Float32Array(numTools);
  for (let i = 0; i < numTools; i++) {
    let sum = 0;
    const base = i * numCapabilities;
    for (let c = 0; c < numCapabilities; c++) {
      sum += matrix[base + c];
    }
    card[i] = sum;
  }

  for (let i = 0; i < numTools; i++) {
    const baseI = i * numCapabilities;

    // Diagonal: jaccard(i,i) = 1 if tool has caps, 0 otherwise
    out[i * numTools + i] = card[i] > 0 ? 1.0 : 0.0;

    for (let j = i + 1; j < numTools; j++) {
      const baseJ = j * numCapabilities;

      // Intersection size
      let inter = 0;
      for (let c = 0; c < numCapabilities; c++) {
        if (matrix[baseI + c] === 1 && matrix[baseJ + c] === 1) {
          inter++;
        }
      }

      const union = card[i] + card[j] - inter;
      const sim = union > 0 ? inter / union : 0.0;

      // Symmetric assignment
      out[i * numTools + j] = sim;
      out[j * numTools + i] = sim;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Bigram transition matrix
// ---------------------------------------------------------------------------

/**
 * Compute the row-normalized bigram transition matrix from execution traces.
 *
 * Counts every consecutive pair (traces[t][k] → traces[t][k+1]) and
 * normalises each row so it sums to 1 (or 0 if no outgoing transitions).
 *
 * @param traces     - Array of traces; each trace is an array of tool IDs (strings).
 * @param toolToIndex - Map from tool ID string to integer index.
 * @param numTools    - Number of tools (matrix dimension).
 * @returns Row-normalized bigram matrix [numTools, numTools] as Float32Array.
 */
export function computeBigramMatrix(
  traces: string[][],
  toolToIndex: Map<string, number>,
  numTools: number,
): Float32Array {
  const counts = new Float32Array(numTools * numTools);

  for (const trace of traces) {
    for (let k = 0; k < trace.length - 1; k++) {
      const fromIdx = toolToIndex.get(trace[k]);
      const toIdx = toolToIndex.get(trace[k + 1]);
      if (fromIdx !== undefined && toIdx !== undefined) {
        counts[fromIdx * numTools + toIdx] += 1;
      }
    }
  }

  // Row-normalize
  for (let i = 0; i < numTools; i++) {
    const rowBase = i * numTools;
    let rowSum = 0;
    for (let j = 0; j < numTools; j++) {
      rowSum += counts[rowBase + j];
    }
    if (rowSum > 0) {
      for (let j = 0; j < numTools; j++) {
        counts[rowBase + j] /= rowSum;
      }
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Per-step transition features
// ---------------------------------------------------------------------------

/**
 * Compute 5-dimensional structural transition features for a single prediction step.
 *
 * Feature layout:
 *   [0] avg_jaccard     — Mean Jaccard similarity between lastTool and each context tool (0 if empty context).
 *   [1] shared_caps     — Number of capabilities shared between lastTool and the union of context caps, normalised by numCapabilities.
 *   [2] is_repeat       — 1 if lastTool equals the second-to-last tool in context (i.e. immediate repeat), else 0.
 *   [3] cap_novelty     — Fraction of lastTool's capabilities NOT already covered by context (excluding lastTool itself).
 *   [4] context_length  — len(contextToolIdxs) / 20 (normalised).
 *
 * @param lastToolIdx    - Index of the most recent tool.
 * @param contextToolIdxs - Indices of all tools in the context so far (may include lastTool as last element).
 * @param toolCapMap      - Binary tool-to-capability mapping.
 * @returns Float32Array(5) with the features.
 */
export function computeTransitionFeatures(
  lastToolIdx: number,
  contextToolIdxs: number[],
  toolCapMap: ToolCapabilityMap,
): Float32Array {
  const { matrix, numCapabilities } = toolCapMap;
  const features = new Float32Array(5);

  // -- [0] avg_jaccard --------------------------------------------------------
  // We need Jaccard between lastTool and each context tool.
  // Computed on-the-fly (this runs per step, not per matrix).
  if (contextToolIdxs.length > 0) {
    const lastBase = lastToolIdx * numCapabilities;
    let lastCard = 0;
    for (let c = 0; c < numCapabilities; c++) {
      lastCard += matrix[lastBase + c];
    }

    let jaccardSum = 0;
    for (const ctxIdx of contextToolIdxs) {
      const ctxBase = ctxIdx * numCapabilities;
      let inter = 0;
      let ctxCard = 0;
      for (let c = 0; c < numCapabilities; c++) {
        const cv = matrix[ctxBase + c];
        ctxCard += cv;
        if (matrix[lastBase + c] === 1 && cv === 1) {
          inter++;
        }
      }
      const union = lastCard + ctxCard - inter;
      jaccardSum += union > 0 ? inter / union : 0;
    }
    features[0] = jaccardSum / contextToolIdxs.length;
  }
  // else features[0] stays 0

  // -- [1] shared_caps (lastTool ∩ union_of_context) / numCapabilities --------
  if (contextToolIdxs.length > 0 && numCapabilities > 0) {
    const lastBase = lastToolIdx * numCapabilities;
    let shared = 0;
    for (let c = 0; c < numCapabilities; c++) {
      if (matrix[lastBase + c] !== 1) continue;
      // Check if any context tool has this cap
      for (const ctxIdx of contextToolIdxs) {
        if (matrix[ctxIdx * numCapabilities + c] === 1) {
          shared++;
          break;
        }
      }
    }
    features[1] = shared / numCapabilities;
  }

  // -- [2] is_repeat ----------------------------------------------------------
  if (contextToolIdxs.length >= 2) {
    features[2] = lastToolIdx === contextToolIdxs[contextToolIdxs.length - 2] ? 1 : 0;
  }

  // -- [3] cap_novelty --------------------------------------------------------
  // Fraction of lastTool's caps NOT covered by context tools (excluding lastTool itself)
  {
    const lastBase = lastToolIdx * numCapabilities;
    let lastCard = 0;
    let novelCount = 0;
    for (let c = 0; c < numCapabilities; c++) {
      if (matrix[lastBase + c] !== 1) continue;
      lastCard++;
      // Check if covered by any context tool OTHER than lastTool
      let covered = false;
      for (const ctxIdx of contextToolIdxs) {
        if (ctxIdx === lastToolIdx) continue;
        if (matrix[ctxIdx * numCapabilities + c] === 1) {
          covered = true;
          break;
        }
      }
      if (!covered) novelCount++;
    }
    features[3] = lastCard > 0 ? novelCount / lastCard : 0;
  }

  // -- [4] context_length / 20 ------------------------------------------------
  features[4] = contextToolIdxs.length / 20;

  return features;
}

// ---------------------------------------------------------------------------
// Capability fingerprint
// ---------------------------------------------------------------------------

/**
 * Compute the capability fingerprint for a context (logical OR of tool cap rows).
 *
 * For each tool in contextToolIdxs, OR its capability row into the output.
 * Result is a binary vector of size numCapabilities (values 0 or 1).
 *
 * @param contextToolIdxs - Indices of tools in the current context.
 * @param toolCapMap       - Binary tool-to-capability mapping.
 * @returns Float32Array(numCapabilities) with values 0 or 1.
 */
export function computeCapFingerprint(
  contextToolIdxs: number[],
  toolCapMap: ToolCapabilityMap,
): Float32Array {
  const { matrix, numCapabilities } = toolCapMap;
  const fingerprint = new Float32Array(numCapabilities);

  for (const toolIdx of contextToolIdxs) {
    const base = toolIdx * numCapabilities;
    for (let c = 0; c < numCapabilities; c++) {
      if (matrix[base + c] === 1) {
        fingerprint[c] = 1;
      }
    }
  }

  return fingerprint;
}
