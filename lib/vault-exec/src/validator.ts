import type { VaultGraph, ValidationError } from "./types.ts";
import { detectCycles } from "./graph.ts";

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

function parseRef(ref: string): { note: string; output: string } {
  const parts = ref.trim().split(".");
  if (parts.length === 1) return { note: parts[0], output: "output" };
  return { note: parts[0], output: parts.slice(1).join(".") };
}

/** Validate the graph for common errors */
export function validate(graph: VaultGraph): ValidationError[] {
  const errors: ValidationError[] = [];

  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    errors.push({ type: "cycle", node: "", message: cycle });
  }

  for (const [name, node] of graph.nodes) {
    const deps = graph.edges.get(name) ?? [];
    const missingDeps = new Set<string>();
    for (const dep of deps) {
      if (!graph.nodes.has(dep)) {
        missingDeps.add(dep);
        errors.push({
          type: "missing_dependency",
          node: name,
          message: `"${name}" depends on "[[${dep}]]" which does not exist in the vault`,
        });
      }
    }

    if (!node.outputs || node.outputs.length === 0) {
      errors.push({
        type: "no_outputs",
        node: name,
        message: `"${name}" has no outputs declared`,
      });
    }

    for (const [param, template] of Object.entries(node.inputs)) {
      const re = new RegExp(TEMPLATE_RE.source, "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(template)) !== null) {
        const ref = parseRef(match[1]);
        // Skip unresolved_input for notes already flagged as missing_dependency
        if (missingDeps.has(ref.note)) continue;
        const targetNode = graph.nodes.get(ref.note);
        if (!targetNode) {
          errors.push({
            type: "unresolved_input",
            node: name,
            message: `"${name}" input "${param}" references "{{${match[1]}}}" but note "${ref.note}" not found`,
          });
        } else if (!targetNode.outputs.includes(ref.output)) {
          errors.push({
            type: "unresolved_input",
            node: name,
            message: `"${name}" input "${param}" references "{{${match[1]}}}" but "${ref.note}" has no output "${ref.output}"`,
          });
        }
      }
    }
  }

  return errors;
}
