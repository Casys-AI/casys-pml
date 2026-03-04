import type { VaultNote, VaultGraph } from "../types.ts";
import type { ExecutionTrace } from "./types.ts";
import { buildGraph, topologicalSort } from "../graph.ts";

/**
 * Extract the subgraph reachable from `target` by following edges (dependencies).
 * Returns a new VaultGraph containing only the target and its transitive deps.
 */
function extractSubgraph(graph: VaultGraph, target: string): VaultGraph {
  const visited = new Set<string>();
  const stack = [target];

  while (stack.length > 0) {
    const name = stack.pop()!;
    if (visited.has(name)) continue;
    if (!graph.nodes.has(name)) continue;
    visited.add(name);
    const deps = graph.edges.get(name) ?? [];
    for (const dep of deps) {
      if (!visited.has(dep)) stack.push(dep);
    }
  }

  const nodes = new Map<string, import("../types.ts").CompiledNode>();
  const edges = new Map<string, string[]>();

  for (const name of visited) {
    const node = graph.nodes.get(name);
    if (node) nodes.set(name, node);
    const nodeDeps = (graph.edges.get(name) ?? []).filter((d) => visited.has(d));
    edges.set(name, nodeDeps);
  }

  return { nodes, edges };
}

/**
 * Generate synthetic execution traces from vault DAG structure.
 *
 * For each non-leaf note (one with wikilinks), extracts the transitive
 * dependency subgraph and topologically sorts it to produce a valid
 * execution path. Leaves first, target last.
 */
export function generateStructuralTraces(notes: VaultNote[]): ExecutionTrace[] {
  const graph = buildGraph(notes);
  const traces: ExecutionTrace[] = [];

  for (const note of notes) {
    if (note.wikilinks.length === 0) continue;

    try {
      const subgraph = extractSubgraph(graph, note.name);
      const path = topologicalSort(subgraph);

      traces.push({
        targetNote: note.name,
        path,
        success: true,
        synthetic: true,
        intent: `Execute ${note.name}: ${note.body.trim().split("\n")[0]}`,
      });
    } catch {
      // Cycle in subgraph -- skip this note
      continue;
    }
  }

  return traces;
}
