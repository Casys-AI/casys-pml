import { assertEquals } from "@std/assert";
import { dedupTracesByIntent } from "../../../../lib/gru/src/data-prep/intent-dedup.ts";

interface FakeTrace {
  id: string;
  group: string;
  emb: number[];
}

const getGroup = (t: FakeTrace) => t.group;
const getEmb = (t: FakeTrace) => t.emb;

Deno.test("dedupTracesByIntent - empty input returns empty output", () => {
  const result = dedupTracesByIntent<FakeTrace>([], getGroup, getEmb);
  assertEquals(result.deduped, []);
  assertEquals(result.inputCount, 0);
  assertEquals(result.removedCount, 0);
});

Deno.test("dedupTracesByIntent - all unique traces are kept", () => {
  const traces: FakeTrace[] = [
    { id: "a", group: "g1", emb: [1.0, 2.0] },
    { id: "b", group: "g1", emb: [3.0, 4.0] },
    { id: "c", group: "g2", emb: [1.0, 2.0] },
  ];
  const result = dedupTracesByIntent(traces, getGroup, getEmb);
  assertEquals(result.deduped.length, 3);
  assertEquals(result.removedCount, 0);
});

Deno.test("dedupTracesByIntent - same group + same intent deduplicates", () => {
  const traces: FakeTrace[] = [
    { id: "a", group: "g1", emb: [1.0, 2.0] },
    { id: "b", group: "g1", emb: [1.0, 2.0] },
    { id: "c", group: "g1", emb: [1.0, 2.0] },
  ];
  const result = dedupTracesByIntent(traces, getGroup, getEmb);
  assertEquals(result.deduped.length, 1);
  assertEquals(result.deduped[0].id, "a");
  assertEquals(result.removedCount, 2);
});

Deno.test("dedupTracesByIntent - same group different intent keeps all", () => {
  const traces: FakeTrace[] = [
    { id: "a", group: "g1", emb: [1.0, 2.0] },
    { id: "b", group: "g1", emb: [1.0, 2.1] },
  ];
  const result = dedupTracesByIntent(traces, getGroup, getEmb);
  assertEquals(result.deduped.length, 2);
  assertEquals(result.removedCount, 0);
});

Deno.test("dedupTracesByIntent - different group same intent keeps all", () => {
  const traces: FakeTrace[] = [
    { id: "a", group: "g1", emb: [1.0, 2.0] },
    { id: "b", group: "g2", emb: [1.0, 2.0] },
  ];
  const result = dedupTracesByIntent(traces, getGroup, getEmb);
  assertEquals(result.deduped.length, 2);
  assertEquals(result.removedCount, 0);
});

Deno.test("dedupTracesByIntent - first occurrence is preserved (order)", () => {
  const traces: FakeTrace[] = [
    { id: "first", group: "g1", emb: [0.5, 0.5] },
    { id: "second", group: "g1", emb: [0.5, 0.5] },
    { id: "third", group: "g1", emb: [0.5, 0.5] },
  ];
  const result = dedupTracesByIntent(traces, getGroup, getEmb);
  assertEquals(result.deduped.length, 1);
  assertEquals(result.deduped[0].id, "first");
  assertEquals(result.inputCount, 3);
});
