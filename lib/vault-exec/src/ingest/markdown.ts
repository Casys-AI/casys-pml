import type { ParsedOpenClawSession, ToolAggregate } from "./types.ts";

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function yamlList(values: string[], indent = 0): string {
  const pad = " ".repeat(indent);
  return values.map((value) => `${pad}- ${value}`).join("\n");
}

function sessionDate(iso?: string): string {
  if (iso && iso.length >= 10) return iso.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(text?: string): string {
  if (!text || text.trim().length === 0) return "(none)";
  return text.trim();
}

export function generateSessionMarkdown(
  session: ParsedOpenClawSession,
): string {
  const date = sessionDate(session.startedAt);

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
        const familyPart = call.family ? ` [family: ${call.family}]` : "";
        sections.push(`${i + 1}. \`${call.toolName}\`${familyPart}`);
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
