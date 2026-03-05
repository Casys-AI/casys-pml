import type {
  L2CoverageReport,
  ParsedOpenClawSession,
  ToolCoverage,
} from "./types.ts";
import { isToolPolicySupported } from "./policy.ts";

interface MutableCoverage {
  total: number;
  hits: number;
  supported: boolean;
}

export function buildL2CoverageReport(
  sessions: ParsedOpenClawSession[],
): L2CoverageReport {
  const byTool = new Map<string, MutableCoverage>();
  let totalCalls = 0;
  let totalHits = 0;

  for (const session of sessions) {
    for (const turn of session.turns) {
      for (const call of turn.toolCalls) {
        totalCalls += 1;
        if (call.l2Hit) totalHits += 1;

        let entry = byTool.get(call.toolName);
        if (!entry) {
          entry = {
            total: 0,
            hits: 0,
            supported: isToolPolicySupported(call.toolName),
          };
          byTool.set(call.toolName, entry);
        }

        entry.total += 1;
        if (call.l2Hit) entry.hits += 1;
      }
    }
  }

  const tools: ToolCoverage[] = [...byTool.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([toolName, value]) => {
      const fallbacks = value.total - value.hits;
      return {
        toolName,
        supported: value.supported,
        total: value.total,
        hits: value.hits,
        fallbacks,
        hitRate: value.total === 0 ? 0 : value.hits / value.total,
      };
    });

  const totalFallbacks = totalCalls - totalHits;

  return {
    totalCalls,
    totalHits,
    totalFallbacks,
    hitRate: totalCalls === 0 ? 0 : totalHits / totalCalls,
    tools,
  };
}
