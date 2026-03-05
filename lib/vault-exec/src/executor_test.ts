import { assertEquals, assertThrows } from "jsr:@std/assert";
import { resolveTemplate, executeNode, executeGraph } from "./executor.ts";
import type { CompiledNode, ResultMap, VaultGraph } from "./types.ts";

Deno.test("resolveTemplate - simple reference", () => {
  const results: ResultMap = new Map([["A", { output: 42 }]]);
  assertEquals(resolveTemplate("{{A.output}}", results), 42);
});

Deno.test("resolveTemplate - shorthand (single output)", () => {
  const results: ResultMap = new Map([["A", { output: 42 }]]);
  assertEquals(resolveTemplate("{{A}}", results), 42);
});

Deno.test("resolveTemplate - throws on missing note", () => {
  const results: ResultMap = new Map();
  assertThrows(() => resolveTemplate("{{Missing.output}}", results), Error, "Missing");
});

Deno.test("executeNode - value node returns literal", async () => {
  const node: CompiledNode = {
    name: "A", type: "value", value: 42, inputs: {}, outputs: ["output"],
  };
  const result = await executeNode(node, new Map());
  assertEquals(result, { output: 42 });
});

Deno.test("executeNode - code node evaluates expression", async () => {
  const node: CompiledNode = {
    name: "B", type: "code",
    code: "data.filter(x => x > 2)",
    inputs: { data: "{{A.output}}" },
    outputs: ["result"],
  };
  const results: ResultMap = new Map([["A", { output: [1, 2, 3, 4] }]]);
  const result = await executeNode(node, results);
  assertEquals(result, { result: [3, 4] });
});

Deno.test("executeGraph - executes full DAG in order", async () => {
  const nodes = new Map<string, CompiledNode>([
    ["A", { name: "A", type: "value", value: [1, 2, 3, 4, 5], inputs: {}, outputs: ["output"] }],
    ["B", {
      name: "B", type: "code",
      code: "data.filter(x => x > 3)",
      inputs: { data: "{{A.output}}" },
      outputs: ["result"],
    }],
    ["C", {
      name: "C", type: "code",
      code: "items.length",
      inputs: { items: "{{B.result}}" },
      outputs: ["count"],
    }],
  ]);
  const edges = new Map<string, string[]>([["A", []], ["B", ["A"]], ["C", ["B"]]]);
  const graph: VaultGraph = { nodes, edges };
  const { results, path } = await executeGraph(graph);
  assertEquals(results.get("A"), { output: [1, 2, 3, 4, 5] });
  assertEquals(results.get("B"), { result: [4, 5] });
  assertEquals(results.get("C"), { count: 2 });
  assertEquals(path, ["A", "B", "C"]);
});

Deno.test("executeGraph - supports machine mode with verbose=false", async () => {
  const nodes = new Map<string, CompiledNode>([
    ["Input", { name: "Input", type: "value", value: 3, inputs: {}, outputs: ["output"] }],
    ["Double", {
      name: "Double",
      type: "code",
      code: "x * 2",
      inputs: { x: "{{Input.output}}" },
      outputs: ["result"],
    }],
  ]);
  const edges = new Map<string, string[]>([["Input", []], ["Double", ["Input"]]]);
  const graph: VaultGraph = { nodes, edges };
  const { results, path } = await executeGraph(graph, {}, { verbose: false });
  assertEquals(results.get("Double"), { result: 6 });
  assertEquals(path, ["Input", "Double"]);
});
