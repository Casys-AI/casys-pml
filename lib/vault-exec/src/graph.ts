import type { VaultNote, VaultGraph, CompiledNode, NodeType } from "./types.ts";

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

/** Topological sort using Kahn's algorithm. Throws on cycle. */
export function topologicalSort(graph: VaultGraph): string[] {
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    throw new Error(`Graph contains cycle(s):\n${cycles.join("\n")}`);
  }

  const inDegree = new Map<string, number>();
  for (const [node, deps] of graph.edges) {
    if (!graph.nodes.has(node)) continue;
    const validDeps = deps.filter(d => graph.nodes.has(d));
    inDegree.set(node, validDeps.length);
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    queue.sort();
    const current = queue.shift()!;
    order.push(current);

    for (const [node, deps] of graph.edges) {
      if (deps.includes(current) && graph.nodes.has(node)) {
        const newDegree = inDegree.get(node)! - 1;
        inDegree.set(node, newDegree);
        if (newDegree === 0) queue.push(node);
      }
    }
  }

  return order;
}
