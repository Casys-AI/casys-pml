import {
  DEFAULT_IDLE_SECS,
  MIN_IDLE_SECS,
  STARTUP_POLL_MS,
  STARTUP_WAIT_MS,
} from "./constants.ts";
import {
  cleanupStaleArtifacts,
  ensureVaultStateDir,
  getServicePaths,
  readServiceMeta,
  removeIfExists,
} from "./lifecycle.ts";
import {
  encodeJsonLine,
  isServiceResponse,
  isServiceStatus,
  isSyncResponse,
  readJsonLine,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceStatus,
  type SyncResponse,
} from "./protocol.ts";

export interface WatchArgs {
  vaultPath: string;
  idleSecs?: number;
}

function requestId(): string {
  return crypto.randomUUID();
}

function fallbackServiceStatus(args: {
  vaultPath: string;
  socketPath: string;
  lastStartedAt: string | null;
  lastRunningAt: string | null;
}): ServiceStatus {
  return {
    running: false,
    pid: 0,
    vaultPath: args.vaultPath,
    socketPath: args.socketPath,
    idleSecs: DEFAULT_IDLE_SECS,
    startedAt: args.lastStartedAt ?? "",
    lastActivityAt: args.lastRunningAt ?? "",
    lastRunningAt: args.lastRunningAt,
    syncInProgress: false,
    lastSyncAt: null,
    lastSyncError: null,
  };
}

async function sendRequest(
  vaultPath: string,
  req: ServiceRequest,
): Promise<ServiceResponse> {
  const paths = await getServicePaths(vaultPath);
  const conn = await Deno.connect({
    transport: "unix",
    path: paths.socketPath,
  });

  try {
    await conn.write(encodeJsonLine(req));
    const rawResponse = await readJsonLine(conn);
    if (!isServiceResponse(rawResponse)) {
      throw new Error("Malformed response from watch service");
    }
    return rawResponse;
  } finally {
    conn.close();
  }
}

async function spawnDaemon(vaultPath: string, idleSecs: number): Promise<void> {
  const daemonPath = new URL("./daemon.ts", import.meta.url).pathname;
  const daemonArgs = [
    Deno.execPath(),
    "run",
    "--allow-read",
    "--allow-write",
    "--allow-net",
    "--allow-env",
    "--allow-run",
    "--allow-ffi",
    "--unstable-kv",
    "--node-modules-dir=manual",
    daemonPath,
    "--vault",
    vaultPath,
    "--idle",
    String(idleSecs),
  ];

  try {
    const spawned = await new Deno.Command("setsid", {
      args: ["-f", ...daemonArgs],
      stdin: "null",
      stdout: "null",
      stderr: "piped",
    }).output();
    if (spawned.success) return;

    const stderr = new TextDecoder().decode(spawned.stderr).trim();
    throw new Error(stderr || "Failed to spawn watch daemon");
  } catch {
    // Fallback for environments without setsid.
    const shellCmd = [
      "nohup",
      daemonArgs.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" "),
      ">/dev/null",
      "2>&1",
      "&",
    ].join(" ");

    const spawned = await new Deno.Command("bash", {
      args: ["-lc", shellCmd],
      stdin: "null",
      stdout: "null",
      stderr: "piped",
    }).output();

    if (!spawned.success) {
      const stderr = new TextDecoder().decode(spawned.stderr).trim();
      throw new Error(stderr || "Failed to spawn watch daemon");
    }
  }
}

async function waitForReady(vaultPath: string): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < STARTUP_WAIT_MS) {
    try {
      const status = await watchStatus({ vaultPath });
      if (status?.running) return;
    } catch {
      // Poll until daemon is listening.
    }
    await new Promise((resolve) => setTimeout(resolve, STARTUP_POLL_MS));
  }

  throw new Error(`Service startup timed out after ${STARTUP_WAIT_MS}ms`);
}

export async function watchStatus(
  args: { vaultPath: string },
): Promise<ServiceStatus> {
  let res: ServiceResponse;
  const paths = await getServicePaths(args.vaultPath);
  try {
    res = await sendRequest(paths.vaultPath, {
      id: requestId(),
      method: "status",
    });
  } catch {
    const meta = await readServiceMeta(paths.metaPath);
    return fallbackServiceStatus({
      vaultPath: paths.vaultPath,
      socketPath: paths.socketPath,
      lastStartedAt: meta.lastStartedAt,
      lastRunningAt: meta.lastRunningAt,
    });
  }

  if (!res.ok) {
    throw new Error(res.error);
  }

  if (!isServiceStatus(res.result)) {
    throw new Error("Malformed status response from watch service");
  }

  return res.result;
}

export async function startWatch(args: WatchArgs): Promise<ServiceStatus> {
  const idleSecs = Math.max(args.idleSecs ?? DEFAULT_IDLE_SECS, MIN_IDLE_SECS);

  await ensureVaultStateDir(args.vaultPath);
  const paths = await getServicePaths(args.vaultPath);
  const cleanup = await cleanupStaleArtifacts(paths);

  if (!cleanup.active) {
    await removeIfExists(paths.socketPath);
    await spawnDaemon(paths.vaultPath, idleSecs);
    await waitForReady(paths.vaultPath);
  }

  return await watchStatus({ vaultPath: paths.vaultPath });
}

export async function syncOnce(
  args: { vaultPath: string },
): Promise<SyncResponse> {
  const paths = await getServicePaths(args.vaultPath);
  await startWatch({ vaultPath: paths.vaultPath });

  const res = await sendRequest(paths.vaultPath, {
    id: requestId(),
    method: "sync",
  });
  if (!res.ok) {
    throw new Error(res.error);
  }

  if (!isSyncResponse(res.result)) {
    throw new Error("Malformed sync response from watch service");
  }

  return res.result;
}

export async function stopWatch(args: { vaultPath: string }): Promise<boolean> {
  const paths = await getServicePaths(args.vaultPath);

  try {
    const res = await sendRequest(paths.vaultPath, {
      id: requestId(),
      method: "stop",
    });
    return res.ok;
  } catch {
    await removeIfExists(paths.socketPath);
    await removeIfExists(paths.pidPath);
    return false;
  }
}
