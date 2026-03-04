import { assertEquals, assertThrows } from "jsr:@std/assert";
import { buildGraph, topologicalSort, detectCycles } from "../src/graph.ts";
import type { VaultNote } from "../src/types.ts";

function makeNote(name: string, frontmatter: Record<string, unknown>, wikilinks: string[]): VaultNote {
  return { path: `${name}.md`, name, body: "", frontmatter, wikilinks };
}

Deno.test("buildGraph - creates nodes and edges from notes", () => {
  const notes = [
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: { x: "{{A.output}}" }, code: "x + 1", outputs: ["result"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  assertEquals(graph.nodes.size, 2);
  assertEquals(graph.edges.get("B"), ["A"]);
  assertEquals(graph.edges.get("A"), []);
});

Deno.test("topologicalSort - returns valid execution order", () => {
  const notes = [
    makeNote("C", { inputs: { x: "{{B.result}}" }, code: "x * 2", outputs: ["out"] }, ["B"]),
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: { x: "{{A.output}}" }, code: "x + 1", outputs: ["result"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const order = topologicalSort(graph);
  assertEquals(order, ["A", "B", "C"]);
});

Deno.test("detectCycles - returns empty for acyclic graph", () => {
  const notes = [
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: {}, code: "1", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  assertEquals(detectCycles(graph), []);
});

Deno.test("detectCycles - detects simple cycle", () => {
  const notes = [
    makeNote("A", { code: "1", outputs: ["out"] }, ["B"]),
    makeNote("B", { code: "1", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const cycles = detectCycles(graph);
  assertEquals(cycles.length > 0, true);
});

Deno.test("topologicalSort - throws on cycle", () => {
  const notes = [
    makeNote("A", { code: "1", outputs: ["out"] }, ["B"]),
    makeNote("B", { code: "1", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  assertThrows(() => topologicalSort(graph), Error, "cycle");
});
