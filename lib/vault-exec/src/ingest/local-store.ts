import type {
  ImportedOpenClawToolCallRow,
  ParsedOpenClawSession,
} from "./types.ts";

interface ImportedOpenClawSessionRow {
  sourceRoot: string;
  sourcePath: string;
  contentHash: string;
  sessionId: string;
  sessionShortId: string;
  sessionStartedAt?: string;
  agentId?: string;
  importedAt: string;
  turnCount: number;
  toolCallCount: number;
}

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
        const row: ImportedOpenClawToolCallRow = {
          sourceRoot: normalizedSourceRoot,
          sourcePath: session.sourcePath,
          contentHash,
          sessionId: session.sessionId,
          sessionShortId: session.shortId,
          sessionStartedAt: session.startedAt,
          agentId: session.agentId,
          turnIndex: turn.index,
          callIndex,
          timestamp: call.timestamp ?? turn.timestamp,
          toolName: call.toolName,
          family: call.family,
          l2Hit: call.l2Hit,
          l2FallbackReason: call.l2FallbackReason,
          parentPlanHint: turn.parentPlanHint,
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
