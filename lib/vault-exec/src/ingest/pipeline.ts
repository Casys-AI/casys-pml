import { loadTraceConfig } from "../config/trace-config.ts";
import { getServicePaths } from "../service/lifecycle.ts";
import { OpenClawLocalStore } from "./local-store.ts";
import {
  loadSourceScanState,
  saveSourceScanState,
  scanSourceFilesForChanges,
  type SourceFileState,
  type SourceScanState,
} from "./source-state.ts";
import { parseOpenClawSessionFile } from "./parser.ts";
import { deriveToolGraphEntities } from "./tool-graph/entities.ts";
import { projectToolGraph } from "./tool-graph/projection.ts";

export interface IncrementalOpenClawImportOptions {
  vaultPath: string;
  dbPath?: string;
}

export interface IncrementalOpenClawImportResult {
  configuredSources: number;
  changedFiles: number;
  unchangedFiles: number;
  sessionsImported: number;
  toolCallsStored: number;
  warnings: string[];
}

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/g, "") || "/";
}

async function resolveSourceRoot(sourcePath: string): Promise<string> {
  const normalized = normalizePath(sourcePath);
  return normalizePath(await Deno.realPath(normalized).catch(() => normalized));
}

function isFileUnderSource(filePath: string, sourceRoot: string): boolean {
  return filePath === sourceRoot || filePath.startsWith(`${sourceRoot}/`);
}

function stateForSource(
  allFiles: Record<string, SourceFileState>,
  sourceRoot: string,
): SourceScanState {
  const files: Record<string, SourceFileState> = {};
  for (const [path, state] of Object.entries(allFiles)) {
    if (isFileUnderSource(path, sourceRoot)) {
      files[path] = state;
    }
  }
  return { version: 1, files };
}

function replaceSourceState(
  allFiles: Record<string, SourceFileState>,
  sourceRoot: string,
  nextFiles: Record<string, SourceFileState>,
): Record<string, SourceFileState> {
  const merged: Record<string, SourceFileState> = {};
  for (const [path, state] of Object.entries(allFiles)) {
    if (!isFileUnderSource(path, sourceRoot)) {
      merged[path] = state;
    }
  }
  for (const [path, state] of Object.entries(nextFiles)) {
    merged[path] = state;
  }
  return merged;
}

function warnForEmptySession(filePath: string): string {
  return `[ingest/pipeline] Skipping ${filePath}: no importable turns found`;
}

function warnForSource(sourcePath: string, error: unknown): string {
  return `[ingest/pipeline] Skipping source ${sourcePath}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

export async function runIncrementalOpenClawImport(
  options: IncrementalOpenClawImportOptions,
): Promise<IncrementalOpenClawImportResult> {
  const config = await loadTraceConfig(options.vaultPath);
  const previousState = await loadSourceScanState(options.vaultPath);
  const servicePaths = await getServicePaths(options.vaultPath);
  const dbPath = options.dbPath ?? servicePaths.vaultDbPath;
  const warnings: string[] = [];
  let files = { ...previousState.files };

  const result: IncrementalOpenClawImportResult = {
    configuredSources: config.traceSources.length,
    changedFiles: 0,
    unchangedFiles: 0,
    sessionsImported: 0,
    toolCallsStored: 0,
    warnings,
  };

  const store = await OpenClawLocalStore.open(dbPath);

  try {
    for (const source of config.traceSources) {
      let sourceRoot: string;
      let scan;
      try {
        sourceRoot = await resolveSourceRoot(source.path);
        scan = await scanSourceFilesForChanges(
          sourceRoot,
          stateForSource(files, sourceRoot),
        );
      } catch (error) {
        warnings.push(warnForSource(source.path, error));
        continue;
      }

      files = replaceSourceState(files, sourceRoot, scan.nextState.files);
      result.changedFiles += scan.changed.length;
      result.unchangedFiles += scan.unchanged.length;

      for (const fileState of scan.changed) {
        const parsed = await parseOpenClawSessionFile(fileState.path);
        if (parsed.turns.length === 0) {
          warnings.push(warnForEmptySession(fileState.path));
          files[fileState.path] = {
            ...fileState,
            importedAt: null,
            status: "failed",
          };
          continue;
        }

        const importedAt = new Date().toISOString();
        const stored = await store.replaceSession(
          sourceRoot,
          fileState.contentHash,
          parsed,
        );
        files[fileState.path] = {
          ...fileState,
          importedAt,
          status: "imported",
        };
        result.sessionsImported++;
        result.toolCallsStored += stored;
      }
    }

    const rows = await store.listToolCalls();
    const entities = deriveToolGraphEntities(rows);
    await projectToolGraph(options.vaultPath, entities);
  } finally {
    store.close();
  }

  await saveSourceScanState(options.vaultPath, {
    version: 1,
    files,
  });

  return result;
}
