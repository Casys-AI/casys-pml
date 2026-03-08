import { assertEquals } from "jsr:@std/assert";
import {
  nextVirtualEdgeStatus,
  PROMOTION_POLICY,
  successRatio,
} from "./policy.ts";
import type { VirtualEdgeRow } from "../core/types.ts";

function makeRow(partial: Partial<VirtualEdgeRow>): VirtualEdgeRow {
  return {
    source: partial.source ?? "A",
    target: partial.target ?? "B",
    score: partial.score ?? 0,
    support: partial.support ?? 0,
    rejects: partial.rejects ?? 0,
    status: partial.status ?? "candidate",
    promotedAt: partial.promotedAt,
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

Deno.test("successRatio returns 0 for empty support/reject counts", () => {
  assertEquals(successRatio(makeRow({ support: 0, rejects: 0 })), 0);
});

Deno.test("nextVirtualEdgeStatus keeps promoted edge promoted", () => {
  const status = nextVirtualEdgeStatus(
    makeRow({
      status: "promoted",
      score: -100,
      support: 0,
      rejects: 999,
    }),
  );
  assertEquals(status, "promoted");
});

Deno.test("nextVirtualEdgeStatus rejects when score passes reject threshold", () => {
  const status = nextVirtualEdgeStatus(
    makeRow({
      score: PROMOTION_POLICY.rejectScore,
      support: 10,
      rejects: 0,
    }),
  );
  assertEquals(status, "rejected");
});

Deno.test("nextVirtualEdgeStatus promotes only when all thresholds pass", () => {
  const status = nextVirtualEdgeStatus(
    makeRow({
      score: PROMOTION_POLICY.minScore,
      support: PROMOTION_POLICY.minSupport,
      rejects: 1,
    }),
  );
  assertEquals(status, "promoted");
});

Deno.test("nextVirtualEdgeStatus stays candidate when success ratio is too low", () => {
  const status = nextVirtualEdgeStatus(
    makeRow({
      score: PROMOTION_POLICY.minScore,
      support: PROMOTION_POLICY.minSupport,
      rejects: 10,
    }),
  );
  assertEquals(status, "candidate");
});
