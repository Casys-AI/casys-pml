import { assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import { feedbackToVirtualEdgeUpdates } from "./feedback.ts";
import type { VaultGraph } from "../core/types.ts";

function makeGraph(edges: Array<[string, string[]]>): VaultGraph {
  const nodeNames = new Set<string>();
  for (const [target, deps] of edges) {
    nodeNames.add(target);
    for (const dep of deps) nodeNames.add(dep);
  }
  const nodes = new Map(
    [...nodeNames].map((name) => [
      name,
      { name, type: "value" as const, inputs: {}, outputs: [] },
    ]),
  );
  return {
    nodes,
    edges: new Map(edges),
  };
}

Deno.test("feedbackToVirtualEdgeUpdates ignores real relations and self loops", () => {
  const graph = makeGraph([["Target", ["RealDep"]]]);
  const updates = feedbackToVirtualEdgeUpdates(
    graph,
    ["RealDep", "Target", "Target"],
    [],
  );
  assertEquals(updates, []);
});

Deno.test("feedbackToVirtualEdgeUpdates merges duplicate edges and sums score", () => {
  const graph = makeGraph([]);
  const updates = feedbackToVirtualEdgeUpdates(
    graph,
    ["A", "B"],
    [["A", "B"]],
  );
  assertEquals(updates.length, 1);
  assertEquals(updates[0].source, "A");
  assertEquals(updates[0].target, "B");
  assertAlmostEquals(updates[0].scoreDelta, 0.3, 1e-12);
});

Deno.test("feedbackToVirtualEdgeUpdates returns deterministic sorted order", () => {
  const graph = makeGraph([]);
  const updates = feedbackToVirtualEdgeUpdates(
    graph,
    ["Z", "A", "M"],
    [["Y", "B"]],
  );

  assertEquals(
    updates.map((u) => `${u.source}->${u.target}`),
    ["A->M", "Y->B", "Z->A"],
  );
});
