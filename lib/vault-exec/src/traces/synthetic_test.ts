import { assertEquals } from "jsr:@std/assert";
import { generateStructuralTraces } from "./synthetic.ts";
import type { VaultNote } from "../core/types.ts";

function makeNote(name: string, wikilinks: string[] = []): VaultNote {
  return {
    path: `${name}.md`,
    name,
    body: `About ${name}`,
    frontmatter: {},
    wikilinks,
  };
}

Deno.test("generateStructuralTraces - generates one trace per non-leaf note", () => {
  const notes = [
    makeNote("A"),
    makeNote("B"),
    makeNote("C", ["A", "B"]),
    makeNote("D", ["C"]),
  ];
  const traces = generateStructuralTraces(notes);
  // C and D are non-leaves -> 2 traces
  assertEquals(traces.length, 2);
});

Deno.test("generateStructuralTraces - trace path is topological order", () => {
  const notes = [
    makeNote("A"),
    makeNote("B"),
    makeNote("C", ["A", "B"]),
  ];
  const traces = generateStructuralTraces(notes);
  assertEquals(traces.length, 1);
  const trace = traces[0];
  assertEquals(trace.targetNote, "C");
  // Path should be [A, B, C] or [B, A, C] -- leaves first, then C
  assertEquals(trace.path[trace.path.length - 1], "C");
  assertEquals(trace.path.length, 3);
});

Deno.test("generateStructuralTraces - all traces marked synthetic", () => {
  const notes = [makeNote("A"), makeNote("B", ["A"])];
  const traces = generateStructuralTraces(notes);
  for (const trace of traces) {
    assertEquals(trace.synthetic, true);
  }
});

Deno.test("generateStructuralTraces - intent includes note body", () => {
  const notes = [makeNote("A"), makeNote("B", ["A"])];
  const traces = generateStructuralTraces(notes);
  assertEquals(traces.length, 1);
  assertEquals(traces[0].intent, "Execute B: About B");
});

Deno.test("generateStructuralTraces - skips notes with cycles", () => {
  const notes = [
    makeNote("X", ["Y"]),
    makeNote("Y", ["X"]),
  ];
  const traces = generateStructuralTraces(notes);
  // Both form a cycle, both should be skipped
  assertEquals(traces.length, 0);
});

Deno.test("generateStructuralTraces - deep transitive deps included", () => {
  const notes = [
    makeNote("L1"),
    makeNote("L2"),
    makeNote("Mid", ["L1", "L2"]),
    makeNote("Top", ["Mid"]),
  ];
  const traces = generateStructuralTraces(notes);
  const topTrace = traces.find((t) => t.targetNote === "Top");
  assertEquals(topTrace !== undefined, true);
  // Top depends on Mid which depends on L1, L2
  // Path should include all 4 nodes: L1, L2, Mid, Top
  assertEquals(topTrace!.path.length, 4);
  assertEquals(topTrace!.path[topTrace!.path.length - 1], "Top");
  // L1 and L2 must come before Mid
  const midIdx = topTrace!.path.indexOf("Mid");
  const l1Idx = topTrace!.path.indexOf("L1");
  const l2Idx = topTrace!.path.indexOf("L2");
  assertEquals(l1Idx < midIdx, true);
  assertEquals(l2Idx < midIdx, true);
});

Deno.test("generateStructuralTraces - dangling wikilink ignored", () => {
  // B references "Ghost" which is not in the notes array
  const notes = [
    makeNote("A"),
    makeNote("B", ["A", "Ghost"]),
  ];
  const traces = generateStructuralTraces(notes);
  assertEquals(traces.length, 1);
  // Ghost is not in the graph nodes, so path should only have A and B
  assertEquals(traces[0].path.length, 2);
  assertEquals(traces[0].path, ["A", "B"]);
});
