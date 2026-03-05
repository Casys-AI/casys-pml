import type { GNNNode, LevelParams } from "./types.ts";
import { attentionScore, elu, matVecMul, softmax } from "./attention.ts";
import {
  additiveSkipResidual,
  convexGatedResidual,
  residualGamma,
} from "./residual.ts";

/**
 * Domain kernel: V->E upward message passing.
 */
export function vertexToEdge(
  parent: GNNNode,
  children: GNNNode[],
  params: LevelParams,
  residualA: number,
  residualB: number,
  leakyAlpha: number,
): number[] {
  if (children.length === 0) return [...parent.embedding];

  const numHeads = params.W_child.length;
  const embDim = parent.embedding.length;
  const headResults: number[][] = [];

  for (let h = 0; h < numHeads; h++) {
    const parentProj = matVecMul(params.W_parent[h], parent.embedding);

    const childProjs: number[][] = [];
    const scores: number[] = [];
    for (const child of children) {
      const childProj = matVecMul(params.W_child[h], child.embedding);
      childProjs.push(childProj);
      scores.push(
        attentionScore(childProj, parentProj, params.a_upward[h], leakyAlpha),
      );
    }

    const weights = softmax(scores);
    const headDim = params.W_child[h].length;
    const agg = new Array(headDim).fill(0);
    for (let c = 0; c < children.length; c++) {
      for (let d = 0; d < headDim; d++) {
        agg[d] += weights[c] * childProjs[c][d];
      }
    }
    headResults.push(agg);
  }

  const concat = headResults.flat();
  const mpResult = new Array(embDim).fill(0);
  for (let i = 0; i < embDim; i++) {
    mpResult[i] = elu(concat[i % concat.length]);
  }

  const gamma = residualGamma(children.length, residualA, residualB);
  return convexGatedResidual(mpResult, parent.embedding, gamma);
}

/**
 * Domain kernel: E->V downward message passing.
 */
export function edgeToVertex(
  child: GNNNode,
  parents: GNNNode[],
  params: LevelParams,
  leakyAlpha: number,
): number[] {
  if (parents.length === 0) return [...child.embedding];

  const numHeads = params.W_parent.length;
  const embDim = child.embedding.length;
  const headResults: number[][] = [];

  for (let h = 0; h < numHeads; h++) {
    const childProj = matVecMul(params.W_child[h], child.embedding);

    const parentProjs: number[][] = [];
    const scores: number[] = [];
    for (const parent of parents) {
      const parentProj = matVecMul(params.W_parent[h], parent.embedding);
      parentProjs.push(parentProj);
      scores.push(
        attentionScore(parentProj, childProj, params.a_downward[h], leakyAlpha),
      );
    }

    const weights = softmax(scores);
    const headDim = params.W_parent[h].length;
    const agg = new Array(headDim).fill(0);
    for (let p = 0; p < parents.length; p++) {
      for (let d = 0; d < headDim; d++) {
        agg[d] += weights[p] * parentProjs[p][d];
      }
    }
    headResults.push(agg);
  }

  const concat = headResults.flat();
  const mpResult = new Array(embDim).fill(0);
  for (let i = 0; i < embDim; i++) {
    mpResult[i] = elu(concat[i % concat.length]);
  }

  return additiveSkipResidual(mpResult, child.embedding);
}

/** Domain kernel: E->E uses same transform as V->E. */
export { vertexToEdge as edgeToEdge };
