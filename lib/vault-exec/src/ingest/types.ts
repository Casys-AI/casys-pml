export type ToolFamily = string;

export type JsonObject = Record<string, unknown>;

export interface ParsedToolCall {
  toolName: string;
  toolCallId?: string;
  args: JsonObject;
  timestamp?: string;
  family: ToolFamily | null;
  l2Hit: boolean;
  l2FallbackReason?: string;
  l2Context?: JsonObject;
}

export interface ParsedToolResult {
  toolCallId?: string;
  toolName: string;
  content: unknown;
  details?: unknown;
  isError: boolean;
  timestamp?: string;
}

export interface ParsedOpenClawTurn {
  index: number;
  timestamp?: string;
  userIntent: string;
  userProvenance?: JsonObject;
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
  sessionKind?: "top_level" | "subagent";
  sessionProvenance?: JsonObject;
  sessionCwd?: string;
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
  l2Hit: boolean;
  l2FallbackReason?: string;
  l2Context?: JsonObject;
  parentPlanHint?: string;
  result?: ParsedToolResult;
}

export interface ToolAggregate {
  toolName: string;
  invocationCount: number;
  l2HitCount: number;
  l2FallbackCount: number;
  familyCounts: Map<string, number>;
  fallbackReasons: Map<string, number>;
  invocations: ToolInvocation[];
  tags: string[];
}

export interface ToolCoverage {
  toolName: string;
  supported: boolean;
  total: number;
  hits: number;
  fallbacks: number;
  hitRate: number;
}

export interface L2CoverageReport {
  totalCalls: number;
  totalHits: number;
  totalFallbacks: number;
  hitRate: number;
  tools: ToolCoverage[];
}

export interface ImportedOpenClawToolCallRow {
  sourceRoot: string;
  sourcePath: string;
  contentHash: string;
  sessionId: string;
  sessionShortId: string;
  sessionStartedAt?: string;
  agentId?: string;
  sessionKind?: "top_level" | "subagent";
  turnIndex: number;
  callIndex: number;
  timestamp?: string;
  modelId?: string;
  toolName: string;
  toolCallId?: string;
  args: JsonObject;
  family: ToolFamily | null;
  l2Hit: boolean;
  l2FallbackReason?: string;
  l2Context?: JsonObject;
  userIntent: string;
  userProvenance?: JsonObject;
  assistantFinalText?: string;
  assistantThinking?: string[];
  parentPlanHint?: string;
  toolResultContent?: unknown;
  toolResultDetails?: unknown;
  toolResultIsError?: boolean;
}

export interface ImportedOpenClawSessionRow {
  sourceRoot: string;
  sourcePath: string;
  contentHash: string;
  sessionId: string;
  sessionShortId: string;
  sessionStartedAt?: string;
  agentId?: string;
  modelId?: string;
  sessionKind?: "top_level" | "subagent";
  sessionProvenance?: JsonObject;
  sessionCwd?: string;
  importedAt: string;
  turnCount: number;
  toolCallCount: number;
}
