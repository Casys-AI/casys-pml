import type { GRUConfig, GRUWeights } from "./types.ts";
import { matVecMul } from "../gnn/attention.ts";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function tanh(x: number): number {
  return Math.tanh(x);
}

function addBias(vec: number[], bias: number[]): number[] {
  return vec.map((v, i) => v + bias[i]);
}

function xavier(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2 / (rows + cols));
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
  );
}

export function initWeights(config: GRUConfig): GRUWeights {
  const { inputDim, hiddenDim, projectionDim, intentDim, fusionDim, outputDim } =
    config;
  return {
    W_input: xavier(projectionDim, inputDim),
    b_input: new Array(projectionDim).fill(0),
    W_z: xavier(hiddenDim, projectionDim),
    b_z: new Array(hiddenDim).fill(0),
    U_z: xavier(hiddenDim, hiddenDim),
    W_r: xavier(hiddenDim, projectionDim),
    b_r: new Array(hiddenDim).fill(0),
    U_r: xavier(hiddenDim, hiddenDim),
    W_h: xavier(hiddenDim, projectionDim),
    b_h: new Array(hiddenDim).fill(0),
    U_h: xavier(hiddenDim, hiddenDim),
    W_intent: xavier(intentDim, inputDim),
    b_intent: new Array(intentDim).fill(0),
    W_fusion: xavier(fusionDim, hiddenDim + intentDim),
    b_fusion: new Array(fusionDim).fill(0),
    W_output: xavier(outputDim, fusionDim),
    b_output: new Array(outputDim).fill(0),
    alpha_up: 0.2,
    alpha_down: 0.1,
  };
}

export function gruStep(
  input: number[],
  hPrev: number[],
  intent: number[],
  weights: GRUWeights,
  _config: GRUConfig,
): { hNew: number[]; logits: number[] } {
  // 1. Project input: 1024 -> projectionDim
  const x = addBias(matVecMul(weights.W_input, input), weights.b_input)
    .map((v) => Math.max(0, v));

  // 2. GRU gates
  const uzHPrev = matVecMul(weights.U_z, hPrev);
  const zGate = addBias(matVecMul(weights.W_z, x), weights.b_z)
    .map((v, i) => sigmoid(v + uzHPrev[i]));

  const urHPrev = matVecMul(weights.U_r, hPrev);
  const rGate = addBias(matVecMul(weights.W_r, x), weights.b_r)
    .map((v, i) => sigmoid(v + urHPrev[i]));

  const rh = hPrev.map((h, i) => rGate[i] * h);
  const uhRh = matVecMul(weights.U_h, rh);
  const hCandidate = addBias(matVecMul(weights.W_h, x), weights.b_h)
    .map((v, i) => tanh(v + uhRh[i]));

  const hNew = hPrev.map((h, i) =>
    zGate[i] * h + (1 - zGate[i]) * hCandidate[i]
  );

  // 3. Project intent: 1024 -> intentDim
  const intentProj = addBias(
    matVecMul(weights.W_intent, intent),
    weights.b_intent,
  )
    .map((v) => Math.max(0, v));

  // 4. Fusion: concat(hNew, intentProj) -> fusionDim
  const fused = addBias(
    matVecMul(weights.W_fusion, [...hNew, ...intentProj]),
    weights.b_fusion,
  ).map((v) => Math.max(0, v));

  // 5. Output projection: fusionDim -> outputDim
  const logits = addBias(matVecMul(weights.W_output, fused), weights.b_output);

  return { hNew, logits };
}
