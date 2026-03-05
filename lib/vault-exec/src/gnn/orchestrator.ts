import type { GNNConfig, GNNNode, GNNParams } from "./types.ts";
import { runEdgeToEdgePhase } from "./phases/edge-to-edge.ts";
import { runEdgeToVertexPhase } from "./phases/edge-to-vertex.ts";
import { runVertexToEdgePhase } from "./phases/vertex-to-edge.ts";

/**
 * Multi-level GNN orchestrator.
 * Executes phases in order while sharing a mutable embedding map.
 */
export function runGnnOrchestrator(
  nodes: GNNNode[],
  params: GNNParams,
  config: GNNConfig,
): Map<string, number[]> {
  const nodeMap = new Map(nodes.map((node) => [node.name, node]));
  const embeddings = new Map<string, number[]>();

  for (const node of nodes) {
    embeddings.set(node.name, [...node.embedding]);
  }

  const byLevel = new Map<number, GNNNode[]>();
  for (const node of nodes) {
    const atLevel = byLevel.get(node.level) ?? [];
    atLevel.push(node);
    byLevel.set(node.level, atLevel);
  }

  const maxLevel = Math.max(...nodes.map((node) => node.level));
  if (maxLevel === 0) return embeddings;

  runVertexToEdgePhase({
    byLevel,
    config,
    embeddings,
    maxLevel,
    nodeMap,
    params,
  });
  runEdgeToEdgePhase({
    byLevel,
    config,
    embeddings,
    maxLevel,
    nodes,
    params,
  });
  runEdgeToVertexPhase({
    byLevel,
    config,
    embeddings,
    nodes,
    params,
  });

  return embeddings;
}
