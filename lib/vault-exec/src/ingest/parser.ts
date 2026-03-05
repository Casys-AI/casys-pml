import { classifyToolFamily } from "./families.ts";
import type {
  JsonObject,
  ParsedOpenClawSession,
  ParsedOpenClawTurn,
  ParsedToolCall,
} from "./types.ts";

function basenamePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  if (line.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(line);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseArgs(raw: unknown): JsonObject {
  if (isObject(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return isObject(parsed) ? parsed : { raw };
    } catch {
      return { raw };
    }
  }
  return {};
}

function normalizeText(text: string): string {
  return text.replace(/\[\[reply_to_current\]\]\s*/g, "").trim();
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return normalizeText(content);
  }
  if (!Array.isArray(content)) return "";

  const chunks: string[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    const type = typeof block.type === "string" ? block.type : "";
    if (type !== "text") continue;
    const text = block.text;
    if (typeof text === "string" && text.trim().length > 0) {
      chunks.push(text.trim());
    }
  }

  return normalizeText(chunks.join("\n"));
}

function thinkingFromContent(content: unknown): string[] {
  if (!Array.isArray(content)) return [];

  const thoughts: string[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    if (block.type !== "thinking") continue;
    if (
      typeof block.thinking === "string" && block.thinking.trim().length > 0
    ) {
      thoughts.push(block.thinking.trim());
    }
  }

  return thoughts;
}

function extractToolCalls(message: Record<string, unknown>): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const seen = new Set<string>();

  const addCall = (
    toolName: unknown,
    argsRaw: unknown,
    toolCallId?: unknown,
  ) => {
    if (typeof toolName !== "string" || toolName.trim().length === 0) return;
    const args = parseArgs(argsRaw);
    const id = typeof toolCallId === "string" ? toolCallId : undefined;
    const key = `${id ?? ""}|${toolName}|${JSON.stringify(args)}`;
    if (seen.has(key)) return;
    seen.add(key);
    calls.push({
      toolName,
      toolCallId: id,
      args,
      family: classifyToolFamily(toolName, args),
    });
  };

  const content = message.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!isObject(block)) continue;
      const type = typeof block.type === "string" ? block.type : "";
      if (type === "toolCall") {
        addCall(block.name, block.arguments, block.id);
      } else if (type === "tool_use") {
        addCall(block.name, block.input, block.id);
      }
    }
  }

  const toolCalls = message.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const entry of toolCalls) {
      if (!isObject(entry)) continue;
      const fn = isObject(entry.function) ? entry.function : undefined;
      addCall(fn?.name, fn?.arguments, entry.id);
    }
  }

  if (isObject(message.toolCall)) {
    const tc = message.toolCall;
    addCall(tc.name, tc.arguments ?? tc.input, tc.id);
  }

  return calls;
}

function deriveAgentId(sourcePath: string): string | undefined {
  const match = /[\\/]agents[\\/]([^\\/]+)[\\/]/.exec(sourcePath);
  return match?.[1];
}

function deriveSessionId(sourcePath: string): string {
  return basenamePath(sourcePath).replace(/\.jsonl$/i, "") || "unknown-session";
}

function deriveShortId(sessionId: string): string {
  const first = sessionId.split("-")[0] ?? sessionId;
  const cleaned = first.replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned.length > 0 ? cleaned : sessionId.replace(/[^a-zA-Z0-9]/g, ""))
    .slice(0, 8) || "session";
}

function finalizeTurn(
  turn: ParsedOpenClawTurn | null,
): ParsedOpenClawTurn | null {
  if (!turn) return null;
  const hasSignal = turn.userIntent.trim().length > 0 ||
    turn.toolCalls.length > 0 ||
    turn.toolResults.length > 0 ||
    (turn.assistantFinalText?.trim().length ?? 0) > 0;

  if (!hasSignal) return null;
  if (!turn.assistantThinking || turn.assistantThinking.length === 0) {
    delete turn.assistantThinking;
  }
  return turn;
}

export function parseOpenClawSessionLines(
  lines: string[],
  sourcePath: string,
): ParsedOpenClawSession {
  let sessionId = deriveSessionId(sourcePath);
  let startedAt: string | undefined;
  let modelId: string | undefined;
  let currentModel: string | undefined;

  const turns: ParsedOpenClawTurn[] = [];
  let currentTurn: ParsedOpenClawTurn | null = null;

  const pushCurrentTurn = () => {
    const finalized = finalizeTurn(currentTurn);
    if (finalized) {
      finalized.index = turns.length + 1;
      turns.push(finalized);
    }
    currentTurn = null;
  };

  const ensureTurn = (timestamp?: string) => {
    if (!currentTurn) {
      currentTurn = {
        index: turns.length + 1,
        timestamp,
        userIntent: "",
        toolCalls: [],
        toolResults: [],
        assistantThinking: [],
        modelId: currentModel,
      };
    }
    return currentTurn;
  };

  for (const line of lines) {
    const event = parseJsonLine(line);
    if (!event) continue;

    if (event.type === "session") {
      if (typeof event.id === "string" && event.id.length > 0) {
        sessionId = event.id;
      }
      if (typeof event.timestamp === "string") {
        startedAt = event.timestamp;
      }
      continue;
    }

    if (event.type === "model_change") {
      if (typeof event.modelId === "string" && event.modelId.length > 0) {
        currentModel = event.modelId;
        modelId = event.modelId;
      }
      continue;
    }

    if (event.type !== "message") continue;
    const message = isObject(event.message) ? event.message : null;
    if (!message) continue;

    const role = typeof message.role === "string" ? message.role : "";
    const eventTimestamp = typeof event.timestamp === "string"
      ? event.timestamp
      : undefined;

    if (role === "user") {
      if (currentTurn) pushCurrentTurn();
      currentTurn = {
        index: turns.length + 1,
        timestamp: eventTimestamp,
        userIntent: textFromContent(message.content),
        toolCalls: [],
        toolResults: [],
        assistantThinking: [],
        modelId: currentModel,
      };
      continue;
    }

    if (role === "assistant") {
      const turn = ensureTurn(eventTimestamp);
      if (!turn.timestamp) turn.timestamp = eventTimestamp;
      if (!turn.modelId && currentModel) turn.modelId = currentModel;

      const thinking = thinkingFromContent(message.content);
      if (thinking.length > 0) {
        turn.assistantThinking ??= [];
        turn.assistantThinking.push(...thinking);
        if (!turn.parentPlanHint) {
          turn.parentPlanHint = thinking[0];
        }
      }

      const toolCalls = extractToolCalls(message);
      for (const call of toolCalls) {
        turn.toolCalls.push({
          ...call,
          timestamp: eventTimestamp,
        });
      }

      const text = textFromContent(message.content);
      if (text.length > 0) {
        turn.assistantFinalText = text;
      }

      continue;
    }

    if (role === "toolResult") {
      const turn = ensureTurn(eventTimestamp);
      const toolName = typeof message.toolName === "string"
        ? message.toolName
        : "unknown";
      const toolCallId = typeof message.toolCallId === "string"
        ? message.toolCallId
        : undefined;

      turn.toolResults.push({
        toolName,
        toolCallId,
        content: message.content,
        isError: message.isError === true,
        timestamp: eventTimestamp,
      });
    }
  }

  if (currentTurn) pushCurrentTurn();

  return {
    sessionId,
    shortId: deriveShortId(sessionId),
    sourcePath,
    startedAt,
    modelId,
    agentId: deriveAgentId(sourcePath),
    turns,
  };
}

export async function parseOpenClawSessionFile(
  sessionPath: string,
): Promise<ParsedOpenClawSession> {
  const raw = await Deno.readTextFile(sessionPath);
  const lines = raw.split(/\r?\n/);
  return parseOpenClawSessionLines(lines, sessionPath);
}
