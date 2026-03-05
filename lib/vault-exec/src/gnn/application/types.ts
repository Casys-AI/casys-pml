import type { GNNConfig, GNNNode, GNNParams } from "../domain/types.ts";

interface BasePhaseArgs {
  byLevel: Map<number, GNNNode[]>;
  config: GNNConfig;
  embeddings: Map<string, number[]>;
  params: GNNParams;
}

export interface VertexToEdgePhaseArgs extends BasePhaseArgs {
  maxLevel: number;
  nodeMap: Map<string, GNNNode>;
}

export interface EdgeToEdgePhaseArgs extends BasePhaseArgs {
  maxLevel: number;
  nodes: GNNNode[];
}

export interface EdgeToVertexPhaseArgs extends BasePhaseArgs {
  nodes: GNNNode[];
}
