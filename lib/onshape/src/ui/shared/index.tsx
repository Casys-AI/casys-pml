/**
 * Shared UI utilities for lib/onshape MCP Apps
 * @module lib/onshape/src/ui/shared
 */

import { Skeleton, SkeletonText } from "../components/ui/skeleton";
import { cx } from "../components/utils";

export { Skeleton, SkeletonText, cx };

export const containers = {
  root: "p-4 font-sans text-sm text-fg-default bg-bg-canvas",
};

/** Onshape brand badge */
export function OnshapeBadge() {
  return (
    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-[#00A6F0]/15 text-[#00A6F0]">
      Onshape
    </span>
  );
}

/** Generic content loading skeleton */
export function ContentSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={containers.root}>
      <Skeleton height="20px" width="60%" className="mb-3" />
      <SkeletonText lines={lines} gap="8px" />
    </div>
  );
}

/** CSV export utility */
export function exportCsv(columns: string[], rows: Record<string, unknown>[], filename: string) {
  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const header = columns.map(escape).join(",");
  const body = rows.map((row) =>
    columns.map((col) => escape(row[col])).join(",")
  ).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Format snake_case to Title Case */
export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a number with locale separators */
export function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}
