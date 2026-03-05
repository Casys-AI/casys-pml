import type { VaultNote } from "../core/types.ts";
import type { ExecutionTrace } from "../core/types.ts";
import { buildGraph, extractSubgraph, topologicalSort } from "../core/graph.ts";

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
