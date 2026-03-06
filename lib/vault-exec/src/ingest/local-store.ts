import type {
  ImportedOpenClawSessionRow,
  ImportedOpenClawToolCallRow,
  JsonObject,
  ParsedOpenClawSession,
  ParsedOpenClawTurn,
  ParsedToolCall,
  ParsedToolResult,
} from "./types.ts";

const encoder = new TextEncoder();
const MAX_TOOL_CALL_ROW_BYTES = 60_000;
const STANDARD_JSON_FIELD_BYTES = 8_000;
const STANDARD_TEXT_FIELD_BYTES = 4_000;
const EMERGENCY_JSON_FIELD_BYTES = 2_000;
const EMERGENCY_TEXT_FIELD_BYTES = 1_000;

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/g, "") || "/";
}

function padIndex(value: number): string {
  return String(value).padStart(8, "0");
}

function compareRows(
  left: ImportedOpenClawToolCallRow,
  right: ImportedOpenClawToolCallRow,
): number {
  return left.sourceRoot.localeCompare(right.sourceRoot) ||
    left.sessionId.localeCompare(right.sessionId) ||
    left.turnIndex - right.turnIndex ||
    left.callIndex - right.callIndex;
}

function compareSessionRows(
  left: ImportedOpenClawSessionRow,
  right: ImportedOpenClawSessionRow,
): number {
  return left.sourceRoot.localeCompare(right.sourceRoot) ||
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.sessionId.localeCompare(right.sessionId);
}

function findToolResultForCall(
  turn: ParsedOpenClawTurn,
  call: ParsedToolCall,
): ParsedToolResult | undefined {
  if (call.toolCallId) {
    const byId = turn.toolResults.find((result) =>
      result.toolCallId === call.toolCallId
    );
    if (byId) return byId;
  }

  const byName = turn.toolResults.filter((result) =>
    result.toolName === call.toolName
  );
  if (byName.length === 1) {
    return byName[0];
  }

  return undefined;
}

function jsonByteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value ?? null)).length;
}

function truncateString(value: string, maxBytes: number): string {
  if (jsonByteLength(value) <= maxBytes) {
    return value;
  }

  const suffix = " ...[truncated]";
  let end = Math.max(0, value.length - suffix.length);
  let out = `${value.slice(0, end)}${suffix}`;
  while (end > 0 && jsonByteLength(out) > maxBytes) {
    end = Math.max(0, end - 128);
    out = `${value.slice(0, end)}${suffix}`;
  }
  return out;
}

function summarizeUnknown(value: unknown, maxBytes: number): JsonObject {
  const serialized = JSON.stringify(value ?? null);
  const previewBudget = Math.max(128, maxBytes - 128);
  return {
    truncated: true,
    originalType: Array.isArray(value) ? "array" : typeof value,
    originalBytes: encoder.encode(serialized).length,
    preview: truncateString(serialized, previewBudget),
  };
}

function compactJsonLike(
  value: JsonObject | undefined,
  maxBytes: number,
): JsonObject | undefined {
  if (value === undefined) return undefined;
  if (jsonByteLength(value) <= maxBytes) {
    return value;
  }
  return summarizeUnknown(value, maxBytes);
}

function compactUnknown(value: unknown, maxBytes: number): unknown {
  if (value === undefined) return undefined;
  if (jsonByteLength(value) <= maxBytes) {
    return value;
  }
  return summarizeUnknown(value, maxBytes);
}

function compactThinking(
  value: string[] | undefined,
  maxBytes: number,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (jsonByteLength(value) <= maxBytes) {
    return value;
  }

  const out: string[] = [];
  for (const item of value) {
    out.push(truncateString(item, Math.max(256, Math.floor(maxBytes / 2))));
    if (jsonByteLength(out) > maxBytes) {
      out.pop();
      break;
    }
  }

  if (out.length < value.length) {
    out.push(`...[truncated ${value.length - out.length} item(s)]`);
  }

  while (out.length > 1 && jsonByteLength(out) > maxBytes) {
    out.splice(Math.max(0, out.length - 2), 1);
    out[out.length - 1] = "...[truncated]";
  }

  return out;
}

function compactToolCallRow(
  row: ImportedOpenClawToolCallRow,
): ImportedOpenClawToolCallRow {
  const applyCaps = (
    textBytes: number,
    jsonBytes: number,
  ): ImportedOpenClawToolCallRow => ({
    ...row,
    args: compactJsonLike(row.args, jsonBytes) ?? {},
    l2Context: compactJsonLike(row.l2Context, jsonBytes),
    userIntent: truncateString(row.userIntent, textBytes),
    userProvenance: compactJsonLike(row.userProvenance, jsonBytes),
    assistantFinalText: row.assistantFinalText
      ? truncateString(row.assistantFinalText, textBytes)
      : undefined,
    assistantThinking: compactThinking(row.assistantThinking, textBytes),
    parentPlanHint: row.parentPlanHint
      ? truncateString(row.parentPlanHint, textBytes)
      : undefined,
    toolResultContent: compactUnknown(row.toolResultContent, jsonBytes),
    toolResultDetails: compactUnknown(row.toolResultDetails, jsonBytes),
  });

  let compacted = applyCaps(
    STANDARD_TEXT_FIELD_BYTES,
    STANDARD_JSON_FIELD_BYTES,
  );
  if (jsonByteLength(compacted) > MAX_TOOL_CALL_ROW_BYTES) {
    compacted = applyCaps(
      EMERGENCY_TEXT_FIELD_BYTES,
      EMERGENCY_JSON_FIELD_BYTES,
    );
  }
  if (jsonByteLength(compacted) > MAX_TOOL_CALL_ROW_BYTES) {
    throw new Error(
      `[ingest/local-store] Tool call row still exceeds KV budget for ${row.toolName} (${row.sessionId})`,
    );
  }
  return compacted;
}

async function ensureParentDir(path: string): Promise<void> {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) return;
  await Deno.mkdir(normalized.slice(0, lastSlash), { recursive: true });
}

export class OpenClawLocalStore {
  private constructor(private readonly kv: Deno.Kv) {}

  static async open(path: string): Promise<OpenClawLocalStore> {
    await ensureParentDir(path);
    return new OpenClawLocalStore(await Deno.openKv(path));
  }

  close(): void {
    this.kv.close();
  }

  async replaceSession(
    sourceRoot: string,
    contentHash: string,
    session: ParsedOpenClawSession,
  ): Promise<number> {
    const normalizedSourceRoot = normalizePath(sourceRoot);
    const importedAt = new Date().toISOString();
    const prefix: Deno.KvKey = [
      "vault",
      "openclaw",
      "tool_calls",
      normalizedSourceRoot,
      session.sessionId,
    ];

    for await (
      const entry of this.kv.list<ImportedOpenClawToolCallRow>({
        prefix,
      })
    ) {
      await this.kv.delete(entry.key);
    }

    let stored = 0;
    for (const turn of session.turns) {
      for (let callIndex = 0; callIndex < turn.toolCalls.length; callIndex++) {
        const call = turn.toolCalls[callIndex];
        const toolResult = findToolResultForCall(turn, call);
        const row = compactToolCallRow({
          sourceRoot: normalizedSourceRoot,
          sourcePath: session.sourcePath,
          contentHash,
          sessionId: session.sessionId,
          sessionShortId: session.shortId,
          sessionStartedAt: session.startedAt,
          agentId: session.agentId,
          sessionKind: session.sessionKind,
          turnIndex: turn.index,
          callIndex,
          timestamp: call.timestamp ?? turn.timestamp,
          modelId: turn.modelId ?? session.modelId,
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          args: call.args,
          family: call.family,
          l2Hit: call.l2Hit,
          l2FallbackReason: call.l2FallbackReason,
          l2Context: call.l2Context,
          userIntent: turn.userIntent,
          userProvenance: turn.userProvenance,
          assistantFinalText: turn.assistantFinalText,
          assistantThinking: turn.assistantThinking,
          parentPlanHint: turn.parentPlanHint,
          toolResultContent: toolResult?.content,
          toolResultDetails: toolResult?.details,
          toolResultIsError: toolResult?.isError,
        });
        await this.kv.set([
          ...prefix,
          padIndex(turn.index),
          padIndex(callIndex),
        ], row);
        stored++;
      }
    }

    const sessionRow: ImportedOpenClawSessionRow = {
      sourceRoot: normalizedSourceRoot,
      sourcePath: session.sourcePath,
      contentHash,
      sessionId: session.sessionId,
      sessionShortId: session.shortId,
      sessionStartedAt: session.startedAt,
      agentId: session.agentId,
      modelId: session.modelId,
      sessionKind: session.sessionKind,
      sessionProvenance: session.sessionProvenance,
      sessionCwd: session.sessionCwd,
      importedAt,
      turnCount: session.turns.length,
      toolCallCount: stored,
    };
    await this.kv.set([
      "vault",
      "openclaw",
      "sessions",
      normalizedSourceRoot,
      session.sessionId,
    ], sessionRow);

    return stored;
  }

  async deleteSession(sourceRoot: string, sessionId: string): Promise<void> {
    const normalizedSourceRoot = normalizePath(sourceRoot);
    const toolCallPrefix: Deno.KvKey = [
      "vault",
      "openclaw",
      "tool_calls",
      normalizedSourceRoot,
      sessionId,
    ];

    for await (
      const entry of this.kv.list<ImportedOpenClawToolCallRow>({
        prefix: toolCallPrefix,
      })
    ) {
      await this.kv.delete(entry.key);
    }

    await this.kv.delete([
      "vault",
      "openclaw",
      "sessions",
      normalizedSourceRoot,
      sessionId,
    ]);
  }

  async listSessions(): Promise<ImportedOpenClawSessionRow[]> {
    const rows: ImportedOpenClawSessionRow[] = [];
    for await (
      const entry of this.kv.list<ImportedOpenClawSessionRow>({
        prefix: ["vault", "openclaw", "sessions"],
      })
    ) {
      rows.push(entry.value);
    }
    rows.sort(compareSessionRows);
    return rows;
  }

  async listToolCalls(): Promise<ImportedOpenClawToolCallRow[]> {
    const rows: ImportedOpenClawToolCallRow[] = [];
    for await (
      const entry of this.kv.list<ImportedOpenClawToolCallRow>({
        prefix: ["vault", "openclaw", "tool_calls"],
      })
    ) {
      rows.push(entry.value);
    }
    rows.sort(compareRows);
    return rows;
  }
}
