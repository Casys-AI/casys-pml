import type { GNNConfig, GNNNode, GNNParams } from "./types.ts";
import { runGnnOrchestrator } from "./orchestrator.ts";

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
  return runGnnOrchestrator(nodes, params, config);
}
