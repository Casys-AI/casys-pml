import { vertexToEdge } from "../domain/message-passing.ts";
import type { GNNConfig, GNNNode, GNNParams } from "../types.ts";

interface VertexToEdgePhaseArgs {
  byLevel: Map<number, GNNNode[]>;
  config: GNNConfig;
  embeddings: Map<string, number[]>;
  maxLevel: number;
  nodeMap: Map<string, GNNNode>;
  params: GNNParams;
}

/**
 * V->E upward: updates L1..Lmax from child embeddings.
 */
export function runVertexToEdgePhase(args: VertexToEdgePhaseArgs): void {
  const { byLevel, config, embeddings, maxLevel, nodeMap, params } = args;
  const getEmbedding = (name: string): number[] => embeddings.get(name)!;

  for (let level = 1; level <= maxLevel; level++) {
    const parents = byLevel.get(level) ?? [];
    const levelParams = params.levels.get(
      Math.min(level - 1, params.levels.size - 1),
    );
    if (!levelParams) continue;

    const residualA = params.veResidualA.get(level - 1) ?? -1.0;
    const residualB = params.veResidualB.get(level - 1) ?? 0.5;

    for (const parent of parents) {
      const children = parent.children
        .map((childName) => nodeMap.get(childName))
        .filter((child): child is GNNNode => child !== undefined)
        .map((child) => ({ ...child, embedding: getEmbedding(child.name) }));

      if (children.length === 0) continue;

      const parentWithEmbedding = {
        ...parent,
        embedding: getEmbedding(parent.name),
      };
      const updatedEmbedding = vertexToEdge(
        parentWithEmbedding,
        children,
        levelParams,
        residualA,
        residualB,
        config.leakyReluAlpha,
      );
      embeddings.set(parent.name, updatedEmbedding);
    }
  }
}
