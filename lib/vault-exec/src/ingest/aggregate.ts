import type {
  ParsedOpenClawTurn,
  ParsedToolResult,
  ToolAggregate,
  ToolInvocation,
} from "./types.ts";
import type { ParsedOpenClawSession } from "./types.ts";

function sessionDate(iso?: string): string {
  if (iso && iso.length >= 10) return iso.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function pairResult(
  callId: string | undefined,
  toolName: string,
  turn: ParsedOpenClawTurn,
  consumed: Set<number>,
): ParsedToolResult | undefined {
  if (callId) {
    for (let i = 0; i < turn.toolResults.length; i++) {
      const result = turn.toolResults[i];
      if (consumed.has(i)) continue;
      if (result.toolCallId === callId) {
        consumed.add(i);
        return result;
      }
    }
  }

  for (let i = 0; i < turn.toolResults.length; i++) {
    const result = turn.toolResults[i];
    if (consumed.has(i)) continue;
    if (result.toolName === toolName) {
      consumed.add(i);
      return result;
    }
  }

  return undefined;
}

function buildTags(
  toolName: string,
  familyCounts: Map<string, number>,
): string[] {
  const tags = new Set<string>([`tool/${toolName}`]);
  for (const family of familyCounts.keys()) {
    tags.add(`family/${toolName}/${family}`);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function buildToolAggregates(
  sessions: ParsedOpenClawSession[],
): Map<string, ToolAggregate> {
  const aggregates = new Map<string, ToolAggregate>();

  for (const session of sessions) {
    const date = sessionDate(session.startedAt);

    for (const turn of session.turns) {
      const consumed = new Set<number>();
      for (const call of turn.toolCalls) {
        const result = pairResult(
          call.toolCallId,
          call.toolName,
          turn,
          consumed,
        );

        const invocation: ToolInvocation = {
          toolName: call.toolName,
          sessionId: session.sessionId,
          sessionShortId: session.shortId,
          sessionDate: date,
          turnIndex: turn.index,
          timestamp: call.timestamp ?? turn.timestamp,
          args: call.args,
          family: call.family,
          parentPlanHint: turn.parentPlanHint,
          result,
        };

        let aggregate = aggregates.get(call.toolName);
        if (!aggregate) {
          aggregate = {
            toolName: call.toolName,
            invocationCount: 0,
            familyCounts: new Map<string, number>(),
            invocations: [],
            tags: [],
          };
          aggregates.set(call.toolName, aggregate);
        }

        aggregate.invocations.push(invocation);
        aggregate.invocationCount += 1;
        if (call.family) {
          aggregate.familyCounts.set(
            call.family,
            (aggregate.familyCounts.get(call.family) ?? 0) + 1,
          );
        }
      }
    }
  }

  for (const aggregate of aggregates.values()) {
    aggregate.tags = buildTags(aggregate.toolName, aggregate.familyCounts);
  }

  return aggregates;
}
