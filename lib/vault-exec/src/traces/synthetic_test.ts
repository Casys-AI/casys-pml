import { assertEquals } from "jsr:@std/assert";
import { generateStructuralTraces } from "./synthetic.ts";
import type { VaultNote } from "../core/types.ts";

function makeNote(
  name: string,
  wikilinks: string[] = [],
  body = `About ${name}`,
): VaultNote {
  return {
    path: `${name}.md`,
    name,
    body,
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
  assertEquals(topTrace!.path.length, 4);
  assertEquals(topTrace!.path[topTrace!.path.length - 1], "Top");
  const midIdx = topTrace!.path.indexOf("Mid");
  const l1Idx = topTrace!.path.indexOf("L1");
  const l2Idx = topTrace!.path.indexOf("L2");
  assertEquals(l1Idx < midIdx, true);
  assertEquals(l2Idx < midIdx, true);
});

Deno.test("generateStructuralTraces - dangling wikilink ignored", () => {
  const notes = [
    makeNote("A"),
    makeNote("B", ["A", "Ghost"]),
  ];
  const traces = generateStructuralTraces(notes);
  assertEquals(traces.length, 1);
  assertEquals(traces[0].path.length, 2);
  assertEquals(traces[0].path, ["A", "B"]);
});

Deno.test("generateStructuralTraces - deterministic trace ordering by target name", () => {
  const notes = [
    makeNote("B", ["Leaf"]),
    makeNote("Leaf"),
    makeNote("A", ["Leaf"]),
  ];

  const traces = generateStructuralTraces(notes);
  assertEquals(traces.length, 2);
  assertEquals(traces.map((t) => t.targetNote), ["A", "B"]);
});

Deno.test("generateStructuralTraces - intent fallback omits trailing separator for empty body", () => {
  const notes = [makeNote("A"), makeNote("B", ["A"], "   ")];
  const traces = generateStructuralTraces(notes);
  assertEquals(traces.length, 1);
  assertEquals(traces[0].intent, "Execute B");
});
