import { assertEquals } from "jsr:@std/assert";
import {
  acquireLiveTrainingLock,
  clearRequestedBuild,
  isLiveTrainingLockStale,
  type LiveTrainingStatusState,
  readLiveTrainingLock,
  readLiveTrainingStatus,
  readRequestedBuild,
  releaseLiveTrainingLock,
  resolveLiveTrainingPaths,
  touchLiveTrainingLock,
  writeLiveTrainingStatus,
  writeRequestedBuild,
} from "./state.ts";

Deno.test("resolveLiveTrainingPaths places state under .vault-exec/live-training", () => {
  const paths = resolveLiveTrainingPaths("/tmp/demo-vault/");

  assertEquals(paths.stateDir, "/tmp/demo-vault/.vault-exec/live-training");
  assertEquals(
    paths.requestedBuildPath,
    "/tmp/demo-vault/.vault-exec/live-training/requested-build.json",
  );
  assertEquals(
    paths.lockPath,
    "/tmp/demo-vault/.vault-exec/live-training/lock.json",
  );
  assertEquals(
    paths.statusPath,
    "/tmp/demo-vault/.vault-exec/live-training/status.json",
  );
  assertEquals(
    paths.workerStatusPath,
    "/tmp/demo-vault/.vault-exec/live-training/worker-status.json",
  );
  assertEquals(
    paths.snapshotDir,
    "/tmp/demo-vault/.vault-exec/live-training/snapshots",
  );
  assertEquals(
    paths.resultDir,
    "/tmp/demo-vault/.vault-exec/live-training/results",
  );
  assertEquals(
    paths.metricsDir,
    "/tmp/demo-vault/.vault-exec/live-training/metrics",
  );
});

Deno.test("writeRequestedBuild/readRequestedBuild round-trip", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-live-state-" });

  try {
    const paths = resolveLiveTrainingPaths(tempDir);
    const requested = {
      buildId: "build-123",
      requestedAt: "2026-03-06T12:00:00.000Z",
      requestedBy: "sync",
    } as const;

    await writeRequestedBuild(paths.requestedBuildPath, requested);

    assertEquals(await readRequestedBuild(paths.requestedBuildPath), requested);
    await clearRequestedBuild(paths.requestedBuildPath);
    assertEquals(await readRequestedBuild(paths.requestedBuildPath), null);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("acquireLiveTrainingLock is exclusive until release", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-live-lock-" });

  try {
    const paths = resolveLiveTrainingPaths(tempDir);
    const nowIso = new Date().toISOString();
    const lock = {
      owner: "runner",
      pid: Deno.pid,
      buildId: "build-123",
      startedAt: nowIso,
      ownerToken: "token-1",
    } as const;

    assertEquals(await acquireLiveTrainingLock(paths.lockPath, lock), true);
    assertEquals(await acquireLiveTrainingLock(paths.lockPath, lock), false);
    const lockOnDisk = await readLiveTrainingLock(paths.lockPath);
    assertEquals(lockOnDisk?.owner, lock.owner);
    assertEquals(lockOnDisk?.pid, lock.pid);
    assertEquals(lockOnDisk?.buildId, lock.buildId);
    assertEquals(lockOnDisk?.startedAt, lock.startedAt);
    assertEquals(lockOnDisk?.ownerToken, lock.ownerToken);
    assertEquals(typeof lockOnDisk?.heartbeatAt, "string");
    assertEquals(typeof lockOnDisk?.ttlMs, "number");

    await releaseLiveTrainingLock(paths.lockPath);

    assertEquals(await readLiveTrainingLock(paths.lockPath), null);
    assertEquals(await acquireLiveTrainingLock(paths.lockPath, lock), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("acquireLiveTrainingLock recovers a stale dead-owner lock", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-live-stale-lock-" });

  try {
    const paths = resolveLiveTrainingPaths(tempDir);
    await Deno.mkdir(paths.stateDir, { recursive: true });
    await Deno.writeTextFile(
      paths.lockPath,
      JSON.stringify(
        {
          owner: "dead-runner",
          pid: 999999,
          buildId: "build-old",
          startedAt: "2026-03-06T12:00:00.000Z",
          heartbeatAt: "2026-03-06T12:00:00.000Z",
          ttlMs: 1,
        },
        null,
        2,
      ),
    );

    const freshLock = {
      owner: "fresh-runner",
      pid: Deno.pid,
      buildId: "build-new",
      startedAt: "2026-03-06T12:05:00.000Z",
      ownerToken: "token-new",
    } as const;

    assertEquals(
      await acquireLiveTrainingLock(paths.lockPath, freshLock),
      true,
    );
    const lockOnDisk = await readLiveTrainingLock(paths.lockPath);
    assertEquals(lockOnDisk?.owner, freshLock.owner);
    assertEquals(lockOnDisk?.buildId, freshLock.buildId);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("isLiveTrainingLockStale expires lock when heartbeat is older than ttl", () => {
  const lock = {
    owner: "runner",
    pid: Deno.pid,
    buildId: "build-ttl",
    startedAt: "2026-03-06T12:00:00.000Z",
    heartbeatAt: "2026-03-06T12:00:00.000Z",
    ttlMs: 1000,
  } as const;
  const nowMs = Date.parse("2026-03-06T12:00:02.500Z");
  assertEquals(isLiveTrainingLockStale(lock, nowMs), true);
});

Deno.test("touchLiveTrainingLock refreshes heartbeat and build", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-live-touch-lock-" });
  try {
    const paths = resolveLiveTrainingPaths(tempDir);
    await acquireLiveTrainingLock(paths.lockPath, {
      owner: "runner",
      pid: Deno.pid,
      buildId: "build-a",
      startedAt: "2026-03-06T12:00:00.000Z",
      ownerToken: "token-a",
    });

    const touched = await touchLiveTrainingLock(paths.lockPath, {
      ownerToken: "token-a",
      buildId: "build-b",
      at: "2026-03-06T12:00:01.000Z",
    });
    assertEquals(touched, true);

    const lock = await readLiveTrainingLock(paths.lockPath);
    assertEquals(lock?.buildId, "build-b");
    assertEquals(lock?.heartbeatAt, "2026-03-06T12:00:01.000Z");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("writeLiveTrainingStatus/readLiveTrainingStatus round-trip", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-live-status-" });
  try {
    const paths = resolveLiveTrainingPaths(tempDir);
    const status: LiveTrainingStatusState = {
      runId: "run-1",
      state: "running",
      phase: "worker",
      updatedAt: "2026-03-06T12:00:00.000Z",
      startedAt: "2026-03-06T11:59:00.000Z",
      buildId: "build-1",
      message: "worker started",
      completedBuildIds: [] as string[],
    };

    await writeLiveTrainingStatus(paths.statusPath, status);
    assertEquals(await readLiveTrainingStatus(paths.statusPath), status);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
