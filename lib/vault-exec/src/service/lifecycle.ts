import {
  SERVICE_META_EXT,
  SERVICE_NAME,
  SERVICE_PID_DIR,
  SERVICE_PID_EXT,
  SERVICE_SOCKET_DIR,
  SERVICE_SOCKET_EXT,
} from "./constants.ts";

export interface ServicePaths {
  vaultPath: string;
  vaultDbPath: string;
  hash: string;
  socketPath: string;
  pidPath: string;
  metaPath: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function stableVaultHash(vaultPath: string): Promise<string> {
  const normalized = normalizeVaultPath(vaultPath);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return toHex(new Uint8Array(digest)).slice(0, 16);
}

export function normalizeVaultPath(vaultPath: string): string {
  return vaultPath.trim().replace(/\/+$/, "") || "/";
}

export async function getServicePaths(vaultPath: string): Promise<ServicePaths> {
  const normalizedInput = normalizeVaultPath(vaultPath);
  const resolved = await Deno.realPath(normalizedInput).catch(() => normalizedInput);
  const normalized = normalizeVaultPath(resolved);
  const hash = await stableVaultHash(normalized);
  return {
    vaultPath: normalized,
    vaultDbPath: `${normalized}/.vault-exec/vault.kv`,
    hash,
    socketPath: `${SERVICE_SOCKET_DIR}/${SERVICE_NAME}-${hash}${SERVICE_SOCKET_EXT}`,
    pidPath: `${SERVICE_PID_DIR}/${SERVICE_NAME}-${hash}${SERVICE_PID_EXT}`,
    metaPath: `${SERVICE_PID_DIR}/${SERVICE_NAME}-${hash}${SERVICE_META_EXT}`,
  };
}

export async function ensureVaultStateDir(vaultPath: string): Promise<void> {
  await Deno.mkdir(`${normalizeVaultPath(vaultPath)}/.vault-exec`, { recursive: true });
}

export async function writePidFile(pidPath: string, pid: number): Promise<void> {
  await Deno.writeTextFile(pidPath, `${pid}\n`);
}

export async function readPidFile(pidPath: string): Promise<number | null> {
  try {
    const raw = await Deno.readTextFile(pidPath);
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export interface ServiceMeta {
  lastStartedAt: string | null;
  lastRunningAt: string | null;
}

export async function readServiceMeta(metaPath: string): Promise<ServiceMeta> {
  try {
    const raw = await Deno.readTextFile(metaPath);
    const parsed = JSON.parse(raw) as Partial<ServiceMeta>;
    return {
      lastStartedAt: typeof parsed.lastStartedAt === "string" ? parsed.lastStartedAt : null,
      lastRunningAt: typeof parsed.lastRunningAt === "string" ? parsed.lastRunningAt : null,
    };
  } catch {
    return { lastStartedAt: null, lastRunningAt: null };
  }
}

export async function writeServiceMeta(metaPath: string, meta: ServiceMeta): Promise<void> {
  await Deno.writeTextFile(metaPath, `${JSON.stringify(meta)}\n`);
}

export function isPidAlive(pid: number): boolean {
  try {
    Deno.kill(pid, "SIGCONT");
    return true;
  } catch (err) {
    if (!(err instanceof Deno.errors.PermissionDenied)) {
      return false;
    }
    // PID exists but is not signalable by this user; treat as alive.
    return true;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function tryConnectUnixSocket(socketPath: string): Promise<boolean> {
  try {
    const conn = await Deno.connect({ transport: "unix", path: socketPath });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

export async function removeIfExists(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch {
    // Best effort cleanup.
  }
}

export interface StaleCleanupResult {
  active: boolean;
  removedPid: boolean;
  removedSocket: boolean;
}

export async function cleanupStaleArtifacts(paths: ServicePaths): Promise<StaleCleanupResult> {
  let removedPid = false;
  let removedSocket = false;

  const pid = await readPidFile(paths.pidPath);
  const pidAlive = pid !== null && isPidAlive(pid);
  if (pid !== null && !pidAlive) {
    await removeIfExists(paths.pidPath);
    removedPid = true;
  }

  const socketExists = await pathExists(paths.socketPath);
  if (socketExists) {
    if (pidAlive) {
      return { active: true, removedPid, removedSocket };
    }

    const socketAlive = await tryConnectUnixSocket(paths.socketPath);
    if (socketAlive) {
      return { active: true, removedPid, removedSocket };
    }

    await removeIfExists(paths.socketPath);
    removedSocket = true;
  }

  return { active: false, removedPid, removedSocket };
}
