import { openVaultStore } from "../../db/index.ts";
import { getActiveTrainingBuildId } from "../../training-data/rebuild.ts";
import {
  isLiveTrainingResultForBuild,
  readLiveTrainingResult,
  writeLiveTrainingFailure,
} from "./result.ts";
import { prepareGruTrainingSnapshot } from "./runner.ts";
import {
  acquireLiveTrainingLock,
  clearRequestedBuild,
  type LiveTrainingLockState,
  type LiveTrainingPaths,
  type LiveTrainingStatusState,
  readRequestedBuild,
  releaseLiveTrainingLock,
  type RequestedBuildState,
  resolveLiveTrainingPaths,
  touchLiveTrainingLock,
  writeLiveTrainingStatus,
  writeRequestedBuild,
} from "./state.ts";

export interface RunQueuedLiveTrainingOptions {
  vaultPath: string;
  dbPath: string;
  maxEpochs?: number;
}

export interface RunQueuedLiveTrainingResult {
  ran: boolean;
  completedBuildIds: string[];
}

export interface RequestLiveTrainingOptions
  extends RunQueuedLiveTrainingOptions {
  requestedBy: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

function nodeWorkerPath(): string {
  return new URL("./node-worker.ts", import.meta.url).pathname;
}

function orchestratorPath(): string {
  return new URL("./orchestrator.ts", import.meta.url).pathname;
}

async function runNodeGruWorker(args: {
  snapshotDir: string;
  resultDir: string;
  statusPath: string;
  buildId: string;
  runId: string;
  maxEpochs: number;
  onSpawn?: (pid: number) => Promise<void>;
  onHeartbeat?: () => Promise<void>;
}): Promise<void> {
  const command = new Deno.Command("node", {
    args: [
      "--experimental-transform-types",
      nodeWorkerPath(),
      "--snapshot",
      args.snapshotDir,
      "--result",
      args.resultDir,
      "--status",
      args.statusPath,
      "--build-id",
      args.buildId,
      "--run-id",
      args.runId,
      "--max-epochs",
      String(args.maxEpochs),
    ],
    cwd: "/home/ubuntu/CascadeProjects/AgentCards/lib/vault-exec",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  await args.onSpawn?.(child.pid);
  await args.onHeartbeat?.();

  const stdoutPromise = child.stdout
    ? new Response(child.stdout).text()
    : Promise.resolve("");
  const stderrPromise = child.stderr
    ? new Response(child.stderr).text()
    : Promise.resolve("");

  const timer = setInterval(() => {
    void args.onHeartbeat?.();
  }, 2000);

  const output = await child.status;
  clearInterval(timer);

  const stderr = (await stderrPromise).trim();
  const stdout = (await stdoutPromise).trim();
  if (!output.success) {
    throw new Error(
      stderr || stdout ||
        "[service/training/orchestrator] Node GRU worker failed",
    );
  }
}

async function writeOrchestratorStatus(
  paths: LiveTrainingPaths,
  context: {
    runId: string;
    startedAt: string;
    completedBuildIds: string[];
  },
  patch: {
    state: LiveTrainingStatusState["state"];
    phase: LiveTrainingStatusState["phase"];
    buildId?: string | null;
    message?: string;
    workerPid?: number;
    lastError?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await writeLiveTrainingStatus(paths.statusPath, {
    runId: context.runId,
    state: patch.state,
    phase: patch.phase,
    updatedAt: now,
    startedAt: context.startedAt,
    heartbeatAt: now,
    buildId: patch.buildId ?? null,
    message: patch.message,
    workerPid: patch.workerPid,
    completedBuildIds: [...context.completedBuildIds],
    lastError: patch.lastError,
  });
}

async function persistLiveTrainingResult(
  dbPath: string,
  resultDir: string,
): Promise<void> {
  const store = await openVaultStore(dbPath);
  try {
    const result = await readLiveTrainingResult(resultDir);
    const kv = await Deno.openKv(dbPath);
    try {
      const activeBuildId = await getActiveTrainingBuildId(kv);
      if (
        !activeBuildId || !isLiveTrainingResultForBuild(result, activeBuildId)
      ) {
        return;
      }
    } finally {
      kv.close();
    }

    await store.saveGruWeights(
      result.gruWeights.bytes,
      result.gruWeights.vocabSize,
      result.gruWeights.epoch,
      result.gruWeights.accuracy,
    );
  } finally {
    store.close();
  }
}

async function processRequestedBuild(
  request: RequestedBuildState,
  options: RunQueuedLiveTrainingOptions,
  hooks: {
    runId: string;
    ownerToken: string;
    paths: LiveTrainingPaths;
    statusContext: {
      runId: string;
      startedAt: string;
      completedBuildIds: string[];
    };
  },
): Promise<void> {
  const paths = hooks.paths;
  const snapshotDir = joinPath(
    joinPath(paths.snapshotDir, request.buildId),
    "gru",
  );
  const resultDir = joinPath(joinPath(paths.resultDir, request.buildId), "gru");

  await writeOrchestratorStatus(paths, hooks.statusContext, {
    state: "running",
    phase: "snapshot",
    buildId: request.buildId,
    message: "Preparing GRU snapshot",
  });
  await touchLiveTrainingLock(paths.lockPath, {
    buildId: request.buildId,
    ownerToken: hooks.ownerToken,
  });

  await prepareGruTrainingSnapshot({
    vaultPath: options.vaultPath,
    dbPath: options.dbPath,
    snapshotDir,
  });
  await writeOrchestratorStatus(paths, hooks.statusContext, {
    state: "running",
    phase: "worker",
    buildId: request.buildId,
    message: "Running Node GRU worker",
  });
  await runNodeGruWorker({
    snapshotDir,
    resultDir,
    statusPath: paths.workerStatusPath,
    buildId: request.buildId,
    runId: hooks.runId,
    maxEpochs: Math.max(1, options.maxEpochs ?? 1),
    onSpawn: async (workerPid) => {
      await writeOrchestratorStatus(paths, hooks.statusContext, {
        state: "running",
        phase: "worker",
        buildId: request.buildId,
        message: "Node GRU worker started",
        workerPid,
      });
    },
    onHeartbeat: async () => {
      await touchLiveTrainingLock(paths.lockPath, {
        buildId: request.buildId,
        ownerToken: hooks.ownerToken,
      });
    },
  });
  await writeOrchestratorStatus(paths, hooks.statusContext, {
    state: "running",
    phase: "persist",
    buildId: request.buildId,
    message: "Persisting GRU weights",
  });
  await touchLiveTrainingLock(paths.lockPath, {
    buildId: request.buildId,
    ownerToken: hooks.ownerToken,
  });
  await persistLiveTrainingResult(options.dbPath, resultDir);
}

export async function runQueuedLiveTraining(
  options: RunQueuedLiveTrainingOptions,
): Promise<RunQueuedLiveTrainingResult> {
  const paths = resolveLiveTrainingPaths(options.vaultPath);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const ownerToken = crypto.randomUUID();
  const lock: LiveTrainingLockState = {
    owner: "service-training-orchestrator",
    pid: Deno.pid,
    buildId: "pending",
    startedAt,
    heartbeatAt: startedAt,
    ownerToken,
  };
  const statusContext = {
    runId,
    startedAt,
    completedBuildIds: [] as string[],
  };

  await writeOrchestratorStatus(paths, statusContext, {
    state: "queued",
    phase: "lock",
    buildId: null,
    message: "Acquiring live-training lock",
  });
  await writeLiveTrainingStatus(paths.workerStatusPath, {
    runId,
    state: "idle",
    phase: "wait_request",
    updatedAt: startedAt,
    startedAt,
    buildId: null,
    message: "Worker not started",
  });

  const acquired = await acquireLiveTrainingLock(paths.lockPath, lock);
  if (!acquired) {
    await writeOrchestratorStatus(paths, statusContext, {
      state: "skipped_locked",
      phase: "lock",
      buildId: null,
      message: "Lock already held by another process",
    });
    return { ran: false, completedBuildIds: [] };
  }

  const completedBuildIds: string[] = [];
  let failed = false;
  let terminalError: string | undefined;
  try {
    await writeOrchestratorStatus(paths, statusContext, {
      state: "running",
      phase: "wait_request",
      buildId: null,
      message: "Waiting for requested build",
    });
    while (true) {
      const request = await readRequestedBuild(paths.requestedBuildPath);
      if (!request) {
        break;
      }

      try {
        await processRequestedBuild(request, options, {
          runId,
          ownerToken,
          paths,
          statusContext,
        });
      } catch (error) {
        const resultDir = joinPath(
          joinPath(paths.resultDir, request.buildId),
          "gru",
        );
        await writeLiveTrainingFailure(resultDir, {
          buildId: request.buildId,
          failedAt: new Date().toISOString(),
          error: toErrorMessage(error),
        });
        failed = true;
        terminalError = toErrorMessage(error);
        await writeOrchestratorStatus(paths, statusContext, {
          state: "failed",
          phase: "worker",
          buildId: request.buildId,
          message: "Training failed",
          lastError: terminalError,
        });
        throw error;
      }
      completedBuildIds.push(request.buildId);
      statusContext.completedBuildIds = completedBuildIds;
      await writeOrchestratorStatus(paths, statusContext, {
        state: "running",
        phase: "wait_request",
        buildId: request.buildId,
        message: `Completed build ${request.buildId}`,
      });

      const latestRequest = await readRequestedBuild(paths.requestedBuildPath);
      if (!latestRequest || latestRequest.buildId === request.buildId) {
        await clearRequestedBuild(paths.requestedBuildPath);
        break;
      }
    }
  } finally {
    await writeOrchestratorStatus(paths, statusContext, {
      state: failed ? "failed" : "running",
      phase: "cleanup",
      buildId: completedBuildIds.at(-1) ?? null,
      message: "Releasing live-training lock",
      lastError: terminalError,
    });
    await releaseLiveTrainingLock(paths.lockPath);
    await writeOrchestratorStatus(paths, statusContext, {
      state: failed ? "failed" : "completed",
      phase: "done",
      buildId: completedBuildIds.at(-1) ?? null,
      message: failed ? "Live training failed" : "Live training completed",
      lastError: terminalError,
    });
  }

  return {
    ran: completedBuildIds.length > 0,
    completedBuildIds,
  };
}

export async function scheduleQueuedLiveTraining(
  options: RunQueuedLiveTrainingOptions,
): Promise<void> {
  const args = [
    Deno.execPath(),
    "run",
    "--allow-read",
    "--allow-write",
    "--allow-env",
    "--allow-run",
    "--allow-ffi",
    "--unstable-kv",
    "--node-modules-dir=manual",
    orchestratorPath(),
    "--vault",
    options.vaultPath,
    "--db",
    options.dbPath,
    "--max-epochs",
    String(Math.max(1, options.maxEpochs ?? 1)),
  ];

  try {
    const spawned = await new Deno.Command("setsid", {
      args: ["-f", ...args],
      stdin: "null",
      stdout: "null",
      stderr: "piped",
    }).output();
    if (spawned.success) {
      return;
    }
  } catch {
    // fall through to nohup
  }

  const shellCmd = [
    "nohup",
    args.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" "),
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
    throw new Error(
      stderr || "[service/training/orchestrator] Failed to schedule training",
    );
  }
}

export async function requestLiveTrainingForActiveBuild(
  options: RequestLiveTrainingOptions,
): Promise<string | null> {
  const kv = await Deno.openKv(options.dbPath);
  let buildId: string | null = null;
  try {
    buildId = await getActiveTrainingBuildId(kv);
  } finally {
    kv.close();
  }

  if (!buildId) {
    return null;
  }

  const paths = resolveLiveTrainingPaths(options.vaultPath);
  await writeRequestedBuild(paths.requestedBuildPath, {
    buildId,
    requestedAt: new Date().toISOString(),
    requestedBy: options.requestedBy,
  });

  try {
    await scheduleQueuedLiveTraining(options);
  } catch (error) {
    if (!(error instanceof Deno.errors.PermissionDenied)) {
      throw error;
    }
  }

  return buildId;
}

function parseCliArgs(args: string[]): RunQueuedLiveTrainingOptions {
  let vaultPath = "";
  let dbPath = "";
  let maxEpochs = 1;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--vault") {
      vaultPath = args[++index] ?? "";
    } else if (arg === "--db") {
      dbPath = args[++index] ?? "";
    } else if (arg === "--max-epochs") {
      const parsed = Number.parseInt(args[++index] ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        maxEpochs = parsed;
      }
    }
  }

  if (!vaultPath || !dbPath) {
    throw new Error("Missing required --vault <path> and --db <path>");
  }

  return { vaultPath, dbPath, maxEpochs };
}

if (import.meta.main) {
  try {
    await runQueuedLiveTraining(parseCliArgs(Deno.args));
  } catch (error) {
    console.error(toErrorMessage(error));
    Deno.exit(1);
  }
}
