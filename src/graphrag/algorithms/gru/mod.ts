/**
 * GRU Inference Module
 *
 * Pure JS+BLAS forward pass for the CompactInformedGRU.
 * No TF.js dependency — runs natively in Deno.
 *
 * @module graphrag/algorithms/gru
 */

export { GRUInference } from "./gru-inference.ts";
export {
  loadGRUWeights,
  loadGRUWeightsFromDb,
  parseGRUWeights,
  buildVocabulary,
  computeJaccardMatrix,
  computeBigramMatrix,
  computeStructuralMatrices,
} from "./gru-loader.ts";
export { spawnGRUTraining } from "./spawn-training.ts";
export type {
  GRUWeights,
  GRUVocabulary,
  GRUConfig,
  IGRUInference,
  StructuralMatrices,
  ToolCapabilityMap,
  SpawnGRUTrainingInput,
  SpawnGRUTrainingResult,
} from "./types.ts";
export { DEFAULT_GRU_CONFIG } from "./types.ts";
