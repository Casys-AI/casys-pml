# Story 14.4: Dynamic MCP Loader with Dependency Installation

Status: ready-for-dev

> **Epic:** 14 - JSR Package Local/Cloud MCP Routing
> **FR Coverage:** FR14-4 (Dynamic MCP import), FR14-10 (Caching via Deno)
> **Prerequisites:** Story 14.3 (Routing + Permission Inference - DONE)
> **Previous Story:** 14-3-routing-config-permission-inferrer.md

## Story

As a developer, I want all capabilities to load automatically via dynamic import when first used,
So that I don't have to manually configure or install each MCP dependency.

## Architecture (Clarified 2026-01-06)

**Key Insight:** ALL capabilities are bundled Deno code. Dependencies are stdio MCP servers.

```
Capability Request: smartSearch(query)
    │
    ▼
PML: Check permissions → "ask" → HIL prompt
    │
    ▼ (User approves)
    │
PML: Fetch metadata from pml.casys.ai/mcp/casys.pml.smartSearch
    │
    ├─► code_url: "https://pml.casys.ai/mcp/casys.pml.smartSearch"
    ├─► mcp_deps: [{ name: "memory", install: "npx ...", integrity: "sha256-..." }]
    │
    ▼
PML: Check mcp_deps installed?
    │
    ├─► memory@1.2.3 installed? NO
    │     └─► HIL: "Install memory@1.2.3?" [Yes] [No]
    │     └─► Verify integrity hash
    │     └─► Run: npx @modelcontextprotocol/server-memory@1.2.3
    │
    ▼
PML: Dynamic import(code_url)
    │
    ▼
PML: Execute capability → mcp.memory.create_entities() → subprocess
    │
    ▼
Result returned to Claude
```

**Same code, different execution context:**
- Code is fetched from same URL (`pml.casys.ai/mcp/{fqdn}`)
- Routing decides: execute on cloud OR on user's machine
- `mcp.*` calls resolve differently based on context

## Problem Context

### Current State (After Story 14.3)

| Component | Status | Description |
|-----------|--------|-------------|
| Routing resolver | ✅ DONE | `resolveToolRouting()` - determines local/cloud |
| Permission inference | ✅ DONE | `inferCapabilityApprovalMode()` - determines hil/auto |
| stdio-command.ts | ✅ EXISTS | JSON-RPC handler, but no dynamic loading |
| Cloud forwarding | ✅ EXISTS | Basic HTTP fetch to `pml.casys.ai/mcp/tools/call` |
| Dynamic import | ❌ MISSING | No module loading from registry |
| Dependency installation | ❌ MISSING | No npm/npx package installation |
| Integrity verification | ❌ MISSING | No hash verification for deps |
| Subprocess management | ❌ MISSING | No stdio MCP lifecycle management |

### Naming Convention (Consolidated)

| Context | Format | Example |
|---------|--------|---------|
| **FQDN** (registry lookup) | org.project.namespace.action | `casys.pml.filesystem.read_file` |
| **Tool name** (config, Claude sees) | namespace:action | `filesystem:read_file` |
| **Code TS** (capability code) | mcp.namespace.action() | `mcp.filesystem.read_file()` |

**Rules:**
- FQDN = all dots (for registry URLs)
- Tool names = colon (MCP standard, what Claude displays)
- Code calls = dots with `mcp.` prefix (our internal DSL)

**No difference between capabilities and MCP servers** - same naming applies to both.

**Conversion:**
- FQDN → Tool: `casys.pml.filesystem.read_file` → `filesystem:read_file`
- Tool → Code: `filesystem:read_file` → `mcp.filesystem.read_file()`

### Capability Metadata Schema

```typescript
interface CapabilityMetadata {
  fqdn: string;                    // e.g., "casys.pml.filesystem.read_file" (all dots)
  type: "deno";                    // Always Deno for capabilities
  code_url: string;                // e.g., "https://pml.casys.ai/mcp/casys.pml.filesystem.read_file"
  description?: string;
  tools: string[];                 // Exposed tool names (colon format): ["filesystem:read_file", ...]
  routing: "client" | "server";    // Where to execute

  // Dependencies on stdio MCP servers
  mcp_deps?: McpDependency[];
}

interface McpDependency {
  name: string;                    // MCP namespace (e.g., "memory")
  type: "stdio";                   // Always stdio for npm deps
  install: string;                 // Install command (e.g., "npx @mcp/server-memory@1.2.3")
  version: string;                 // Pinned version
  integrity: string;               // sha256 hash for verification
  env_required?: string[];         // Required env vars (e.g., ["ANTHROPIC_API_KEY"])
}
```

**URL Pattern:**
- Registry: `pml.casys.ai/mcp/{fqdn}` → e.g., `pml.casys.ai/mcp/casys.pml.filesystem.read_file`
- Same URL returns JSON metadata OR TypeScript code (content negotiation)

## Acceptance Criteria

### AC1-2: Dynamic Import from Registry

**Given** any capability call (e.g., `smartSearch:run`)
**When** PML receives the call
**Then** it fetches metadata from `pml.casys.ai/mcp/{namespace}`
**And** dynamically imports the bundled Deno code via `import(code_url)`
**And** Deno caches the module natively (offline support)

**Given** a cached capability module
**When** called again
**Then** no network request is made (Deno HTTP cache)
**And** execution is instant

### AC3-4: Dependency Detection & HIL Installation

**Given** a capability with `mcp_deps` (e.g., memory, serena)
**When** the capability is first loaded
**Then** PML checks if each dependency is installed with correct version
**And** if missing, triggers HIL prompt: "Install memory@1.2.3? [Yes] [No]"
**And** waits for user approval before proceeding

**Given** user approves dependency installation
**When** PML installs the package
**Then** it runs the install command (e.g., `npx @mcp/server-memory@1.2.3`)
**And** verifies the integrity hash matches (like npm)
**And** stores installation state in `~/.pml/deps.json`

### AC5-6: Integrity Verification

**Given** a dependency with `integrity: "sha256-abc123..."`
**When** the package is installed
**Then** PML computes the sha256 hash of the installed package
**And** compares with the expected integrity hash
**And** fails installation if hash mismatch with clear error

**Given** an integrity verification failure
**When** displayed to user
**Then** the error shows: "Integrity check failed for memory@1.2.3"
**And** suggests: "Expected sha256-abc123..., got sha256-xyz789..."
**And** does NOT execute the capability

### AC7-8: Subprocess Management for stdio deps

**Given** a capability calls `mcp.memory.create_entities()`
**When** the memory MCP is a stdio dependency
**Then** PML spawns the subprocess if not running
**And** sends JSON-RPC request via stdin
**And** returns response from stdout

**Given** a stdio subprocess is idle for >5 minutes
**When** timeout expires
**Then** PML may terminate it to save resources
**And** respawns transparently on next call

### AC9-10: Offline & Error Handling

**Given** registry is unreachable
**When** a capability is cached locally (Deno cache)
**Then** execution proceeds offline
**And** a warning is logged

**Given** a dependency requires an env var (e.g., `ANTHROPIC_API_KEY`)
**When** the variable is missing
**Then** a clear error is shown: "serena requires ANTHROPIC_API_KEY"
**And** instructions to set it are provided

## Tasks / Subtasks

### Phase 1: Types & Interfaces (~30m)

- [ ] Task 1: Define capability and dependency types (AC: #1, #3)
  - [ ] Create `packages/pml/src/loader/types.ts`
  - [ ] Define `CapabilityMetadata` interface
  - [ ] Define `McpDependency` interface
  - [ ] Define `InstalledDep` for tracking state
  - [ ] Export from `packages/pml/src/types.ts`

### Phase 2: Registry Client (~45m)

- [ ] Task 2: Create registry client (AC: #1, #2)
  - [ ] Create `packages/pml/src/loader/registry-client.ts`
  - [ ] Implement `fetchCapabilityMetadata(namespace: string, cloudUrl: string)`:
    - Fetch from `${cloudUrl}/mcp/${namespace}`
    - Parse JSON metadata
    - Validate schema
  - [ ] Handle 404 gracefully with clear error
  - [ ] Handle offline mode (network errors)
  - [ ] Add in-memory cache for metadata

### Phase 3: Deno Dynamic Loader (~30m)

- [ ] Task 3: Create Deno module loader (AC: #1, #2, #9)
  - [ ] Create `packages/pml/src/loader/deno-loader.ts`
  - [ ] Implement `loadCapabilityModule(codeUrl: string)`:
    ```typescript
    export async function loadCapabilityModule(codeUrl: string): Promise<CapabilityModule> {
      // Deno's native HTTP cache handles offline
      const module = await import(codeUrl);
      return module;
    }
    ```
  - [ ] Handle import errors gracefully
  - [ ] Log cache hit/miss for debugging

### Phase 4: Dependency Manager (~2h)

- [ ] Task 4: Create dependency state tracker (AC: #3, #4)
  - [ ] Create `packages/pml/src/loader/dep-state.ts`
  - [ ] Implement `DepState` class:
    ```typescript
    class DepState {
      private statePath = "~/.pml/deps.json";

      isInstalled(name: string, version: string): boolean;
      markInstalled(dep: McpDependency, hash: string): void;
      getInstalled(): InstalledDep[];
    }
    ```
  - [ ] Persist to `~/.pml/deps.json`
  - [ ] Handle first-run (no state file)

- [ ] Task 5: Create integrity verifier (AC: #5, #6)
  - [ ] Create `packages/pml/src/loader/integrity.ts`
  - [ ] Implement `verifyIntegrity(dep: McpDependency)`:
    - Compute sha256 of installed package
    - Compare with expected `dep.integrity`
    - Return `{ valid: boolean, actual: string, expected: string }`
  - [ ] Handle missing integrity (warn but allow for dev)

- [ ] Task 6: Create dependency installer (AC: #3, #4, #5)
  - [ ] Create `packages/pml/src/loader/dep-installer.ts`
  - [ ] Implement `installDependency(dep: McpDependency)`:
    ```typescript
    async function installDependency(dep: McpDependency): Promise<InstallResult> {
      // 1. Parse install command (npx, pip, etc.)
      const [cmd, ...args] = dep.install.split(" ");

      // 2. Run installation
      const process = new Deno.Command(cmd, { args });
      const result = await process.output();

      // 3. Verify integrity
      const integrity = await verifyIntegrity(dep);
      if (!integrity.valid) {
        throw new IntegrityError(dep, integrity);
      }

      // 4. Mark as installed
      depState.markInstalled(dep, integrity.actual);

      return { success: true };
    }
    ```
  - [ ] Handle installation errors with clear messages

### Phase 5: Stdio Process Manager (~1.5h)

- [ ] Task 7: Create stdio subprocess manager (AC: #7, #8)
  - [ ] Create `packages/pml/src/loader/stdio-manager.ts`
  - [ ] Implement `StdioManager` class:
    ```typescript
    class StdioManager {
      private processes = new Map<string, StdioProcess>();
      private readonly idleTimeoutMs = 5 * 60 * 1000;

      async getOrSpawn(dep: McpDependency): Promise<StdioProcess>;
      async call(name: string, method: string, params: unknown): Promise<unknown>;
      shutdown(name: string): void;
    }
    ```
  - [ ] Implement JSON-RPC multiplexing (unique request IDs)
  - [ ] Implement idle timeout with auto-shutdown
  - [ ] Handle process crashes with auto-restart

- [ ] Task 8: Implement stdio JSON-RPC protocol (AC: #7)
  - [ ] Create `packages/pml/src/loader/stdio-rpc.ts`
  - [ ] Implement request/response matching via ID
  - [ ] Handle partial message buffering
  - [ ] Handle notifications (no response expected)

### Phase 6: Unified Capability Loader (~1h)

- [ ] Task 9: Create unified loader (AC: #1-10)
  - [ ] Create `packages/pml/src/loader/capability-loader.ts`
  - [ ] Implement `CapabilityLoader` class:
    ```typescript
    class CapabilityLoader {
      constructor(
        cloudUrl: string,
        depState: DepState,
        stdioManager: StdioManager,
        hilCallback: (prompt: string) => Promise<boolean>,
      );

      /**
       * Load capability with all dependencies.
       * 1. Fetch metadata from registry
       * 2. Check/install mcp_deps (with HIL)
       * 3. Dynamic import capability code
       * 4. Return executable module
       */
      async load(namespace: string): Promise<LoadedCapability>;

      /**
       * Call a tool, routing mcp.* calls appropriately
       */
      async call(toolId: string, args: unknown): Promise<unknown>;
    }
    ```
  - [ ] Implement `mcp.*` call interception and routing
  - [ ] Cache loaded capabilities in memory

- [ ] Task 10: Implement env var checker (AC: #10)
  - [ ] Create `packages/pml/src/loader/env-checker.ts`
  - [ ] Implement `checkEnvVars(required: string[])`:
    - Check each var exists in Deno.env
    - Return missing vars list
  - [ ] Format clear error messages

### Phase 7: Integration (~1h)

- [ ] Task 11: Update stdio-command.ts (AC: all)
  - [ ] Initialize `CapabilityLoader` at startup
  - [ ] Modify `handleToolsCall()` to use loader
  - [ ] Implement HIL callback (write to stderr, read from stdin)
  - [ ] Wire `mcp.*` routing to stdio manager

- [ ] Task 12: Update serve-command.ts (AC: all)
  - [ ] Initialize `CapabilityLoader` at startup
  - [ ] Wire HTTP handler to use loader

### Phase 8: Tests (~1.5h)

- [ ] Task 13: Unit tests for registry client
  - [ ] Test metadata fetch and parse
  - [ ] Test 404 handling
  - [ ] Test offline mode

- [ ] Task 14: Unit tests for dependency manager
  - [ ] Test state persistence
  - [ ] Test integrity verification
  - [ ] Test installation flow

- [ ] Task 15: Unit tests for stdio manager
  - [ ] Test process spawn/shutdown
  - [ ] Test JSON-RPC multiplexing
  - [ ] Test idle timeout

- [ ] Task 16: Integration test
  - [ ] Test full flow: fetch → deps → import → execute

## Dev Notes

### Capability Loading Flow

```typescript
// packages/pml/src/loader/capability-loader.ts

export class CapabilityLoader {
  async load(namespace: string): Promise<LoadedCapability> {
    // 1. Fetch metadata
    const meta = await this.registryClient.fetch(namespace);

    // 2. Check and install dependencies
    for (const dep of meta.mcp_deps || []) {
      if (!this.depState.isInstalled(dep.name, dep.version)) {
        // HIL prompt
        const approved = await this.hilCallback(
          `Install ${dep.name}@${dep.version}? [Yes/No]`
        );

        if (!approved) {
          throw new Error(`Dependency ${dep.name} required but not approved`);
        }

        // Check env vars
        const missing = checkEnvVars(dep.env_required || []);
        if (missing.length > 0) {
          throw new Error(`${dep.name} requires: ${missing.join(", ")}`);
        }

        // Install with integrity check
        await this.installer.install(dep);
      }
    }

    // 3. Dynamic import capability code
    const module = await import(meta.code_url);

    // 4. Return loaded capability with mcp.* router
    return {
      meta,
      module,
      call: (method, args) => this.executeWithMcpRouting(meta, module, method, args),
    };
  }

  private async executeWithMcpRouting(
    meta: CapabilityMetadata,
    module: unknown,
    method: string,
    args: unknown,
  ): Promise<unknown> {
    // Inject mcp.* proxy that routes to appropriate handler
    const mcpProxy = this.createMcpProxy(meta);

    // Execute capability function with proxy
    const fn = (module as Record<string, unknown>)[method];
    if (typeof fn !== "function") {
      throw new Error(`Method ${method} not found in capability`);
    }

    return await fn(args, { mcp: mcpProxy });
  }

  private createMcpProxy(meta: CapabilityMetadata): McpProxy {
    return new Proxy({}, {
      get: (_, namespace: string) => {
        return new Proxy({}, {
          get: (_, action: string) => {
            return async (args: unknown) => {
              // Route based on dependency type
              const dep = meta.mcp_deps?.find(d => d.name === namespace);

              if (dep?.type === "stdio") {
                // Call via subprocess
                return this.stdioManager.call(namespace, `${namespace}:${action}`, args);
              }

              // Check routing for other MCPs
              const routing = resolveToolRouting(`${namespace}:${action}`);
              if (routing === "cloud") {
                return this.cloudClient.call(`${namespace}:${action}`, args);
              }

              // Local capability - recursive load
              return this.call(`${namespace}:${action}`, args);
            };
          },
        });
      },
    });
  }
}
```

### Integrity Verification Pattern

```typescript
// packages/pml/src/loader/integrity.ts

import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding/hex";

export async function computePackageHash(packagePath: string): Promise<string> {
  // For npm packages, hash the package.json + main entry
  const packageJson = await Deno.readTextFile(`${packagePath}/package.json`);
  const pkg = JSON.parse(packageJson);
  const mainFile = await Deno.readFile(`${packagePath}/${pkg.main || "index.js"}`);

  const combined = new TextEncoder().encode(packageJson);
  const hash = await crypto.subtle.digest("SHA-256", combined);

  return `sha256-${encodeHex(new Uint8Array(hash))}`;
}

export async function verifyIntegrity(
  dep: McpDependency,
  installedPath: string,
): Promise<IntegrityResult> {
  const actual = await computePackageHash(installedPath);
  const expected = dep.integrity;

  return {
    valid: actual === expected,
    actual,
    expected,
  };
}
```

### HIL Callback for stdio mode

```typescript
// In stdio-command.ts

function createHilCallback(): (prompt: string) => Promise<boolean> {
  return async (prompt: string): Promise<boolean> => {
    // Write prompt to stderr (doesn't interfere with JSON-RPC on stdout)
    console.error(`\n⚠️  ${prompt}`);
    console.error("   Type 'yes' to approve, 'no' to deny:");

    // Read response from stdin
    // Note: This blocks the JSON-RPC loop - need careful handling
    const buf = new Uint8Array(1024);
    const n = await Deno.stdin.read(buf);
    if (n === null) return false;

    const response = new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
    return response === "yes" || response === "y";
  };
}
```

### Dependency State File

```json
// ~/.pml/deps.json
{
  "version": 1,
  "installed": {
    "memory": {
      "version": "1.2.3",
      "integrity": "sha256-abc123...",
      "installedAt": "2026-01-06T10:30:00Z",
      "installCommand": "npx @modelcontextprotocol/server-memory@1.2.3"
    },
    "serena": {
      "version": "0.5.0",
      "integrity": "sha256-def456...",
      "installedAt": "2026-01-05T14:00:00Z",
      "installCommand": "npx @anthropic/serena@0.5.0"
    }
  }
}
```

### Project Structure

**Files to Create:**
```
packages/pml/src/loader/
├── types.ts                  # CapabilityMetadata, McpDependency
├── registry-client.ts        # Fetch from pml.casys.ai/mcp/{fqdn}
├── deno-loader.ts            # Dynamic import wrapper
├── dep-state.ts              # ~/.pml/deps.json management
├── integrity.ts              # sha256 verification
├── dep-installer.ts          # npm/npx installation
├── stdio-manager.ts          # Subprocess lifecycle
├── stdio-rpc.ts              # JSON-RPC over stdio
├── env-checker.ts            # Required env var validation
├── capability-loader.ts      # Unified loader with mcp.* routing
└── mod.ts                    # Exports

packages/pml/tests/
├── registry_client_test.ts
├── dep_state_test.ts
├── integrity_test.ts
├── stdio_manager_test.ts
└── capability_loader_test.ts
```

**Files to Modify:**
```
packages/pml/src/cli/stdio-command.ts  # Wire CapabilityLoader + HIL
packages/pml/src/cli/serve-command.ts  # Wire CapabilityLoader
packages/pml/src/types.ts              # Add loader types
packages/pml/mod.ts                    # Export loader
```

### Security Considerations

1. **Integrity verification:** sha256 hash MUST match before execution
2. **HIL for installation:** User approves each new dependency
3. **Env var isolation:** User's API keys stay in local process
4. **Subprocess sandboxing:** Consider `--allow-*` flags for child processes
5. **Path validation:** For filesystem MCPs, use Story 14.2's `validatePath()`

### Dependencies

- **Story 14.3** (DONE): Routing + Permission inference
- **Story 14.2** (DONE): Workspace + Path validation
- **Story 14.5** (NEXT): Sandboxed local execution uses loaded capabilities
- **Story 14.7** (FUTURE): Registry endpoint serves capability metadata

### References

- [Source: packages/pml/src/cli/stdio-command.ts] - Current stdio implementation
- [Source: packages/pml/src/routing/resolver.ts] - Routing logic
- [Source: packages/pml/src/permissions/capability-inferrer.ts] - Permission inference
- [Source: src/mcp/smithery-loader.ts] - Pattern for registry loading
- [Source: Epic 14 lines 231-282] - Capability Bundling architecture

## Estimation

- **Effort:** 3-4 days
- **LOC:** ~1000 net
  - loader/types.ts: ~60 lines
  - loader/registry-client.ts: ~80 lines
  - loader/deno-loader.ts: ~40 lines
  - loader/dep-state.ts: ~80 lines
  - loader/integrity.ts: ~60 lines
  - loader/dep-installer.ts: ~100 lines
  - loader/stdio-manager.ts: ~150 lines
  - loader/stdio-rpc.ts: ~100 lines
  - loader/capability-loader.ts: ~200 lines
  - tests: ~200 lines
- **Risk:** Medium
  - Integrity verification complexity
  - HIL in stdio mode needs careful design
  - Registry endpoint may not exist yet (Story 14.7)

## Open Questions

1. **Registry endpoint ready?** Story 14.7 provides the actual endpoint. For now, use mock metadata for testing.

2. **Where to store deps?** Proposal: `~/.pml/deps.json` for state, npm packages in default location.

3. **How to compute integrity hash?** Proposal: sha256 of package.json + main entry file (like npm's approach).

4. **HIL in stdio mode?** The JSON-RPC loop must handle HIL prompts without breaking protocol. Proposal: Use stderr for prompts.

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Context Reference

- `packages/pml/src/cli/stdio-command.ts:89-99` - Current empty tools/list
- `packages/pml/src/routing/resolver.ts` - Routing determination
- `packages/pml/src/permissions/capability-inferrer.ts` - Permission inference
- `_bmad-output/planning-artifacts/epics/epic-14-jsr-package-local-cloud-mcp-routing.md:231-282` - Capability Bundling
- `_bmad-output/planning-artifacts/epics/epic-14-jsr-package-local-cloud-mcp-routing.md:285-305` - Routing architecture

### Debug Log References

### Completion Notes List

### File List

