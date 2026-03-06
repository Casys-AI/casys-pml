import { resolveVaultStateDir } from "../service/lifecycle.ts";

export type SourceImportStatus = "pending" | "imported" | "failed";

export interface SourceFileState {
  path: string;
  size: number;
  mtimeMs: number | null;
  contentHash: string;
  sessionId: string;
  importedAt: string | null;
  status: SourceImportStatus;
}

export interface SourceScanState {
  version: 1;
  files: Record<string, SourceFileState>;
}

export interface SourceScanResult {
  changed: SourceFileState[];
  unchanged: SourceFileState[];
  nextState: SourceScanState;
}

const EMPTY_SOURCE_SCAN_STATE: SourceScanState = {
  version: 1,
  files: {},
};

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/, "") || "/";
}

function basenamePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function deriveSessionId(path: string): string {
  return basenamePath(path).replace(/\.jsonl$/i, "") || "unknown-session";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256Hex(content: Uint8Array): Promise<string> {
  const buffer = content.buffer instanceof ArrayBuffer
    ? content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    )
    : new Uint8Array(content).buffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function collectJsonlFiles(sourcePath: string): Promise<string[]> {
  const info = await Deno.stat(sourcePath);
  if (info.isFile) {
    if (sourcePath.toLowerCase().endsWith(".jsonl")) {
      return [normalizePath(await Deno.realPath(sourcePath).catch(() => sourcePath))];
    }
    throw new Error(`[source-state] Source file is not a .jsonl file: ${sourcePath}`);
  }

  const files: string[] = [];
  for await (const entry of Deno.readDir(sourcePath)) {
    const fullPath = `${normalizePath(sourcePath)}/${entry.name}`;
    if (entry.isDirectory) {
      files.push(...(await collectJsonlFiles(fullPath)));
      continue;
    }
    if (entry.isFile && entry.name.toLowerCase().endsWith(".jsonl")) {
      files.push(normalizePath(await Deno.realPath(fullPath).catch(() => fullPath)));
    }
  }
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

async function readSourceFileState(
  path: string,
  previous?: SourceFileState,
): Promise<SourceFileState> {
  const stat = await Deno.stat(path);
  const content = await Deno.readFile(path);
  const contentHash = await sha256Hex(content);
  const unchanged = previous?.contentHash === contentHash;

  return {
    path,
    size: stat.size,
    mtimeMs: stat.mtime?.getTime() ?? null,
    contentHash,
    sessionId: deriveSessionId(path),
    importedAt: unchanged ? previous?.importedAt ?? null : null,
    status: unchanged ? previous?.status ?? "pending" : "pending",
  };
}

export function resolveSourceScanStatePath(vaultPath: string): string {
  return `${resolveVaultStateDir(vaultPath)}/trace-source-state.json`;
}

export async function loadSourceScanState(
  vaultPath: string,
): Promise<SourceScanState> {
  const path = resolveSourceScanStatePath(vaultPath);
  if (!(await pathExists(path))) {
    return {
      version: EMPTY_SOURCE_SCAN_STATE.version,
      files: { ...EMPTY_SOURCE_SCAN_STATE.files },
    };
  }

  const raw = await Deno.readTextFile(path);
  const parsed = JSON.parse(raw) as Partial<SourceScanState>;
  if (parsed.version !== 1 || typeof parsed.files !== "object" || !parsed.files) {
    throw new Error(`[source-state] Invalid state file: ${path}`);
  }

  return {
    version: 1,
    files: parsed.files as Record<string, SourceFileState>,
  };
}

export async function saveSourceScanState(
  vaultPath: string,
  state: SourceScanState,
): Promise<void> {
  await Deno.mkdir(resolveVaultStateDir(vaultPath), { recursive: true });
  await Deno.writeTextFile(
    resolveSourceScanStatePath(vaultPath),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

export async function scanSourceFilesForChanges(
  sourcePath: string,
  previousState: SourceScanState,
): Promise<SourceScanResult> {
  const files = await collectJsonlFiles(sourcePath);
  const changed: SourceFileState[] = [];
  const unchanged: SourceFileState[] = [];
  const nextFiles: Record<string, SourceFileState> = {};

  for (const filePath of files) {
    const previous = previousState.files[filePath];
    const next = await readSourceFileState(filePath, previous);
    nextFiles[filePath] = next;

    if (previous && previous.contentHash === next.contentHash) {
      unchanged.push(next);
      continue;
    }
    changed.push(next);
  }

  return {
    changed,
    unchanged,
    nextState: {
      version: 1,
      files: nextFiles,
    },
  };
}
