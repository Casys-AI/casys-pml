// gnn/forward.ts
import type { GNNNode, GNNParams, GNNConfig } from "./types.ts";
import { vertexToEdge, edgeToVertex, edgeToEdge } from "./message-passing.ts";

/**
 * Multi-level GNN forward pass.
 * 1. V->E upward (L0 -> L1)
 * 2. E->E upward (L1 -> L2 -> ... -> L_max) -- same as V->E
 * 3. E->E downward (L_max -> ... -> L1)
 * 4. E->V downward (L1 -> L0)
 *
 * Returns updated embeddings for all nodes.
 */
export function gnnForward(
  nodes: GNNNode[],
  params: GNNParams,
  config: GNNConfig,
): Map<string, number[]> {
  const nodeMap = new Map(nodes.map((n) => [n.name, n]));
  const result = new Map<string, number[]>();

  // Initialize with copies of original embeddings
  for (const node of nodes) {
    result.set(node.name, [...node.embedding]);
  }

  // Group nodes by level
  const byLevel = new Map<number, GNNNode[]>();
  for (const node of nodes) {
    const list = byLevel.get(node.level) ?? [];
    list.push(node);
    byLevel.set(node.level, list);
  }

  const maxLevel = Math.max(...nodes.map((n) => n.level));
  if (maxLevel === 0) return result; // All leaves, nothing to do

  // Helper: get current embedding for a node
  const getEmb = (name: string): number[] => result.get(name)!;

  // 1. V->E upward: for each level 1+ node, aggregate from its children
  for (let level = 1; level <= maxLevel; level++) {
    const parents = byLevel.get(level) ?? [];
    const levelParams = params.levels.get(Math.min(level - 1, params.levels.size - 1));
    if (!levelParams) continue;

    const a = params.veResidualA.get(level - 1) ?? -1.0;
    const b = params.veResidualB.get(level - 1) ?? 0.5;

    for (const parent of parents) {
      const children = parent.children
        .map((c) => nodeMap.get(c))
        .filter((c): c is GNNNode => c !== undefined)
        .map((c) => ({ ...c, embedding: getEmb(c.name) }));

      if (children.length === 0) continue;

      const parentWithEmb = { ...parent, embedding: getEmb(parent.name) };
      const newEmb = vertexToEdge(parentWithEmb, children, levelParams, a, b, config.leakyReluAlpha);
      result.set(parent.name, newEmb);
    }
  }

  // 2. E->E downward: from L_max down to L1
  for (let level = maxLevel - 1; level >= 1; level--) {
    const nodesAtLevel = byLevel.get(level) ?? [];
    const levelParams = params.levels.get(Math.min(level - 1, params.levels.size - 1));
    if (!levelParams) continue;

    const a = params.veResidualA.get(level - 1) ?? -1.0;
    const b = params.veResidualB.get(level - 1) ?? 0.5;

    for (const node of nodesAtLevel) {
      // Find parents (nodes at higher levels that have this node as a child)
      const parents = nodes
        .filter((n) => n.level > level && n.children.includes(node.name))
        .map((n) => ({ ...n, embedding: getEmb(n.name) }));

      if (parents.length === 0) continue;

      const nodeWithEmb = { ...node, embedding: getEmb(node.name) };
      const newEmb = edgeToEdge(nodeWithEmb, parents, levelParams, a, b, config.leakyReluAlpha);
      result.set(node.name, newEmb);
    }
  }

  // 3. E->V downward: L1 -> L0
  const leaves = byLevel.get(0) ?? [];
  const levelParams = params.levels.get(0);
  if (levelParams) {
    for (const leaf of leaves) {
      const parents = nodes
        .filter((n) => n.level > 0 && n.children.includes(leaf.name))
        .map((n) => ({ ...n, embedding: getEmb(n.name) }));

      if (parents.length === 0) continue;

      const leafWithEmb = { ...leaf, embedding: getEmb(leaf.name) };
      const newEmb = edgeToVertex(leafWithEmb, parents, levelParams, config.leakyReluAlpha);
      result.set(leaf.name, newEmb);
    }
  }

  return result;
}
