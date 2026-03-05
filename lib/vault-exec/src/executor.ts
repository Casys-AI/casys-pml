import type { CompiledNode, ResultMap, VaultGraph } from "./types.ts";
import { topologicalSort } from "./graph.ts";
import { parseRef } from "./template.ts";

const TEMPLATE_RE = /\{\{([^}]+)\}\}/;

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".").filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Resolve a template string like "{{NoteName.output}}" against results or runtime inputs */
export function resolveTemplate(
  template: string,
  results: ResultMap,
  runtimeInputs: Record<string, unknown> = {},
): unknown {
  const match = template.match(TEMPLATE_RE);
  if (!match) return template;

  const ref = parseRef(match[1]);

  if (ref.note === "input" || ref.note === "inputs") {
    // Optional runtime fields may be absent; AJV enforces required fields upstream.
    return getByPath(runtimeInputs, ref.output);
  }

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
  runtimeInputs: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (node.type === "value") {
    const outputName = node.outputs[0] ?? "output";
    return { [outputName]: node.value };
  }

  if (node.type === "code") {
    const resolvedInputs: Record<string, unknown> = {};
    for (const [param, template] of Object.entries(node.inputs)) {
      resolvedInputs[param] = resolveTemplate(template, results, runtimeInputs);
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
export async function executeGraph(
  graph: VaultGraph,
  runtimeInputs: Record<string, unknown> = {},
  options: { verbose?: boolean } = {},
): Promise<ExecutionResult> {
  const order = topologicalSort(graph);
  const results: ResultMap = new Map();
  const verbose = options.verbose ?? true;

  for (const name of order) {
    const node = graph.nodes.get(name);
    if (!node) throw new Error(`Node "${name}" not found in graph`);

    if (verbose) console.log(`▶ ${name} (${node.type})`);
    const output = await executeNode(node, results, runtimeInputs);
    results.set(name, output);
    if (verbose) console.log(`  → ${JSON.stringify(output)}`);
  }

  return { results, path: order };
}
