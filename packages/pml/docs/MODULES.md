# Modules Guide

This document provides detailed documentation for each module in `@casys/pml`.

## Overview

```text
src/
├── cli/           # CLI commands
├── routing/       # Client/server routing
├── loader/        # Dynamic capability loading
├── sandbox/       # Isolated execution
├── execution/     # Execution orchestration
├── byok/          # API key management
├── permissions/   # Tool permissions
├── tracing/       # Trace collection
├── security/      # Path validation
├── lockfile/      # Dependency lockfiles
├── session/       # Cloud session
├── workflow/      # Pending workflows
├── init/          # Project initialization
├── workspace.ts   # Workspace resolution
├── logging.ts     # Logging utilities
└── types.ts       # Shared types
```

---

## cli/

CLI commands and shared utilities.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Main CLI entry point with Cliffy command setup |
| `init-command.ts` | `pml init` - Initialize project configuration |
| `serve-command.ts` | `pml serve` - Start HTTP MCP server |
| `stdio-command.ts` | `pml stdio` - Run in stdio mode |
| `upgrade-command.ts` | `pml upgrade` - Self-update CLI |

### cli/shared/

Shared utilities used by multiple commands.

| File | Description |
|------|-------------|
| `cloud-client.ts` | HTTP client for pml.casys.ai communication |
| `local-executor.ts` | Execute capabilities locally in sandbox |
| `approval-formatter.ts` | Format HIL approval prompts |
| `workflow-utils.ts` | Workflow state management |
| `version-check.ts` | Check for CLI updates |
| `constants.ts` | Shared constants |
| `types.ts` | Shared type definitions |

### Usage

```typescript
import { main } from "@casys/pml/cli";

// Run CLI
await main();
```

---

## routing/

Platform-defined routing for MCP tools. Determines whether a tool executes locally (client) or forwards to cloud (server).

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `resolver.ts` | Tool routing resolution logic |
| `cache.ts` | Local cache for routing config |
| `sync.ts` | Sync routing config from cloud |

### Key Functions

```typescript
import {
  initializeRouting,
  resolveToolRouting,
  isClientTool,
  isServerTool,
} from "@casys/pml/routing";

// Initialize at startup
await initializeRouting({ cloudUrl: "https://pml.casys.ai" });

// Resolve where to execute
const routing = resolveToolRouting("filesystem:read_file");
// Returns: "client"

const routing2 = resolveToolRouting("tavily:search");
// Returns: "server"
```

### Routing Rules

| Namespace | Routing | Reason |
|-----------|---------|--------|
| `filesystem:*` | client | Local file access |
| `shell:*` | client | Local command execution |
| `docker:*` | client | Local container management |
| `git:*` | client | Local repository operations |
| `tavily:*` | server | External API, no local state |
| `exa:*` | server | External API |
| Default | server | Safe default |

---

## loader/

Dynamic capability loading from the PML registry.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `capability-loader.ts` | Main loader class |
| `registry-client.ts` | Registry API client |
| `deno-loader.ts` | Deno module loading |
| `code-fetcher.ts` | Fetch code for sandbox |
| `dep-installer.ts` | Install MCP dependencies |
| `dep-state.ts` | Track installed dependencies |
| `stdio-manager.ts` | Manage stdio MCP processes |
| `stdio-rpc.ts` | JSON-RPC over stdio |
| `binary-resolver.ts` | Resolve binary dependencies |
| `env-checker.ts` | Check required env vars |
| `integrity.ts` | Hash verification |
| `types.ts` | Loader types |

### MCP Types

The loader supports three capability types:

| Type | Description | Example |
|------|-------------|---------|
| **deno** | TypeScript code executed in sandbox | Custom capabilities |
| **stdio** | External MCP server via subprocess | filesystem, shell, git |
| **http** | Proxy to HTTP endpoint (server-side) | tavily, memory cloud |

### FQDN Format

Capabilities are identified by a 5-part FQDN:

```text
org.project.namespace.action.hash
│   │       │         │      └── 4-char hash for uniqueness
│   │       │         └── Action name (e.g., read_file)
│   │       └── Namespace/server (e.g., filesystem)
│   └── Project name
└── Organization
```

Example: `casys.pml.filesystem.read_file.7b92`

### Approval Types (HIL Flow)

When a capability requires user intervention:

| Type | Trigger | User Action |
|------|---------|-------------|
| `tool_permission` | Tool needs approval to execute | Approve tool usage |
| `api_key_required` | Missing API key | Add key to `.env` |
| `integrity` | Hash changed from lockfile | Approve update |

**Unified Permission Model:** When user approves a tool, installation (if needed) happens automatically. The tool is then added to the session's `approvedTools` set.

### Key Classes

```typescript
import { CapabilityLoader, RegistryClient } from "@casys/pml/loader";

// Create loader
const loader = new CapabilityLoader({
  cloudUrl: "https://pml.casys.ai",
  workspaceRoot: "/path/to/project",
});

// Load a capability
const result = await loader.loadCapability("casys.tools.example:run");

if (!result.approvalRequired) {
  // Execute the loaded capability
  const output = await result.capability.call("run", args);
}

if (result.approvalRequired) {
  // Handle HIL pause
  switch (result.approvalType) {
    case "tool_permission":
      console.log(`Tool ${result.toolId} needs approval`);
      break;
    case "api_key_required":
      console.log(`Missing keys: ${result.missingKeys.join(", ")}`);
      break;
  }
}
```

### Load Flow

1. Parse tool name to extract namespace and action
2. Fetch metadata from registry (with FQDN resolution)
3. Check permissions (allow/deny/ask)
4. If `ask` → return `tool_permission` approval
5. Check if dependencies installed
6. If missing API keys → return `api_key_required` approval
7. Verify integrity against lockfile
8. If hash changed → return `integrity` approval
9. Fetch capability code (for deno type)
10. Return executable capability

---

## sandbox/

Isolated code execution environment using Deno workers.

> **Note:** This is the **client-side sandbox** (`@casys/pml`), distinct from the server-side `WorkerBridge` in `@casys/mcp-gateway`. See [Client vs Server Sandbox](#client-vs-server-sandbox) below.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `types.ts` | Sandbox types |
| `constants.ts` | Timeout and limits |
| `execution/rpc-bridge.ts` | RPC bridge for tool calls |
| `execution/sandbox-script.ts` | Worker entry script |
| `execution/worker-runner.ts` | Worker lifecycle management (SandboxWorker class) |
| `execution/timeout-handler.ts` | Execution timeout handling |

### Security Model

The sandbox provides:

- **Isolation**: Code runs in Deno Worker with `permissions: "none"`
- **RPC Bridge**: All tool calls go through JSON-RPC
- **Timeout**: Configurable execution timeout (default 30s)
- **Memory limits**: Prevent runaway allocations

### Architecture

```text
┌────────────────────────────────────────┐
│           Main Process                 │
│  ┌──────────────────────────────────┐  │
│  │         RPC Bridge               │  │
│  │  - Receive mcp.* calls           │  │
│  │  - Route to StdioManager         │  │
│  │  - Forward to MCP subprocess     │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
              ▲ JSON-RPC
              │
┌─────────────▼──────────────────────────┐
│         Deno Worker (isolated)         │
│  ┌──────────────────────────────────┐  │
│  │     Capability Code              │  │
│  │  - No direct I/O                 │  │
│  │  - mcp.* calls → RPC             │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### Client vs Server Sandbox

PML has **two sandbox implementations** with different capabilities:

| Aspect | Client Sandbox (`@casys/pml`) | Server Sandbox (`@casys/mcp-gateway`) |
|--------|-------------------------------|---------------------------------------|
| **Class** | `SandboxWorker` | `WorkerBridge` |
| **Location** | `packages/pml/src/sandbox/` | `src/sandbox/` |
| **RPC Target** | `StdioManager` (local MCP servers) | `MCPClients` + `CapabilityStore` |
| **Tracing** | Simple trace collector | EventBus + BroadcastChannel (ADR-036) |
| **GraphRAG** | No | Yes (learning from executions) |
| **cap_* tools** | No | Yes (capabilities as MCP tools) |
| **Use case** | Local CLI execution | Cloud gateway execution |

**Client sandbox** is lightweight: it spawns MCP servers locally via `StdioManager` and routes `mcp.*` calls to them.

**Server sandbox** is rich: it integrates with GraphRAG for learning, emits events via BroadcastChannel, and supports calling capabilities as if they were MCP tools (`cap_*`).

---

## execution/

Hybrid code execution with routing. This module orchestrates code execution when the server returns `execute_locally`.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `types.ts` | Execution types |
| `sandbox-executor.ts` | Main executor class with hybrid routing |

### Key Class: `SandboxExecutor`

Executes code in an isolated sandbox with hybrid routing:

1. Creates `SandboxWorker` (isolated Deno worker)
2. For each `mcp.*` call: routes via `resolveToolRouting()`
   - **client** → calls `clientHandler` (e.g., `CapabilityLoader`)
   - **server** → forwards to `cloudUrl`
3. Collects tool call records with timing
4. Returns result with `durationMs`

**Constructor options:** `cloudUrl`, `apiKey`, `executionTimeoutMs`, `rpcTimeoutMs`

**Method:** `execute(code, context, clientHandler)` → `SandboxExecutionResult`

### Hybrid Routing

| Tool Call | Routing | Handler |
|-----------|---------|---------|
| `mcp.filesystem.read_file()` | client | `clientHandler` → `CapabilityLoader` |
| `mcp.shell.exec()` | client | `clientHandler` → `CapabilityLoader` |
| `mcp.tavily.search()` | server | Forward to `cloudUrl` |
| `mcp.github.get_pr()` | server | Forward to `cloudUrl` |

This hybrid model ensures:
- **Sensitive operations** (file system, shell) run on user's machine
- **API calls** (search, external services) go through cloud for quota management
- **Traces** are collected client-side with full timing data

---

## byok/

BYOK (Bring Your Own Key) - API key management and HIL approval flow.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `types.ts` | BYOK types |
| `env-loader.ts` | Load keys from .env file |
| `key-checker.ts` | Validate required keys |
| `hil-integration.ts` | HIL pause/resume flow |
| `sanitizer.ts` | Redact keys from output |

### Key Functions

```typescript
import {
  checkKeys,
  reloadEnv,
  pauseForMissingKeys,
  sanitize,
} from "@casys/pml/byok";

// Check if required keys are present
const result = checkKeys(["TAVILY_API_KEY", "OPENAI_API_KEY"]);
if (!result.valid) {
  // Pause for user to add keys
  const approval = pauseForMissingKeys(result.missing);
  return { status: "approval_required", approval };
}

// After user adds keys
await reloadEnv();

// Sanitize output before logging
const safe = sanitize(output); // Redacts API keys
```

### HIL Flow

1. Capability requests API key (e.g., `TAVILY_API_KEY`)
2. `checkKeys()` finds it missing
3. Return `ApiKeyApprovalRequired` to Claude Code
4. User sees prompt: "Add TAVILY_API_KEY to .env"
5. User edits `.env`, clicks Continue
6. `reloadEnv()` picks up new key
7. Execution resumes

---

## permissions/

Tool permission management following Claude Code's allow/deny/ask model.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `loader.ts` | Load permissions from .pml.json |
| `capability-inferrer.ts` | Infer approval mode from tool list |

### Key Functions

```typescript
import {
  loadUserPermissions,
  checkPermission,
  checkCapabilityPermissions,
} from "@casys/pml/permissions";

// Load from .pml.json
const { permissions } = await loadUserPermissions();

// Check single tool
const result = checkPermission("filesystem:read_file", permissions);
// Returns: "allowed" | "denied" | "ask"

// Check capability (multiple tools)
const capResult = checkCapabilityPermissions(
  ["filesystem:read_file", "shell:exec"],
  permissions
);
if (!capResult.canExecute) {
  throw new Error(`Blocked: ${capResult.blockedTool}`);
}
if (capResult.approvalMode === "hil") {
  // Requires user confirmation
}
```

### Permission Patterns

```json
{
  "permissions": {
    "allow": ["filesystem:read_*", "git:*"],
    "deny": ["shell:rm_rf", "shell:sudo_*"],
    "ask": ["shell:*", "docker:*"]
  }
}
```

- Glob patterns supported (`*` wildcard)
- `deny` takes precedence over `allow`
- Unmatched tools default to `ask`

---

## tracing/

Execution trace collection and cloud sync.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `types.ts` | Trace types |
| `collector.ts` | Collect execution data |
| `syncer.ts` | Batch sync to cloud |
| `sanitizer.ts` | Redact sensitive data |

### Key Classes

```typescript
import { TraceCollector, TraceSyncer } from "@casys/pml/tracing";

// Create syncer (once per session)
const syncer = new TraceSyncer({
  cloudUrl: "https://pml.casys.ai",
  batchSize: 10,
  flushIntervalMs: 5000,
});

// Per-execution collector
const collector = new TraceCollector();

// Record MCP calls during execution
collector.recordMcpCall(
  "filesystem:read_file",
  { path: "/tmp/test.txt" },
  { content: "Hello" },
  50, // duration ms
  true // success
);

// Finalize and enqueue
const trace = collector.finalize("casys.tools.example:run", true);
syncer.enqueue(trace);
```

### Sanitization

Before syncing, traces are sanitized:

- API keys → `[REDACTED]`
- Emails → `u***@***.com`
- File contents → truncated if >10KB
- Stack traces → cleaned

---

## security/

Path validation and workspace containment.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `path-validator.ts` | Validate paths within workspace |

### Key Functions

```typescript
import { validatePath, createPathValidator } from "@casys/pml/security";

// Validate a single path
const result = await validatePath("/home/user/project/src/file.ts", {
  workspaceRoot: "/home/user/project",
});

if (!result.valid) {
  console.error(result.error.code); // PATH_OUTSIDE_WORKSPACE
}

// Create reusable validator
const validator = createPathValidator("/home/user/project");
const ok = await validator.validate("../../../etc/passwd");
// Returns: { valid: false, error: { code: "PATH_TRAVERSAL_ATTACK" } }
```

### Error Codes

| Code | Description |
|------|-------------|
| `PATH_OUTSIDE_WORKSPACE` | Resolved path is outside workspace |
| `PATH_TRAVERSAL_ATTACK` | Path contains `..` traversal |
| `PATH_NOT_FOUND` | Path does not exist |
| `PATH_INVALID` | Invalid path format |
| `WORKSPACE_INVALID` | Workspace root invalid |

---

## lockfile/

Dependency lockfile management for reproducible builds.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `types.ts` | Lockfile types |
| `lockfile-manager.ts` | Read/write lockfiles |
| `auto-cleanup.ts` | Clean stale entries |

### Key Classes

```typescript
import { LockfileManager } from "@casys/pml/lockfile";

const manager = new LockfileManager("/path/to/project");

// Check if dependency is locked
const entry = await manager.get("@anthropic/mcp-server-filesystem");
if (entry) {
  console.log(entry.integrity); // sha256-...
}

// Add new entry
await manager.set("@anthropic/mcp-server-filesystem", {
  version: "1.0.0",
  integrity: "sha256-abc123...",
  installedAt: new Date().toISOString(),
});
```

---

## session/

Cloud session management.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `client.ts` | Session HTTP client |

---

## workflow/

Pending workflow store for HIL interruptions.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports |
| `pending-store.ts` | Store pending workflow state |

---

## init/

Project initialization logic.

### Files

| File | Description |
|------|-------------|
| `mod.ts` | Module exports and initProject function |

### Key Functions

```typescript
import { initProject } from "@casys/pml/init";

const result = await initProject({
  port: 3003,
  cloudUrl: "https://pml.casys.ai",
  yes: true, // Skip prompts
});

if (result.success) {
  console.log(`Created: ${result.mcpConfigPath}`);
  console.log(`Created: ${result.pmlConfigPath}`);
}
```

---

## workspace.ts

Workspace resolution utilities.

### Key Functions

```typescript
import {
  resolveWorkspace,
  findProjectRoot,
  isValidWorkspace,
  PROJECT_MARKERS,
} from "@casys/pml/workspace";

// Resolve workspace (checks env, then detects, then fallback)
const workspace = await resolveWorkspace();
console.log(workspace.root);   // /home/user/project
console.log(workspace.source); // "detected" | "env" | "fallback"
console.log(workspace.marker); // "package.json" (if detected)

// Project markers used for detection
console.log(PROJECT_MARKERS);
// ["package.json", "deno.json", ".git", "Cargo.toml", ...]
```

---

## types.ts

Shared type definitions used across modules.

See [API.md](./API.md) for complete type documentation.
