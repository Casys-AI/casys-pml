/** A node in the vault graph for GNN processing. */
export interface GNNNode {
  name: string;
  level: number;
  embedding: number[]; // BGE or GNN embedding (1024-d)
  children: string[]; // direct dependencies (wikilinks)
}

/** GNN parameters for one hierarchy level. */
export interface LevelParams {
  W_child: number[][][]; // [numHeads][headDim][embDim]
  W_parent: number[][][]; // [numHeads][headDim][embDim]
  a_upward: number[][]; // [numHeads][2*headDim]
  a_downward: number[][]; // [numHeads][2*headDim]
}

/** Full GNN parameters. */
export interface GNNParams {
  levels: Map<number, LevelParams>;
  numHeads: number;
  headDim: number;
  embDim: number;
  veResidualA: Map<number, number>; // a per level (learnable)
  veResidualB: Map<number, number>; // b per level (learnable)
  shareLevelWeights: boolean;
}

/** GNN configuration. */
export interface GNNConfig {
  numHeads: number;
  headDim: number;
  embDim: number;
  shareLevelWeights: boolean;
  leakyReluAlpha: number;
}

export const DEFAULT_GNN_CONFIG: GNNConfig = {
  numHeads: 8,
  headDim: 64,
  embDim: 1024,
  shareLevelWeights: true,
  leakyReluAlpha: 0.2,
};
