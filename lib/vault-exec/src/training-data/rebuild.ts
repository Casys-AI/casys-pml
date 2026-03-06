import {
  deriveToolGraphKeysForCall,
  sanitizeToolGraphSegment,
} from "../ingest/tool-graph/naming.ts";
import type {
  ImportedOpenClawSessionRow,
  ImportedOpenClawToolCallRow,
} from "../ingest/types.ts";

export interface ToolLeafNodeRow {
  leafKey: string;
  toolRoot: string;
  level: 1 | 2 | 3;
  isFallback: boolean;
  totalOccurrences: number;
  topLevelOccurrences: number;
  subagentOccurrences: number;
  uniqueSessions: number;
  uniqueAgents: number;
}

export interface ToolLeafEdgeNextRow {
  fromLeaf: string;
  toLeaf: string;
  weight: number;
  topLevelWeight: number;
  subagentWeight: number;
}

export interface SessionSequenceRow {
  sourceRoot: string;
  sessionId: string;
  sessionShortId: string;
  sourcePath: string;
  agentId?: string;
  sessionKind: "top_level" | "subagent";
  leafKeys: string[];
  callCount: number;
}

export interface RebuildDerivedTrainingDataOptions {
  kv: Deno.Kv;
  sessions: ImportedOpenClawSessionRow[];
  toolCalls: ImportedOpenClawToolCallRow[];
  buildId?: string;
}

export interface RebuildDerivedTrainingDataResult {
  buildId: string;
  toolLeafNodes: number;
  toolLeafEdgesNext: number;
  sessionSequences: number;
}

interface MutableToolLeafNode {
  leafKey: string;
  toolRoot: string;
  level: 1 | 2 | 3;
  isFallback: boolean;
  totalOccurrences: number;
  topLevelOccurrences: number;
  subagentOccurrences: number;
  sessionKeys: Set<string>;
  agentKeys: Set<string>;
}

interface MutableToolLeafEdge {
  fromLeaf: string;
  toLeaf: string;
  weight: number;
  topLevelWeight: number;
  subagentWeight: number;
}

interface DerivedTables {
  toolLeafNodes: ToolLeafNodeRow[];
  toolLeafEdgesNext: ToolLeafEdgeNextRow[];
  sessionSequences: SessionSequenceRow[];
}

const TRAINING_DATA_PREFIX = ["vault", "training_data"] as const;
const ACTIVE_BUILD_KEY: Deno.KvKey = [...TRAINING_DATA_PREFIX, "active_build"];

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareSessionRows(
  left: SessionSequenceRow,
  right: SessionSequenceRow,
): number {
  return left.sourceRoot.localeCompare(right.sourceRoot) ||
    left.sessionId.localeCompare(right.sessionId);
}

function compareEdgeRows(
  left: ToolLeafEdgeNextRow,
  right: ToolLeafEdgeNextRow,
): number {
  return left.fromLeaf.localeCompare(right.fromLeaf) ||
    left.toLeaf.localeCompare(right.toLeaf);
}

function compareToolCallRows(
  left: ImportedOpenClawToolCallRow,
  right: ImportedOpenClawToolCallRow,
): number {
  return left.sourceRoot.localeCompare(right.sourceRoot) ||
    left.sessionId.localeCompare(right.sessionId) ||
    left.turnIndex - right.turnIndex ||
    left.callIndex - right.callIndex;
}

function buildPrefix(buildId: string): Deno.KvKey {
  return [...TRAINING_DATA_PREFIX, "builds", buildId];
}

function sessionIdentity(sourceRoot: string, sessionId: string): string {
  return `${sourceRoot}::${sessionId}`;
}

function normalizeSessionKind(
  value: ImportedOpenClawSessionRow["sessionKind"] | ImportedOpenClawToolCallRow["sessionKind"],
): "top_level" | "subagent" {
  return value === "subagent" ? "subagent" : "top_level";
}

function asLevel(leafKey: string): 1 | 2 | 3 {
  const level = Math.max(1, Math.min(3, leafKey.split(".").length - 1));
  return level as 1 | 2 | 3;
}

function toolRootForLeaf(leafKey: string): string {
  const segment = leafKey.split(".")[1] ?? "unknown";
  return sanitizeToolGraphSegment(segment);
}

function isFallbackLeaf(leafKey: string): boolean {
  return leafKey.endsWith(".fallback");
}

function assertNonEmptyString(label: string, value: string | undefined): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[training-data] Invalid ${label}: expected non-empty string`);
  }
}

function deriveLeafKey(row: ImportedOpenClawToolCallRow): string {
  assertNonEmptyString("toolCalls[].sessionId", row.sessionId);
  assertNonEmptyString("toolCalls[].sourceRoot", row.sourceRoot);
  assertNonEmptyString("toolCalls[].sourcePath", row.sourcePath);
  assertNonEmptyString("toolCalls[].toolName", row.toolName);

  const keys = deriveToolGraphKeysForCall(row);
  return keys.l2Key ?? keys.l1Key;
}

function ensureToolLeafNode(
  nodes: Map<string, MutableToolLeafNode>,
  leafKey: string,
): MutableToolLeafNode {
  const existing = nodes.get(leafKey);
  if (existing) {
    return existing;
  }

  const created: MutableToolLeafNode = {
    leafKey,
    toolRoot: toolRootForLeaf(leafKey),
    level: asLevel(leafKey),
    isFallback: isFallbackLeaf(leafKey),
    totalOccurrences: 0,
    topLevelOccurrences: 0,
    subagentOccurrences: 0,
    sessionKeys: new Set<string>(),
    agentKeys: new Set<string>(),
  };
  nodes.set(leafKey, created);
  return created;
}

function ensureToolLeafEdge(
  edges: Map<string, MutableToolLeafEdge>,
  fromLeaf: string,
  toLeaf: string,
): MutableToolLeafEdge {
  const edgeKey = `${fromLeaf}=>${toLeaf}`;
  const existing = edges.get(edgeKey);
  if (existing) {
    return existing;
  }

  const created: MutableToolLeafEdge = {
    fromLeaf,
    toLeaf,
    weight: 0,
    topLevelWeight: 0,
    subagentWeight: 0,
  };
  edges.set(edgeKey, created);
  return created;
}

function deriveTables(
  sessions: ImportedOpenClawSessionRow[],
  toolCalls: ImportedOpenClawToolCallRow[],
): DerivedTables {
  const sessionsByIdentity = new Map<string, ImportedOpenClawSessionRow>();
  for (const session of sessions) {
    assertNonEmptyString("sessions[].sessionId", session.sessionId);
    assertNonEmptyString("sessions[].sourceRoot", session.sourceRoot);
    assertNonEmptyString("sessions[].sourcePath", session.sourcePath);
    sessionsByIdentity.set(
      sessionIdentity(session.sourceRoot, session.sessionId),
      session,
    );
  }

  const groupedCalls = new Map<string, ImportedOpenClawToolCallRow[]>();
  const nodes = new Map<string, MutableToolLeafNode>();
  const edges = new Map<string, MutableToolLeafEdge>();

  for (const row of [...toolCalls].sort(compareToolCallRows)) {
    const identity = sessionIdentity(row.sourceRoot, row.sessionId);
    const rows = groupedCalls.get(identity) ?? [];
    rows.push(row);
    groupedCalls.set(identity, rows);

    const leafKey = deriveLeafKey(row);
    const node = ensureToolLeafNode(nodes, leafKey);
    const sessionKind = normalizeSessionKind(row.sessionKind);
    node.totalOccurrences += 1;
    if (sessionKind === "subagent") {
      node.subagentOccurrences += 1;
    } else {
      node.topLevelOccurrences += 1;
    }
    node.sessionKeys.add(identity);
    node.agentKeys.add(row.agentId ?? "unknown");
  }

  const sessionSequences: SessionSequenceRow[] = [];
  for (const [identity, rows] of groupedCalls.entries()) {
    const leafKeys = rows.map(deriveLeafKey);
    if (leafKeys.length === 0) {
      continue;
    }

    const session = sessionsByIdentity.get(identity);
    const first = rows[0];
    const sessionKind = normalizeSessionKind(
      session?.sessionKind ?? first.sessionKind,
    );

    sessionSequences.push({
      sourceRoot: first.sourceRoot,
      sessionId: first.sessionId,
      sessionShortId: session?.sessionShortId ?? first.sessionShortId,
      sourcePath: session?.sourcePath ?? first.sourcePath,
      agentId: session?.agentId ?? first.agentId,
      sessionKind,
      leafKeys,
      callCount: leafKeys.length,
    });

    for (let index = 1; index < leafKeys.length; index++) {
      const edge = ensureToolLeafEdge(edges, leafKeys[index - 1], leafKeys[index]);
      edge.weight += 1;
      if (sessionKind === "subagent") {
        edge.subagentWeight += 1;
      } else {
        edge.topLevelWeight += 1;
      }
    }
  }

  return {
    toolLeafNodes: [...nodes.values()]
      .sort((left, right) => compareStrings(left.leafKey, right.leafKey))
      .map((node) => ({
        leafKey: node.leafKey,
        toolRoot: node.toolRoot,
        level: node.level,
        isFallback: node.isFallback,
        totalOccurrences: node.totalOccurrences,
        topLevelOccurrences: node.topLevelOccurrences,
        subagentOccurrences: node.subagentOccurrences,
        uniqueSessions: node.sessionKeys.size,
        uniqueAgents: node.agentKeys.size,
      })),
    toolLeafEdgesNext: [...edges.values()]
      .sort((left, right) =>
        compareStrings(left.fromLeaf, right.fromLeaf) ||
        compareStrings(left.toLeaf, right.toLeaf)
      )
      .map((edge) => ({
        fromLeaf: edge.fromLeaf,
        toLeaf: edge.toLeaf,
        weight: edge.weight,
        topLevelWeight: edge.topLevelWeight,
        subagentWeight: edge.subagentWeight,
      })),
    sessionSequences: sessionSequences.sort(compareSessionRows),
  };
}

async function writeRows<T>(
  kv: Deno.Kv,
  prefix: Deno.KvKey,
  rows: T[],
  keyForRow: (row: T) => Deno.KvKeyPart[],
): Promise<void> {
  for (const row of rows) {
    await kv.set([...prefix, ...keyForRow(row)], row);
  }
}

async function deleteBuild(kv: Deno.Kv, buildId: string): Promise<void> {
  const prefix = buildPrefix(buildId);
  for await (const entry of kv.list({ prefix })) {
    await kv.delete(entry.key);
  }
}

export async function getActiveTrainingBuildId(
  kv: Deno.Kv,
): Promise<string | null> {
  const entry = await kv.get<string>(ACTIVE_BUILD_KEY);
  return typeof entry.value === "string" && entry.value.length > 0
    ? entry.value
    : null;
}

async function listRowsForActiveBuild<T>(
  kv: Deno.Kv,
  tableName: string,
): Promise<T[]> {
  const buildId = await getActiveTrainingBuildId(kv);
  if (!buildId) {
    return [];
  }

  const rows: T[] = [];
  for await (
    const entry of kv.list<T>({
      prefix: [...buildPrefix(buildId), tableName],
    })
  ) {
    rows.push(entry.value);
  }
  return rows;
}

export async function listActiveToolLeafNodes(
  kv: Deno.Kv,
): Promise<ToolLeafNodeRow[]> {
  const rows = await listRowsForActiveBuild<ToolLeafNodeRow>(
    kv,
    "tool_leaf_nodes",
  );
  return rows.sort((left, right) => compareStrings(left.leafKey, right.leafKey));
}

export async function listActiveToolLeafEdgesNext(
  kv: Deno.Kv,
): Promise<ToolLeafEdgeNextRow[]> {
  const rows = await listRowsForActiveBuild<ToolLeafEdgeNextRow>(
    kv,
    "tool_leaf_edges_next",
  );
  return rows.sort(compareEdgeRows);
}

export async function listActiveSessionSequences(
  kv: Deno.Kv,
): Promise<SessionSequenceRow[]> {
  const rows = await listRowsForActiveBuild<SessionSequenceRow>(
    kv,
    "session_sequences",
  );
  return rows.sort(compareSessionRows);
}

export async function rebuildDerivedTrainingData(
  options: RebuildDerivedTrainingDataOptions,
): Promise<RebuildDerivedTrainingDataResult> {
  const buildId = options.buildId ?? crypto.randomUUID();
  const previousBuildId = await getActiveTrainingBuildId(options.kv);
  const tables = deriveTables(options.sessions, options.toolCalls);
  const prefix = buildPrefix(buildId);

  await writeRows(
    options.kv,
    [...prefix, "tool_leaf_nodes"],
    tables.toolLeafNodes,
    (row) => [row.leafKey],
  );
  await writeRows(
    options.kv,
    [...prefix, "tool_leaf_edges_next"],
    tables.toolLeafEdgesNext,
    (row) => [row.fromLeaf, row.toLeaf],
  );
  await writeRows(
    options.kv,
    [...prefix, "session_sequences"],
    tables.sessionSequences,
    (row) => [row.sourceRoot, row.sessionId],
  );

  await options.kv.set(ACTIVE_BUILD_KEY, buildId);

  if (previousBuildId && previousBuildId !== buildId) {
    try {
      await deleteBuild(options.kv, previousBuildId);
    } catch {
      // Keep the active build valid even if old-build cleanup fails.
    }
  }

  return {
    buildId,
    toolLeafNodes: tables.toolLeafNodes.length,
    toolLeafEdgesNext: tables.toolLeafEdgesNext.length,
    sessionSequences: tables.sessionSequences.length,
  };
}
