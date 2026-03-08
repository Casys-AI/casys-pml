import {
  isPidAlive,
  normalizeVaultPath,
  resolveVaultStateDir,
} from "../lifecycle.ts";

export interface LiveTrainingPaths {
  stateDir: string;
  requestedBuildPath: string;
  lockPath: string;
  statusPath: string;
  workerStatusPath: string;
  snapshotDir: string;
  resultDir: string;
  metricsDir: string;
}

export interface RequestedBuildState {
  buildId: string;
  requestedAt: string;
  requestedBy: string;
}

export interface LiveTrainingLockState {
  owner: string;
  pid: number;
  buildId: string;
  startedAt: string;
  heartbeatAt?: string;
  ttlMs?: number;
  ownerToken?: string;
}

export interface LiveTrainingStatusState {
  runId: string;
  state:
    | "idle"
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "skipped_locked";
  phase:
    | "lock"
    | "wait_request"
    | "snapshot"
    | "worker"
    | "load_snapshot"
    | "build_dataset"
    | "train"
    | "evaluate"
    | "write_result"
    | "persist"
    | "cleanup"
    | "done";
  updatedAt: string;
  startedAt?: string;
  heartbeatAt?: string;
  buildId?: string | null;
  message?: string;
  workerPid?: number;
  completedBuildIds?: string[];
  lastError?: string;
}

export const DEFAULT_LIVE_TRAINING_LOCK_TTL_MS = 5 * 60 * 1000;

function dirname(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  return slash > 0 ? normalized.slice(0, slash) : ".";
}

async function ensureParentDir(path: string): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
}

function isRequestedBuildState(value: unknown): value is RequestedBuildState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.buildId === "string" &&
    record.buildId.length > 0 &&
    typeof record.requestedAt === "string" &&
    record.requestedAt.length > 0 &&
    typeof record.requestedBy === "string" &&
    record.requestedBy.length > 0;
}

function isLiveTrainingLockState(
  value: unknown,
): value is LiveTrainingLockState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.owner === "string" &&
    record.owner.length > 0 &&
    typeof record.pid === "number" &&
    Number.isFinite(record.pid) &&
    record.pid > 0 &&
    typeof record.buildId === "string" &&
    record.buildId.length > 0 &&
    typeof record.startedAt === "string" &&
    record.startedAt.length > 0 &&
    (record.heartbeatAt === undefined ||
      (typeof record.heartbeatAt === "string" &&
        record.heartbeatAt.length > 0)) &&
    (record.ttlMs === undefined ||
      (typeof record.ttlMs === "number" &&
        Number.isFinite(record.ttlMs) &&
        record.ttlMs > 0)) &&
    (record.ownerToken === undefined ||
      (typeof record.ownerToken === "string" && record.ownerToken.length > 0));
}

function isLiveTrainingStatusState(
  value: unknown,
): value is LiveTrainingStatusState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.runId === "string" &&
    record.runId.length > 0 &&
    typeof record.state === "string" &&
    typeof record.phase === "string" &&
    typeof record.updatedAt === "string" &&
    record.updatedAt.length > 0;
}

function parseIsoDateMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lockHeartbeatAt(lock: LiveTrainingLockState): number | null {
  return parseIsoDateMs(lock.heartbeatAt) ?? parseIsoDateMs(lock.startedAt);
}

export function isLiveTrainingLockStale(
  lock: LiveTrainingLockState,
  nowMs = Date.now(),
): boolean {
  const heartbeatMs = lockHeartbeatAt(lock);
  if (heartbeatMs === null) {
    return true;
  }

  const ttlMs = lock.ttlMs ?? DEFAULT_LIVE_TRAINING_LOCK_TTL_MS;
  if (ttlMs <= 0 || !Number.isFinite(ttlMs)) {
    return true;
  }
  return (nowMs - heartbeatMs) > ttlMs;
}

function normalizeLockState(
  state: LiveTrainingLockState,
): LiveTrainingLockState {
  return {
    ...state,
    heartbeatAt: state.heartbeatAt ?? state.startedAt,
    ttlMs: state.ttlMs ?? DEFAULT_LIVE_TRAINING_LOCK_TTL_MS,
    ownerToken: state.ownerToken,
  };
}

export function resolveLiveTrainingPaths(vaultPath: string): LiveTrainingPaths {
  const normalizedVaultPath = normalizeVaultPath(vaultPath);
  const stateDir = `${resolveVaultStateDir(normalizedVaultPath)}/live-training`;

  return {
    stateDir,
    requestedBuildPath: `${stateDir}/requested-build.json`,
    lockPath: `${stateDir}/lock.json`,
    statusPath: `${stateDir}/status.json`,
    workerStatusPath: `${stateDir}/worker-status.json`,
    snapshotDir: `${stateDir}/snapshots`,
    resultDir: `${stateDir}/results`,
    metricsDir: `${stateDir}/metrics`,
  };
}

export async function writeRequestedBuild(
  requestedBuildPath: string,
  state: RequestedBuildState,
): Promise<void> {
  await ensureParentDir(requestedBuildPath);
  await Deno.writeTextFile(requestedBuildPath, JSON.stringify(state, null, 2));
}

export async function readRequestedBuild(
  requestedBuildPath: string,
): Promise<RequestedBuildState | null> {
  try {
    const raw = await Deno.readTextFile(requestedBuildPath);
    const parsed = JSON.parse(raw);
    return isRequestedBuildState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearRequestedBuild(
  requestedBuildPath: string,
): Promise<void> {
  try {
    await Deno.remove(requestedBuildPath);
  } catch {
    // best-effort cleanup
  }
}

export async function acquireLiveTrainingLock(
  lockPath: string,
  state: LiveTrainingLockState,
): Promise<boolean> {
  await ensureParentDir(lockPath);
  const lockToWrite = normalizeLockState(state);
  for (let attempt = 0; attempt < 2; attempt++) {
    let file: Deno.FsFile | null = null;
    try {
      file = await Deno.open(lockPath, {
        createNew: true,
        write: true,
      });
      await file.write(
        new TextEncoder().encode(JSON.stringify(lockToWrite, null, 2)),
      );
      return true;
    } catch (err) {
      if (err instanceof Deno.errors.AlreadyExists) {
        const existing = await readLiveTrainingLock(lockPath);
        if (
          !existing ||
          isLiveTrainingLockStale(existing) ||
          !isPidAlive(existing.pid)
        ) {
          await releaseLiveTrainingLock(lockPath);
          continue;
        }
        return false;
      }
      throw err;
    } finally {
      file?.close();
    }
  }
  return false;
}

export async function readLiveTrainingLock(
  lockPath: string,
): Promise<LiveTrainingLockState | null> {
  try {
    const raw = await Deno.readTextFile(lockPath);
    const parsed = JSON.parse(raw);
    return isLiveTrainingLockState(parsed) ? normalizeLockState(parsed) : null;
  } catch {
    return null;
  }
}

export async function touchLiveTrainingLock(
  lockPath: string,
  options: {
    buildId?: string;
    ownerToken?: string;
    ttlMs?: number;
    at?: string;
  } = {},
): Promise<boolean> {
  try {
    const current = await readLiveTrainingLock(lockPath);
    if (!current) return false;
    if (
      options.ownerToken && current.ownerToken &&
      options.ownerToken !== current.ownerToken
    ) {
      return false;
    }

    const next: LiveTrainingLockState = {
      ...current,
      buildId: options.buildId ?? current.buildId,
      heartbeatAt: options.at ?? new Date().toISOString(),
      ttlMs: options.ttlMs ?? current.ttlMs ??
        DEFAULT_LIVE_TRAINING_LOCK_TTL_MS,
    };
    await ensureParentDir(lockPath);
    await Deno.writeTextFile(lockPath, JSON.stringify(next, null, 2));
    return true;
  } catch {
    return false;
  }
}

export async function writeLiveTrainingStatus(
  statusPath: string,
  state: LiveTrainingStatusState,
): Promise<void> {
  await ensureParentDir(statusPath);
  await Deno.writeTextFile(statusPath, JSON.stringify(state, null, 2));
}

export async function readLiveTrainingStatus(
  statusPath: string,
): Promise<LiveTrainingStatusState | null> {
  try {
    const raw = await Deno.readTextFile(statusPath);
    const parsed = JSON.parse(raw);
    return isLiveTrainingStatusState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function releaseLiveTrainingLock(lockPath: string): Promise<void> {
  try {
    await Deno.remove(lockPath);
  } catch {
    // best-effort cleanup
  }
}
