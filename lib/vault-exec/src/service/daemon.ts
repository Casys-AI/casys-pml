import {
  DEFAULT_IDLE_SECS,
  MIN_IDLE_SECS,
} from "./constants.ts";
import {
  cleanupStaleArtifacts,
  getServicePaths,
  readPidFile,
  removeIfExists,
  writeServiceMeta,
  writePidFile,
} from "./lifecycle.ts";
import {
  encodeJsonLine,
  readJsonLine,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceStatus,
} from "./protocol.ts";
import { runIncrementalSync } from "./sync-worker.ts";

interface DaemonOptions {
  vaultPath: string;
  idleSecs: number;
}

interface DaemonState {
  startedAt: string;
  lastActivityAt: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  syncInProgress: boolean;
}

function parseDaemonOptions(args: string[]): DaemonOptions {
  let vaultPath = "";
  let idleSecs = DEFAULT_IDLE_SECS;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--vault") {
      vaultPath = args[++i] ?? "";
    } else if (arg === "--idle") {
      const parsed = Number.parseInt(args[++i] ?? "", 10);
      if (Number.isFinite(parsed)) idleSecs = Math.max(parsed, MIN_IDLE_SECS);
    }
  }

  if (!vaultPath) {
    throw new Error("Missing required --vault <path>");
  }

  return { vaultPath, idleSecs };
}

function buildStatus(
  state: DaemonState,
  vaultPath: string,
  socketPath: string,
  idleSecs: number,
): ServiceStatus {
  return {
    running: true,
    pid: Deno.pid,
    vaultPath,
    socketPath,
    idleSecs,
    startedAt: state.startedAt,
    lastActivityAt: state.lastActivityAt,
    lastRunningAt: state.lastActivityAt,
    syncInProgress: state.syncInProgress,
    lastSyncAt: state.lastSyncAt,
    lastSyncError: state.lastSyncError,
  };
}

async function writeResponse(conn: Deno.Conn, response: ServiceResponse): Promise<void> {
  await conn.write(encodeJsonLine(response));
}

export async function runDaemon(opts: DaemonOptions): Promise<void> {
  const idleSecs = Math.max(opts.idleSecs, MIN_IDLE_SECS);
  const paths = await getServicePaths(opts.vaultPath);

  const cleanup = await cleanupStaleArtifacts(paths);
  if (cleanup.active) {
    const pid = await readPidFile(paths.pidPath);
    throw new Error(`Service already running for vault ${opts.vaultPath} (pid=${pid ?? "unknown"})`);
  }

  await removeIfExists(paths.socketPath);
  const listener = Deno.listen({ transport: "unix", path: paths.socketPath });
  await writePidFile(paths.pidPath, Deno.pid);

  const state: DaemonState = {
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    lastSyncAt: null,
    lastSyncError: null,
    syncInProgress: false,
  };
  await writeServiceMeta(paths.metaPath, {
    lastStartedAt: state.startedAt,
    lastRunningAt: state.lastActivityAt,
  });

  let shuttingDown = false;
  let idleTimer: number | null = null;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    try {
      listener.close();
    } catch {
      // ignore
    }

    await removeIfExists(paths.socketPath);
    await removeIfExists(paths.pidPath);
    await writeServiceMeta(paths.metaPath, {
      lastStartedAt: state.startedAt,
      lastRunningAt: state.lastActivityAt,
    });
  };

  const armIdleTimer = () => {
    if (idleTimer !== null) clearTimeout(idleTimer);

    idleTimer = setTimeout(async () => {
      if (shuttingDown) return;
      const idleForMs = Date.now() - Date.parse(state.lastActivityAt);
      if (!state.syncInProgress && idleForMs >= idleSecs * 1000) {
        await shutdown();
        return;
      }
      armIdleTimer();
    }, idleSecs * 1000);
  };

  armIdleTimer();

  while (!shuttingDown) {
    let conn: Deno.Conn | null = null;
    try {
      conn = await listener.accept();
    } catch {
      if (!shuttingDown) {
        await shutdown();
      }
      break;
    }

    (async () => {
      try {
        const raw = await readJsonLine(conn!);
        const req = raw as ServiceRequest;
        state.lastActivityAt = new Date().toISOString();
        armIdleTimer();

        if (!req?.id || !req?.method) {
          await writeResponse(conn!, { id: "unknown", ok: false, error: "Invalid request" });
          return;
        }

        if (req.method === "status") {
          await writeResponse(conn!, {
            id: req.id,
            ok: true,
            result: buildStatus(state, paths.vaultPath, paths.socketPath, idleSecs),
          });
          return;
        }

        if (req.method === "sync") {
          if (state.syncInProgress) {
            await writeResponse(conn!, {
              id: req.id,
              ok: true,
              result: {
                ok: false,
                tracesUsed: 0,
                notesReindexed: 0,
                gruTrained: false,
                gruAccuracy: 0,
                gnnUpdated: false,
                error: "Sync already in progress",
              },
            });
            return;
          }

          state.syncInProgress = true;
          const result = await runIncrementalSync(paths.vaultPath);
          state.syncInProgress = false;
          state.lastSyncAt = new Date().toISOString();
          state.lastSyncError = result.ok ? null : result.error ?? "Unknown sync error";
          state.lastActivityAt = new Date().toISOString();
          armIdleTimer();

          await writeResponse(conn!, { id: req.id, ok: true, result });
          return;
        }

        if (req.method === "stop") {
          await writeResponse(conn!, { id: req.id, ok: true, result: { stopped: true } });
          await shutdown();
          return;
        }

        await writeResponse(conn!, { id: req.id, ok: false, error: `Unknown method: ${req.method}` });
      } catch (err) {
        try {
          await writeResponse(conn!, {
            id: "unknown",
            ok: false,
            error: (err as Error).message,
          });
        } catch {
          // ignore
        }
      } finally {
        conn?.close();
      }
    })();
  }
}

if (import.meta.main) {
  const opts = parseDaemonOptions(Deno.args);
  await runDaemon(opts);
}
