import { assertEquals } from "jsr:@std/assert";
import { validate } from "./validator.ts";
import { buildGraph } from "./graph.ts";
import type { VaultNote } from "./types.ts";

function makeNote(name: string, fm: Record<string, unknown>, wikilinks: string[]): VaultNote {
  return { path: `${name}.md`, name, body: "", frontmatter: fm, wikilinks };
}

Deno.test("validate - valid graph returns no errors", () => {
  const notes = [
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: { x: "{{A.output}}" }, code: "x + 1", outputs: ["result"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const errors = validate(graph);
  assertEquals(errors, []);
});

Deno.test("validate - missing dependency", () => {
  const notes = [
    makeNote("B", { inputs: { x: "{{A.output}}" }, code: "x", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const errors = validate(graph);
  assertEquals(errors.length, 1);
  assertEquals(errors[0].type, "missing_dependency");
});

Deno.test("validate - unresolved input reference", () => {
  const notes = [
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: { x: "{{A.nonexistent}}" }, code: "x", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const errors = validate(graph);
  assertEquals(errors.length, 1);
  assertEquals(errors[0].type, "unresolved_input");
});

Deno.test("validate - node with no outputs", () => {
  const notes = [
    makeNote("A", { value: 1 }, []),
  ];
  const graph = buildGraph(notes);
  const errors = validate(graph);
  assertEquals(errors.length, 1);
  assertEquals(errors[0].type, "no_outputs");
});
