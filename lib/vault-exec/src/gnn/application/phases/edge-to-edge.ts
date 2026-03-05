import { edgeToEdge } from "../../domain/message-passing.ts";
import type { GNNConfig, GNNNode, GNNParams } from "../../types.ts";

interface EdgeToEdgePhaseArgs {
  byLevel: Map<number, GNNNode[]>;
  config: GNNConfig;
  embeddings: Map<string, number[]>;
  maxLevel: number;
  nodes: GNNNode[];
  params: GNNParams;
}

/**
 * E->E downward: updates intermediate levels from higher-level parent edges.
 */
export function runEdgeToEdgePhase(args: EdgeToEdgePhaseArgs): void {
  const { byLevel, config, embeddings, maxLevel, nodes, params } = args;
  const getEmbedding = (name: string): number[] => embeddings.get(name)!;

  for (let level = maxLevel - 1; level >= 1; level--) {
    const nodesAtLevel = byLevel.get(level) ?? [];
    const levelParams = params.levels.get(
      Math.min(level - 1, params.levels.size - 1),
    );
    if (!levelParams) continue;

    const residualA = params.veResidualA.get(level - 1) ?? -1.0;
    const residualB = params.veResidualB.get(level - 1) ?? 0.5;

    for (const node of nodesAtLevel) {
      const parents = nodes
        .filter((candidate) =>
          candidate.level > level && candidate.children.includes(node.name)
        )
        .map((parent) => ({ ...parent, embedding: getEmbedding(parent.name) }));

      if (parents.length === 0) continue;

      const nodeWithEmbedding = { ...node, embedding: getEmbedding(node.name) };
      const updatedEmbedding = edgeToEdge(
        nodeWithEmbedding,
        parents,
        levelParams,
        residualA,
        residualB,
        config.leakyReluAlpha,
      );
      embeddings.set(node.name, updatedEmbedding);
    }
  }
}

