/**
 * Unit Tests: code:* fallback heuristic in generateSequenceEdges
 *
 * Tests the fallback that creates sequence edges for code:* nodes
 * missing both `arguments` and `chainedFrom` metadata.
 * These nodes are data transformations that always depend on a prior step,
 * but extractArgumentValue() couldn't resolve their input.
 *
 * @module tests/unit/capabilities/edge-generators-code-star-fallback
 */

import { assertEquals } from "@std/assert";
import {
  generateChainedEdges,
  generateSequenceEdges,
} from "../../../src/capabilities/static-structure/edge-generators.ts";
import type { StaticStructureEdge } from "../../../src/capabilities/types.ts";
import type { InternalNode } from "../../../src/capabilities/static-structure/types.ts";
import type { ArgumentsStructure } from "../../../src/capabilities/types/static-analysis.ts";

// =============================================================================
// Helpers
// =============================================================================

function makeTaskNode(
  id: string,
  tool: string,
  position: number,
  opts: {
    parentScope?: string;
    arguments?: ArgumentsStructure;
    chainedFrom?: string;
    executable?: boolean;
  } = {},
): InternalNode {
  const node: InternalNode = {
    id,
    type: "task",
    tool,
    position,
    parentScope: opts.parentScope,
    metadata: {
      executable: opts.executable ?? true,
      chainedFrom: opts.chainedFrom,
    },
  };
  if (opts.arguments) {
    (node as Extract<InternalNode, { type: "task" }>).arguments = opts.arguments;
  }
  return node;
}

function getSequenceEdges(
  nodes: InternalNode[],
): StaticStructureEdge[] {
  const edges: StaticStructureEdge[] = [];
  const edgeSet = new Set<string>();
  // Run chained edges first (mirrors generateAllEdges order)
  generateChainedEdges(nodes, edges, edgeSet);
  generateSequenceEdges(nodes, edges, edgeSet);
  return edges.filter((e) => e.type === "sequence");
}

// =============================================================================
// Tests: Fallback heuristic
// =============================================================================

Deno.test("code:* without arguments or chainedFrom gets fallback edge to previous node", () => {
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "std:psql_query", 0),
    makeTaskNode("n2", "code:filter", 1), // no arguments, no chainedFrom
  ];

  const edges = getSequenceEdges(nodes);

  assertEquals(edges.length, 1, "Should create 1 fallback sequence edge");
  assertEquals(edges[0].from, "n1");
  assertEquals(edges[0].to, "n2");
});

Deno.test("code:* WITH arguments does NOT get fallback edge", () => {
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "std:psql_query", 0),
    makeTaskNode("n2", "code:filter", 1, {
      arguments: { input: { type: "reference", expression: "n1" } },
    }),
  ];

  const edges = getSequenceEdges(nodes);

  // Should get the normal edge via nodeReferencesNode, not the fallback
  assertEquals(edges.length, 1);
  assertEquals(edges[0].from, "n1");
  assertEquals(edges[0].to, "n2");
});

Deno.test("code:* WITH chainedFrom does NOT get fallback edge", () => {
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "code:filter", 0),
    makeTaskNode("n2", "code:map", 1, { chainedFrom: "n1" }),
  ];

  const edges = getSequenceEdges(nodes);

  // Should get chained edge, not fallback
  assertEquals(edges.length, 1);
  assertEquals(edges[0].from, "n1");
  assertEquals(edges[0].to, "n2");
});

Deno.test("MCP tool without arguments does NOT get fallback edge (only code:*)", () => {
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "std:psql_query", 0),
    makeTaskNode("n2", "filesystem:read_file", 1), // MCP tool, not code:*
  ];

  const edges = getSequenceEdges(nodes);

  assertEquals(edges.length, 0, "MCP tools should not get fallback edges");
});

Deno.test("multiple code:* without arguments chain sequentially", () => {
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "std:psql_query", 0),
    makeTaskNode("n2", "code:map", 1), // no arguments → fallback to n1
    makeTaskNode("n3", "code:greaterThan", 2), // no arguments → fallback to n2
    makeTaskNode("n4", "code:filter", 3), // no arguments → fallback to n3
  ];

  const edges = getSequenceEdges(nodes);

  assertEquals(edges.length, 3, "Should create 3 fallback edges forming a chain");
  assertEquals(edges[0].from, "n1");
  assertEquals(edges[0].to, "n2");
  assertEquals(edges[1].from, "n2");
  assertEquals(edges[1].to, "n3");
  assertEquals(edges[2].from, "n3");
  assertEquals(edges[2].to, "n4");
});

Deno.test("code:* fallback respects scope boundaries", () => {
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "std:psql_query", 0, { parentScope: undefined }),
    makeTaskNode("n2", "code:filter", 1, { parentScope: "d1:true" }), // different scope
  ];

  const edges = getSequenceEdges(nodes);

  // n2 is in scope "d1:true", n1 is in root scope — they shouldn't get a fallback
  // edge because they're in different scope groups
  assertEquals(edges.length, 0, "Should not create fallback edge across scopes");
});

Deno.test("code:* fallback does not duplicate existing chained edges", () => {
  // n1 → n2 already has a chained edge. n2 has chainedFrom so no fallback.
  // n3 has no arguments/chainedFrom → fallback to n2.
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "code:filter", 0),
    makeTaskNode("n2", "code:map", 1, { chainedFrom: "n1" }),
    makeTaskNode("n3", "code:join", 2), // no arguments → fallback to n2
  ];

  const edges = getSequenceEdges(nodes);

  // n1→n2 from chaining, n2→n3 from fallback
  assertEquals(edges.length, 2);
  const edgePairs = edges.map((e) => `${e.from}->${e.to}`);
  assertEquals(edgePairs.includes("n1->n2"), true, "Should have chained edge n1->n2");
  assertEquals(edgePairs.includes("n2->n3"), true, "Should have fallback edge n2->n3");
});

Deno.test("non-executable code:* nodes are skipped by fallback", () => {
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "std:psql_query", 0),
    makeTaskNode("n2", "code:greaterThan", 1, { executable: false }), // nested in callback
    makeTaskNode("n3", "code:filter", 2), // executable, no arguments → fallback to n1 (n2 skipped)
  ];

  const edges = getSequenceEdges(nodes);

  // n2 is not executable → skipped in taskNodes. n3 fallback to n1.
  assertEquals(edges.length, 1);
  assertEquals(edges[0].from, "n1");
  assertEquals(edges[0].to, "n3");
});

Deno.test("mixed: some code:* have arguments, some don't", () => {
  const nodes: InternalNode[] = [
    makeTaskNode("n1", "std:psql_query", 0),
    makeTaskNode("n2", "code:map", 1, {
      arguments: { input: { type: "reference", expression: "n1" } },
    }),
    makeTaskNode("n3", "code:split", 2), // no arguments → fallback to n2
  ];

  const edges = getSequenceEdges(nodes);

  assertEquals(edges.length, 2, "Should have 2 edges: 1 normal + 1 fallback");
  const edgePairs = edges.map((e) => `${e.from}->${e.to}`);
  assertEquals(edgePairs.includes("n1->n2"), true, "Normal edge via nodeReferencesNode");
  assertEquals(edgePairs.includes("n2->n3"), true, "Fallback edge for code:split");
});
