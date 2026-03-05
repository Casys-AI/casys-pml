# Vault-Exec VX Agent CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an agent-friendly CLI workflow for vault-exec with a short `vx` command, intelligent compact search, target execution with runtime variables, complete note creation, and an on-demand background service that auto-starts and auto-stops on idle.

**Architecture:** Keep command usage stateless (`vx ...`) while introducing an internal Unix-socket service process (Linux) for background sync/index/retrain/watch work. CLI auto-spawns the service when needed and service exits automatically after inactivity. Runtime variable injection is explicit in target call commands and does not mutate note files.

**Tech Stack:** Deno/TypeScript, Deno KV, Cliffy, Unix domain socket IPC, Deno.watchFs, existing graph/executor/parser/retrain modules.

---

## Product Decisions (Locked)

1. CLI-first, no blocking chat/REPL mode.
2. Short command alias: `vx`.
3. Search output = compact for agent context:
   - note name
   - score
   - mini summary
   - outputs
   - detected inputs
4. Target call supports runtime variables (execution-time only).
5. Note creation writes full `.md` compiled note; inputs are optional at creation.
6. Service lifecycle is automatic:
   - auto-start on demand
   - auto-stop on idle
   - no second terminal required.

---

### Task 1: Add `vx` Entry and Command Group Skeleton

**Files:**
- Create: `lib/vault-exec/src/vx.ts`
- Modify: `lib/vault-exec/deno.json`
- Modify: `lib/vault-exec/src/cli.ts`
- Test: `lib/vault-exec/src/vx_test.ts`

**Step 1: Write failing tests**

Test that:
- `deno task vx --help` resolves.
- `vx` exposes top-level groups: `search`, `target`, `note`, `service`, `sync`.

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read src/vx_test.ts`

**Step 3: Minimal implementation**

- Add `vx.ts` as thin wrapper to existing CLI.
- Add `deno task vx`.
- Add empty command groups in CLI (placeholders returning “not implemented”).

**Step 4: Re-run tests**

Expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/vx.ts lib/vault-exec/deno.json lib/vault-exec/src/cli.ts lib/vault-exec/src/vx_test.ts
git commit -m "feat(vault-exec): add vx command entrypoint and command group skeleton"
```

---

### Task 2: Service Protocol and Lifecycle (Auto-Start / Idle Stop)

**Files:**
- Create: `lib/vault-exec/src/service/protocol.ts`
- Create: `lib/vault-exec/src/service/lifecycle.ts`
- Create: `lib/vault-exec/src/service/daemon.ts`
- Create: `lib/vault-exec/src/service/client.ts`
- Test: `lib/vault-exec/src/service/lifecycle_test.ts`
- Test: `lib/vault-exec/src/service/client_test.ts`

**Step 1: Write failing lifecycle/client tests**

Cover:
- auto-spawn when socket missing
- status query when running
- stale pid/socket cleanup
- idle auto-shutdown after timeout

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-run --allow-net src/service/lifecycle_test.ts src/service/client_test.ts`

**Step 3: Implement**

- Unix socket path: `/tmp/vx-<vault-hash>.sock`
- pid file: `/tmp/vx-<vault-hash>.pid`
- lifecycle ops:
  - `ensureService(vaultPath)`
  - `serviceStatus(vaultPath)`
  - `serviceStop(vaultPath)` (still useful)
- daemon idle timer resets on every request; exits after default 5 min.

**Step 4: Re-run tests**

Expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/*
git commit -m "feat(vault-exec): add on-demand idle service with auto-start and cleanup"
```

---

### Task 3: Intelligent Compact Search (`vx search`)

**Files:**
- Create: `lib/vault-exec/src/search.ts`
- Modify: `lib/vault-exec/src/cli.ts`
- Test: `lib/vault-exec/src/search_test.ts`

**Step 1: Write failing tests**

Search output shape:
- `name`
- `score`
- `summary`
- `outputs`
- `inputs`

Include:
- max result cap (`--top`, default 5)
- deterministic ordering on score ties

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write --unstable-kv src/search_test.ts`

**Step 3: Implement**

Search ranking:
- primary by embedding similarity if embeddings available
- fallback lexical ranking from note name/body

Summary extraction:
- first meaningful body sentence (trimmed, max chars)

Inputs detection:
- parse frontmatter `inputs`
- plus `{{vars.xxx}}` tokens in code/body when present

CLI:
- `vx search <vault-path> "<query>" [--top N] [--json]`

**Step 4: Re-run tests**

Expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/search.ts lib/vault-exec/src/cli.ts lib/vault-exec/src/search_test.ts
git commit -m "feat(vault-exec): add compact agent-friendly search command"
```

---

### Task 4: Target Call with Runtime Variables (`vx target call`)

**Files:**
- Create: `lib/vault-exec/src/vars.ts`
- Modify: `lib/vault-exec/src/executor.ts`
- Modify: `lib/vault-exec/src/cli.ts`
- Test: `lib/vault-exec/src/executor_test.ts`
- Test: `lib/vault-exec/src/vars_test.ts`

**Step 1: Write failing tests**

Cases:
- template resolves `{{vars.foo}}`
- missing var produces explicit error
- runtime vars do not mutate note/frontmatter files
- existing dependency resolution still works

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read src/executor_test.ts src/vars_test.ts`

**Step 3: Implement**

Add runtime context support in executor:
- new optional `runtimeVars: Record<string, unknown>`
- template resolution priority:
  1. `vars.*` runtime namespace
  2. normal note output references
  3. error

CLI:
- `vx target call <vault-path> <target> --var key=value --var foo=bar [--json]`

**Step 4: Re-run tests**

Expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/vars.ts lib/vault-exec/src/executor.ts lib/vault-exec/src/cli.ts lib/vault-exec/src/vars_test.ts lib/vault-exec/src/executor_test.ts
git commit -m "feat(vault-exec): support runtime variables in target execution"
```

---

### Task 5: Complete Note Creation (`vx note create` + `vx note add`)

**Files:**
- Create: `lib/vault-exec/src/note-create.ts`
- Modify: `lib/vault-exec/src/io.ts`
- Modify: `lib/vault-exec/src/cli.ts`
- Test: `lib/vault-exec/src/note-create_test.ts`

**Step 1: Write failing tests**

Scenarios:
- create value note with outputs only
- create code note with optional inputs
- create note with children declarations (wikilinks in body or explicit metadata)
- add existing full `.md` file via `--file`

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write src/note-create_test.ts`

**Step 3: Implement**

Commands:
- `vx note create <vault> --title "..." --type value|code --output out1 --value-json ... --code "..."`
- `vx note create ... --child "Note A" --child "Note B"` (optional)
- `vx note add <vault> --file <absolute-or-relative-md>`

Guarantees:
- note is fully written markdown file
- inputs optional
- no compile step required if fully specified

**Step 4: Re-run tests**

Expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/note-create.ts lib/vault-exec/src/io.ts lib/vault-exec/src/cli.ts lib/vault-exec/src/note-create_test.ts
git commit -m "feat(vault-exec): add complete note creation and file import commands"
```

---

### Task 6: Service-Backed Background Sync and Status

**Files:**
- Create: `lib/vault-exec/src/service/sync-worker.ts`
- Modify: `lib/vault-exec/src/cli.ts`
- Test: `lib/vault-exec/src/service/sync-worker_test.ts`

**Step 1: Write failing tests**

Cases:
- `vx sync <vault>` enqueues sync and returns quickly
- `vx service status <vault>` reports queue depth + last sync + idle ETA
- watcher events debounce correctly

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-run --allow-net --unstable-kv src/service/sync-worker_test.ts`

**Step 3: Implement**

- background sync loop in daemon:
  - parse/index changed notes
  - optional short retrain
- commands:
  - `vx sync <vault>`
  - `vx service status <vault>`

**Step 4: Re-run tests**

Expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/sync-worker.ts lib/vault-exec/src/cli.ts lib/vault-exec/src/service/sync-worker_test.ts
git commit -m "feat(vault-exec): add background sync queue and service status"
```

---

### Task 7: Frontmatter Schema for Agent Use

**Files:**
- Create: `lib/vault-exec/schema/frontmatter.schema.json`
- Create: `lib/vault-exec/src/schema.ts`
- Modify: `lib/vault-exec/src/cli.ts`
- Test: `lib/vault-exec/src/schema_test.ts`

**Step 1: Write failing tests**

Validate:
- schema is valid JSON
- command prints schema

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read src/schema_test.ts`

**Step 3: Implement**

Command:
- `vx schema frontmatter --json`

Schema covers:
- `value` nodes
- `code` nodes
- `outputs`
- optional `inputs`
- optional compile metadata

**Step 4: Re-run tests**

Expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/schema/frontmatter.schema.json lib/vault-exec/src/schema.ts lib/vault-exec/src/cli.ts lib/vault-exec/src/schema_test.ts
git commit -m "feat(vault-exec): expose frontmatter schema for agent note generation"
```

---

### Task 8: End-to-End Regression and Docs

**Files:**
- Modify: `lib/vault-exec/README.md` (create if missing)
- Modify: `lib/vault-exec/notebooks/INDEX.md` (command examples)
- Test: `lib/vault-exec/src/integration_test.ts`

**Step 1: Add E2E tests**

Scenarios:
- `vx search` compact payload shape
- `vx target call` with vars
- `vx note create` then `vx sync` then `vx intent`
- service auto-start and idle auto-stop

**Step 2: Run full suite**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-env --allow-run --allow-net --unstable-kv src/`

Expected PASS.

**Step 3: Update docs**

Document:
- one-terminal workflow
- no manual start/stop required in normal usage
- idle auto-shutdown
- `none` behavior in intent candidates

**Step 4: Commit**

```bash
git add lib/vault-exec/README.md lib/vault-exec/notebooks/INDEX.md lib/vault-exec/src/integration_test.ts
git commit -m "docs(vault-exec): document vx agent workflow and idle service lifecycle"
```

---

## Out of Scope

1. Blocking interactive chat mode in terminal.
2. Automatic markdown wikilink persistence from virtual edges.
3. Multi-user/distributed service coordination.

---

## Done Criteria

1. `vx` command exists and is parity-safe with current CLI.
2. `vx search` returns compact, agent-optimized result payload.
3. `vx target call` supports runtime variables cleanly.
4. `vx note create/add` can write complete notes with optional children.
5. Service is invisible to normal flow: auto-start, auto-idle-stop, no zombie leftovers.
6. Existing run behavior preserved: confirm default + `none` always present.
7. All tests pass.

---

Plan complete and saved to `lib/vault-exec/docs/2026-03-04-vault-exec-vx-agent-cli.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
