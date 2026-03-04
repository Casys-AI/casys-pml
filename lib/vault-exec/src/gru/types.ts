export interface GRUConfig {
  inputDim: number; // 1024 (embedding dim)
  hiddenDim: number; // 32
  projectionDim: number; // 64 (input projection)
  intentDim: number; // 64 (intent projection)
  fusionDim: number; // 32 (post-fusion)
  outputDim: number; // 1024 (back to embedding space)
}

export const DEFAULT_GRU_CONFIG: GRUConfig = {
  inputDim: 1024,
  hiddenDim: 32,
  projectionDim: 64,
  intentDim: 64,
  fusionDim: 32,
  outputDim: 1024,
};

export interface GRUWeights {
  W_input: number[][];
  b_input: number[];
  W_z: number[][];
  b_z: number[];
  U_z: number[][];
  W_r: number[][];
  b_r: number[];
  U_r: number[][];
  W_h: number[][];
  b_h: number[];
  U_h: number[][];
  W_intent: number[][];
  b_intent: number[];
  W_fusion: number[][];
  b_fusion: number[];
  W_output: number[][];
  b_output: number[];
  alpha_up: number;
  alpha_down: number;
}

export interface VocabNode {
  name: string;
  level: number;
  embedding: number[];
  children?: string[];
}

export interface GRUVocabulary {
  nodes: VocabNode[];
  nameToIndex: Map<string, number>;
  indexToName: string[];
}
