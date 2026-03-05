export type ExecCommandFamily =
  | "git"
  | "openclaw"
  | "python"
  | "docker"
  | "deno"
  | "gh"
  | "shell-utils"
  | "other";

export type WriteContentFamily =
  | "json"
  | "yaml"
  | "markdown"
  | "script"
  | "other";

export type ToolFamily = ExecCommandFamily | WriteContentFamily;

export type JsonObject = Record<string, unknown>;

export interface ParsedToolCall {
  toolName: string;
  toolCallId?: string;
  args: JsonObject;
  timestamp?: string;
  family: ToolFamily | null;
}

export interface ParsedToolResult {
  toolCallId?: string;
  toolName: string;
  content: unknown;
  isError: boolean;
  timestamp?: string;
}

export interface ParsedOpenClawTurn {
  index: number;
  timestamp?: string;
  userIntent: string;
  assistantFinalText?: string;
  assistantThinking?: string[];
  parentPlanHint?: string;
  modelId?: string;
  toolCalls: ParsedToolCall[];
  toolResults: ParsedToolResult[];
}

export interface ParsedOpenClawSession {
  sessionId: string;
  shortId: string;
  sourcePath: string;
  startedAt?: string;
  modelId?: string;
  agentId?: string;
  turns: ParsedOpenClawTurn[];
}

export interface ToolInvocation {
  toolName: string;
  sessionId: string;
  sessionShortId: string;
  sessionDate: string;
  turnIndex: number;
  timestamp?: string;
  args: JsonObject;
  family: ToolFamily | null;
  parentPlanHint?: string;
  result?: ParsedToolResult;
}

export interface ToolAggregate {
  toolName: string;
  invocationCount: number;
  familyCounts: Map<string, number>;
  invocations: ToolInvocation[];
  tags: string[];
}
