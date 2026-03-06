import { DenoVaultWriter } from "../../infrastructure/fs/deno-vault-fs.ts";
import type { ToolGraphEntity } from "./entities.ts";

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/g, "") || "/";
}

function renderFrontmatter(entity: ToolGraphEntity): string {
  return [
    "---",
    `tool_graph_key: ${entity.key}`,
    `tool_graph_level: ${entity.level}`,
    `tool_graph_kind: ${entity.kind}`,
    "version: 1",
    "---",
  ].join("\n");
}

function renderMetaJson(entity: ToolGraphEntity): string {
  return JSON.stringify({
    totalOccurrences: entity.totalOccurrences,
    uniqueSessions: entity.uniqueSessions,
    uniqueAgents: entity.uniqueAgents,
    l2Hits: entity.l2Hits,
    l2Fallbacks: entity.l2Fallbacks,
    sourceCounts: entity.sourceCounts,
    agentCounts: entity.agentCounts,
    sessionCounts: entity.sessionCounts,
  }, null, 2);
}

export function resolveToolGraphNotePath(
  vaultPath: string,
  entity: ToolGraphEntity,
): string {
  return `${normalizePath(vaultPath)}/tool-graph/l${entity.level}/${entity.key}.md`;
}

export function renderToolGraphNote(entity: ToolGraphEntity): string {
  const sections = [
    renderFrontmatter(entity),
    "",
    `# ${entity.key}`,
    "",
    "## Summary",
    `- Total occurrences: ${entity.totalOccurrences}`,
    `- Unique sessions: ${entity.uniqueSessions}`,
    `- Unique agents: ${entity.uniqueAgents}`,
    `- L2 hits: ${entity.l2Hits}`,
    `- L2 fallbacks: ${entity.l2Fallbacks}`,
    "",
    "## Graph",
    `- Parent: ${entity.parentKey ? `[[${entity.parentKey}]]` : "none"}`,
    `- Children: ${
      entity.childKeys.length > 0
        ? entity.childKeys.map((key) => `[[${key}]]`).join(", ")
        : "none"
    }`,
    "",
    "## Tool Graph Meta",
    "```json",
    renderMetaJson(entity),
    "```",
    "",
  ];

  return sections.join("\n");
}

export async function projectToolGraph(
  vaultPath: string,
  entities: ToolGraphEntity[],
): Promise<string[]> {
  const writer = new DenoVaultWriter();
  const writtenPaths: string[] = [];

  for (const entity of entities) {
    const notePath = resolveToolGraphNotePath(vaultPath, entity);
    await writer.writeNote(notePath, renderToolGraphNote(entity));
    writtenPaths.push(notePath);
  }

  return writtenPaths;
}
