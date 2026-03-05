import type { VirtualEdgeRow, VirtualEdgeStatus } from "./types.ts";

export const PROMOTION_POLICY = {
  minScore: 5,
  minSupport: 3,
  minSuccessRatio: 0.7,
  rejectScore: -4,
  decayFactor: 0.99,
} as const;

export function successRatio(row: VirtualEdgeRow): number {
  const total = row.support + row.rejects;
  return total > 0 ? row.support / total : 0;
}

export function nextVirtualEdgeStatus(
  row: VirtualEdgeRow,
): VirtualEdgeStatus {
  if (row.status === "promoted") return "promoted";
  if (row.score <= PROMOTION_POLICY.rejectScore) return "rejected";
  if (
    row.score >= PROMOTION_POLICY.minScore &&
    row.support >= PROMOTION_POLICY.minSupport &&
    successRatio(row) >= PROMOTION_POLICY.minSuccessRatio
  ) {
    return "promoted";
  }
  return "candidate";
}
