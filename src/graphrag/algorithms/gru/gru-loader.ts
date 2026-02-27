/**
 * GRU Weight Loader
 *
 * Loads GRU weights from JSON file or database, reshapes flat arrays
 * into weight matrices, and builds vocabulary mappings.
 *
 * @module graphrag/algorithms/gru/gru-loader
 */

import * as log from "@std/log";
import type { GRUWeights, GRUVocabulary, StructuralMatrices, ToolCapabilityMap } from "./types.ts";

// ---------------------------------------------------------------------------
// Weight name → index mapping (matches TF.js export order)
// ---------------------------------------------------------------------------

/** Weight names in TF.js export order (for documentation/validation). */
const _WEIGHT_NAMES = [
  "input_proj/kernel",        // 0: [1024, 128]
  "input_proj/bias",          // 1: [128]
  "gru/kernel",               // 2: [133, 192]
  "gru/recurrent_kernel",     // 3: [64, 192]
  "gru/bias",                 // 4: [192]
  "intent_proj/kernel",       // 5: [1024, 64]
  "intent_proj/bias",         // 6: [64]
  "cap_proj/kernel",          // 7: [numCaps, 16]
  "cap_proj/bias",            // 8: [16]
  "composite_proj/kernel",    // 9: [3, 8]
  "composite_proj/bias",      // 10: [8]
  "fusion_dense/kernel",      // 11: [152, 64]
  "fusion_dense/bias",        // 12: [64]
  "emb_proj/kernel",          // 13: [64, 1024]
  "emb_proj/bias",            // 14: [1024]
  "term_hidden/kernel",       // 15: [128, 32]
  "term_hidden/bias",         // 16: [32]
  "termination_head/kernel",  // 17: [32, 1]
  "termination_head/bias",    // 18: [1]
  "similarity_head/kernel",   // 19: [1024, vocabSize]
] as const;
void _WEIGHT_NAMES; // Keep for reference

/**
 * Derive all layer shapes from bias vector lengths.
 * This avoids hardcoding dimensions and supports different model configs.
 */
function deriveShapes(lookup: Map<string, number[]>): Map<string, [number, number]> {
  const biasLen = (name: string) => lookup.get(name)?.length ?? 0;

  const inputProjDim = biasLen("input_proj/bias");      // 128
  const gruBiasLen = biasLen("gru/bias");                // 3*hiddenDim
  const hiddenDim = gruBiasLen / 3;                       // 64
  const intentProjDim = biasLen("intent_proj/bias");     // 64
  const capProjDim = biasLen("cap_proj/bias");           // 16
  const compositeProjDim = biasLen("composite_proj/bias"); // 8
  const fusionDim = biasLen("fusion_dense/bias");        // 64
  const embProjDim = biasLen("emb_proj/bias");           // 1024
  const termHiddenDim = biasLen("term_hidden/bias");     // 32

  const gruInputDim = inputProjDim + 5; // + numTransitionFeatures
  const fusionInputDim = hiddenDim + intentProjDim + capProjDim + compositeProjDim;
  const termInputDim = hiddenDim + intentProjDim;

  // Derive embeddingDim from input_proj kernel length
  const inputProjKernelLen = lookup.get("input_proj/kernel")?.length ?? 0;
  const embeddingDim = inputProjKernelLen / inputProjDim;

  // Derive numCapabilities from cap_proj kernel length
  const capProjKernelLen = lookup.get("cap_proj/kernel")?.length ?? 0;
  const numCaps = capProjKernelLen / capProjDim;

  // Derive vocabSize from similarity_head kernel length
  const simKernelLen = lookup.get("similarity_head/kernel")?.length ?? 0;
  const vocabSize = simKernelLen / embeddingDim;

  // Derive compositeFeatureDim from composite_proj kernel length
  const compKernelLen = lookup.get("composite_proj/kernel")?.length ?? 0;
  const compFeatureDim = compKernelLen / compositeProjDim;

  const shapes = new Map<string, [number, number]>();
  shapes.set("input_proj/kernel", [embeddingDim, inputProjDim]);
  shapes.set("gru/kernel", [gruInputDim, gruBiasLen]);
  shapes.set("gru/recurrent_kernel", [hiddenDim, gruBiasLen]);
  shapes.set("intent_proj/kernel", [embeddingDim, intentProjDim]);
  shapes.set("cap_proj/kernel", [numCaps, capProjDim]);
  shapes.set("composite_proj/kernel", [compFeatureDim, compositeProjDim]);
  shapes.set("fusion_dense/kernel", [fusionInputDim, fusionDim]);
  shapes.set("emb_proj/kernel", [fusionDim, embProjDim]);
  shapes.set("term_hidden/kernel", [termInputDim, termHiddenDim]);
  shapes.set("termination_head/kernel", [termHiddenDim, 1]);
  shapes.set("similarity_head/kernel", [embeddingDim, vocabSize]);

  return shapes;
}

// ---------------------------------------------------------------------------
// Reshape utility
// ---------------------------------------------------------------------------

function reshapeFlat(flat: number[], rows: number, cols: number): number[][] {
  if (flat.length !== rows * cols) {
    throw new Error(
      `[GRU Loader] Shape mismatch: expected ${rows}×${cols}=${rows * cols} but got ${flat.length}`,
    );
  }
  const matrix: number[][] = new Array(rows);
  for (let r = 0; r < rows; r++) {
    matrix[r] = flat.slice(r * cols, (r + 1) * cols);
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Load weights from JSON file
// ---------------------------------------------------------------------------

/**
 * Load GRU weights from a JSON file exported by CompactInformedGRU.exportWeights().
 *
 * Expected JSON format:
 * ```json
 * {
 *   "date": "...",
 *   "weights": {
 *     "names": ["input_proj/kernel", ...],
 *     "weights": [[...flat arrays...]]
 *   }
 * }
 * ```
 */
export interface GRUWeightsFile {
  weights: GRUWeights;
  vocab?: {
    toolIds: string[];
    vocabNodes: Array<{ id: string; level?: number; children?: string[] }>;
  };
}

export async function loadGRUWeightsFile(path: string): Promise<GRUWeightsFile> {
  log.info(`[GRU Loader] Loading weights from ${path}...`);
  const raw = await Deno.readTextFile(path);
  const json = JSON.parse(raw) as {
    date?: string;
    weights: { names: string[]; weights: number[][] };
    vocab?: {
      toolIds: string[];
      vocabNodes: Array<{ id: string; level?: number; children?: string[] }>;
    };
  };

  return {
    weights: parseGRUWeights(json.weights),
    vocab: json.vocab,
  };
}

/** @deprecated Use loadGRUWeightsFile instead */
export async function loadGRUWeights(path: string): Promise<GRUWeights> {
  const file = await loadGRUWeightsFile(path);
  return file.weights;
}

/**
 * Parse GRU weights from the { names, weights } structure.
 * Can be called with data from JSON file or from DB.
 */
export function parseGRUWeights(data: { names: string[]; weights: number[][] }): GRUWeights {
  const { names, weights: arrays } = data;

  if (names.length !== arrays.length) {
    throw new Error(
      `[GRU Loader] names.length (${names.length}) !== weights.length (${arrays.length})`,
    );
  }

  // Build name → flat array lookup
  const lookup = new Map<string, number[]>();
  for (let i = 0; i < names.length; i++) {
    lookup.set(names[i], arrays[i]);
  }

  function getFlat(name: string): number[] {
    const arr = lookup.get(name);
    if (!arr) {
      throw new Error(`[GRU Loader] Missing weight: ${name}`);
    }
    return arr;
  }

  // Derive shapes from bias lengths (no hardcoded dimensions)
  const shapes = deriveShapes(lookup);

  function getMatrix(name: string): number[][] {
    const flat = getFlat(name);
    const shape = shapes.get(name);
    if (!shape) {
      throw new Error(`[GRU Loader] No shape derived for weight: ${name}`);
    }
    return reshapeFlat(flat, shape[0], shape[1]);
  }

  const result: GRUWeights = {
    inputProjKernel: getMatrix("input_proj/kernel"),
    inputProjBias: getFlat("input_proj/bias"),
    gruKernel: getMatrix("gru/kernel"),
    gruRecurrentKernel: getMatrix("gru/recurrent_kernel"),
    gruBias: getFlat("gru/bias"),
    intentProjKernel: getMatrix("intent_proj/kernel"),
    intentProjBias: getFlat("intent_proj/bias"),
    capProjKernel: getMatrix("cap_proj/kernel"),
    capProjBias: getFlat("cap_proj/bias"),
    compositeProjKernel: getMatrix("composite_proj/kernel"),
    compositeProjBias: getFlat("composite_proj/bias"),
    fusionDenseKernel: getMatrix("fusion_dense/kernel"),
    fusionDenseBias: getFlat("fusion_dense/bias"),
    embProjKernel: getMatrix("emb_proj/kernel"),
    embProjBias: getFlat("emb_proj/bias"),
    termHiddenKernel: getMatrix("term_hidden/kernel"),
    termHiddenBias: getFlat("term_hidden/bias"),
    terminationHeadKernel: getMatrix("termination_head/kernel"),
    terminationHeadBias: getFlat("termination_head/bias"),
    similarityHeadKernel: getMatrix("similarity_head/kernel"),
  };

  const vocabSize = result.similarityHeadKernel[0]?.length ?? 0;
  const numCaps = result.capProjKernel.length;
  log.info(`[GRU Loader] Parsed ${names.length} weight arrays: vocabSize=${vocabSize}, numCaps=${numCaps}`);

  return result;
}

// ---------------------------------------------------------------------------
// Build vocabulary from similarity_head embeddings
// ---------------------------------------------------------------------------

/**
 * Build vocabulary from the similarity_head kernel.
 *
 * The similarity_head kernel is [embDim, vocabSize] = embeddings^T / temperature.
 * Vocab ordering: [L0 tools..., L1+ vocab nodes...].
 *
 * @param toolIds - Ordered list of L0 tool IDs (must match training vocabulary order)
 * @param vocabNodes - L1+ vocab nodes with id, children
 * @param similarityKernel - [embDim, vocabSize] from weights
 */
export function buildVocabulary(
  toolIds: string[],
  vocabNodes: Array<{ id: string; children?: string[] }>,
  similarityKernel: number[][],
): GRUVocabulary {
  const embDim = similarityKernel.length;
  const vocabSize = similarityKernel[0]?.length ?? 0;
  const numTools = toolIds.length;

  if (numTools + vocabNodes.length !== vocabSize) {
    const msg = `[GRU Loader] Vocab size mismatch: ${numTools} tools + ${vocabNodes.length} nodes = ${numTools + vocabNodes.length}, expected ${vocabSize}. Weights and vocab are incompatible.`;
    log.error(msg);
    throw new Error(msg);
  }

  const nodeToIndex = new Map<string, number>();
  const indexToNode: string[] = [];
  const children = new Map<string, string[]>();

  // L0 tools first
  for (let i = 0; i < numTools; i++) {
    nodeToIndex.set(toolIds[i], i);
    indexToNode.push(toolIds[i]);
  }

  // L1+ vocab nodes
  for (let i = 0; i < vocabNodes.length; i++) {
    const node = vocabNodes[i];
    const idx = numTools + i;
    nodeToIndex.set(node.id, idx);
    indexToNode.push(node.id);
    if (node.children && node.children.length > 0) {
      children.set(node.id, node.children);
    }
  }

  // Transpose similarity kernel to get embeddings [vocabSize, embDim]
  const embeddings: number[][] = new Array(vocabSize);
  for (let j = 0; j < vocabSize; j++) {
    embeddings[j] = new Array(embDim);
    for (let i = 0; i < embDim; i++) {
      embeddings[j][i] = similarityKernel[i][j];
    }
  }

  // Build tool→canonical cap promotion map for 1-child caps.
  // If exactly ONE cap wraps a given tool (no ambiguity), we can promote
  // tool predictions to the cap at inference time.
  const toolToCapCandidates = new Map<string, string[]>();
  for (const [capId, capChildren] of children) {
    if (capChildren.length === 1) {
      const tool = capChildren[0];
      if (!toolToCapCandidates.has(tool)) toolToCapCandidates.set(tool, []);
      toolToCapCandidates.get(tool)!.push(capId);
    }
  }
  const toolToCanonicalCap = new Map<string, string>();
  for (const [tool, caps] of toolToCapCandidates) {
    if (caps.length === 1) {
      toolToCanonicalCap.set(tool, caps[0]);
    }
    // If multiple 1-child caps wrap the same tool → ambiguous, no promotion
  }
  if (toolToCanonicalCap.size > 0) {
    log.info(`[GRU Loader] Tool→cap promotion map: ${toolToCanonicalCap.size} unambiguous 1-child caps`);
  }

  return {
    nodeToIndex,
    indexToNode,
    embeddings,
    numTools,
    vocabSize,
    children,
    toolToCanonicalCap,
  };
}

// ---------------------------------------------------------------------------
// Structural matrices
// ---------------------------------------------------------------------------

/**
 * Compute Jaccard similarity matrix from tool-capability mappings.
 * Port of lib/gru/src/transition/structural-bias.ts::computeJaccardMatrix.
 */
export function computeJaccardMatrix(toolCapMap: ToolCapabilityMap): Float32Array {
  const { matrix, numTools, numCapabilities } = toolCapMap;
  const out = new Float32Array(numTools * numTools);

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
    out[i * numTools + i] = card[i] > 0 ? 1.0 : 0.0;

    for (let j = i + 1; j < numTools; j++) {
      const baseJ = j * numCapabilities;
      let inter = 0;
      for (let c = 0; c < numCapabilities; c++) {
        if (matrix[baseI + c] === 1 && matrix[baseJ + c] === 1) {
          inter++;
        }
      }
      const union = card[i] + card[j] - inter;
      const sim = union > 0 ? inter / union : 0.0;
      out[i * numTools + j] = sim;
      out[j * numTools + i] = sim;
    }
  }

  return out;
}

/**
 * Compute row-normalized bigram transition matrix from execution traces.
 * Port of lib/gru/src/transition/structural-bias.ts::computeBigramMatrix.
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

/**
 * Build structural matrices from traces and tool-capability map.
 */
export function computeStructuralMatrices(
  traces: string[][],
  toolToIndex: Map<string, number>,
  numTools: number,
  toolCapMap?: ToolCapabilityMap,
): StructuralMatrices {
  const jaccardMatrix = toolCapMap
    ? computeJaccardMatrix(toolCapMap)
    : new Float32Array(numTools * numTools);

  const bigramMatrix = computeBigramMatrix(traces, toolToIndex, numTools);

  return { jaccardMatrix, bigramMatrix, numTools, toolCapMap };
}

// ---------------------------------------------------------------------------
// Load from database
// ---------------------------------------------------------------------------

/**
 * Load GRU weights + embedded vocab from gru_params table.
 * Returns GRUWeightsFile (with optional vocab) or null if no weights stored.
 */
export async function loadGRUWeightsFromDb(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
): Promise<GRUWeightsFile | null> {
  const rows = await db.query(
    "SELECT params FROM gru_params ORDER BY updated_at DESC LIMIT 1",
  ) as Array<{ params: string | { names: string[]; weights: number[][]; vocab?: GRUWeightsFile["vocab"] } }>;

  if (!rows || rows.length === 0) {
    return null;
  }

  // Handle legacy scalar-string JSONB (pre-fix) and proper JSONB object
  const raw = typeof rows[0].params === "string"
    ? JSON.parse(rows[0].params) as { names: string[]; weights: number[][]; vocab?: GRUWeightsFile["vocab"] }
    : rows[0].params;

  return {
    weights: parseGRUWeights(raw),
    vocab: raw.vocab,
  };
}
