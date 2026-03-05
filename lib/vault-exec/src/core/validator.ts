import type { ValidationError, VaultGraph } from "./types.ts";
import { detectCycles } from "./graph.ts";
import { parseRef } from "./template.ts";

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

/** Validate the graph for common errors */
export function validate(graph: VaultGraph): ValidationError[] {
  const errors: ValidationError[] = [];

  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    errors.push({ type: "cycle", node: "", message: cycle });
  }

  for (const [name, node] of graph.nodes) {
    // A node must have exactly one execution payload source.
    // Even if buildGraph infers type=value by default, we still reject
    // frontmatters that are missing payload fields or combine multiple modes.
    const hasValue = node.value !== undefined;
    const hasCode = typeof node.code === "string" &&
      node.code.trim().length > 0;
    const hasTool = typeof node.tool === "string" &&
      node.tool.trim().length > 0;
    const payloadCount = Number(hasValue) + Number(hasCode) + Number(hasTool);
    if (payloadCount !== 1) {
      errors.push({
        type: "unknown_type",
        node: name,
        message:
          `"${name}" must define exactly one of frontmatter fields: value | code | tool`,
      });
    }

    const deps = graph.edges.get(name) ?? [];
    const missingDeps = new Set<string>();
    for (const dep of deps) {
      if (!graph.nodes.has(dep)) {
        missingDeps.add(dep);
        errors.push({
          type: "missing_dependency",
          node: name,
          message:
            `"${name}" depends on "[[${dep}]]" which does not exist in the vault`,
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
        // Runtime refs are resolved from CLI-provided input payload.
        if (ref.note === "input" || ref.note === "inputs") continue;

        // Skip unresolved_input for notes already flagged as missing_dependency
        if (missingDeps.has(ref.note)) continue;
        const targetNode = graph.nodes.get(ref.note);
        if (!targetNode) {
          errors.push({
            type: "unresolved_input",
            node: name,
            message: `"${name}" input "${param}" references "{{${
              match[1]
            }}}" but note "${ref.note}" not found`,
          });
        } else if (!targetNode.outputs.includes(ref.output)) {
          errors.push({
            type: "unresolved_input",
            node: name,
            message: `"${name}" input "${param}" references "{{${
              match[1]
            }}}" but "${ref.note}" has no output "${ref.output}"`,
          });
        }
      }
    }
  }

  return errors;
}
