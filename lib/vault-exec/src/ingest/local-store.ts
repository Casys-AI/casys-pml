import type {
  ImportedOpenClawSessionRow,
  ImportedOpenClawToolCallRow,
  ParsedOpenClawSession,
  ParsedOpenClawTurn,
  ParsedToolCall,
  ParsedToolResult,
} from "./types.ts";

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
        const row: ImportedOpenClawToolCallRow = {
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
        };
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
