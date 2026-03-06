import type { ImportedOpenClawToolCallRow } from "../types.ts";

export interface ToolGraphKeySet {
  l1Key: string;
  l2Key?: string;
}

export function sanitizeToolGraphSegment(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return cleaned.replace(/^_+|_+$/g, "") || "unknown";
}

export function deriveToolGraphKeysForCall(
  row: ImportedOpenClawToolCallRow,
): ToolGraphKeySet {
  const toolSegment = sanitizeToolGraphSegment(row.toolName);
  const l1Key = `tool.${toolSegment}`;
  const family = typeof row.family === "string" && row.family.trim().length > 0
    ? sanitizeToolGraphSegment(row.family)
    : null;

  if (!family) {
    return { l1Key };
  }

  return {
    l1Key,
    l2Key: `${l1Key}.${family}`,
  };
}
