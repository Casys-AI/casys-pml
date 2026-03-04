import type { CompiledNode, ResultMap, VaultGraph } from "./types.ts";
import { topologicalSort } from "./graph.ts";

const TEMPLATE_RE = /\{\{([^}]+)\}\}/;

function parseRef(ref: string): { note: string; output: string } {
  const parts = ref.trim().split(".");
  if (parts.length === 1) return { note: parts[0], output: "output" };
  return { note: parts[0], output: parts.slice(1).join(".") };
}

/** Resolve a template string like "{{NoteName.output}}" against results */
export function resolveTemplate(template: string, results: ResultMap): unknown {
  const match = template.match(TEMPLATE_RE);
  if (!match) return template;

  const ref = parseRef(match[1]);
  const noteResults = results.get(ref.note);
  if (!noteResults) {
    throw new Error(`Cannot resolve "{{${match[1]}}}": note "${ref.note}" has no results yet`);
  }
  if (!(ref.output in noteResults)) {
    throw new Error(`Cannot resolve "{{${match[1]}}}": note "${ref.note}" has no output "${ref.output}"`);
  }
  return noteResults[ref.output];
}

/** Execute a single node */
export async function executeNode(
  node: CompiledNode,
  results: ResultMap,
): Promise<Record<string, unknown>> {
  if (node.type === "value") {
    const outputName = node.outputs[0] ?? "output";
    return { [outputName]: node.value };
  }

  if (node.type === "code") {
    const resolvedInputs: Record<string, unknown> = {};
    for (const [param, template] of Object.entries(node.inputs)) {
      resolvedInputs[param] = resolveTemplate(template, results);
    }

    const paramNames = Object.keys(resolvedInputs);
    const paramValues = Object.values(resolvedInputs);
    // deno-lint-ignore no-new-func
    const fn = new Function(...paramNames, `return (${node.code});`);
    const result = await fn(...paramValues);

    const outputName = node.outputs[0] ?? "output";
    return { [outputName]: result };
  }

  if (node.type === "tool") {
    throw new Error(`Tool nodes not supported yet (Phase 2). Node: "${node.name}"`);
  }

  throw new Error(`Unknown node type "${(node as CompiledNode).type}" for node "${node.name}"`);
}

/** Result of executeGraph: the outputs map + the execution path (node names in order) */
export interface ExecutionResult {
  results: ResultMap;
  path: string[];
}

/** Execute the full graph in topological order */
export async function executeGraph(graph: VaultGraph): Promise<ExecutionResult> {
  const order = topologicalSort(graph);
  const results: ResultMap = new Map();

  for (const name of order) {
    const node = graph.nodes.get(name);
    if (!node) throw new Error(`Node "${name}" not found in graph`);

    console.log(`▶ ${name} (${node.type})`);
    const output = await executeNode(node, results);
    results.set(name, output);
    console.log(`  → ${JSON.stringify(output)}`);
  }

  return { results, path: order };
}
