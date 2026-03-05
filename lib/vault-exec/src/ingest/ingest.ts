import { buildToolAggregates } from "./aggregate.ts";
import {
  generateSessionMarkdown,
  generateToolMarkdown,
  toolFileName,
} from "./markdown.ts";
import { parseOpenClawSessionFile } from "./parser.ts";
import type { ParsedOpenClawSession } from "./types.ts";

export interface IngestOpenClawOptions {
  sourcePath: string;
  outputPath: string;
}

export interface IngestOpenClawResult {
  sessionsProcessed: number;
  toolsProcessed: number;
  sessionFiles: string[];
  toolFiles: string[];
}

function joinPath(...parts: string[]): string {
  const normalized = parts
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (index === 0) return part.replace(/\/+$/g, "");
      return part.replace(/^\/+|\/+$/g, "");
    });
  return normalized.join("/");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectJsonlFiles(sourcePath: string): Promise<string[]> {
  const info = await Deno.stat(sourcePath);
  if (info.isFile) {
    if (sourcePath.toLowerCase().endsWith(".jsonl")) {
      return [sourcePath];
    }
    throw new Error(`Source file is not a .jsonl file: ${sourcePath}`);
  }

  const files: string[] = [];
  for await (const entry of Deno.readDir(sourcePath)) {
    const fullPath = joinPath(sourcePath, entry.name);
    if (entry.isDirectory) {
      files.push(...(await collectJsonlFiles(fullPath)));
      continue;
    }
    if (entry.isFile && entry.name.toLowerCase().endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function sessionDate(iso?: string): string {
  if (iso && iso.length >= 10) return iso.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function sessionFileName(session: ParsedOpenClawSession): string {
  return `${sessionDate(session.startedAt)}-${session.shortId}.md`;
}

export async function ingestOpenClawSessions(
  options: IngestOpenClawOptions,
): Promise<IngestOpenClawResult> {
  if (!(await fileExists(options.sourcePath))) {
    throw new Error(`Source path not found: ${options.sourcePath}`);
  }

  const sessionFiles = await collectJsonlFiles(options.sourcePath);
  const sessions: ParsedOpenClawSession[] = [];

  for (const file of sessionFiles) {
    const parsed = await parseOpenClawSessionFile(file);
    if (parsed.turns.length === 0) continue;
    sessions.push(parsed);
  }

  sessions.sort((a, b) => {
    const left = `${a.startedAt ?? ""}-${a.sessionId}`;
    const right = `${b.startedAt ?? ""}-${b.sessionId}`;
    return left.localeCompare(right);
  });

  const aggregates = buildToolAggregates(sessions);
  const toolsDir = joinPath(options.outputPath, "tools");
  const sessionsDir = joinPath(options.outputPath, "sessions");

  await Deno.mkdir(toolsDir, { recursive: true });
  await Deno.mkdir(sessionsDir, { recursive: true });

  const writtenSessionFiles: string[] = [];
  for (const session of sessions) {
    const path = joinPath(sessionsDir, sessionFileName(session));
    await Deno.writeTextFile(path, generateSessionMarkdown(session));
    writtenSessionFiles.push(path);
  }

  const writtenToolFiles: string[] = [];
  const toolEntries = [...aggregates.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [toolName, aggregate] of toolEntries) {
    const path = joinPath(toolsDir, toolFileName(toolName));
    await Deno.writeTextFile(path, generateToolMarkdown(aggregate));
    writtenToolFiles.push(path);
  }

  return {
    sessionsProcessed: sessions.length,
    toolsProcessed: aggregates.size,
    sessionFiles: writtenSessionFiles,
    toolFiles: writtenToolFiles,
  };
}
