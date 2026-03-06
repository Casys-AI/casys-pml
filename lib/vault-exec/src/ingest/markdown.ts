<<<<<<< HEAD
import type {
  L2CoverageReport,
  ParsedOpenClawSession,
  ToolAggregate,
} from "./types.ts";
import { resolveSessionDate } from "./session-date.ts";

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function yamlList(values: string[], indent = 0): string {
  const pad = " ".repeat(indent);
  return values.map((value) => `${pad}- ${value}`).join("\n");
}

function normalizeText(text?: string): string {
  if (!text || text.trim().length === 0) return "(none)";
  return text.trim();
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function generateSessionMarkdown(
  session: ParsedOpenClawSession,
): string {
  const date = resolveSessionDate(session.startedAt);

  const frontmatter = [
    "---",
    "vault-exec:",
    "  type: trace-session",
    `  session_id: ${session.sessionId}`,
    `  short_id: ${session.shortId}`,
    `  date: ${date}`,
    `  turn_count: ${session.turns.length}`,
    ...(session.agentId ? [`  agent: ${session.agentId}`] : []),
    ...(session.modelId ? [`  model: ${session.modelId}`] : []),
    "---",
    "",
  ].join("\n");

  const sections: string[] = [];
  sections.push(`# Session ${session.shortId}`);
  sections.push("");
  sections.push(`- Session ID: \`${session.sessionId}\``);
  sections.push(`- Source: \`${session.sourcePath}\``);
  sections.push(`- Started: ${session.startedAt ?? "unknown"}`);
  sections.push("");

  for (const turn of session.turns) {
    sections.push(`## Turn ${turn.index}`);
    sections.push("");
    sections.push("## User Intent");
    sections.push(normalizeText(turn.userIntent));
    sections.push("");

    if (turn.parentPlanHint) {
      sections.push("## Parent Plan Hint");
      sections.push(turn.parentPlanHint);
      sections.push("");
    }

    sections.push("## Tool Chain");
    if (turn.toolCalls.length === 0) {
      sections.push("(none)");
      sections.push("");
    } else {
      for (let i = 0; i < turn.toolCalls.length; i++) {
        const call = turn.toolCalls[i];
        const l2Label = call.family
          ? `family: ${call.family}`
          : `fallback: ${call.l2FallbackReason ?? "unknown"}`;
        const familyPart = ` [${l2Label}]`;
        sections.push(`${i + 1}. \`${call.toolName}\`${familyPart}`);
        if (call.l2Context) {
          sections.push("- L2 context:");
          sections.push("```json");
          sections.push(toJson(call.l2Context));
          sections.push("```");
        }
        sections.push("```json");
        sections.push(toJson(call.args));
        sections.push("```");
      }
      sections.push("");
    }

    sections.push("### Tool Results");
    if (turn.toolResults.length === 0) {
      sections.push("(none)");
      sections.push("");
    } else {
      for (let i = 0; i < turn.toolResults.length; i++) {
        const result = turn.toolResults[i];
        const status = result.isError ? "error" : "ok";
        sections.push(
          `${i + 1}. \`${result.toolName}\` (${status})${
            result.toolCallId ? ` id=${result.toolCallId}` : ""
          }`,
        );
        sections.push("```json");
        sections.push(toJson(result.content));
        sections.push("```");
      }
      sections.push("");
    }

    sections.push("## Assistant Final Text");
    sections.push(normalizeText(turn.assistantFinalText));
    sections.push("");
  }

  return `${frontmatter}${sections.join("\n")}`.trimEnd() + "\n";
}

export function generateToolMarkdown(tool: ToolAggregate): string {
  const families = [...tool.familyCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const frontmatter = [
    "---",
    "vault-exec:",
    "  type: trace-tool",
    `  tool: ${tool.toolName}`,
    `  invocation_count: ${tool.invocationCount}`,
    "tags:",
    ...(tool.tags.length > 0
      ? yamlList(tool.tags, 2).split("\n")
      : ["  - tool/unknown"]),
    "---",
    "",
  ].join("\n");

  const sections: string[] = [];
  sections.push(`# Tool ${tool.toolName}`);
  sections.push("");
  sections.push(`- Total invocations: ${tool.invocationCount}`);
  sections.push(`- L2 hit: ${tool.l2HitCount}`);
  sections.push(`- L2 fallback: ${tool.l2FallbackCount}`);
  sections.push(
    `- L2 hit rate: ${
      percent(
        tool.invocationCount === 0 ? 0 : tool.l2HitCount / tool.invocationCount,
      )
    }`,
  );
  sections.push("");

  sections.push("## L2 Families");
  if (families.length === 0) {
    sections.push("(none)");
  } else {
    for (const [family, count] of families) {
      sections.push(`- ${family}: ${count}`);
    }
  }
  sections.push("");

  sections.push("## L2 Fallbacks");
  if (tool.fallbackReasons.size === 0) {
    sections.push("(none)");
  } else {
    const reasons = [...tool.fallbackReasons.entries()].sort((a, b) =>
      b[1] - a[1] || a[0].localeCompare(b[0])
    );
    for (const [reason, count] of reasons) {
      sections.push(`- ${reason}: ${count}`);
    }
  }
  sections.push("");

  sections.push("## Iterations");
  if (tool.invocations.length === 0) {
    sections.push("(none)");
    sections.push("");
  } else {
    for (let i = 0; i < tool.invocations.length; i++) {
      const invocation = tool.invocations[i];
      sections.push(`### ${i + 1}`);
      sections.push(
        `- Session: \`${invocation.sessionDate}-${invocation.sessionShortId}\` (turn ${invocation.turnIndex})`,
      );
      if (invocation.family) {
        sections.push(`- Family: ${invocation.family}`);
      } else if (invocation.l2FallbackReason) {
        sections.push(`- L2 fallback: ${invocation.l2FallbackReason}`);
      }
      if (invocation.l2Context) {
        sections.push("- L2 context:");
        sections.push("```json");
        sections.push(toJson(invocation.l2Context));
        sections.push("```");
      }
      if (invocation.parentPlanHint) {
        sections.push(`- Parent hint: ${invocation.parentPlanHint}`);
      }
      sections.push("- Args:");
      sections.push("```json");
      sections.push(toJson(invocation.args));
      sections.push("```");

      if (invocation.result) {
        sections.push(
          `- Result: ${invocation.result.isError ? "error" : "ok"}`,
        );
        sections.push("```json");
        sections.push(toJson(invocation.result.content));
        sections.push("```");
      }

      sections.push("");
    }
  }

  return `${frontmatter}${sections.join("\n")}`.trimEnd() + "\n";
}

export function toolFileName(toolName: string): string {
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")
    .replace(
      /^-+|-+$/g,
      "",
    );
  return `${normalized || "tool"}.md`;
}

export function generateCoverageMarkdown(report: L2CoverageReport): string {
  const sections: string[] = [];
  sections.push("# L2 Coverage Report");
  sections.push("");
  sections.push(`- Total tool calls: ${report.totalCalls}`);
  sections.push(`- L2 hits: ${report.totalHits}`);
  sections.push(`- L2 fallbacks: ${report.totalFallbacks}`);
  sections.push(`- L2 hit rate: ${percent(report.hitRate)}`);
  sections.push("");
  sections.push("## Per Tool");
  if (report.tools.length === 0) {
    sections.push("(none)");
  } else {
    for (const tool of report.tools) {
      sections.push(
        `- ${tool.toolName}: total=${tool.total}, hit=${tool.hits}, fallback=${tool.fallbacks}, hit_rate=${
          percent(tool.hitRate)
        }${tool.supported ? "" : " (unsupported)"}`,
      );
    }
  }
  sections.push("");
  return `${sections.join("\n").trimEnd()}\n`;
}
