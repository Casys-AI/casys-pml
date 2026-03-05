import type { CompiledNode, NodeType, VaultGraph, VaultNote } from "./types.ts";
import type { VirtualEdgeRow } from "./types.ts";

/** Determine node type from frontmatter */
function resolveNodeType(fm: Record<string, unknown>): NodeType {
  if ("tool" in fm) return "tool";
  if ("code" in fm) return "code";
  return "value";
}

/** Build a VaultGraph from parsed notes */
export function buildGraph(notes: VaultNote[]): VaultGraph {
  const nodes = new Map<string, CompiledNode>();
  const edges = new Map<string, string[]>();

  for (const note of notes) {
    const type = resolveNodeType(note.frontmatter);
    const node: CompiledNode = {
      name: note.name,
      type,
      value: note.frontmatter.value,
      code: note.frontmatter.code as string | undefined,
      tool: note.frontmatter.tool as string | undefined,
      inputs: (note.frontmatter.inputs as Record<string, string>) ?? {},
      outputs: (note.frontmatter.outputs as string[]) ?? [],
      inputSchema: note.frontmatter.input_schema as
        | Record<string, unknown>
        | undefined,
    };
    nodes.set(note.name, node);
    edges.set(note.name, note.wikilinks);
  }

  return { nodes, edges };
}

/** Detect cycles using DFS. Returns list of cycle descriptions. */
export function detectCycles(graph: VaultGraph): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[] = [];

  for (const name of graph.nodes.keys()) {
    color.set(name, WHITE);
  }

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    path.push(node);
    for (const dep of graph.edges.get(node) ?? []) {
      if (!graph.nodes.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        const cycleStart = path.indexOf(dep);
        cycles.push(`Cycle: ${path.slice(cycleStart).join(" -> ")} -> ${dep}`);
      } else if (color.get(dep) === WHITE) {
        dfs(dep, path);
      }
    }
    path.pop();
    color.set(node, BLACK);
  }

  for (const name of graph.nodes.keys()) {
    if (color.get(name) === WHITE) {
      dfs(name, []);
    }
  }

  return cycles;
}

/** Extract the subgraph needed to compute a target node (BFS up dependencies) */
export function extractSubgraph(graph: VaultGraph, target: string): VaultGraph {
  if (!graph.nodes.has(target)) {
    throw new Error(`Target note "${target}" not found in graph`);
  }

  const needed = new Set<string>();
  const queue = [target];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (needed.has(name)) continue;
    needed.add(name);
    for (const dep of graph.edges.get(name) ?? []) {
      if (graph.nodes.has(dep)) queue.push(dep);
    }
  }

  const nodes = new Map<string, CompiledNode>();
  const edges = new Map<string, string[]>();
  for (const name of needed) {
    nodes.set(name, graph.nodes.get(name)!);
    edges.set(name, (graph.edges.get(name) ?? []).filter((d) => needed.has(d)));
  }

  return { nodes, edges };
}

/** Topological sort using Kahn's algorithm. Throws on cycle. */
export function topologicalSort(graph: VaultGraph): string[] {
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    throw new Error(`Graph contains cycle(s):\n${cycles.join("\n")}`);
  }

  // Build reverse adjacency: dep -> nodes that depend on it
  const dependents = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const [node, deps] of graph.edges) {
    if (!graph.nodes.has(node)) continue;
    const validDeps = deps.filter((d) => graph.nodes.has(d));
    inDegree.set(node, validDeps.length);
    for (const dep of validDeps) {
      const list = dependents.get(dep);
      if (list) {
        list.push(node);
      } else {
        dependents.set(dep, [node]);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    queue.sort(); // deterministic order for ties
    const current = queue.shift()!;
    order.push(current);

    for (const dependent of dependents.get(current) ?? []) {
      const newDegree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  return order;
}

/**
 * Overlay promoted virtual relations (source -> target) onto graph dependencies.
 * Graph edge convention is: target -> dependencies, so we add source as a dependency of target.
 * Any virtual edge that would introduce a cycle is ignored.
 */
export function withVirtualEdges(
  graph: VaultGraph,
  virtualEdges: Array<Pick<VirtualEdgeRow, "source" | "target">>,
): VaultGraph {
  const next: VaultGraph = {
    nodes: new Map(graph.nodes),
    edges: new Map([...graph.edges.entries()].map(([k, v]) => [k, [...v]])),
  };

  for (const e of virtualEdges) {
    if (!next.nodes.has(e.source) || !next.nodes.has(e.target)) continue;
    if (e.source === e.target) continue;

    const deps = next.edges.get(e.target) ?? [];
    if (deps.includes(e.source)) continue;

    deps.push(e.source);
    next.edges.set(e.target, deps);

    // Keep execution safety: rollback virtual edge if it creates a cycle.
    if (detectCycles(next).length > 0) {
      next.edges.set(e.target, deps.filter((d) => d !== e.source));
    }
  }

  return next;
}
