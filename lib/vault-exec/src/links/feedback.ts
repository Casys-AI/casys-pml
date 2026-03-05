import type { VaultGraph } from "../core/types.ts";
import type { VirtualEdgeUpdate } from "../core/types.ts";

function buildRealRelationSet(graph: VaultGraph): Set<string> {
  const relations = new Set<string>();
  // graph.edges is target -> dependencies. For path relations, we use dep -> target.
  for (const [target, deps] of graph.edges) {
    for (const dep of deps) {
      if (graph.nodes.has(dep)) relations.add(`${dep}->${target}`);
    }
  }
  return relations;
}

function updatesFromPath(
  path: string[],
  scoreDelta: number,
  reason: VirtualEdgeUpdate["reason"],
  realRelations: Set<string>,
): VirtualEdgeUpdate[] {
  const updates: VirtualEdgeUpdate[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const source = path[i];
    const target = path[i + 1];
    if (source === target) continue;
    if (realRelations.has(`${source}->${target}`)) continue;
    updates.push({ source, target, scoreDelta, reason });
  }
  return updates;
}

export function feedbackToVirtualEdgeUpdates(
  graph: VaultGraph,
  selectedPath: string[] | null,
  rejectedPaths: string[][],
): VirtualEdgeUpdate[] {
  const realRelations = buildRealRelationSet(graph);
  const merged = new Map<string, VirtualEdgeUpdate>();

  const all: VirtualEdgeUpdate[] = [];
  if (selectedPath && selectedPath.length >= 2) {
    all.push(
      ...updatesFromPath(selectedPath, 1.0, "selected_path", realRelations),
    );
  }
  for (const path of rejectedPaths) {
    if (path.length >= 2) {
      all.push(
        ...updatesFromPath(path, -0.7, "rejected_candidate", realRelations),
      );
    }
  }

  for (const u of all) {
    const key = `${u.source}->${u.target}`;
    const prev = merged.get(key);
    if (prev) {
      prev.scoreDelta += u.scoreDelta;
    } else {
      merged.set(key, { ...u });
    }
  }

  return [...merged.values()];
}
