import { assertEquals } from "jsr:@std/assert";
import { buildGraph, detectCycles, withVirtualEdges } from "./graph.ts";
import type { VaultNote } from "./types.ts";

function note(name: string, deps: string[] = []): VaultNote {
  return {
    path: `${name}.md`,
    name,
    body: "",
    frontmatter: {},
    wikilinks: deps,
  };
}

Deno.test("withVirtualEdges adds promoted relation without cycle", () => {
  // B depends on A
  const graph = buildGraph([note("A"), note("B", ["A"]), note("C")]);
  // Virtual relation A -> C means C depends on A.
  const next = withVirtualEdges(graph, [{ source: "A", target: "C" }]);
  assertEquals(next.edges.get("C")?.includes("A"), true);
  assertEquals(detectCycles(next).length, 0);
});

Deno.test("withVirtualEdges skips edge that creates cycle", () => {
  // B depends on A
  const graph = buildGraph([note("A"), note("B", ["A"])]);
  // A -> B virtual means B depends on A (already real, no-op), not cycle
  // B -> A virtual would make A depend on B and create cycle; must be skipped.
  const next = withVirtualEdges(graph, [{ source: "B", target: "A" }]);
  assertEquals(next.edges.get("A")?.includes("B"), false);
  assertEquals(detectCycles(next).length, 0);
});
