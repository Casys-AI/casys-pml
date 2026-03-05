import { edgeToVertex } from "../../domain/message-passing.ts";
import type { EdgeToVertexPhaseArgs } from "../types.ts";

/**
 * E->V downward: updates leaves from parent edge embeddings.
 */
export function runEdgeToVertexPhase(args: EdgeToVertexPhaseArgs): void {
  const { byLevel, config, embeddings, nodes, params } = args;
  const levelParams = params.levels.get(0);
  if (!levelParams) return;

  const leaves = byLevel.get(0) ?? [];
  const getEmbedding = (name: string): number[] => embeddings.get(name)!;

  for (const leaf of leaves) {
    const parents = nodes
      .filter((node) => node.level > 0 && node.children.includes(leaf.name))
      .map((parent) => ({ ...parent, embedding: getEmbedding(parent.name) }));

    if (parents.length === 0) continue;

    const leafWithEmbedding = { ...leaf, embedding: getEmbedding(leaf.name) };
    const updatedEmbedding = edgeToVertex(
      leafWithEmbedding,
      parents,
      levelParams,
      config.leakyReluAlpha,
    );
    embeddings.set(leaf.name, updatedEmbedding);
  }
}
