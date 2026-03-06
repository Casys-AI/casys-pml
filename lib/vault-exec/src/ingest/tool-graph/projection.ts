import { DenoVaultWriter } from "../../infrastructure/fs/deno-vault-fs.ts";
import type { ToolGraphEntity } from "./entities.ts";

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/g, "") || "/";
}

async function collectProjectedNotePaths(
  path: string,
  out: string[],
): Promise<void> {
  let entries: AsyncIterable<Deno.DirEntry>;
  try {
    entries = Deno.readDir(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return;
    }
    throw error;
  }

  for await (const entry of entries) {
    const entryPath = `${path}/${entry.name}`;
    if (entry.isDirectory) {
      await collectProjectedNotePaths(entryPath, out);
      continue;
    }
    if (entry.isFile && entry.name.toLowerCase().endsWith(".md")) {
      out.push(entryPath);
    }
  }
}

function relativeToolNotePath(key: string): string {
  const parts = key.split(".");
  const toolSegments = parts.slice(1);
  if (toolSegments.length === 0) {
    return "tools/unknown/unknown";
  }
  const noteName = toolSegments[toolSegments.length - 1] ?? "unknown";
  return `tools/${toolSegments.join("/")}/${noteName}`;
}

function toolLinkLabel(key: string): string {
  const parts = key.split(".");
  return parts[parts.length - 1] ?? key;
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

function renderTransitionLines(
  transitions: Record<string, number>,
): string[] {
  const entries = Object.entries(transitions).sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0])
  );
  if (entries.length === 0) {
    return ["none"];
  }

  return entries.map(([key, count]) =>
    `- [[${relativeToolNotePath(key)}|${toolLinkLabel(key)}]] (${count})`
  );
}

export function resolveToolGraphNotePath(
  vaultPath: string,
  entity: ToolGraphEntity,
): string {
  return `${normalizePath(vaultPath)}/${relativeToolNotePath(entity.key)}.md`;
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
    "## Next",
    ...renderTransitionLines(entity.nextTransitions),
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
  const normalizedVaultPath = normalizePath(vaultPath);
  const projectionRoot = `${normalizedVaultPath}/tools`;
  const legacyProjectionRoot = `${normalizedVaultPath}/tool-graph`;
  const writtenPaths: string[] = [];
  const nextPaths = new Set<string>();

  for (const entity of entities) {
    const notePath = resolveToolGraphNotePath(vaultPath, entity);
    await writer.writeNote(notePath, renderToolGraphNote(entity));
    writtenPaths.push(notePath);
    nextPaths.add(notePath);
  }

  const existingPaths: string[] = [];
  await collectProjectedNotePaths(projectionRoot, existingPaths);
  for (const existingPath of existingPaths) {
    if (!nextPaths.has(existingPath)) {
      await Deno.remove(existingPath);
    }
  }

  try {
    await Deno.remove(legacyProjectionRoot, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  return writtenPaths;
}
