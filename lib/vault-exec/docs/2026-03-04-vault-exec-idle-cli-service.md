# Vault-Exec Idle CLI Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep `vault-exec` fully CLI/agent-friendly while adding an on-demand local service that auto-starts on first command and auto-stops when idle (no manual terminal juggling).

**Architecture:** Existing stateless CLI commands remain the public interface. A lightweight Linux-only local service (Unix socket + pid/lock) is introduced for background index/retrain/watch tasks. CLI commands (`intent`, `note add`, `cluster`) connect to service if alive; if not, they auto-spawn it and proceed. Service self-terminates after configurable idle timeout.

**Tech Stack:** Deno/TypeScript, Deno KV, Unix domain sockets (`Deno.listen`), `Deno.watchFs`, Cliffy command parser, existing `init/retrain/run` pipeline.

---

### Current CLI Baseline (Observed)

`lib/vault-exec/src/cli.ts` currently provides:
- `validate`
- `graph`
- `run` (intent routing, confirm default, none option, live retrain)
- `compile`
- `init`

Recent additions already present and should be preserved:
- virtual edges in KV (`src/db/store-kv.ts`)
- auto edge feedback updates in `run`
- confirm by default + `--no-confirm`
- always include `none` candidate

This plan extends, not replaces, that baseline.

---

### Task 1: Define Service Protocol and Runtime Constants

**Files:**
- Create: `lib/vault-exec/src/service/protocol.ts`
- Create: `lib/vault-exec/src/service/constants.ts`
- Test: `lib/vault-exec/src/service/protocol_test.ts`

**Step 1: Write failing protocol tests**

Test JSON round-trip for:
- `SyncNow`
- `IndexFileChanged`
- `IntentExecuted`
- `GetStatus`
- `Shutdown`

**Step 2: Run test to verify fail**

Run:  
`cd lib/vault-exec && deno test --allow-read src/service/protocol_test.ts`

**Step 3: Implement minimal protocol**

Define:
- socket path template: `/tmp/vx-<vault-hash>.sock`
- pid file: `/tmp/vx-<vault-hash>.pid`
- idle default: 300s
- message envelope `{ id, type, payload }`

**Step 4: Re-run protocol tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/protocol.ts lib/vault-exec/src/service/constants.ts lib/vault-exec/src/service/protocol_test.ts
git commit -m "feat(vault-exec): add idle service protocol and runtime constants"
```

---

### Task 2: Implement Service Lifecycle (Auto-Start, Status, Idle Stop)

**Files:**
- Create: `lib/vault-exec/src/service/lifecycle.ts`
- Create: `lib/vault-exec/src/service/lifecycle_test.ts`

**Step 1: Write failing lifecycle tests**

Cover:
- detects running service via socket/pid
- stale pid/socket cleanup
- idle timer triggers graceful shutdown

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write src/service/lifecycle_test.ts`

**Step 3: Implement lifecycle**

Add:
- `isServiceRunning(vaultPath)`
- `cleanupStaleServiceArtifacts(vaultPath)`
- `touchHeartbeat()`
- `scheduleIdleShutdown(timeoutMs)`

Safety:
- no hard kill by default
- stale cleanup only when process is confirmed dead

**Step 4: Re-run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/lifecycle.ts lib/vault-exec/src/service/lifecycle_test.ts
git commit -m "feat(vault-exec): implement service lifecycle and idle shutdown primitives"
```

---

### Task 3: Build Service Daemon Process

**Files:**
- Create: `lib/vault-exec/src/service/daemon.ts`
- Create: `lib/vault-exec/src/service/daemon_test.ts`

**Step 1: Write failing daemon tests**

Cases:
- accepts `GetStatus` request
- resets idle timer on any request
- handles `Shutdown` cleanly

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-net src/service/daemon_test.ts`

**Step 3: Implement daemon**

Behavior:
- listen on Unix socket
- process one-request/one-response JSON lines
- maintain in-memory queue for background tasks
- auto-stop on idle timeout

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/daemon.ts lib/vault-exec/src/service/daemon_test.ts
git commit -m "feat(vault-exec): add unix-socket daemon with idle auto-shutdown"
```

---

### Task 4: Add Client API with Auto-Spawn

**Files:**
- Create: `lib/vault-exec/src/service/client.ts`
- Create: `lib/vault-exec/src/service/client_test.ts`

**Step 1: Write failing tests**

Cases:
- client auto-spawns daemon when socket absent
- request succeeds after spawn
- returns status when daemon already running

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-run --allow-net src/service/client_test.ts`

**Step 3: Implement client**

Functions:
- `ensureService(vaultPath)`
- `callService(vaultPath, msg)`
- `getServiceStatus(vaultPath)`

Spawn model:
- detached child process (`deno run ... service daemon`)
- no second terminal required

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/client.ts lib/vault-exec/src/service/client_test.ts
git commit -m "feat(vault-exec): add auto-spawn service client"
```

---

### Task 5: Integrate Background Sync Pipeline into Daemon

**Files:**
- Create: `lib/vault-exec/src/service/sync-worker.ts`
- Modify: `lib/vault-exec/src/retrain.ts` (extract reusable non-blocking entrypoint if needed)
- Test: `lib/vault-exec/src/service/sync-worker_test.ts`

**Step 1: Write failing tests**

Cases:
- file change event schedules incremental sync
- burst events are debounced
- worker updates notes/embeddings without blocking caller

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-env --unstable-kv src/service/sync-worker_test.ts`

**Step 3: Implement worker**

Pipeline:
- parse changed markdowns
- incremental index update
- optional short retrain window
- store last sync timestamp in KV

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/sync-worker.ts lib/vault-exec/src/retrain.ts lib/vault-exec/src/service/sync-worker_test.ts
git commit -m "feat(vault-exec): add background incremental sync worker"
```

---

### Task 6: Extend CLI with Agent-Friendly Stateless Commands

**Files:**
- Modify: `lib/vault-exec/src/cli.ts`
- Create: `lib/vault-exec/src/cli_service_test.ts`

**Step 1: Write failing CLI tests**

Add tests for:
- `intent` command (alias path to existing run/intent behavior)
- `sync` command (service-triggered sync)
- `note add --file`
- `service status`

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-run --unstable-kv src/cli_service_test.ts`

**Step 3: Implement command surface**

New commands:
- `intent <vault> <text>` (internally uses run intent flow)
- `sync <vault>` (enqueue immediate sync request to daemon)
- `note add <vault> --file <md>`
- `service status <vault>`

No interactive shell/chat mode. Pure stateless commands.

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/cli.ts lib/vault-exec/src/cli_service_test.ts
git commit -m "feat(vault-exec): add stateless intent/sync/note/service commands"
```

---

### Task 7: Add Short Command Alias (`vx`)

**Files:**
- Modify: `lib/vault-exec/deno.json`
- Create: `lib/vault-exec/src/vx.ts`
- Test: `lib/vault-exec/src/vx_test.ts`

**Step 1: Write failing tests**

Test that:
- `vx` delegates to same CLI entrypoint
- command parity with `vault-exec`

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read src/vx_test.ts`

**Step 3: Implement alias**

Add `vx.ts` thin wrapper and task:
- `deno task vx ...`

Optionally set command name metadata to `vx` for shorter logs in agent workflows.

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/deno.json lib/vault-exec/src/vx.ts lib/vault-exec/src/vx_test.ts
git commit -m "feat(vault-exec): add short vx alias command"
```

---

### Task 8: Add Frontmatter Schema Exposure for AI Agents

**Files:**
- Create: `lib/vault-exec/schema/frontmatter.schema.json`
- Create: `lib/vault-exec/src/schema.ts`
- Modify: `lib/vault-exec/src/cli.ts`
- Test: `lib/vault-exec/src/schema_test.ts`

**Step 1: Write failing tests**

Cases:
- schema file loads
- `schema frontmatter --json` prints valid JSON schema

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read src/schema_test.ts`

**Step 3: Implement**

Expose:
- `vx schema frontmatter --json`
- includes value/code/tool shapes, outputs/inputs constraints

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/schema/frontmatter.schema.json lib/vault-exec/src/schema.ts lib/vault-exec/src/cli.ts lib/vault-exec/src/schema_test.ts
git commit -m "feat(vault-exec): expose frontmatter schema for agent-driven note generation"
```

---

### Task 9: Observability and Safety Rails

**Files:**
- Create: `lib/vault-exec/src/service/metrics.ts`
- Modify: `lib/vault-exec/src/service/daemon.ts`
- Test: `lib/vault-exec/src/service/metrics_test.ts`

**Step 1: Write failing tests**

Track:
- uptime
- idle shutdown count
- auto-spawn count
- sync queue depth

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read src/service/metrics_test.ts`

**Step 3: Implement + expose**

`vx service status` should include:
- running/stopped
- pid
- idle timeout
- last sync timestamp
- queue size

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/metrics.ts lib/vault-exec/src/service/daemon.ts lib/vault-exec/src/service/metrics_test.ts
git commit -m "feat(vault-exec): add service status metrics and safety visibility"
```

---

### Task 10: End-to-End Validation and Docs

**Files:**
- Modify: `lib/vault-exec/README.md` (or create `lib/vault-exec/README.md` if absent)
- Modify: `lib/vault-exec/notebooks/INDEX.md` (optional command examples)
- Test: `lib/vault-exec/src/integration_test.ts` (service-aware scenario)

**Step 1: Add integration test**

Scenario:
- call `intent` with no daemon -> auto-spawn
- run returns quickly
- wait idle timeout in test config -> service exits automatically

**Step 2: Run full test suite**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-env --allow-run --allow-net --unstable-kv src/`

Expected: PASS.

**Step 3: Update docs**

Document:
- no second terminal needed
- no manual start/stop in normal usage
- idle auto-shutdown behavior
- `vx` examples for agents

**Step 4: Commit**

```bash
git add lib/vault-exec/src/integration_test.ts lib/vault-exec/README.md lib/vault-exec/notebooks/INDEX.md
git commit -m "docs(vault-exec): document auto-spawn idle service workflow"
```

---

## Out-of-Scope (Explicit)

1. Full interactive shell/chat REPL (stdin monopolizing mode)
2. Automatic markdown wikilink writing from virtual edges
3. System-level service managers (systemd user units)

---

## Done Criteria

1. User can run intent/note/sync commands from one terminal only.
2. Service starts automatically on demand.
3. Service stops automatically on idle.
4. No zombie process from stale pid/socket artifacts.
5. Existing `run` behavior remains intact: confirm default, `none` always present.
6. Full `lib/vault-exec/src` tests remain green.

---

Plan complete and saved to `lib/vault-exec/docs/2026-03-04-vault-exec-idle-cli-service.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
