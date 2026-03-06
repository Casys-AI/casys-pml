import { deriveToolGraphKeysForCall } from "./naming.ts";
import type { ImportedOpenClawToolCallRow } from "../types.ts";

export interface ToolGraphEntity {
  key: string;
  level: 1 | 2 | 3;
  kind: "tool";
  parentKey?: string;
  childKeys: string[];
  totalOccurrences: number;
  uniqueSessions: number;
  uniqueAgents: number;
  l2Hits: number;
  l2Fallbacks: number;
  sourceCounts: Record<string, number>;
  agentCounts: Record<string, number>;
  sessionCounts: Record<string, number>;
}

interface MutableToolGraphEntity {
  key: string;
  level: 1 | 2 | 3;
  kind: "tool";
  parentKey?: string;
  childKeys: Set<string>;
  totalOccurrences: number;
  l2Hits: number;
  l2Fallbacks: number;
  sourceCounts: Map<string, number>;
  agentCounts: Map<string, number>;
  sessionCounts: Map<string, number>;
}

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right);
}

function ensureEntity(
  entities: Map<string, MutableToolGraphEntity>,
  key: string,
  level: 1 | 2 | 3,
  parentKey?: string,
): MutableToolGraphEntity {
  const existing = entities.get(key);
  if (existing) {
    if (parentKey) existing.parentKey = parentKey;
    return existing;
  }

  const created: MutableToolGraphEntity = {
    key,
    level,
    kind: "tool",
    parentKey,
    childKeys: new Set<string>(),
    totalOccurrences: 0,
    l2Hits: 0,
    l2Fallbacks: 0,
    sourceCounts: new Map(),
    agentCounts: new Map(),
    sessionCounts: new Map(),
  };
  entities.set(key, created);
  return created;
}

function sessionCountKey(row: ImportedOpenClawToolCallRow): string {
  return `${row.agentId ?? "unknown"}:${row.sessionId}`;
}

function applyRow(
  entity: MutableToolGraphEntity,
  row: ImportedOpenClawToolCallRow,
): void {
  entity.totalOccurrences += 1;
  if (row.l2Hit) {
    entity.l2Hits += 1;
  } else {
    entity.l2Fallbacks += 1;
  }
  incrementCount(entity.sourceCounts, row.sourceRoot);
  incrementCount(entity.agentCounts, row.agentId ?? "unknown");
  incrementCount(entity.sessionCounts, sessionCountKey(row));
}

function mapToRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => compareStable(left[0], right[0])),
  );
}

export function deriveToolGraphEntities(
  rows: ImportedOpenClawToolCallRow[],
): ToolGraphEntity[] {
  const entities = new Map<string, MutableToolGraphEntity>();

  for (const row of rows) {
    const keys = deriveToolGraphKeysForCall(row);
    const l1 = ensureEntity(entities, keys.l1Key, 1);
    applyRow(l1, row);

    if (keys.l2Key) {
      l1.childKeys.add(keys.l2Key);
      const l2 = ensureEntity(entities, keys.l2Key, 2, keys.l1Key);
      applyRow(l2, row);
    }
  }

  return [...entities.values()]
    .sort((left, right) => compareStable(left.key, right.key))
    .map((entity) => ({
      key: entity.key,
      level: entity.level,
      kind: entity.kind,
      parentKey: entity.parentKey,
      childKeys: [...entity.childKeys].sort(compareStable),
      totalOccurrences: entity.totalOccurrences,
      uniqueSessions: entity.sessionCounts.size,
      uniqueAgents: entity.agentCounts.size,
      l2Hits: entity.l2Hits,
      l2Fallbacks: entity.l2Fallbacks,
      sourceCounts: mapToRecord(entity.sourceCounts),
      agentCounts: mapToRecord(entity.agentCounts),
      sessionCounts: mapToRecord(entity.sessionCounts),
    }));
}
